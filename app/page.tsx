"use client";

import { useEffect, useMemo, useState } from "react";
import KpiCard from "@/components/KpiCard";
import FarmerTable from "@/components/FarmerTable";
import FarmersToolbar, { type FarmerFilter } from "@/components/FarmersToolbar";
import CsTramSection from "@/components/CsTramSection";
import DealsModal, { type ModalKind } from "@/components/DealsModal";
import PeriodFilter from "@/components/PeriodFilter";
import type { TabValue } from "@/components/TabsBar";
import { computePeriod, type PeriodValue } from "@/lib/periods";
import type { DashboardData, FarmerRow } from "@/lib/aggregate";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const num = (n: number) => n.toLocaleString("pt-BR");

type TopoCs = {
  demandas: number;
  concluidos: number;
  cancelados: number;
  emTramite: number;
  semEntregas: number;
};

type View = {
  demandas: number;
  ganhos: number;
  semGanhos: number;
  emAberto: number;
  receitaTotal: number;
  farmers: FarmerRow[];
  topoCs: TopoCs;
  leader?: string;
};

function computeView(data: DashboardData | null, tab: TabValue): View | null {
  if (!data) return null;
  if (tab === "all") {
    return {
      ...data.topo,
      farmers: data.farmers,
      topoCs: data.topoCs,
    };
  }
  const squad = data.squads.find((s) => s.id === tab);
  if (!squad) return null;
  return {
    demandas: squad.demandas,
    ganhos: squad.ganhos,
    semGanhos: squad.semGanhos,
    emAberto: squad.emAberto,
    receitaTotal: squad.receitaTotal,
    farmers: squad.farmers,
    topoCs: {
      demandas: squad.csDemandas,
      concluidos: squad.csConcluidos,
      cancelados: squad.csCancelados,
      emTramite: squad.csEmTramite,
      semEntregas: squad.csSemEntregas,
    },
    leader: squad.leader,
  };
}

