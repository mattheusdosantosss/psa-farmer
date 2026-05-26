// ============================================================
// Agregação dos dados crus do HubSpot → KPIs do dashboard
// ============================================================

import {
  Deal,
  Ticket,
  Owner,
  GANHO_STAGES,
  ESTADO_FINAL_STAGES,
  STAGES,
  ownerDisplayName,
} from "./hubspot";

export type RevenueMode = "liquido" | "bruto";

export type FarmerRow = {
  ownerId: string;
  nome: string;
  demandas: number;
  ganhos: number;
  perdidos: number;
  emAberto: number;
  txConversao: number; // 0..1
  receita: number;
  tramCs: number;
};

export type DashboardData = {
  topo: {
    demandas: number;
    ganhos: number;
    semGanhos: number; // farmers sem nenhum ganho
    emAberto: number;
    receitaTotal: number;
  };
  farmers: FarmerRow[];
  meta: {
    revenueMode: RevenueMode;
    pipelineCsAtivo: boolean;
    totalDeals: number;
    totalFarmers: number;
  };
};

// ============================================================
// Helpers
// ============================================================

function parseAmount(deal: Deal, mode: RevenueMode): number {
  // No HubSpot:
  //   amount = valor "bruto" inserido pelo usuário
  //   amount_in_home_currency = mesmo valor convertido pra moeda da conta
  //
  // Para "líquido" vs "bruto" não existe um par direto na API; a Pri precisa
  // confirmar onde mora o líquido. Por ora:
  //   - bruto    → amount (campo padrão)
  //   - líquido  → amount_in_home_currency (placeholder; ajustar quando Pri responder)
  const raw = mode === "bruto"
    ? deal.properties.amount
    : (deal.properties.amount_in_home_currency || deal.properties.amount);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function isGanho(deal: Deal): boolean {
  const stage = deal.properties.dealstage;
  return !!stage && GANHO_STAGES.includes(stage);
}

function isPerdido(deal: Deal): boolean {
  return deal.properties.dealstage === STAGES.PERDIDO;
}

function isEmAberto(deal: Deal): boolean {
  const stage = deal.properties.dealstage;
  // Em aberto = qualificado (já garantido pelo filtro de busca) e
  // não está em estado final (ganho/contrato/perdido).
  return !stage || !ESTADO_FINAL_STAGES.includes(stage);
}

// ============================================================
// Agregador principal
// ============================================================

export function aggregate(input: {
  deals: Deal[];
  tickets: Ticket[];
  owners: Map<string, Owner>;
  revenueMode: RevenueMode;
  pipelineCsAtivo: boolean;
}): DashboardData {
  const { deals, tickets, owners, revenueMode, pipelineCsAtivo } = input;

  // Mapa: ownerId -> agregação
  const byFarmer = new Map<string, FarmerRow>();

  const ensureFarmer = (ownerId: string): FarmerRow => {
    let row = byFarmer.get(ownerId);
    if (!row) {
      row = {
        ownerId,
        nome: ownerDisplayName(owners.get(ownerId)),
        demandas: 0,
        ganhos: 0,
        perdidos: 0,
        emAberto: 0,
        txConversao: 0,
        receita: 0,
        tramCs: 0,
      };
      byFarmer.set(ownerId, row);
    }
    return row;
  };

  // Processa deals
  for (const deal of deals) {
    const ownerId = deal.properties.sdrfarmer_responsavel;
    if (!ownerId) continue;

    const row = ensureFarmer(ownerId);
    row.demandas += 1;

    if (isGanho(deal)) {
      row.ganhos += 1;
      row.receita += parseAmount(deal, revenueMode);
    } else if (isPerdido(deal)) {
      row.perdidos += 1;
    } else if (isEmAberto(deal)) {
      row.emAberto += 1;
    }
  }

  // Processa tickets CS (só se pipeline ativo)
  if (pipelineCsAtivo) {
    for (const ticket of tickets) {
      const ownerId = ticket.properties.hubspot_owner_id;
      if (!ownerId) continue;
      // Conta tickets do farmer mesmo que ele ainda não tenha deal
      const row = ensureFarmer(ownerId);
      row.tramCs += 1;
    }
  }

  // Calcula tx de conversão por farmer
  for (const row of byFarmer.values()) {
    row.txConversao = row.demandas > 0 ? row.ganhos / row.demandas : 0;
  }

  const farmers = Array.from(byFarmer.values()).sort(
    (a, b) => b.ganhos - a.ganhos || b.demandas - a.demandas
  );

  const topo = {
    demandas: farmers.reduce((s, f) => s + f.demandas, 0),
    ganhos: farmers.reduce((s, f) => s + f.ganhos, 0),
    semGanhos: farmers.filter((f) => f.ganhos === 0).length,
    emAberto: farmers.reduce((s, f) => s + f.emAberto, 0),
    receitaTotal: farmers.reduce((s, f) => s + f.receita, 0),
  };

  return {
    topo,
    farmers,
    meta: {
      revenueMode,
      pipelineCsAtivo,
      totalDeals: deals.length,
      totalFarmers: farmers.length,
    },
  };
}