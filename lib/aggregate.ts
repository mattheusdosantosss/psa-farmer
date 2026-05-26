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
  CsStagesResolved,
} from "./hubspot";
import { SQUADS, SquadId, squadOf, normalizeEmail } from "./teams";

export type RevenueMode = "liquido" | "bruto";

// Representação enxuta de um deal para listagens no client
export type DealLite = {
  id: string;
  dealname: string;
  amount: number;
  closedate?: string;   // ISO ou undefined
  createdate?: string;  // ISO ou undefined
};

// Representação enxuta de um ticket CS para listagens
export type TicketLite = {
  id: string;
  subject: string;
  createdate?: string;
};

export type FarmerRow = {
  ownerId: string;
  email: string;
  nome: string;
  squadId: SquadId | null;
  ativo: boolean;
  demandas: number;
  ganhos: number;
  perdidos: number;
  emAberto: number;
  txConversao: number;
  receita: number;
  // Métricas da tramitação CS (espelham vendas)
  csDemandas: number;     // concluídos + cancelados + em trâmite
  csConcluidos: number;
  csCancelados: number;
  csEmTramite: number;
  csTxConclusao: number;  // concluidos / csDemandas
  // Listas pra drill-down nos modais
  dealsGanhos: DealLite[];
  dealsPerdidos: DealLite[];
  dealsEmAberto: DealLite[];
  ticketsEmTramite: TicketLite[];
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
  // Tramitação CS
  csDemandas: number;
  csConcluidos: number;
  csCancelados: number;
  csEmTramite: number;
  csSemEntregas: number;  // farmers sem nenhum concluído
  farmers: FarmerRow[];
};

export type DashboardData = {
  topo: {
    demandas: number;
    ganhos: number;
    semGanhos: number;
    emAberto: number;
    receitaTotal: number;
  };
  topoCs: {
    demandas: number;
    concluidos: number;
    cancelados: number;
    emTramite: number;
    semEntregas: number;
  };
  farmers: FarmerRow[];
  squads: SquadStats[];
  meta: {
    revenueMode: RevenueMode;
    pipelineCsAtivo: boolean;
    totalDeals: number;
    totalFarmers: number;
    totalCsTickets: number;
    missingEmails: string[];
    updatedAt: string; // ISO datetime do momento em que a API processou
  };
};

// ============================================================
// Helpers — vendas
// ============================================================

