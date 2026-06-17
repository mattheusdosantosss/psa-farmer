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
import type { FarmerTag } from "./farmer-tags-store";
import { normalizeTagName } from "./farmer-tags-store";

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
  /**
   * Tag opcional atribuída ao farmer no admin. Vem do KV (farmer-tags).
   * null se o farmer não tem tag atribuída ou se a tag referenciada foi
   * apagada do vocabulário antes de desatribuir.
   */
  tag: { name: string; color: string } | null;
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
  /**
   * Tx Conversão HISTÓRICA (vida toda como farmer, desde startDate).
   * - Farmer COM startDate: ganhos lifetime / demandas lifetime
   * - Farmer SEM startDate: 0 (pré-requisito não cumprido)
   *
   * Não é mais a tx do período: a coluna Conv.%, o critério 1 do Score
   * e o diagnóstico textual usam todos esse mesmo valor.
   */
  txConversao: number;
  /** Total de demandas (qualificações) desde startDate */
  lifetimeDemandas: number;
  /** Total de ganhos desde startDate */
  lifetimeGanhos: number;
  /** Total de perdidos desde startDate (informativo, ainda sem uso na UI) */
  lifetimePerdidos: number;
  /** Total de "em aberto" desde startDate (ainda na esteira do funil) */
  lifetimeEmAberto: number;
  /** Receita no modo atual do toggle (líquido ou bruto). É a que aparece na UI. */
  receita: number;
  /**
   * Receita SEMPRE em líquido (campo `amount`). Usada pelo Score, que
   * não muda com o toggle pra manter o ranking estável.
   */
  receitaLiquida: number;
  // Métricas da tramitação CS (espelham vendas)
  csDemandas: number;     // backlog ao vivo: Em andamento + Iniciar Trâmites (== csEmTramite)
  csConcluidos: number;   // entraram em "Aprovação Arquivo" no período
  csCancelados: number;   // entraram em "Cancelado" no período
  csEmTramite: number;    // idem csDemandas (mantido p/ drill-down ticketsEmTramite)
  csTxConclusao: number;  // concluidos / (concluidos + cancelados)
  // Listas pra drill-down nos modais
  dealsGanhos: DealLite[];
  dealsPerdidos: DealLite[];
  dealsEmAberto: DealLite[];
  ticketsEmTramite: TicketLite[];
};

/**
 * Deal ganho mas SEM o campo `valor_total_do_contrato__bruto___ganho_`
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
 * - Bruto:   campo custom `valor_total_do_contrato__bruto___ganho_`,
 *            que SÓ é preenchido em deals dados como ganho.
 *
 * Quando o bruto está vazio (deal em aberto/perdido ou ganho sem o
 * campo preenchido), retorna 0 — o caller fica responsável por
 * decidir o que fazer com isso (a função `hasBrutoPreenchido` abaixo
 * detecta o caso anômalo: ganho sem bruto preenchido).
 */
