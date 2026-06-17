// ============================================================
// HubSpot CRM v3 — cliente para o dashboard de farmers
// ============================================================

const HUBSPOT_API = "https://api.hubapi.com";

const TOKEN = process.env.HUBSPOT_TOKEN;
const STAGE_NEGOCIO_FECHADO = process.env.HUBSPOT_STAGE_NEGOCIO_FECHADO || "1076664462";
const STAGE_GANHO_CONTRATO = process.env.HUBSPOT_STAGE_GANHO_CONTRATO || "1076664460";
const STAGE_PERDIDO = process.env.HUBSPOT_STAGE_PERDIDO || "1076664461";
const PIPELINE_CS = process.env.HUBSPOT_PIPELINE_CS || "";

export const STAGES = {
  NEGOCIO_FECHADO: STAGE_NEGOCIO_FECHADO,
  GANHO_CONTRATO: STAGE_GANHO_CONTRATO,
  PERDIDO: STAGE_PERDIDO,
};

export const GANHO_STAGES = [STAGE_NEGOCIO_FECHADO, STAGE_GANHO_CONTRATO];
export const ESTADO_FINAL_STAGES = [STAGE_NEGOCIO_FECHADO, STAGE_GANHO_CONTRATO, STAGE_PERDIDO];

// ============================================================
// Tipos
// ============================================================

export type Deal = {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    amount_in_home_currency?: string;
    dealstage?: string;
    pipeline?: string;
    createdate?: string;
    closedate?: string;
    sdrfarmer_responsavel?: string;
    pipedrive___data_de_qualificacao?: string;
    hs_lastmodifieddate?: string;
    origem_do_lead?: string;
    /** Motivo de fechamento perdido (closed_lost_reason). "Fora do MOA" é excluído das métricas. */
    closed_lost_reason?: string;
    /**
     * "Valor total do contrato (Bruto) (GANHO)" no HubSpot.
     * Só preenchido em deals fechados como ganho. É o BRUTO oficial pra dashboard.
     * Note os underscores no internal name: __bruto___ganho_ (2-3-1).
     */
    valor_total_do_contrato__bruto___ganho_?: string;
    [key: string]: string | undefined;
  };
};

export type Ticket = {
  id: string;
  properties: {
    subject?: string;
    hubspot_owner_id?: string;
    hs_pipeline?: string;
    hs_pipeline_stage?: string;
    createdate?: string;
    [key: string]: string | undefined;
  };
};

export type Owner = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  userId?: number;
  archived?: boolean;
};

// ============================================================
// Helpers
// ============================================================

function assertToken() {
  if (!TOKEN) {
    throw new Error("HUBSPOT_TOKEN não está configurado. Veja .env.example.");
  }
}