function parseAmount(deal: Deal, mode: RevenueMode): number {
  // bruto    → amount
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
// Helpers — tramitação CS
// ============================================================

function classificaTicket(
  ticket: Ticket,
  stages: CsStagesResolved
): "concluido" | "cancelado" | "tramite" | null {
  const stage = ticket.properties.hs_pipeline_stage;
  if (!stage) return null;
  if (stages.abertos.includes(stage)) return "tramite";
  if (stages.concluidos.includes(stage)) return "concluido";
  if (stages.cancelados.includes(stage)) return "cancelado";
  return null;
}

// ============================================================
// Agregador principal
// ============================================================

export function aggregate(input: {
  deals: Deal[];
  tickets: Ticket[];
  owners: Map<string, Owner>;
  allowedOwnerIds: Set<string>;
  missingEmails: string[];
  revenueMode: RevenueMode;
  pipelineCsAtivo: boolean;
  csStages: CsStagesResolved;
}): DashboardData {
  const {
    deals, tickets, owners, allowedOwnerIds, missingEmails,
    revenueMode, pipelineCsAtivo, csStages,
  } = input;

  // Inicializa rows com zeros pra todo farmer permitido
  const byFarmer = new Map<string, FarmerRow>();
  for (const ownerId of allowedOwnerIds) {
    const owner = owners.get(ownerId);
    const email = normalizeEmail(owner?.email);
    byFarmer.set(ownerId, {
      ownerId,
      email,
      nome: ownerDisplayName(owner),
      squadId: squadOf(email),
      ativo: !owner?.archived,
      demandas: 0,
      ganhos: 0,
      perdidos: 0,
      emAberto: 0,
      txConversao: 0,
      receita: 0,
      csDemandas: 0,
      csConcluidos: 0,
      csCancelados: 0,
      csEmTramite: 0,
      csTxConclusao: 0,
      dealsGanhos: [],
      dealsPerdidos: [],
      dealsEmAberto: [],
      ticketsEmTramite: [],
    });
  }

  // Processa deals
  for (const deal of deals) {
    const ownerId = deal.properties.sdrfarmer_responsavel;
    if (!ownerId) continue;
    const row = byFarmer.get(ownerId);
    if (!row) continue;

    const lite: DealLite = {
      id: deal.id,
      dealname: deal.properties.dealname || "(sem nome)",
      amount: parseAmount(deal, revenueMode),
      closedate: deal.properties.closedate,
      createdate: deal.properties.createdate,
    };

    row.demandas += 1;
    if (isGanho(deal)) {
      row.ganhos += 1;
      row.receita += lite.amount;
      row.dealsGanhos.push(lite);
    } else if (isPerdido(deal)) {
      row.perdidos += 1;
      row.dealsPerdidos.push(lite);
    } else if (isEmAberto(deal)) {
      row.emAberto += 1;
      row.dealsEmAberto.push(lite);
    }
  }

  // Processa tickets CS
  if (pipelineCsAtivo) {
    for (const ticket of tickets) {
      const ownerId = ticket.properties.hubspot_owner_id;
      if (!ownerId) continue;
      const row = byFarmer.get(ownerId);
      if (!row) continue;

      const tipo = classificaTicket(ticket, csStages);
      if (!tipo) continue;
      if (tipo === "tramite") {
        row.csEmTramite += 1;
        row.ticketsEmTramite.push({
          id: ticket.id,
          subject: ticket.properties.subject || "(sem assunto)",
          createdate: ticket.properties.createdate,
        });
      } else if (tipo === "concluido") row.csConcluidos += 1;
      else if (tipo === "cancelado") row.csCancelados += 1;
    }
  }

  // Derivadas: total CS, tx conversão e tx conclusão por farmer
  for (const row of byFarmer.values()) {
    row.txConversao = row.demandas > 0 ? row.ganhos / row.demandas : 0;
    row.csDemandas = row.csConcluidos + row.csCancelados + row.csEmTramite;
    row.csTxConclusao = row.csDemandas > 0 ? row.csConcluidos / row.csDemandas : 0;
  }

  // Ordena por mais ganhos -> mais demandas
  const farmers = Array.from(byFarmer.values()).sort(
    (a, b) => b.ganhos - a.ganhos || b.demandas - a.demandas
  );

  // Agregação por squad
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
      csDemandas: members.reduce((sum, f) => sum + f.csDemandas, 0),
      csConcluidos: members.reduce((sum, f) => sum + f.csConcluidos, 0),
      csCancelados: members.reduce((sum, f) => sum + f.csCancelados, 0),
      csEmTramite: members.reduce((sum, f) => sum + f.csEmTramite, 0),
      csSemEntregas: members.filter((f) => f.csConcluidos === 0).length,
    };
  });

  const topo = {
    demandas: farmers.reduce((s, f) => s + f.demandas, 0),
    ganhos: farmers.reduce((s, f) => s + f.ganhos, 0),
    semGanhos: farmers.filter((f) => f.ganhos === 0).length,
    emAberto: farmers.reduce((s, f) => s + f.emAberto, 0),
    receitaTotal: farmers.reduce((s, f) => s + f.receita, 0),
  };

  const topoCs = {
    demandas: farmers.reduce((s, f) => s + f.csDemandas, 0),
    concluidos: farmers.reduce((s, f) => s + f.csConcluidos, 0),
    cancelados: farmers.reduce((s, f) => s + f.csCancelados, 0),
    emTramite: farmers.reduce((s, f) => s + f.csEmTramite, 0),
    semEntregas: farmers.filter((f) => f.csConcluidos === 0).length,
  };

  return {
    topo,
    topoCs,
    farmers,
    squads,
    meta: {
      revenueMode,
      pipelineCsAtivo,
      totalDeals: deals.length,
      totalFarmers: farmers.length,
      totalCsTickets: tickets.length,
      missingEmails,
      updatedAt: new Date().toISOString(),
    },
  };
}