function parseAmount(deal: Deal, mode: RevenueMode): number {
  const raw = mode === "bruto"
    ? deal.properties.valor_total_do_contrato__bruto___ganho_
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
  const raw = deal.properties.valor_total_do_contrato__bruto___ganho_;
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
  /**
   * Tx Conversão HISTÓRICA (0..1). Critério 1 usa esta — não recalcula
   * a partir de ganhos/demandas do período. Os demais critérios continuam
   * baseados no período.
   */
  txConversaoLifetime: number;
}): number {
  const { ganhos, receita, diasAtivos, demandas, txConversaoLifetime } = input;

  // 1) Conversão % (HISTÓRICA — usa lifetime, não período)
  const convPct = txConversaoLifetime * 100;
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
  /**
   * Deals lifetime (qualificados desde a startDate mais antiga, todos os
   * estágios). Alimenta lifetimeDemandas/lifetimeGanhos por farmer, que
   * por sua vez geram txConversao histórica e score.
   * Pode ser undefined se nenhum farmer tem startDate definida ainda.
   */
  dealsLifetime?: Deal[];
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
  /** Mapa ownerId → nome da tag atribuída no admin. */
  tagAssignments?: Map<string, string>;
  /** Vocabulário global de tags pra resolver nome → cor. */
  tagVocabulary?: FarmerTag[];
}): DashboardData {
  const {
    dealsQualificados: _dealsQualificados,
    dealsFechados: _dealsFechados,
    dealsLifetime: _dealsLifetime,
    tickets, owners, allowedOwnerIds, missingEmails,
    revenueMode, pipelineCsAtivo, csStages, startDates, squadByOwnerId,
    tagAssignments, tagVocabulary,
  } = input;

  // Deals perdidos com motivo "Fora do MOA" NÃO são demanda válida de farmer —
  // o relatório oficial do HubSpot os exclui. Filtramos na entrada pra que
  // saiam de TODAS as métricas (demandas, ganhos, perdidos, em aberto, lifetime),
  // mantendo o funil consistente.
  const MOTIVO_FORA_MOA = "Fora do MOA";
  const semForaMoa = (deals: Deal[]) =>
    deals.filter((d) => d.properties.closed_lost_reason !== MOTIVO_FORA_MOA);
  const dealsQualificados = semForaMoa(_dealsQualificados);
  const dealsFechados = semForaMoa(_dealsFechados);
  const dealsLifetime = _dealsLifetime ? semForaMoa(_dealsLifetime) : undefined;

  // Index do vocabulário por nome normalizado pra resolver atribuições.
  // Se o vocab estiver vazio (ou tag foi apagada antes de desatribuir),
  // a atribuição vira null silenciosamente.
  const tagByNormName = new Map<string, FarmerTag>();
  for (const t of tagVocabulary ?? []) {
    tagByNormName.set(normalizeTagName(t.name), t);
  }
  const resolveTag = (ownerId: string): { name: string; color: string } | null => {
    const assigned = tagAssignments?.get(ownerId);
    if (!assigned) return null;
    const found = tagByNormName.get(normalizeTagName(assigned));
    return found ? { name: found.name, color: found.color } : null;
  };

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
      tag: resolveTag(ownerId),
      startDate: startDates.get(ownerId) ?? null,
      diasAtivos: null,
      score: 0,
      demandas: 0,
      ganhos: 0,
      perdidos: 0,
      emAberto: 0,
      txConversao: 0,
      lifetimeDemandas: 0,
      lifetimeGanhos: 0,
      lifetimePerdidos: 0,
      lifetimeEmAberto: 0,
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

  // Processa deals LIFETIME (vida toda como farmer, desde startDate)
  // - Alimenta lifetimeDemandas e lifetimeGanhos por farmer
  // - Apenas conta deals cuja data de qualificação >= startDate do farmer
  // - Se farmer não tem startDate, lifetime fica zerado (pré-requisito)
  if (dealsLifetime && dealsLifetime.length > 0) {
    for (const deal of dealsLifetime) {
      const ownerId = deal.properties.sdrfarmer_responsavel;
      if (!ownerId) continue;
      const row = byFarmer.get(ownerId);
      if (!row || !row.startDate) continue; // sem startDate, sem lifetime

      const qualDate = deal.properties.pipedrive___data_de_qualificacao;
      if (!qualDate) continue;

      // Compara apenas a parte de data (sem timezone) — o HubSpot pode
      // entregar como ISO string ou epoch; new Date() resolve ambos.
      // O importante é não contar deals anteriores à startDate do farmer.
      const qualMs = new Date(qualDate).getTime();
      const startMs = new Date(row.startDate).getTime();
      if (!Number.isFinite(qualMs) || qualMs < startMs) continue;

      row.lifetimeDemandas += 1;
      if (isGanho(deal)) {
        row.lifetimeGanhos += 1;
      } else if (isPerdido(deal)) {
        row.lifetimePerdidos += 1;
      } else if (isEmAberto(deal)) {
        row.lifetimeEmAberto += 1;
      }
    }
  }

  // Derivadas: total CS, tx conversão (HISTÓRICA), tx conclusão, diasAtivos e score
  const today = new Date();
  for (const row of byFarmer.values()) {
    // Tx Conversão agora é HISTÓRICA (lifetime desde startDate).
    // Farmer sem startDate fica em 0 — é pré-requisito de configuração.
    row.txConversao =
      row.lifetimeDemandas > 0
        ? row.lifetimeGanhos / row.lifetimeDemandas
        : 0;
    // Demanda de tramitação = backlog AO VIVO (Em andamento + Iniciar Trâmites).
    // É o mesmo conjunto de "em trâmite", então csDemandas === csEmTramite.
    row.csDemandas = row.csEmTramite;
    // Tx de conclusão entre os finalizados do período (concluídos vs cancelados).
    const finalizados = row.csConcluidos + row.csCancelados;
    row.csTxConclusao = finalizados > 0 ? row.csConcluidos / finalizados : 0;

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
      txConversaoLifetime: row.txConversao, // já está em formato 0..1 e é histórica
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