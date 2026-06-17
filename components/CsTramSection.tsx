import type { FarmerRow } from "@/lib/aggregate";
import KpiCard from "./KpiCard";

const num = (n: number) => n.toLocaleString("pt-BR");

const initials = (nome: string) => {
  const parts = nome.trim().split(/\s+/);
  const first = parts[0]?.[0] || "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
};

type Topo = {
  demandas: number;
  concluidos: number;
  cancelados: number;
  emTramite: number;
  semEntregas: number;
};

type Props = {
  topo: Topo;
  rows: FarmerRow[];
  loading?: boolean;
  onDrillDownTramite?: (farmer: FarmerRow) => void;
};

const HEAD = (
  <thead className="bg-psa-ink text-white">
    <tr>
      <th className="text-left p-4 font-display font-semibold text-xs uppercase tracking-wider">Farmer</th>
      <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Demandas</th>
      <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Concluídos</th>
      <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Cancelados</th>
    </tr>
  </thead>
);

function SkeletonRow() {
  return (
    <tr className="border-t border-psa-line">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <span className="skeleton w-8 h-8 rounded-full" />
          <span className="skeleton h-4 w-32 inline-block" />
        </div>
      </td>
      {Array.from({ length: 3 }).map((_, i) => (
        <td key={i} className="p-4 text-right">
          <span className="skeleton h-4 w-12 inline-block" />
        </td>
      ))}
    </tr>
  );
}

export default function CsTramSection({
  topo,
  rows,
  loading = false,
  onDrillDownTramite,
}: Props) {
  // Ordena: concluídos primeiro, depois demandas
  const ranked = [...rows].sort(
    (a, b) => b.csConcluidos - a.csConcluidos || b.csDemandas - a.csDemandas
  );

  const hasAnyData = ranked.some((f) => f.csDemandas > 0);

  return (
    <section className="space-y-4">
      {/* Título da seção */}
      <div className="flex items-baseline justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-psa-orange" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-psa-orange">
              Operação CS
            </span>
          </div>
          <h2 className="font-display text-lg font-semibold text-psa-ink">
            Detalhe da tramitação
          </h2>
        </div>
        {!loading && (
          <span className="text-xs text-psa-ink-soft">
            {ranked.length}{" "}
            {ranked.length === 1 ? "farmer" : "farmers"} ·{" "}
            {topo.demandas} {topo.demandas === 1 ? "ticket" : "tickets"}
          </span>
        )}
      </div>

      {/* KPIs — demanda (snapshot) + finalizados do período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Demandas"
          value={num(topo.demandas)}
          accent="blue"
          hint="Em andamento + Iniciar Trâmites (ao vivo)"
          loading={loading}
        />
        <KpiCard
          label="Concluídos"
          value={num(topo.concluidos)}
          accent="orange"
          hint="Entraram em Aprovação Arquivo no período"
          loading={loading}
        />
        <KpiCard
          label="Cancelados"
          value={num(topo.cancelados)}
          accent="ink"
          hint="Entraram em Cancelado no período"
          loading={loading}
        />
        <KpiCard
          label="Sem entregas"
          value={num(topo.semEntregas)}
          accent="ink"
          hint="Farmers sem conclusão no período"
          loading={loading}
        />
      </div>

      {/* Tabela */}
      {loading ? (
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
      ) : !hasAnyData ? (
        <div className="rounded-2xl bg-psa-surface border border-psa-line p-12 text-center shadow-card">
          <div className="font-display text-lg font-semibold text-psa-ink">
            Nenhum ticket no período
          </div>
          <p className="mt-2 text-sm text-psa-ink-soft max-w-sm mx-auto">
            Ajuste o filtro de período ou confirme se há tickets atribuídos
            aos farmers na pipeline CS.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {HEAD}
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
                    <td className="p-4 text-right tabular-nums">
                      <button
                        type="button"
                        onClick={() => onDrillDownTramite?.(f)}
                        disabled={f.csDemandas === 0 || !onDrillDownTramite}
                        className="inline-block min-w-[2rem] px-1 rounded-md font-semibold text-psa-ink-soft hover:bg-psa-orange-soft hover:text-psa-orange transition-colors cursor-pointer disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-psa-ink-soft"
                        title={f.csDemandas > 0 ? "Ver tickets em tramitação" : ""}
                      >
                        {f.csDemandas}
                      </button>
                    </td>
                    <td className="p-4 text-right tabular-nums font-semibold text-psa-orange">
                      {f.csConcluidos}
                    </td>
                    <td className="p-4 text-right tabular-nums text-psa-ink-soft">
                      {f.csCancelados}
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