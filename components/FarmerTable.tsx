import type { FarmerRow } from "@/lib/aggregate";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct = (n: number) =>
  (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";

type Props = {
  rows: FarmerRow[];
  pipelineCsAtivo: boolean;
};

export default function FarmerTable({ rows, pipelineCsAtivo }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-black/5 p-8 text-center text-psa-gray">
        Nenhum farmer com dados no período selecionado.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-black/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-psa-blue-dark text-white">
            <tr>
              <th className="text-left p-3 font-medium">Farmer</th>
              <th className="text-right p-3 font-medium">Demandas</th>
              <th className="text-right p-3 font-medium">Ganhos</th>
              <th className="text-right p-3 font-medium">Perdidos</th>
              <th className="text-right p-3 font-medium">Em aberto</th>
              <th className="text-right p-3 font-medium">Tx Conv.</th>
              <th className="text-right p-3 font-medium">
                Tram CS{!pipelineCsAtivo && <span className="ml-1 text-psa-orange-light" title="Pipeline CS sem acesso">*</span>}
              </th>
              <th className="text-right p-3 font-medium">Receita</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f, idx) => (
              <tr
                key={f.ownerId}
                className={idx % 2 === 0 ? "bg-white" : "bg-psa-cream/40"}
              >
                <td className="p-3 font-medium text-psa-blue-dark">{f.nome}</td>
                <td className="p-3 text-right tabular-nums">{f.demandas}</td>
                <td className="p-3 text-right tabular-nums text-psa-orange-dark font-semibold">
                  {f.ganhos}
                </td>
                <td className="p-3 text-right tabular-nums text-psa-gray">{f.perdidos}</td>
                <td className="p-3 text-right tabular-nums">{f.emAberto}</td>
                <td className="p-3 text-right tabular-nums">{pct(f.txConversao)}</td>
                <td className="p-3 text-right tabular-nums">
                  {pipelineCsAtivo ? f.tramCs : "—"}
                </td>
                <td className="p-3 text-right tabular-nums font-medium">
                  {brl(f.receita)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!pipelineCsAtivo && (
        <div className="p-3 text-xs text-psa-gray border-t border-black/5">
          * Tram CS desativado: aguardando liberação de permissão na pipeline CS do HubSpot.
        </div>
      )}
    </div>
  );
}