import type { FarmerRow } from "@/lib/aggregate";

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

type Props = {
  rows: FarmerRow[];
  pipelineCsAtivo: boolean;
  loading?: boolean;
};

function SkeletonRow({ pipelineCsAtivo }: { pipelineCsAtivo: boolean }) {
  return (
    <tr className="border-t border-psa-line">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <span className="skeleton w-8 h-8 rounded-full" />
          <span className="skeleton h-4 w-32 inline-block" />
        </div>
      </td>
      {Array.from({ length: pipelineCsAtivo ? 7 : 7 }).map((_, i) => (
        <td key={i} className="p-4 text-right">
          <span className="skeleton h-4 w-12 inline-block" />
        </td>
      ))}
    </tr>
  );
}

export default function FarmerTable({ rows, pipelineCsAtivo, loading = false }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-psa-ink text-white">
            <tr>
              <th className="text-left p-4 font-display font-semibold text-xs uppercase tracking-wider">Farmer</th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Demandas</th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Ganhos</th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Perdidos</th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Em aberto</th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Conversão</th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Tram CS</th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">Receita</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} pipelineCsAtivo={pipelineCsAtivo} />
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
          Nenhum dado no período
        </div>
        <p className="mt-2 text-sm text-psa-ink-soft max-w-sm mx-auto">
          Ajuste o filtro de período ou confirme se há negócios qualificados
          atribuídos a farmers no recorte escolhido.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-psa-ink text-white">
            <tr>
              <th className="text-left p-4 font-display font-semibold text-xs uppercase tracking-wider">
                Farmer
              </th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">
                Demandas
              </th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">
                Ganhos
              </th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">
                Perdidos
              </th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">
                Em aberto
              </th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">
                Conversão
              </th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">
                Tram CS
              </th>
              <th className="text-right p-4 font-display font-semibold text-xs uppercase tracking-wider">
                Receita
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr
                key={f.ownerId}
                className="border-t border-psa-line hover:bg-psa-canvas transition-colors"
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-psa-blue-soft text-psa-blue flex items-center justify-center font-display text-xs font-semibold">
                      {initials(f.nome)}
                    </span>
                    <span className="font-medium text-psa-ink">{f.nome}</span>
                  </div>
                </td>
                <td className="p-4 text-right tabular-nums text-psa-ink-soft">
                  {f.demandas}
                </td>
                <td className="p-4 text-right tabular-nums font-semibold text-psa-orange">
                  {f.ganhos}
                </td>
                <td className="p-4 text-right tabular-nums text-psa-ink-soft">
                  {f.perdidos}
                </td>
                <td className="p-4 text-right tabular-nums text-psa-ink-soft">
                  {f.emAberto}
                </td>
                <td className="p-4 text-right tabular-nums text-psa-ink-soft">
                  {pct(f.txConversao)}
                </td>
                <td className="p-4 text-right tabular-nums">
                  {pipelineCsAtivo ? (
                    <span className="text-psa-ink-soft">{f.tramCs}</span>
                  ) : (
                    <span className="text-[11px] text-psa-ink-soft italic">
                      sem acesso
                    </span>
                  )}
                </td>
                <td className="p-4 text-right tabular-nums font-medium text-psa-ink">
                  {brl(f.receita)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!pipelineCsAtivo && (
        <div className="px-4 py-3 text-[11px] text-psa-ink-soft bg-psa-canvas border-t border-psa-line flex items-center gap-2">
          <span className="inline-block w-1 h-1 rounded-full bg-psa-orange" />
          Coluna <strong className="font-semibold text-psa-ink-soft">Tram CS</strong> indisponível
          até liberação de acesso à pipeline CS no HubSpot.
        </div>
      )}
    </div>
  );
}