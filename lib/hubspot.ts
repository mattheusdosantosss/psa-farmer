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
];

// Origens do Lead que definem "demanda válida" pra dashboard de farmer.
// IMPORTANTE: valores exatos do internal value no HubSpot — preservar
// espaços e capitalização. Trocar isso quebra TODAS as métricas; confirmar
// em Settings → Properties → origem_do_lead → Opções.
//
// - "Carteira do Farmer": prospecção ativa (rótulo "Carteira" na UI)
// - "Curador": leads vindos do time de curadoria (rótulo "Curador")
const FARMER_LEAD_ORIGINS = ["Carteira do Farmer", "Curador"];

/**
 * Busca deals para o dashboard.
 *
 * Se `ownerIds` for fornecido, filtra apenas deals desses farmers (estrito).
 * Caso contrário, busca todos os deals com sdrfarmer_responsavel preenchido
 * (modo legado/fallback).
 */
export async function fetchDealsForDashboard(opts: {
  from?: string;
  to?: string;
  ownerIds?: string[];
}): Promise<Deal[]> {
  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: "pipedrive___data_de_qualificacao", operator: "HAS_PROPERTY" },
    // Só conta deals cuja Origem do Lead esteja em FARMER_LEAD_ORIGINS
    // (Carteira do Farmer ou Curador). Inbound, indicação, chatbot, etc.
    // existem com farmer atribuído mas NÃO contam como demanda do farmer.
    { propertyName: "origem_do_lead", operator: "IN", values: FARMER_LEAD_ORIGINS },
  ];

  if (opts.ownerIds && opts.ownerIds.length > 0) {
    // Filtro estrito: só esses owners. Operador IN aceita até 100 valores.
    filters.push({
      propertyName: "sdrfarmer_responsavel",
      operator: "IN",
      values: opts.ownerIds.slice(0, 100),
    });
  } else {
    filters.push({ propertyName: "sdrfarmer_responsavel", operator: "HAS_PROPERTY" });
  }

  if (opts.from) {
    filters.push({
      propertyName: "pipedrive___data_de_qualificacao",
      operator: "GTE",
      value: new Date(opts.from).getTime().toString(),
    });
  }
  if (opts.to) {
    filters.push({
      propertyName: "pipedrive___data_de_qualificacao",
      operator: "LTE",
      value: new Date(opts.to).getTime().toString(),
    });
  }

  const all: Deal[] = [];
  let after: string | undefined;
  const limit = 100;
  let pageCount = 0;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties: DEAL_PROPS,
      limit,
      sorts: [{ propertyName: "pipedrive___data_de_qualificacao", direction: "DESCENDING" }],
    };
    if (after) body.after = after;

    const data: SearchResponse<Deal> = await hsFetch(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    all.push(...data.results);
    after = data.paging?.next?.after;
    pageCount++;

    // Espaça as próximas chamadas pra evitar 429 quando há muitas páginas.
    if (after) await sleep(150);
  } while (after);

  return all;
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
 * Categorias:
 *  - abertos: estágios marcados como isClosed=false no HubSpot ("em trâmite")
 *  - concluidos: por nome contendo "concl" (case-insensitive), ou ENV
 *  - cancelados: por nome contendo "cancel" (case-insensitive), ou ENV
 *
 * Os demais estágios fechados (ex.: "Aprovação Arquivo", "Stand by") ficam
 * fora das três categorias e, portanto, não pesam nas métricas.
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

  const isClosed = (s: Stage) =>
    s.metadata?.isClosed === true || s.metadata?.isClosed === "true";

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Abertos: ENV tem prioridade; caso vazio, usa isClosed=false
  const abertos = STAGES_ABERTOS_ENV
    ? STAGES_ABERTOS_ENV.split(",").map((s) => s.trim()).filter(Boolean)
    : data.stages.filter((s) => !isClosed(s)).map((s) => s.id);

  // Concluídos: ENV tem prioridade; caso vazio, infere pelo label
  const concluidos = STAGE_CONCLUIDO_ENV
    ? STAGE_CONCLUIDO_ENV.split(",").map((s) => s.trim()).filter(Boolean)
    : data.stages
        .filter((s) => isClosed(s) && norm(s.label).includes("conclu"))
        .map((s) => s.id);

  // Cancelados: idem
  const cancelados = STAGE_CANCELADO_ENV
    ? STAGE_CANCELADO_ENV.split(",").map((s) => s.trim()).filter(Boolean)
    : data.stages
        .filter((s) => isClosed(s) && norm(s.label).includes("cancel"))
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
 * Estratégia:
 * - Busca TODOS os tickets em estágios relevantes (abertos + concluídos +
 *   cancelados) — outros fechados (Aprovação, Stand by) ficam de fora.
 * - Para "concluídos" e "cancelados", aplica filtro de período via createdate.
 * - Para "abertos" (em trâmite hoje), traz independente da data — quem está
 *   em trâmite agora interessa mesmo que tenha sido criado antes do período.
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
  const finaisDoPeriodo = [...stages.concluidos, ...stages.cancelados];

  if (stages.abertos.length === 0 && finaisDoPeriodo.length === 0) {
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

  // Grupo 1: tickets ABERTOS (todos, sem filtro de data)
  const grupoAbertos =
    stages.abertos.length > 0
      ? [{
          filters: [
            { propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_CS },
            { propertyName: "hs_pipeline_stage", operator: "IN", values: stages.abertos },
            ownerFilter,
          ],
        }]
      : [];

  // Grupo 2: tickets CONCLUÍDOS/CANCELADOS criados no período
  const filtersFinais: Array<Record<string, unknown>> = [
    { propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_CS },
    { propertyName: "hs_pipeline_stage", operator: "IN", values: finaisDoPeriodo },
    ownerFilter,
  ];
  if (opts?.from) {
    filtersFinais.push({
      propertyName: "createdate",
      operator: "GTE",
      value: new Date(opts.from).getTime().toString(),
    });
  }
  if (opts?.to) {
    filtersFinais.push({
      propertyName: "createdate",
      operator: "LTE",
      value: new Date(opts.to).getTime().toString(),
    });
  }
  const grupoFinais = finaisDoPeriodo.length > 0 ? [{ filters: filtersFinais }] : [];

  const filterGroups = [...grupoAbertos, ...grupoFinais];
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