// Pequeno delay entre requests/páginas para respeitar o rate limit do HubSpot.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hsFetch<T>(
  path: string,
  init?: RequestInit,
  attempt = 0
): Promise<T> {
  assertToken();
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  // Retry automático em 429 (rate limit) — até 3 tentativas com backoff
  if (res.status === 429 && attempt < 3) {
    const retryAfter = Number(res.headers.get("Retry-After"));
    // Retry-After em segundos. Se ausente, usa backoff progressivo.
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
    await sleep(waitMs);
    return hsFetch<T>(path, init, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    let detail = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text);
      const propErrors = parsed?.validationResults
        ?.map((v: { error?: string; name?: string; message?: string }) =>
          `${v.name || "?"}: ${v.message || v.error || "?"}`
        )
        ?.join(" | ");
      if (propErrors) {
        detail = `Propriedades inválidas → ${propErrors}`;
      } else if (parsed?.message) {
        detail = parsed.message;
      }
    } catch {
      // mantém o text bruto
    }
    throw new Error(`HubSpot ${res.status} em ${path}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

// ============================================================
// Owners (para traduzir ID do farmer em nome)
// ============================================================

type OwnersResponse = { results: Owner[]; paging?: { next?: { after: string } } };

export async function fetchAllOwners(): Promise<Map<string, Owner>> {
  const map = new Map<string, Owner>();
  let after: string | undefined;
  do {
    const qs = new URLSearchParams({ limit: "100" });
    if (after) qs.set("after", after);
    const data: OwnersResponse = await hsFetch(`/crm/v3/owners?${qs}`);
    for (const o of data.results) map.set(o.id, o);
    after = data.paging?.next?.after;
  } while (after);
  return map;
}

export function ownerDisplayName(owner?: Owner): string {
  if (!owner) return "Desconhecido";
  const first = owner.firstName?.trim() || "";
  const last = owner.lastName?.trim() || "";
  const full = `${first} ${last}`.trim();
  return full || owner.email || `Owner ${owner.id}`;
}

// ============================================================
// Deals — busca via Search API
// ============================================================

type SearchResponse<T> = {
  total: number;
  results: T[];
  paging?: { next?: { after: string } };
};

const DEAL_PROPS = [
  "dealname",
  "amount",
  "amount_in_home_currency",
  "dealstage",
  "pipeline",
  "createdate",
  "closedate",
  "sdrfarmer_responsavel",
  "pipedrive___data_de_qualificacao",
  "hs_lastmodifieddate",
  "origem_do_lead",
  "valor_total_do_contrato__bruto___ganho_",
  // Motivo de fechamento perdido — deals com "Fora do MOA" são excluídos das
  // métricas (alinha com o relatório oficial do HubSpot).
  "closed_lost_reason",
];

// Origens do Lead que definem "demanda válida" pra dashboard de farmer.
// IMPORTANTE: valores exatos do internal value no HubSpot — preservar
// espaços e capitalização. Trocar isso quebra TODAS as métricas; confirmar
// em Settings → Properties → origem_do_lead → Opções.
//
// - "Carteira do Farmer": prospecção ativa (rótulo "Carteira" na UI)
// - "Curador": leads vindos do time de curadoria (rótulo "Curador")
const FARMER_LEAD_ORIGINS = ["Carteira do Farmer", "Curador"];

// ----- Helpers de timezone (Brasília = UTC-3, sem DST desde 2019) -----
// A UI manda datas como "YYYY-MM-DD" representando dias-calendário em BRT.
// new Date("YYYY-MM-DD") interpreta como UTC 00:00, que em BRT vira 21:00
// do dia anterior — pega ou perde 3h de deals no recorte. Estes helpers
// convertem corretamente pra timestamps que casam com BRT 00:00 e 23:59:59.
const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // +3h em ms

const brStartOfDayMs = (yyyymmdd: string): number =>
  new Date(yyyymmdd).getTime() + BR_OFFSET_MS;

const brEndOfDayMs = (yyyymmdd: string): number =>
  new Date(yyyymmdd).getTime() + BR_OFFSET_MS + 86_400_000 - 1;

// Campos de data possíveis pra recortar o período
type DealDateField =
  | "pipedrive___data_de_qualificacao"
  | "closedate";

/**
 * Busca deals do funil de farmer, recortando o período pelo campo de data
 * indicado em `dateField`. Mantém os filtros invariantes:
 *  - origem_do_lead ∈ FARMER_LEAD_ORIGINS
 *  - sdrfarmer_responsavel ∈ ownerIds (ou HAS_PROPERTY no fallback)
 *  - dateField HAS_PROPERTY (necessário pra ordenação e pra excluir deals
 *    sem a data — um deal sem closedate, por exemplo, não fechou)
 *
 * Se `stages` for fornecido, restringe a esses dealstages — útil pra trazer
 * só ganhos+perdidos quando consultamos por closedate (todo deal com
 * closedate preenchido está em estado final, mas filtrar pelos estágios
 * exatos é mais defensivo).
 */
async function fetchDealsByDateField(opts: {
  from?: string;
  to?: string;
  ownerIds?: string[];
  dateField: DealDateField;
  stages?: string[];
}): Promise<Deal[]> {
  const { from, to, ownerIds, dateField, stages } = opts;

  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: dateField, operator: "HAS_PROPERTY" },
    { propertyName: "origem_do_lead", operator: "IN", values: FARMER_LEAD_ORIGINS },
  ];

  if (ownerIds && ownerIds.length > 0) {
    filters.push({
      propertyName: "sdrfarmer_responsavel",
      operator: "IN",
      values: ownerIds.slice(0, 100),
    });
  } else {
    filters.push({ propertyName: "sdrfarmer_responsavel", operator: "HAS_PROPERTY" });
  }

  if (stages && stages.length > 0) {
    filters.push({ propertyName: "dealstage", operator: "IN", values: stages });
  }

  if (from) {
    // from "YYYY-MM-DD" representa o início do dia em horário de BRASÍLIA.
    // Sem fuso explícito, new Date("YYYY-MM-DD") cai em UTC 00:00, que
    // em BRT (UTC-3) seria o dia ANTERIOR 21:00 — pegando 3h de deals
    // do dia errado. Compensamos somando +3h pra alinhar com BRT 00:00.
    filters.push({
      propertyName: dateField,
      operator: "GTE",
      value: brStartOfDayMs(from).toString(),
    });
  }
  if (to) {
    // to "YYYY-MM-DD" representa o FIM do dia (inclusive) em BRT.
    // Sem isso, "LTE 2026-05-26" pararia em BRT 21:00 e perderíamos
    // tudo qualificado nas últimas 3 horas do dia atual.
    filters.push({
      propertyName: dateField,
      operator: "LTE",
      value: brEndOfDayMs(to).toString(),
    });
  }

  const all: Deal[] = [];
  let after: string | undefined;
  const limit = 100;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties: DEAL_PROPS,
      limit,
      sorts: [{ propertyName: dateField, direction: "DESCENDING" }],
    };
    if (after) body.after = after;

    const data: SearchResponse<Deal> = await hsFetch(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    all.push(...data.results);
    after = data.paging?.next?.after;

    if (after) await sleep(150);
  } while (after);

  return all;
}

/**
 * Deals com QUALIFICAÇÃO no período.
 * Alimenta: Demandas (totais) e Em aberto (qualificados no período
 * que ainda não estão em estado final).
 */
export function fetchDealsByQualification(opts: {
  from?: string;
  to?: string;
  ownerIds?: string[];
}): Promise<Deal[]> {
  return fetchDealsByDateField({ ...opts, dateField: "pipedrive___data_de_qualificacao" });
}

/**
 * Deals com FECHAMENTO no período, restritos a estágios finais (ganho/perdido).
 * Alimenta: Ganhos, Perdidos, Receita.
 *
 * O filtro `dealstage IN (ganhos+perdido)` é defensivo: em teoria todo deal
 * com closedate está em estado final, mas garantimos pra evitar surpresa
 * caso o HubSpot grave closedate em algum cenário inesperado.
 */
export function fetchDealsByClose(opts: {
  from?: string;
  to?: string;
  ownerIds?: string[];
}): Promise<Deal[]> {
  return fetchDealsByDateField({
    ...opts,
    dateField: "closedate",
    stages: [...GANHO_STAGES, STAGES.PERDIDO],
  });
}

// ============================================================
// Lifetime: deals desde uma data mínima (sem filtro `to`)
// ============================================================
//
// Usada pra calcular Tx Conversão histórica de cada farmer desde sua
// startDate individual. Estratégia de uma chamada só:
// - Buscamos todos os deals qualificados desde a startDate MAIS ANTIGA
//   entre os farmers da lista.
// - O agregador filtra cliente-side por farmer aplicando a startDate
//   individual de cada um.
//
// Cache em memória (5 min) — esses dados raramente mudam em janela
// curta e o ganho de latência é grande.

type LifetimeCache = {
  key: string;
  data: Deal[];
  expiresAt: number;
};
let lifetimeCache: LifetimeCache | null = null;
const LIFETIME_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export async function fetchDealsLifetimeByQualification(opts: {
  fromMin: string; // "YYYY-MM-DD" - startDate mais antiga entre os farmers
  ownerIds: string[];
}): Promise<Deal[]> {
  // Cache key: combina os ownerIds ordenados e a data mínima
  const cacheKey = `${opts.fromMin}|${[...opts.ownerIds].sort().join(",")}`;
  const now = Date.now();
  if (lifetimeCache && lifetimeCache.key === cacheKey && lifetimeCache.expiresAt > now) {
    return lifetimeCache.data;
  }

  const data = await fetchDealsByDateField({
    from: opts.fromMin,
    ownerIds: opts.ownerIds,
    dateField: "pipedrive___data_de_qualificacao",
  });

  lifetimeCache = {
    key: cacheKey,
    data,
    expiresAt: now + LIFETIME_CACHE_TTL_MS,
  };
  return data;
}

// ============================================================
// Tickets (pipeline CS)
// ============================================================

const TICKET_PROPS = [
  "subject",
  "hubspot_owner_id",
  "hs_pipeline",
  "hs_pipeline_stage",
  "createdate",
];

const STAGES_ABERTOS_ENV = process.env.HUBSPOT_PIPELINE_CS_STAGES_ABERTOS || "";
const STAGE_CONCLUIDO_ENV = process.env.HUBSPOT_PIPELINE_CS_STAGE_CONCLUIDO || "";
const STAGE_CANCELADO_ENV = process.env.HUBSPOT_PIPELINE_CS_STAGE_CANCELADO || "";

export type CsStagesResolved = {
  abertos: string[];
  concluidos: string[];
  cancelados: string[];
};

// Cache em memória dos estágios CS (TTL 1h).
// Estágios mudam tipo nunca; cachear elimina chamadas extras à API.
let csStagesCache: { value: CsStagesResolved; expiresAt: number } | null = null;
const STAGES_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Resolve os IDs de estágios da pipeline CS por categoria.
 *
 * Regra de negócio (definida pela operação), casa label-a-label dentro da
 * pipeline CS — ENV sempre tem prioridade:
 *  - abertos    = "demanda de tramitação" = etapas "Em andamento" + "Iniciar
 *                 Trâmites". Conta como backlog AO VIVO (snapshot), sem filtro
 *                 de data.
 *  - concluidos = etapa "Aprovação Arquivo" (NÃO é a etapa "Concluído").
 *                 Conta por entrada no estágio dentro do período.
 *  - cancelados = etapa "Cancelado". Conta por entrada no estágio no período.
 *
 * As demais etapas (Conferência, Pagamento, Aguardando NF, Stand by,
 * Concluído, etc.) ficam fora das três categorias e não pesam nas métricas.
 */
async function resolveCsStages(): Promise<CsStagesResolved> {
  if (!PIPELINE_CS) {
    return { abertos: [], concluidos: [], cancelados: [] };
  }

  const now = Date.now();
  if (csStagesCache && csStagesCache.expiresAt > now) {
    return csStagesCache.value;
  }

  type Stage = {
    id: string;
    label: string;
    metadata?: { isClosed?: string | boolean };
  };
  type PipelineResponse = { stages: Stage[] };

  const data: PipelineResponse = await hsFetch(
    `/crm/v3/pipelines/tickets/${encodeURIComponent(PIPELINE_CS)}`
  );

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Abertos / demanda: exatamente "Em andamento" + "Iniciar Trâmites".
  const abertos = STAGES_ABERTOS_ENV
    ? STAGES_ABERTOS_ENV.split(",").map((s) => s.trim()).filter(Boolean)
    : data.stages
        .filter((s) => {
          const n = norm(s.label);
          return n === "em andamento" || n === "iniciar tramites";
        })
        .map((s) => s.id);

  // Concluídos: etapa "Aprovação Arquivo" (regra de negócio — não "Concluído").
  const concluidos = STAGE_CONCLUIDO_ENV
    ? STAGE_CONCLUIDO_ENV.split(",").map((s) => s.trim()).filter(Boolean)
    : data.stages
        .filter((s) => norm(s.label) === "aprovacao arquivo")
        .map((s) => s.id);

  // Cancelados: etapa "Cancelado".
  const cancelados = STAGE_CANCELADO_ENV
    ? STAGE_CANCELADO_ENV.split(",").map((s) => s.trim()).filter(Boolean)
    : data.stages
        .filter((s) => norm(s.label).includes("cancel"))
        .map((s) => s.id);

  const value: CsStagesResolved = { abertos, concluidos, cancelados };
  csStagesCache = { value, expiresAt: now + STAGES_CACHE_TTL_MS };
  return value;
}

export async function getCsStages(): Promise<CsStagesResolved> {
  return resolveCsStages();
}

/**
 * Tickets na pipeline CS para o dashboard de tramitação.
 *
 * Semântica (regra de negócio da operação):
 * - DEMANDA (abertos): SNAPSHOT ao vivo — todos os tickets que ESTÃO hoje em
 *   "Em andamento" / "Iniciar Trâmites", sem filtro de data. É backlog atual.
 * - CONCLUÍDOS ("Aprovação Arquivo") e CANCELADOS ("Cancelado"): filtra por
 *   quando o ticket ENTROU no estágio (`hs_v2_date_entered_<stageId>`, 1
 *   filterGroup por estágio) dentro do período. Mede entrega/cancelamento no
 *   mês, independente de quando o ticket foi criado.
 *
 * As demais etapas ficam fora — não pesam nas métricas.
 *
 * Retorna [] se HUBSPOT_PIPELINE_CS não estiver configurado.
 */
export async function fetchCsTickets(opts?: {
  ownerIds?: string[];
  from?: string;
  to?: string;
}): Promise<Ticket[]> {
  if (!PIPELINE_CS) return [];

  const stages = await resolveCsStages();

  if (
    stages.abertos.length === 0 &&
    stages.concluidos.length === 0 &&
    stages.cancelados.length === 0
  ) {
    console.warn("[hubspot] Pipeline CS sem estágios resolvidos");
    return [];
  }

  const ownerFilter = opts?.ownerIds && opts.ownerIds.length > 0
    ? {
        propertyName: "hubspot_owner_id",
        operator: "IN",
        values: opts.ownerIds.slice(0, 100),
      }
    : { propertyName: "hubspot_owner_id", operator: "HAS_PROPERTY" };

  // Grupo ABERTOS / DEMANDA: snapshot — tudo que está HOJE nesses estágios,
  // sem filtro de data (backlog atual de tramitação).
  const grupoAbertos: Array<{ filters: Array<Record<string, unknown>> }> = [];
  if (stages.abertos.length > 0) {
    const filters: Array<Record<string, unknown>> = [
      { propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_CS },
      { propertyName: "hs_pipeline_stage", operator: "IN", values: stages.abertos },
      ownerFilter,
    ];
    grupoAbertos.push({ filters });
  }

  // Grupos CONCLUÍDOS: 1 por stageId, filtrando por entrada no estágio.
  // O nome interno da propriedade é hs_v2_date_entered_<stageId> — o HubSpot
  // mantém uma por estágio com o timestamp de quando o ticket entrou nele.
  const gruposConcluidos = stages.concluidos.flatMap((stageId) => {
    const filters: Array<Record<string, unknown>> = [
      { propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_CS },
      { propertyName: "hs_pipeline_stage", operator: "EQ", value: stageId },
      ownerFilter,
    ];
    if (opts?.from) {
      filters.push({
        propertyName: `hs_v2_date_entered_${stageId}`,
        operator: "GTE",
        value: new Date(opts.from).getTime().toString(),
      });
    }
    if (opts?.to) {
      filters.push({
        propertyName: `hs_v2_date_entered_${stageId}`,
        operator: "LTE",
        value: new Date(opts.to).getTime().toString(),
      });
    }
    return [{ filters }];
  });

  // Grupos CANCELADOS: 1 por stageId, por entrada no estágio no período
  // (mesma semântica de CONCLUÍDOS via hs_v2_date_entered_<stageId>).
  const gruposCancelados = stages.cancelados.flatMap((stageId) => {
    const filters: Array<Record<string, unknown>> = [
      { propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_CS },
      { propertyName: "hs_pipeline_stage", operator: "EQ", value: stageId },
      ownerFilter,
    ];
    if (opts?.from) {
      filters.push({
        propertyName: `hs_v2_date_entered_${stageId}`,
        operator: "GTE",
        value: new Date(opts.from).getTime().toString(),
      });
    }
    if (opts?.to) {
      filters.push({
        propertyName: `hs_v2_date_entered_${stageId}`,
        operator: "LTE",
        value: new Date(opts.to).getTime().toString(),
      });
    }
    return [{ filters }];
  });

  const filterGroups = [...grupoAbertos, ...gruposConcluidos, ...gruposCancelados];
  if (filterGroups.length === 0) return [];

  const all: Ticket[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups, // OR entre grupos (abertos OU finais-do-período)
      properties: TICKET_PROPS,
      limit: 100,
    };
    if (after) body.after = after;

    const data: SearchResponse<Ticket> = await hsFetch(`/crm/v3/objects/tickets/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    all.push(...data.results);
    after = data.paging?.next?.after;
    if (after) await sleep(150);
  } while (after);

  return all;
}