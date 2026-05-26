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
];

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

/**
 * Resolve quais estágios da pipeline CS contam como "abertos" (tramitando).
 *
 * Ordem de prioridade:
 *  1) Se HUBSPOT_PIPELINE_CS_STAGES_ABERTOS está preenchida -> usa essa lista
 *  2) Caso contrário, consulta a API de pipelines e seleciona automaticamente
 *     todos os estágios com metadata.isClosed === false
 */
// Cache em memória dos estágios abertos (TTL 1h).
// Estágios da pipeline não mudam com frequência; cachear elimina uma
// chamada à API a cada request do dashboard.
let stagesAbertosCache: { ids: string[]; expiresAt: number } | null = null;
const STAGES_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

async function resolveCsStagesAbertos(): Promise<string[]> {
  if (STAGES_ABERTOS_ENV) {
    return STAGES_ABERTOS_ENV.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (!PIPELINE_CS) return [];

  // Usa cache se ainda válido
  const now = Date.now();
  if (stagesAbertosCache && stagesAbertosCache.expiresAt > now) {
    return stagesAbertosCache.ids;
  }

  type Stage = { id: string; label: string; metadata?: { isClosed?: string | boolean } };
  type PipelineResponse = { stages: Stage[] };

  const data: PipelineResponse = await hsFetch(
    `/crm/v3/pipelines/tickets/${encodeURIComponent(PIPELINE_CS)}`
  );

  // HubSpot retorna isClosed como string "true"/"false" em alguns lugares
  const isClosed = (s: Stage) =>
    s.metadata?.isClosed === true || s.metadata?.isClosed === "true";

  const ids = data.stages.filter((s) => !isClosed(s)).map((s) => s.id);
  stagesAbertosCache = { ids, expiresAt: now + STAGES_CACHE_TTL_MS };
  return ids;
}

/**
 * Tickets na pipeline CS que estão em estágio ABERTO (tramitando).
 * - Filtra por owner se ownerIds for fornecido (mais eficiente, evita rate limit)
 * - Retorna [] se HUBSPOT_PIPELINE_CS não estiver configurado
 */
export async function fetchCsTickets(opts?: {
  ownerIds?: string[];
}): Promise<Ticket[]> {
  if (!PIPELINE_CS) return [];

  const stagesAbertos = await resolveCsStagesAbertos();
  if (stagesAbertos.length === 0) {
    console.warn("[hubspot] Pipeline CS sem estágios abertos resolvidos");
    return [];
  }

  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_CS },
    { propertyName: "hs_pipeline_stage", operator: "IN", values: stagesAbertos },
  ];

  if (opts?.ownerIds && opts.ownerIds.length > 0) {
    filters.push({
      propertyName: "hubspot_owner_id",
      operator: "IN",
      values: opts.ownerIds.slice(0, 100),
    });
  } else {
    filters.push({ propertyName: "hubspot_owner_id", operator: "HAS_PROPERTY" });
  }

  const all: Ticket[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
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