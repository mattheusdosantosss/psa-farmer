"use client";

import { useEffect, useMemo, useState } from "react";
import KpiCard from "@/components/KpiCard";
import FarmerTable from "@/components/FarmerTable";
import FarmersToolbar, { type FarmerFilter } from "@/components/FarmersToolbar";
import CsTramSection from "@/components/CsTramSection";
import DealsModal, { type ModalKind } from "@/components/DealsModal";
import PeriodFilter from "@/components/PeriodFilter";
import { computePeriod, type PeriodValue } from "@/lib/periods";
import type { DashboardData, FarmerRow } from "@/lib/aggregate";
import type { TabValue } from "@/lib/teams";

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
  /**
   * Sub-aba que decide qual seção é renderizada abaixo do hero.
   * "negocios" — KPIs de negócios + tabela "Detalhe por farmer"
   * "tramitacao" — KPIs de CS + tabela "Detalhe da tramitação"
   * Default em "negocios" porque é a métrica principal do dash.
   */
  const [subTab, setSubTab] = useState<"negocios" | "tramitacao">("negocios");
  const [accessKey, setAccessKey] = useState<string>("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FarmerFilter>("todos");
  // Modal pode estar em dois modos:
  //  - { mode: "single", farmer, kind }  → drill-down de UM farmer (click na linha)
  //  - { mode: "aggregated", kind, title } → drill-down do CARD do topo (todos farmers do view)
  const [modal, setModal] = useState<
    | { mode: "single"; farmer: FarmerRow; kind: ModalKind }
    | { mode: "aggregated"; kind: ModalKind; title: string }
    | null
  >(null);

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

              {/* Coluna direita: toggle Negócios/Tramitação no topo
                  (acima do par Receita/Admin), aproveitando o espaço
                  vazio que sobra porque o card do Período é mais alto. */}
              <div className="flex flex-col gap-3">
                {/* Toggle Negócios/Tramitação — só aparece se pipeline CS ativa */}
                {data?.meta.pipelineCsAtivo && (
                  <div className="inline-flex self-start rounded-xl bg-white/[0.06] border border-white/10 p-1 text-sm">
                    <button
                      onClick={() => setSubTab("negocios")}
                      className={`px-4 py-1.5 rounded-lg transition-all font-semibold ${
                        subTab === "negocios"
                          ? "bg-psa-orange text-white shadow-md"
                          : "text-white/85 hover:text-white"
                      }`}
                    >
                      Negócios
                    </button>
                    <button
                      onClick={() => setSubTab("tramitacao")}
                      className={`px-4 py-1.5 rounded-lg transition-all font-semibold ${
                        subTab === "tramitacao"
                          ? "bg-psa-orange text-white shadow-md"
                          : "text-white/85 hover:text-white"
                      }`}
                    >
                      Tramitação
                    </button>
                  </div>
                )}

                {/* Linha de baixo: Receita + Admin lado a lado */}
                <div className="flex flex-wrap items-end gap-4">
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

                  {/* Botão Admin (gerenciar farmers e datas) */}
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/85 mb-2">
                      Admin
                    </span>
                    <a
                      href={`/admin/farmers${accessKey ? `?key=${encodeURIComponent(accessKey)}` : ""}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-sm font-semibold text-white/90 hover:bg-white/[0.12] hover:text-white transition-all"
                      title="Abrir painel administrativo"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      Gerenciar
                    </a>
                  </div>
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

      {/* Aviso de integridade: ganhos sem o campo "Valor total bruto" preenchido.
          Aparece pra todos. A Pri usa pra contatar o farmer e regularizar o cadastro. */}
      {data && data.ganhosSemBruto.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <svg
              className="flex-shrink-0 mt-0.5 h-5 w-5 text-amber-600"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold mb-1">
                {data.ganhosSemBruto.length === 1
                  ? "1 ganho sem valor bruto preenchido"
                  : `${data.ganhosSemBruto.length} ganhos sem valor bruto preenchido`}
              </div>
              <div className="text-amber-800 text-xs mb-2">
                Os deals abaixo estão como ganho mas com o campo{" "}
                <span className="font-mono">Valor total do contrato (Bruto) (GANHO)</span>{" "}
                vazio. Confirmar com o farmer responsável e regularizar o cadastro.
              </div>
              <ul className="space-y-1 text-xs">
                {data.ganhosSemBruto.map((g) => (
                  <li key={g.dealId} className="flex flex-wrap gap-x-2">
                    <span className="font-semibold text-amber-900">{g.dealname}</span>
                    <span className="text-amber-700">— {g.farmerNome}</span>
                    {g.closedate && (
                      <span className="text-amber-600">
                        ({new Date(g.closedate).toLocaleDateString("pt-BR")})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

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

      {/* === SUB-ABA: NEGÓCIOS === */}
      {subTab === "negocios" && (
      <>
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
          onClick={
            view && view.ganhos > 0
              ? () => {
                  // Título descritivo segundo o escopo (Geral ou Squad X)
                  const scopeLabel =
                    tab === "all"
                      ? "Geral"
                      : tab === "dani"
                      ? "Squad Dani"
                      : tab === "katyeli"
                      ? "Squad Katyeli"
                      : "Squad Leticia";
                  setModal({
                    mode: "aggregated",
                    kind: "ganhos",
                    title: `Todos os ganhos · ${scopeLabel}`,
                  });
                }
              : undefined
          }
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
          onDrillDown={(farmer, kind) => setModal({ mode: "single", farmer, kind })}
        />
      </section>
      </>
      )}

      {/* === SUB-ABA: TRAMITAÇÃO === */}
      {subTab === "tramitacao" && data?.meta.pipelineCsAtivo && view && (
        <CsTramSection
          topo={view.topoCs}
          rows={view.farmers}
          loading={loading}
          onDrillDownTramite={(farmer) =>
            setModal({ mode: "single", farmer, kind: "tramite" })
          }
        />
      )}

      {/* Modal de drill-down (clique em números OU em cards do topo) */}
      <DealsModal
        open={modal !== null}
        onClose={() => setModal(null)}
        farmerName={
          modal?.mode === "single"
            ? modal.farmer.nome
            : modal?.mode === "aggregated"
            ? modal.title
            : ""
        }
        kind={modal?.kind ?? "ganhos"}
        deals={
          modal?.mode === "single"
            ? modal.kind === "ganhos"
              ? modal.farmer.dealsGanhos
              : modal.kind === "perdidos"
              ? modal.farmer.dealsPerdidos
              : modal.kind === "aberto"
              ? modal.farmer.dealsEmAberto
              : undefined
            : undefined
        }
        aggregatedDeals={
          modal?.mode === "aggregated" && modal.kind === "ganhos" && view
            ? view.farmers.flatMap((f) =>
                f.dealsGanhos.map((d) => ({ ...d, ownerName: f.nome }))
              )
            : undefined
        }
        tickets={
          modal?.mode === "single" && modal.kind === "tramite"
            ? modal.farmer.ticketsEmTramite
            : undefined
        }
      />
    </main>
  );
}