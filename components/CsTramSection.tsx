import type { FarmerRow } from "@/lib/aggregate";
import KpiCard from "./KpiCard";

const num = (n: number) => n.toLocaleString("pt-BR");

const initials = (nome: string) => {
  const parts = nome.trim().split(/\s+/);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
};

type Props = {
  rows: FarmerRow[]; // pode ser todos os farmers ou só os de uma squad
  loading?: boolean;
};

export default function CsTramSection({ rows, loading = false }: Props) {
  // Ordena por mais tramitações primeiro
  const ranked = [...rows].sort((a, b) => b.tramCs - a.tramCs);
  const total = ranked.reduce((sum, f) => sum + f.tramCs, 0);
  const farmersComTramitacao = ranked.filter((f) => f.tramCs > 0);
  const farmersSemTramitacao = ranked.filter((f) => f.tramCs === 0).length;

  return (
    <section>
      {/* Título da seção */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-psa-orange" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-psa-orange">
              Operação CS
            </span>
          </div>
          <h2 className="font-display text-lg font-semibold text-psa-ink">
            Tramitação CS
          </h2>
        </div>
        {!loading && (
          <span className="text-xs text-psa-ink-soft">
            {farmersComTramitacao.length}{" "}
            {farmersComTramitacao.length === 1
              ? "farmer com tickets em trâmite"
              : "farmers com tickets em trâmite"}
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <KpiCard
          label="Total em trâmite"
          value={loading ? "" : num(total)}
          accent="orange"
          hint="Tickets abertos no funil CS"
          loading={loading}
        />
        <KpiCard
          label="Farmers ativos"
          value={loading ? "" : num(farmersComTramitacao.length)}
          accent="blue"
          hint="Com pelo menos 1 ticket aberto"
          loading={loading}
        />
        <KpiCard
          label="Farmers sem trâmite"
          value={loading ? "" : num(farmersSemTramitacao)}
          accent="ink"
          hint="Sem nenhum ticket aberto no período"
          loading={loading}
        />
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-psa-ink text-white">
              <tr>
                <th className="text-left p-4 font-display font-semibold text-xs uppercase tracking-wider">Farmer</th>
                <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Tickets em trâmite</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-psa-line">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="skeleton w-8 h-8 rounded-full" />
                      <span className="skeleton h-4 w-32 inline-block" />
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <span className="skeleton h-4 w-10 inline-block" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : ranked.length === 0 ? (
        <div className="rounded-2xl bg-psa-surface border border-psa-line p-12 text-center shadow-card">
          <div className="font-display text-lg font-semibold text-psa-ink">
            Nenhum ticket em trâmite
          </div>
          <p className="mt-2 text-sm text-psa-ink-soft max-w-sm mx-auto">
            Ninguém da squad tem tickets abertos na pipeline CS no momento.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-psa-ink text-white">
                <tr>
                  <th className="text-left p-4 font-display font-semibold text-xs uppercase tracking-wider">
                    Farmer
                  </th>
                  <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">
                    Tickets em trâmite
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((f) => (
                  <tr
                    key={f.ownerId}
                    className="border-t border-psa-line hover:bg-psa-canvas transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-psa-orange-soft text-psa-orange flex items-center justify-center font-display text-xs font-semibold">
                          {initials(f.nome)}
                        </span>
                        <span className="font-medium text-psa-ink">{f.nome}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right tabular-nums font-semibold text-psa-orange">
                      {f.tramCs}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}