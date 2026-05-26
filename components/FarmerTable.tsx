import type { FarmerRow } from "@/lib/aggregate";
import DistBar from "./DistBar";
import type { ModalKind } from "./DealsModal";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct = (n: number) =>
  (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";

const initials = (nome: string) => {
  const parts = nome.trim().split(/\s+/);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
};

const diagnostico = (f: FarmerRow) =>
  `${f.ganhos} ${f.ganhos === 1 ? "ganho" : "ganhos"} · conv. ${pct(f.txConversao)} · ${f.emAberto} em aberto`;

type Props = {
  rows: FarmerRow[];
  loading?: boolean;
  onDrillDown?: (farmer: FarmerRow, kind: ModalKind) => void;
};

const numBtnClasses =
  "inline-block min-w-[2rem] px-1 rounded-md font-semibold hover:bg-psa-orange-soft hover:text-psa-orange transition-colors cursor-pointer";

const COLUNAS_NUMERICAS = 7; // Demandas, Ganhos, Perdidas, Em aberto, Dist, Conv, Receita, Diagnóstico

function SkeletonRow() {
  return (
    <tr className="border-t border-psa-line">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <span className="skeleton w-8 h-8 rounded-full" />
          <span className="skeleton h-4 w-32 inline-block" />
        </div>
      </td>
      {Array.from({ length: COLUNAS_NUMERICAS }).map((_, i) => (
        <td key={i} className="p-4 text-right">
          <span className="skeleton h-4 w-12 inline-block" />
        </td>
      ))}
    </tr>
  );
}

const HEAD = (
  <thead className="bg-psa-ink text-white">
    <tr>
      <th className="text-left p-4 font-display font-semibold text-xs uppercase tracking-wider">Farmer</th>
      <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Demandas</th>
      <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Ganhos</th>
      <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Perdidas</th>
      <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Em aberto</th>
      <th className="text-left p-4 font-display font-semibold text-xs uppercase tracking-wider">Dist.</th>
      <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Conv.%</th>
      <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Receita</th>
      <th className="text-left p-4 font-display font-semibold text-xs uppercase tracking-wider">Diagnóstico</th>
    </tr>
  </thead>
);

export default function FarmerTable({ rows, loading = false, onDrillDown }: Props) {
  const handleClick = (farmer: FarmerRow, kind: ModalKind) => {
    if (onDrillDown) onDrillDown(farmer, kind);
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
        <table className="w-full text-sm">
          {HEAD}
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
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
          {HEAD}
          <tbody>
            {rows.map((f) => (
              <tr
                key={f.ownerId}
                className="border-t border-psa-line hover:bg-psa-canvas transition-colors"
              >
                {/* Farmer + badge */}
                <td className="p-4">
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <span className="w-8 h-8 rounded-full bg-psa-blue-soft text-psa-blue flex items-center justify-center font-display text-xs font-semibold shrink-0">
                      {initials(f.nome)}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium text-psa-ink truncate">{f.nome}</div>
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
                  </div>
                </td>

                <td className="p-4 text-right tabular-nums text-psa-ink-soft">
                  {f.demandas}
                </td>
                <td className="p-4 text-right tabular-nums">
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
                <td className="p-4 text-right tabular-nums">
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
                <td className="p-4 text-right tabular-nums">
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

                {/* Dist. */}
                <td className="p-4">
                  <DistBar
                    ganhos={f.ganhos}
                    perdidos={f.perdidos}
                    emAberto={f.emAberto}
                  />
                </td>

                <td className="p-4 text-right tabular-nums text-psa-ink-soft">
                  {pct(f.txConversao)}
                </td>

                {/* Receita + "X deals" embaixo (clicável) */}
                <td className="p-4 text-right whitespace-nowrap">
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

                {/* Diagnóstico */}
                <td className="p-4 text-xs text-psa-ink-soft min-w-[180px]">
                  {diagnostico(f)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}