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
import { SQUADS, SquadId, squadOf, normalizeEmail } from "./teams";

export type RevenueMode = "liquido" | "bruto";

export type FarmerRow = {
  ownerId: string;
  email: string;
  nome: string;
  squadId: SquadId | null;
  demandas: number;
  ganhos: number;
  perdidos: number;
  emAberto: number;
  txConversao: number; // 0..1
  receita: number;
  tramCs: number;
};

export type SquadStats = {
  id: SquadId;
  label: string;
  leader: string;
  demandas: number;
  ganhos: number;
  semGanhos: number;
  emAberto: number;
  receitaTotal: number;
  farmers: FarmerRow[];
};

export type DashboardData = {
  // Visão geral (todos os farmers, todas as squads)
  topo: {
    demandas: number;
    ganhos: number;
    semGanhos: number;
    emAberto: number;
    receitaTotal: number;
  };
  farmers: FarmerRow[];

  // Visão por squad (para abas)
  squads: SquadStats[];

  meta: {
    revenueMode: RevenueMode;
    pipelineCsAtivo: boolean;
    totalDeals: number;
    totalFarmers: number;
    // E-mails da squad que não foram encontrados como owners no HubSpot
    // (typo na lista, owner desativado, etc.)
    missingEmails: string[];
  };
};

// ============================================================
// Helpers
// ============================================================

function parseAmount(deal: Deal, mode: RevenueMode): number {
  // bruto    → amount (campo padrão do HubSpot)
  // líquido  → amount_in_home_currency (placeholder; Pri precisa confirmar)
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
  return !stage || !ESTADO_FINAL_STAGES.includes(stage);
}

// ============================================================
// Agregador principal
// ============================================================

export function aggregate(input: {
  deals: Deal[];
  tickets: Ticket[];
  owners: Map<string, Owner>;     // ownerId -> Owner
  allowedOwnerIds: Set<string>;   // só esses entram no resultado
  missingEmails: string[];
  revenueMode: RevenueMode;
  pipelineCsAtivo: boolean;
}): DashboardData {
  const {
    deals, tickets, owners, allowedOwnerIds, missingEmails,
    revenueMode, pipelineCsAtivo,
  } = input;

  // Inicializa a row de TODO farmer permitido (mesmo que ele não tenha
  // nenhum deal no período — ele precisa aparecer com zeros).
  const byFarmer = new Map<string, FarmerRow>();

  for (const ownerId of allowedOwnerIds) {
    const owner = owners.get(ownerId);
    const email = normalizeEmail(owner?.email);
    byFarmer.set(ownerId, {
      ownerId,
      email,
      nome: ownerDisplayName(owner),
      squadId: squadOf(email),
      demandas: 0,
      ganhos: 0,
      perdidos: 0,
      emAberto: 0,
      txConversao: 0,
      receita: 0,
      tramCs: 0,
    });
  }

  // Processa deals — ignora qualquer um que não seja de owner permitido
  for (const deal of deals) {
    const ownerId = deal.properties.sdrfarmer_responsavel;
    if (!ownerId) continue;
    const row = byFarmer.get(ownerId);
    if (!row) continue; // ownerId não está na lista oficial, ignora

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

  // Tickets CS (se permissão ativa)
  if (pipelineCsAtivo) {
    for (const ticket of tickets) {
      const ownerId = ticket.properties.hubspot_owner_id;
      if (!ownerId) continue;
      const row = byFarmer.get(ownerId);
      if (!row) continue;
      row.tramCs += 1;
    }
  }

  // Tx de conversão
  for (const row of byFarmer.values()) {
    row.txConversao = row.demandas > 0 ? row.ganhos / row.demandas : 0;
  }

  // Ordena: mais ganhos primeiro, depois mais demandas
  const farmers = Array.from(byFarmer.values()).sort(
    (a, b) => b.ganhos - a.ganhos || b.demandas - a.demandas
  );

  // Squads (apenas as definidas em SQUADS, na ordem definida lá)
  const squads: SquadStats[] = SQUADS.map((s) => {
    const members = farmers.filter((f) => f.squadId === s.id);
    return {
      id: s.id,
      label: s.label,
      leader: s.leader,
      farmers: members,
      demandas: members.reduce((sum, f) => sum + f.demandas, 0),
      ganhos: members.reduce((sum, f) => sum + f.ganhos, 0),
      semGanhos: members.filter((f) => f.ganhos === 0).length,
      emAberto: members.reduce((sum, f) => sum + f.emAberto, 0),
      receitaTotal: members.reduce((sum, f) => sum + f.receita, 0),
    };
  });

  // Topo (visão geral somando todas as squads)
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
    squads,
    meta: {
      revenueMode,
      pipelineCsAtivo,
      totalDeals: deals.length,
      totalFarmers: farmers.length,
      missingEmails,
    },
  };
}