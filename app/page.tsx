"use client";

import { useEffect, useMemo, useState } from "react";
import KpiCard from "@/components/KpiCard";
import FarmerTable from "@/components/FarmerTable";
import type { DashboardData } from "@/lib/aggregate";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function startOfMonthISO(d = new Date()): string {
  const s = new Date(d.getFullYear(), d.getMonth(), 1);
  return s.toISOString().slice(0, 10);
}

function todayISO(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export default function Page() {
  const [from, setFrom] = useState<string>(startOfMonthISO());
  const [to, setTo] = useState<string>(todayISO());
  const [mode, setMode] = useState<"bruto" | "liquido">("bruto");
  const [accessKey, setAccessKey] = useState<string>("");

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carrega chave da URL na primeira render (?key=...)
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key") || "";
    setAccessKey(k);
  }, []);

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("mode", mode);
    if (accessKey) qs.set("key", accessKey);
    return qs.toString();
  }, [from, to, mode, accessKey]);

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

  // Auto-load quando filtros mudam
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, mode, accessKey]);

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-psa-blue-dark">
            Farmer Dashboard
          </h1>
          <p className="text-sm text-psa-gray">
            Operação dos farmers — Funil de Vendas B2B
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-psa-gray mb-1">De</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-psa-gray mb-1">Até</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-psa-gray mb-1">Receita</label>
            <div className="inline-flex rounded-lg border border-black/10 overflow-hidden text-sm">
              <button
                onClick={() => setMode("bruto")}
                className={`px-3 py-1.5 ${
                  mode === "bruto"
                    ? "bg-psa-blue text-white"
                    : "bg-white text-psa-blue-dark"
                }`}
              >
                Bruto
              </button>
              <button
                onClick={() => setMode("liquido")}
                className={`px-3 py-1.5 ${
                  mode === "liquido"
                    ? "bg-psa-blue text-white"
                    : "bg-white text-psa-blue-dark"
                }`}
              >
                Líquido
              </button>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-psa-orange text-white text-sm font-medium hover:bg-psa-orange-dark disabled:opacity-50"
          >
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>Erro ao carregar:</strong> {error}
          {error.includes("unauthorized") && (
            <div className="mt-1 text-xs">
              Adicione <code>?key=SUA_CHAVE</code> à URL (definida em
              <code> DASHBOARD_ACCESS_KEY</code>).
            </div>
          )}
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Demandas"
          value={data?.topo.demandas ?? "—"}
          accent="blue"
          hint="Qualificados c/ farmer"
        />
        <KpiCard
          label="Ganhos"
          value={data?.topo.ganhos ?? "—"}
          accent="orange"
          hint="Fechado + Contrato"
        />
        <KpiCard
          label="Sem ganhos"
          value={data?.topo.semGanhos ?? "—"}
          hint="Farmers sem nenhum ganho"
        />
        <KpiCard
          label="Em aberto"
          value={data?.topo.emAberto ?? "—"}
          accent="blue"
          hint="Ainda na esteira"
        />
        <KpiCard
          label="Receita total"
          value={data ? brl(data.topo.receitaTotal) : "—"}
          accent="orange"
          hint={mode === "bruto" ? "Valor bruto" : "Valor líquido"}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-psa-blue-dark mb-3">
          Por farmer
        </h2>
        <FarmerTable
          rows={data?.farmers ?? []}
          pipelineCsAtivo={data?.meta.pipelineCsAtivo ?? false}
        />
      </section>

      {data && (
        <footer className="text-xs text-psa-gray">
          {data.meta.totalDeals} negócios • {data.meta.totalFarmers} farmers •
          modo: {data.meta.revenueMode}
          {!data.meta.pipelineCsAtivo && " • CS: aguardando permissão"}
        </footer>
      )}
    </main>
  );
}