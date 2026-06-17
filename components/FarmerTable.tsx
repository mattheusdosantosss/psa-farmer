import type { FarmerRow } from "@/lib/aggregate";
import DistBar from "./DistBar";
import type { ModalKind } from "./DealsModal";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct = (n: number) =>
  (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";

/**
 * Histórico do farmer: resumo lifetime (desde startDate).
 * Retorna null se farmer não tem startDate (pré-requisito do admin).
 *
 * Usa lifetimeGanhos/lifetimeEmAberto + txConversao (que já é histórica).
 * Os números aqui são INDEPENDENTES do filtro de período do dashboard.
 */
const historico = (f: FarmerRow): string | null => {
  if (!f.startDate) return null;
  return `${f.lifetimeGanhos} ${f.lifetimeGanhos === 1 ? "ganho" : "ganhos"} · ${f.lifetimeEmAberto} em aberto · conv. ${pct(f.txConversao)}`;
};

const daysSince = (iso?: string | null) => {
  if (!iso) return null;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return null;
  const today = new Date();
  const ms = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

const formatBR = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

/**
 * Escolhe preto ou branco como texto pra dar contraste sobre uma cor
 * de fundo arbitrária. Usa a fórmula YIQ (luma percebido): cores claras
 * → texto preto, cores escuras → texto branco.
 *
 * Aceita "#RGB", "#RRGGBB" ou "#RRGGBBAA". Inválido cai em branco.
 */
function pickReadableTextColor(hex: string): "#000" | "#fff" {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return "#fff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "#fff";
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#000" : "#fff";
}

type Props = {
  rows: FarmerRow[];
  loading?: boolean;
  onDrillDown?: (farmer: FarmerRow, kind: ModalKind) => void;
  /** Mostra a coluna "Tram." (demandas de tramitação) quando a pipeline CS está ativa. */
  csAtivo?: boolean;
};

const numBtnClasses =
  "inline-block min-w-[2rem] px-1 rounded-md font-semibold hover:bg-psa-orange-soft hover:text-psa-orange transition-colors cursor-pointer";

const COLUNAS_NUMERICAS = 9; // Score, Demandas, Ganhos, Perdidas, Em aberto, Dist, Conv, Receita, Tempo, Histórico

// Posição -> rótulo "1º", "2º" ... (1-based)
const rankLabel = (idx: number) => `${idx + 1}º`;

// Cor do score (faixas amplas pra leitura rápida)
const scoreColor = (s: number) => {
  if (s >= 70) return "bg-psa-orange-soft text-psa-orange";
  if (s >= 40) return "bg-psa-blue-soft text-psa-blue";
  return "bg-psa-canvas text-psa-ink-soft";
};

function SkeletonRow({ csAtivo = false }: { csAtivo?: boolean }) {
  return (
    <tr className="border-t border-psa-line">
      <td className="p-3 text-center">
        <span className="skeleton h-10 w-12 inline-block rounded-lg" />
      </td>
      <td className="p-3">
        <span className="skeleton h-4 w-32 inline-block" />
      </td>
      {Array.from({ length: COLUNAS_NUMERICAS - 1 + (csAtivo ? 1 : 0) }).map((_, i) => (
        <td key={i} className="p-3 text-right">
          <span className="skeleton h-4 w-10 inline-block" />
        </td>
      ))}
    </tr>
  );
}

const head = (csAtivo: boolean) => (
  <thead className="bg-psa-ink text-white">
    <tr>
      <th className="text-center p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Score</th>
      <th className="text-left p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Farmer</th>
      <th className="text-right p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Demandas</th>
      <th className="text-right p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Ganhos</th>
      <th className="text-right p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Perdidas</th>
      <th className="text-right p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Em aberto</th>
      {csAtivo && (
        <th
          className="text-right p-3 font-display font-semibold text-[11px] uppercase tracking-wider"
          title="Demandas de tramitação (Em andamento + Iniciar Trâmites, ao vivo)"
        >
          Tram.
        </th>
      )}
      <th className="text-left p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Dist.</th>
      <th className="text-right p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Conv.%</th>
      <th className="text-right p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Receita</th>
      <th className="text-right p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Tempo</th>
      <th className="text-left p-3 font-display font-semibold text-[11px] uppercase tracking-wider" title="Resumo da vida toda como farmer (independe do filtro de período)">Histórico</th>
    </tr>
  </thead>
);

export default function FarmerTable({ rows, loading = false, onDrillDown, csAtivo = false }: Props) {
  const handleClick = (farmer: FarmerRow, kind: ModalKind) => {
    if (onDrillDown) onDrillDown(farmer, kind);
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
        <table className="w-full text-sm">
          {head(csAtivo)}
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} csAtivo={csAtivo} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-psa-surface border border-psa-line p-12 text-center shadow-card">
        <div className="font-display text-lg font-semibold text-psa-ink">
          Nenhum farmer encontrado
        </div>
        <p className="mt-2 text-sm text-psa-ink-soft max-w-sm mx-auto">
          Ajuste o filtro, a busca ou o período para ver resultados.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {head(csAtivo)}
          <tbody>
            {rows.map((f, idx) => (
              <tr
                key={f.ownerId}
                className="border-t border-psa-line hover:bg-psa-canvas transition-colors"
              >
                {/* Score + Rank */}
                <td className="p-3 text-center whitespace-nowrap">
                  <div className={`inline-flex flex-col items-center justify-center min-w-[44px] px-2 py-1 rounded-lg ${scoreColor(f.score)}`}>
                    <span className="font-display font-bold text-base leading-none tabular-nums">
                      {f.score}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider mt-0.5 opacity-80">
                      {rankLabel(idx)}
                    </span>
                  </div>
                </td>

                {/* Farmer + tag (opcional) + badge ativo/arquivado */}
                <td className="p-3">
                  <div className="min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-psa-ink truncate">{f.nome}</span>
                      {f.tag && (
                        <span
                          className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: f.tag.color,
                            color: pickReadableTextColor(f.tag.color),
                          }}
                          title={`Tag: ${f.tag.name}`}
                        >
                          {f.tag.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${
                          f.ativo ? "bg-green-500" : "bg-psa-ink-soft"
                        }`}
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-psa-ink-soft">
                        {f.ativo ? "Ativo" : "Arquivado"}
                      </span>
                    </div>
                  </div>
                </td>

                <td className="p-3 text-right tabular-nums text-psa-ink-soft">
                  {f.demandas}
                </td>
                <td className="p-3 text-right tabular-nums">
                  <button
                    type="button"
                    onClick={() => handleClick(f, "ganhos")}
                    className={`${numBtnClasses} text-psa-orange`}
                    disabled={f.ganhos === 0}
                    title={f.ganhos > 0 ? "Ver negócios fechados" : ""}
                  >
                    {f.ganhos}
                  </button>
                </td>
                <td className="p-3 text-right tabular-nums">
                  <button
                    type="button"
                    onClick={() => handleClick(f, "perdidos")}
                    className={`${numBtnClasses} text-psa-ink-soft`}
                    disabled={f.perdidos === 0}
                    title={f.perdidos > 0 ? "Ver negócios perdidos" : ""}
                  >
                    {f.perdidos}
                  </button>
                </td>
                <td className="p-3 text-right tabular-nums">
                  <button
                    type="button"
                    onClick={() => handleClick(f, "aberto")}
                    className={`${numBtnClasses} text-psa-ink-soft`}
                    disabled={f.emAberto === 0}
                    title={f.emAberto > 0 ? "Ver negócios em aberto" : ""}
                  >
                    {f.emAberto}
                  </button>
                </td>

                {/* Tram. — demandas de tramitação (snapshot ao vivo) */}
                {csAtivo && (
                  <td className="p-3 text-right tabular-nums">
                    <button
                      type="button"
                      onClick={() => handleClick(f, "tramite")}
                      className={`${numBtnClasses} text-psa-blue`}
                      disabled={f.csDemandas === 0}
                      title={f.csDemandas > 0 ? "Ver tickets em tramitação" : ""}
                    >
                      {f.csDemandas}
                    </button>
                  </td>
                )}

                {/* Dist. */}
                <td className="p-3">
                  <DistBar
                    ganhos={f.ganhos}
                    perdidos={f.perdidos}
                    emAberto={f.emAberto}
                  />
                </td>

                <td className="p-3 text-right tabular-nums text-psa-ink-soft">
                  {pct(f.txConversao)}
                </td>

                {/* Receita + "X deals" embaixo (clicável) */}
                <td className="p-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleClick(f, "ganhos")}
                    disabled={f.ganhos === 0}
                    className="block w-full text-right group disabled:cursor-default"
                    title={f.ganhos > 0 ? "Ver negócios fechados" : ""}
                  >
                    <div className="tabular-nums font-medium text-psa-ink group-hover:text-psa-orange group-disabled:hover:text-psa-ink transition-colors">
                      {brl(f.receita)}
                    </div>
                    <div className="text-[10px] text-psa-ink-soft mt-0.5">
                      {f.ganhos} {f.ganhos === 1 ? "deal" : "deals"}
                    </div>
                  </button>
                </td>

                {/* Tempo (dias desde startDate) */}
                <td className="p-3 text-right whitespace-nowrap">
                  {f.startDate && daysSince(f.startDate) !== null ? (
                    <>
                      <div className="tabular-nums font-medium text-psa-blue">
                        {daysSince(f.startDate)}d
                      </div>
                      <div className="text-[10px] text-psa-ink-soft mt-0.5">
                        desde {formatBR(f.startDate)}
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] text-psa-ink-soft italic">
                      sem data
                    </div>
                  )}
                </td>

                {/* Histórico (lifetime desde startDate) */}
                <td className="p-3 text-xs text-psa-ink-soft min-w-[170px]">
                  {historico(f) ?? (
                    <span className="italic">Sem histórico</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}