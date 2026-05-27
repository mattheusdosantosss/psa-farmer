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
  /** Data ISO "YYYY-MM-DD" definida no admin (ou null se nunca foi definida) */
  startDate: string | null;
  /** Dias desde startDate (null se startDate não definido) */
  diasAtivos: number | null;
  /** Score 0-99 ponderado (ver fórmula em computeScore) */
  score: number;
  demandas: number;
  ganhos: number;
  perdidos: number;
  emAberto: number;
  txConversao: number;
  /** Receita no modo atual do toggle (líquido ou bruto). É a que aparece na UI. */
  receita: number;
  /**
   * Receita SEMPRE em líquido (campo `amount`). Usada pelo Score, que
   * não muda com o toggle pra manter o ranking estável.
   */
  receitaLiquida: number;
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

/**
 * Deal ganho mas SEM o campo `valor_total_do_contrato__bruto____ganho_`
 * preenchido. É uma anomalia de cadastro — o dash mostra um aviso pra Pri
 * conferir com o farmer responsável.
 */
export type GanhoSemBruto = {
  dealId: string;
  dealname: string;
  farmerNome: string;
  farmerOwnerId: string;
  closedate?: string;
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
  /**
   * Avisos de integridade: deals em estágio de ganho que estão SEM o campo
   * "Valor total do contrato (Bruto) (GANHO)" preenchido. Renderizado abaixo
   * da hero pra Pri contatar os farmers responsáveis.
   */
  ganhosSemBruto: GanhoSemBruto[];
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

/**
 * Extrai o valor monetário de um deal conforme o modo (líquido/bruto).
 *
 * - Líquido: campo `amount` (valor padrão do HubSpot).
 * - Bruto:   campo custom `valor_total_do_contrato__bruto____ganho_`,
 *            que SÓ é preenchido em deals dados como ganho.
 *
 * Quando o bruto está vazio (deal em aberto/perdido ou ganho sem o
 * campo preenchido), retorna 0 — o caller fica responsável por
 * decidir o que fazer com isso (a função `hasBrutoPreenchido` abaixo
 * detecta o caso anômalo: ganho sem bruto preenchido).
 */
function parseAmount(deal: Deal, mode: RevenueMode): number {
  const raw = mode === "bruto"
    ? deal.properties.valor_total_do_contrato__bruto____ganho_
    : deal.properties.amount;
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/** Sempre retorna o valor líquido (`amount`). Usado pelo Score, que ignora o toggle. */
function parseAmountLiquido(deal: Deal): number {
  const raw = deal.properties.amount;
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/** True se o deal tem o campo bruto preenchido com um número válido. */
function hasBrutoPreenchido(deal: Deal): boolean {
  const raw = deal.properties.valor_total_do_contrato__bruto____ganho_;
  if (raw == null || raw === "") return false;
  const n = Number(raw);
  return Number.isFinite(n);
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
// Score (0-99) - ranking dos farmers
// ============================================================
//
// 4 critérios com tetos, soma <= 100 (cap em 99 pra ser "0-99"):
//
// 1) Conversão %     -> até 30 pts  (ganhos/demandas × 100 × 1.5, teto 30)
// 2) Ganhos absolut. -> até 30 pts  (ganhos × 1.5, teto 30 = 20 ganhos)
// 3) Receita         -> até 25 pts  (receita / 200000 × 25, teto 25)
// 4) Ritmo dem/dia   -> até 15 pts  (demandas/diasAtivos × 20, teto 15)
//
// O ritmo só é calculado quando diasAtivos > 0 (precisa de startDate
// configurada no admin); caso contrário esse critério vale 0.
//
// Soma máxima teórica: 100 → fazemos cap em 99 pra atender "0-99".

function computeScore(input: {
  ganhos: number;
  demandas: number;
  receita: number;
  diasAtivos: number | null;
}): number {
  const { ganhos, demandas, receita, diasAtivos } = input;

  // 1) Conversão %
  const convPct = demandas > 0 ? (ganhos / demandas) * 100 : 0;
  const ptsConversao = Math.min(30, convPct * 1.5);

  // 2) Ganhos absolutos
  const ptsGanhos = Math.min(30, ganhos * 1.5);

  // 3) Receita
  const ptsReceita = Math.min(25, (receita / 200_000) * 25);

  // 4) Ritmo demandas/dia
  const ptsRitmo =
    diasAtivos !== null && diasAtivos > 0
      ? Math.min(15, (demandas / diasAtivos) * 20)
      : 0;

  const total = ptsConversao + ptsGanhos + ptsReceita + ptsRitmo;
  return Math.min(99, Math.round(total));
}

// ============================================================
// Agregador principal
// ============================================================

export function aggregate(input: {
  /** Deals qualificados no período. Alimenta Demandas e Em aberto. */
  dealsQualificados: Deal[];
  /** Deals fechados no período (ganhos+perdidos). Alimenta Ganhos, Perdidos e Receita. */
  dealsFechados: Deal[];
  tickets: Ticket[];
  owners: Map<string, Owner>;
  allowedOwnerIds: Set<string>;
  missingEmails: string[];
  revenueMode: RevenueMode;
  pipelineCsAtivo: boolean;
  csStages: CsStagesResolved;
  startDates: Map<string, string>;
  /** Override de squad por ownerId (admin). Se ausente, cai em squadOf(email). */
  squadByOwnerId?: Map<string, SquadId>;
}): DashboardData {
  const {
    dealsQualificados, dealsFechados, tickets, owners, allowedOwnerIds, missingEmails,
    revenueMode, pipelineCsAtivo, csStages, startDates, squadByOwnerId,
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
      squadId: squadByOwnerId?.get(ownerId) ?? squadOf(email),
      ativo: !owner?.archived,
      startDate: startDates.get(ownerId) ?? null,
      diasAtivos: null,
      score: 0,
      demandas: 0,
      ganhos: 0,
      perdidos: 0,
      emAberto: 0,
      txConversao: 0,
      receita: 0,
      receitaLiquida: 0,
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

  // ----- Pass 1: deals QUALIFICADOS no período -----
  // Alimenta Demandas (todos) e Em aberto (qualificados ainda não-finais).
  // Ganhos/perdidos NÃO são contados aqui — esses vêm do pass 2 com closedate.
  for (const deal of dealsQualificados) {
    const ownerId = deal.properties.sdrfarmer_responsavel;
    if (!ownerId) continue;
    const row = byFarmer.get(ownerId);
    if (!row) continue;

    row.demandas += 1;
    if (isEmAberto(deal)) {
      const lite: DealLite = {
        id: deal.id,
        dealname: deal.properties.dealname || "(sem nome)",
        amount: parseAmount(deal, revenueMode),
        closedate: deal.properties.closedate,
        createdate: deal.properties.createdate,
      };
      row.emAberto += 1;
      row.dealsEmAberto.push(lite);
    }
  }

  // ----- Pass 2: deals FECHADOS no período -----
  // Alimenta Ganhos, Perdidos e Receita. A query do HubSpot já garante
  // closedate no período + dealstage em ganho/perdido, mas reclassificamos
  // por segurança caso volte algo estranho.
  //
  // Em paralelo:
  // - `row.receita` usa o modo do toggle (líquido/bruto) — é o que a UI mostra
  // - `row.receitaLiquida` é SEMPRE em líquido — usada pelo Score (estável)
  // - Ganhos sem o campo bruto preenchido entram em `ganhosSemBruto`,
  //   exposto no payload pra renderizar o aviso abaixo da hero.
  const ganhosSemBruto: GanhoSemBruto[] = [];

  for (const deal of dealsFechados) {
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

    if (isGanho(deal)) {
      row.ganhos += 1;
      row.receita += lite.amount;
      row.receitaLiquida += parseAmountLiquido(deal);
      row.dealsGanhos.push(lite);

      // Aviso de integridade: ganho sem bruto preenchido
      if (!hasBrutoPreenchido(deal)) {
        ganhosSemBruto.push({
          dealId: deal.id,
          dealname: lite.dealname,
          farmerNome: row.nome,
          farmerOwnerId: row.ownerId,
          closedate: deal.properties.closedate,
        });
      }
    } else if (isPerdido(deal)) {
      row.perdidos += 1;
      row.dealsPerdidos.push(lite);
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

  // Derivadas: total CS, tx conversão, tx conclusão, diasAtivos e score
  const today = new Date();
  for (const row of byFarmer.values()) {
    row.txConversao = row.demandas > 0 ? row.ganhos / row.demandas : 0;
    row.csDemandas = row.csConcluidos + row.csCancelados + row.csEmTramite;
    row.csTxConclusao = row.csDemandas > 0 ? row.csConcluidos / row.csDemandas : 0;

    // Dias ativos a partir de startDate (admin)
    if (row.startDate) {
      const start = new Date(row.startDate);
      if (!Number.isNaN(start.getTime())) {
        const ms = today.getTime() - start.getTime();
        row.diasAtivos = Math.max(0, Math.floor(ms / 86_400_000));
      }
    }

    // Score 0-99 (4 critérios)
    // IMPORTANTE: usa receitaLiquida (campo `amount`), nunca a bruta —
    // assim o ranking não muda quando o usuário alterna o toggle de receita.
    row.score = computeScore({
      ganhos: row.ganhos,
      demandas: row.demandas,
      receita: row.receitaLiquida,
      diasAtivos: row.diasAtivos,
    });
  }

  // Ordena por score -> ganhos -> demandas (desempate)
  const farmers = Array.from(byFarmer.values()).sort(
    (a, b) => b.score - a.score || b.ganhos - a.ganhos || b.demandas - a.demandas
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

  // Ordena avisos por data de fechamento mais recente primeiro
  ganhosSemBruto.sort((a, b) => (b.closedate ?? "").localeCompare(a.closedate ?? ""));

  return {
    topo,
    topoCs,
    farmers,
    squads,
    ganhosSemBruto,
    meta: {
      revenueMode,
      pipelineCsAtivo,
      // Demandas é a métrica canônica; total de deals fechados é apenas auxiliar
      totalDeals: dealsQualificados.length,
      totalFarmers: farmers.length,
      totalCsTickets: tickets.length,
      missingEmails,
      updatedAt: new Date().toISOString(),
    },
  };
}