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
    data_de_qualificacao?: string;
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

async function hsFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
  if (!res.ok) {
    const text = await res.text();
    // Tenta extrair info útil do payload de erro do HubSpot pra mensagens claras
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
  "data_de_qualificacao",
  "hs_lastmodifieddate",
];

/**
 * Busca TODOS os deals que tenham:
 * - sdrfarmer_responsavel preenchido
 * - data_de_qualificacao preenchida
 * - opcionalmente: data_de_qualificacao dentro de [from, to]
 *
 * Trazemos todos os estágios e pipelines aqui; a filtragem por
 * "ganho", "perdido", "em aberto" é feita em memória nas funções de agregação.
 * Isso evita N chamadas à API e mantém o código simples.
 */
export async function fetchDealsForDashboard(opts: {
  from?: string; // ISO date
  to?: string;   // ISO date
}): Promise<Deal[]> {
  const filters: Array<{ propertyName: string; operator: string; value?: string; highValue?: string }> = [
    { propertyName: "sdrfarmer_responsavel", operator: "HAS_PROPERTY" },
    { propertyName: "data_de_qualificacao", operator: "HAS_PROPERTY" },
  ];

  if (opts.from) {
    filters.push({
      propertyName: "data_de_qualificacao",
      operator: "GTE",
      value: new Date(opts.from).getTime().toString(),
    });
  }
  if (opts.to) {
    filters.push({
      propertyName: "data_de_qualificacao",
      operator: "LTE",
      value: new Date(opts.to).getTime().toString(),
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
      sorts: [{ propertyName: "data_de_qualificacao", direction: "DESCENDING" }],
    };
    if (after) body.after = after;

    const data: SearchResponse<Deal> = await hsFetch(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    all.push(...data.results);
    after = data.paging?.next?.after;
  } while (after);

  return all;
}

// ============================================================
// Tickets (pipeline CS) — bloqueado por permissão hoje
// ============================================================

const TICKET_PROPS = [
  "subject",
  "hubspot_owner_id",
  "hs_pipeline",
  "hs_pipeline_stage",
  "createdate",
];

/**
 * Tickets do farmer na pipeline CS.
 * Retorna [] se HUBSPOT_PIPELINE_CS não estiver configurado (caso atual).
 */
export async function fetchCsTickets(): Promise<Ticket[]> {
  if (!PIPELINE_CS) return [];

  const all: Ticket[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_CS },
            { propertyName: "hubspot_owner_id", operator: "HAS_PROPERTY" },
          ],
        },
      ],
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
  } while (after);

  return all;
}