export default function Page() {
  const [period, setPeriod] = useState<PeriodValue>(() => computePeriod("30d"));
  const [mode, setMode] = useState<"bruto" | "liquido">("bruto");
  const [tab, setTab] = useState<TabValue>("all");
  const [accessKey, setAccessKey] = useState<string>("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FarmerFilter>("todos");
  const [modal, setModal] = useState<{
    farmer: FarmerRow;
    kind: ModalKind;
  } | null>(null);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key") || "";
    setAccessKey(k);
  }, []);

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

  const view = computeView(data, tab);

  // Normaliza pra busca case- e accent-insensitive
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filteredFarmers = useMemo(() => {
    if (!view) return [];
    const q = normalize(search.trim());
    return view.farmers.filter((f) => {
      if (filter === "com_ganhos" && f.ganhos === 0) return false;
      if (filter === "sem_ganhos" && f.ganhos > 0) return false;
      if (q && !normalize(f.nome).includes(q)) return false;
      return true;
    });
  }, [view, search, filter]);

  const updatedAtFormatted = useMemo(() => {
    if (!data?.meta.updatedAt) return null;
    const d = new Date(data.meta.updatedAt);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [data?.meta.updatedAt]);

  return (
    <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-8">
      {/* Hero / Header Bloco */}
      <section className="relative overflow-hidden rounded-3xl bg-psa-ink text-white shadow-card">
        {/* Faixas geométricas decorativas (vibe LP PSA) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full bg-psa-orange opacity-20 blur-[2px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-12 w-[300px] h-[300px] rounded-full bg-psa-blue opacity-25"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 h-full w-1.5 bg-psa-orange"
        />

        {/* Conteúdo */}
        <div className="relative px-8 pt-8 pb-2">
          <div className="flex flex-wrap items-start justify-between gap-8">
            {/* Marca + título */}
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-psa-orange/15 border border-psa-orange/30">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-psa-orange" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                  PSA · Operação
                </span>
              </div>
              <h1 className="font-display text-[44px] leading-[1.05] font-extrabold tracking-tight text-white">
                Farmer
                <br />
                <span className="text-psa-orange">Dashboard.</span>
              </h1>
              <p className="mt-4 text-sm text-white/85 max-w-md">
                Acompanhamento da operação dos farmers no Funil de Vendas B2B.
              </p>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="bg-white/[0.06] backdrop-blur border border-white/10 rounded-xl px-4 py-3">
                <PeriodFilter value={period} onChange={handlePeriodChange} />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/85 mb-2">
                  Receita
                </span>
                <div className="inline-flex rounded-xl bg-white/[0.06] border border-white/10 p-1 text-sm">
                  <button
                    onClick={() => setMode("bruto")}
                    className={`px-4 py-1.5 rounded-lg transition-all font-semibold ${
                      mode === "bruto"
                        ? "bg-psa-orange text-white shadow-md"
                        : "text-white/85 hover:text-white"
                    }`}
                  >
                    Bruto
                  </button>
                  <button
                    onClick={() => setMode("liquido")}
                    className={`px-4 py-1.5 rounded-lg transition-all font-semibold ${
                      mode === "liquido"
                        ? "bg-psa-orange text-white shadow-md"
                        : "text-white/85 hover:text-white"
                    }`}
                  >
                    Líquido
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs ancoradas ao fundo do hero */}
          <div className="mt-8 -mb-px flex flex-wrap items-end justify-between gap-4">
            <div className="inline-flex flex-wrap gap-1">
              {[
                { id: "all" as const, label: "Geral" },
                { id: "dani" as const, label: "Squad Dani" },
                { id: "katyeli" as const, label: "Squad Katyeli" },
                { id: "leticia" as const, label: "Squad Leticia" },
              ].map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`relative px-5 py-3 text-sm font-semibold transition-colors rounded-t-xl ${
                      active
                        ? "bg-psa-canvas text-psa-ink"
                        : "text-white/85 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {t.label}
                    {active && (
                      <span className="absolute left-5 right-5 top-0 h-[3px] bg-psa-orange rounded-b-full" />
                    )}
                  </button>
                );
              })}
            </div>
            {view?.leader && (
              <div className="pb-3 text-xs text-white/85">
                Líder da squad{" "}
                <span className="font-bold text-white">{view.leader}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Erro */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-display font-semibold mb-1">Erro ao carregar</div>
          <div className="text-red-700">{error}</div>
          {error.includes("unauthorized") && (
            <div className="mt-2 text-xs text-red-700">
              Adicione <code className="px-1 py-0.5 bg-red-100 rounded">?key=SUA_CHAVE</code> à URL.
            </div>
          )}
          {error.includes("429") && (
            <div className="mt-2 text-xs text-red-700">
              Rate limit do HubSpot. Aguarde alguns segundos e atualize.
            </div>
          )}
        </div>
      )}

      {/* Aviso de e-mails não encontrados */}
      {data && data.meta.missingEmails.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-display font-semibold mb-1">
            E-mails não encontrados no HubSpot
          </div>
          <div className="text-amber-800 text-xs">
            Os seguintes farmers estão na lista oficial mas não foram
            localizados como owners do HubSpot. Confira possíveis erros de
            digitação em <code>lib/teams.ts</code>:
          </div>
          <ul className="mt-2 text-xs font-mono text-amber-900 list-disc list-inside">
            {data.meta.missingEmails.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* KPIs — 5 cards iguais em telas grandes */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Demandas"
          value={view ? num(view.demandas) : 0}
          accent="blue"
          hint="Qualificados com farmer atribuído"
          loading={loading}
        />
        <KpiCard
          label="Ganhos"
          value={view ? num(view.ganhos) : 0}
          accent="orange"
          hint="Negócio fechado e contrato assinado"
          loading={loading}
        />
        <KpiCard
          label="Sem ganhos"
          value={view ? num(view.semGanhos) : 0}
          accent="ink"
          hint="Farmers sem nenhum fechamento"
          loading={loading}
        />
        <KpiCard
          label="Em aberto"
          value={view ? num(view.emAberto) : 0}
          accent="blue"
          hint="Ainda na esteira do funil"
          loading={loading}
        />
        <KpiCard
          label="Receita total"
          value={view ? brl(view.receitaTotal) : "R$ 0,00"}
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
          {data && !loading && view && (
            <span className="text-xs text-psa-ink-soft">
              {filteredFarmers.length}/{view.farmers.length}{" "}
              {view.farmers.length === 1 ? "farmer" : "farmers"}
              {tab === "all" && ` · ${data.meta.totalDeals} ${data.meta.totalDeals === 1 ? "negócio" : "negócios"}`}
              {updatedAtFormatted && (
                <>
                  {" · "}
                  <span title="Última atualização dos dados">
                    Atualizado {updatedAtFormatted}
                  </span>
                </>
              )}
            </span>
          )}
        </div>

        <FarmersToolbar
          search={search}
          onSearch={setSearch}
          filter={filter}
          onFilter={setFilter}
        />

        <FarmerTable
          rows={filteredFarmers}
          loading={loading}
          onDrillDown={(farmer, kind) => setModal({ farmer, kind })}
        />
      </section>

      {/* Tramitação CS — só aparece se a pipeline estiver configurada */}
      {data?.meta.pipelineCsAtivo && view && (
        <CsTramSection
          topo={view.topoCs}
          rows={view.farmers}
          loading={loading}
          onDrillDownTramite={(farmer) =>
            setModal({ farmer, kind: "tramite" })
          }
        />
      )}

      {/* Modal de drill-down (clique em números) */}
      <DealsModal
        open={modal !== null}
        onClose={() => setModal(null)}
        farmerName={modal?.farmer.nome ?? ""}
        kind={modal?.kind ?? "ganhos"}
        deals={
          modal
            ? modal.kind === "ganhos"
              ? modal.farmer.dealsGanhos
              : modal.kind === "perdidos"
              ? modal.farmer.dealsPerdidos
              : modal.kind === "aberto"
              ? modal.farmer.dealsEmAberto
              : undefined
            : undefined
        }
        tickets={modal?.kind === "tramite" ? modal.farmer.ticketsEmTramite : undefined}
      />
    </main>
  );
}