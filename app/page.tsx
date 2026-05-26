"use client";

import { useEffect, useMemo, useState } from "react";
import KpiCard from "@/components/KpiCard";
import FarmerTable from "@/components/FarmerTable";
import PeriodFilter from "@/components/PeriodFilter";
import { computePeriod, type PeriodValue, type PeriodPreset } from "@/lib/periods";
import type { DashboardData } from "@/lib/aggregate";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const num = (n: number) => n.toLocaleString("pt-BR");

export default function Page() {
  const [period, setPeriod] = useState<PeriodValue>(() => computePeriod("30d"));
  const [mode, setMode] = useState<"bruto" | "liquido">("bruto");
  const [accessKey, setAccessKey] = useState<string>("");

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Captura ?key=... da URL na primeira render
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key") || "";
    setAccessKey(k);
  }, []);

  // Quando o preset muda (e não é "custom"), recalcula as datas
  const handlePeriodChange = (next: PeriodValue) => {
    if (next.preset !== period.preset && next.preset !== "custom") {
      setPeriod(computePeriod(next.preset));
    } else {
      setPeriod(next);
    }
  };

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("from", period.from);
    qs.set("to", period.to);
    qs.set("mode", mode);
    if (accessKey) qs.set("key", accessKey);
    return qs.toString();
  }, [period.from, period.to, mode, accessKey]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?${queryString}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json as DashboardData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro desconhecido");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2 h-2 rounded-sm bg-psa-orange" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-psa-orange">
              PSA · Operação
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-psa-ink">
            Farmer Dashboard
          </h1>
          <p className="mt-1 text-sm text-psa-muted">
            Acompanhamento da operação dos farmers no Funil de Vendas B2B.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <PeriodFilter value={period} onChange={handlePeriodChange} />

          <div className="flex flex-col">
            <span className="text-[11px] font-medium uppercase tracking-wider text-psa-muted mb-1.5">
              Receita
            </span>
            <div className="inline-flex rounded-lg border border-psa-line overflow-hidden text-sm bg-psa-surface">
              <button
                onClick={() => setMode("bruto")}
                className={`px-4 py-2 transition-colors font-medium ${
                  mode === "bruto"
                    ? "bg-psa-blue text-white"
                    : "text-psa-ink-soft hover:bg-psa-canvas"
                }`}
              >
                Bruto
              </button>
              <button
                onClick={() => setMode("liquido")}
                className={`px-4 py-2 transition-colors font-medium ${
                  mode === "liquido"
                    ? "bg-psa-blue text-white"
                    : "text-psa-ink-soft hover:bg-psa-canvas"
                }`}
              >
                Líquido
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Erro */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-display font-semibold mb-1">Erro ao carregar</div>
          <div className="text-red-700">{error}</div>
          {error.includes("unauthorized") && (
            <div className="mt-2 text-xs text-red-600">
              Adicione <code className="px-1 py-0.5 bg-red-100 rounded">?key=SUA_CHAVE</code> à URL.
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Demandas"
          value={data ? num(data.topo.demandas) : 0}
          accent="blue"
          hint="Qualificados com farmer atribuído"
          loading={loading}
        />
        <KpiCard
          label="Ganhos"
          value={data ? num(data.topo.ganhos) : 0}
          accent="orange"
          hint="Negócio fechado e contrato assinado"
          loading={loading}
        />
        <KpiCard
          label="Sem ganhos"
          value={data ? num(data.topo.semGanhos) : 0}
          accent="ink"
          hint="Farmers sem nenhum fechamento"
          loading={loading}
        />
        <KpiCard
          label="Em aberto"
          value={data ? num(data.topo.emAberto) : 0}
          accent="blue"
          hint="Ainda na esteira do funil"
          loading={loading}
        />
        <KpiCard
          label="Receita total"
          value={data ? brl(data.topo.receitaTotal) : "R$ 0,00"}
          accent="orange"
          hint={mode === "bruto" ? "Valor bruto" : "Valor líquido"}
          loading={loading}
        />
      </section>

      {/* Tabela */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-psa-ink">
            Detalhe por farmer
          </h2>
          {data && !loading && (
            <span className="text-xs text-psa-muted">
              {data.meta.totalFarmers} {data.meta.totalFarmers === 1 ? "farmer" : "farmers"} · {data.meta.totalDeals} {data.meta.totalDeals === 1 ? "negócio" : "negócios"}
            </span>
          )}
        </div>
        <FarmerTable
          rows={data?.farmers ?? []}
          pipelineCsAtivo={data?.meta.pipelineCsAtivo ?? false}
          loading={loading}
        />
      </section>
    </main>
  );
}