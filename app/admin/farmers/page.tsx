"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FarmerManager from "@/components/FarmerManager";

type AdminTab = "datas" | "gerenciar";

type FarmerRecord = {
  email: string;
  ownerId: string | null;
  nome: string;
  squadId: "dani" | "katyeli" | "leticia" | null;
  startDate: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const SQUAD_LABEL: Record<string, string> = {
  dani: "Squad Dani",
  katyeli: "Squad Katyeli",
  leticia: "Squad Leticia",
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const daysBetween = (iso: string) => {
  const start = new Date(iso);
  const today = new Date(todayISO());
  if (Number.isNaN(start.getTime())) return null;
  const ms = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

const formatBR = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

export default function AdminFarmersPage() {
  const [farmers, setFarmers] = useState<FarmerRecord[]>([]);
  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  const [saveStates, setSaveStates] = useState<Map<string, SaveState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [tab, setTab] = useState<AdminTab>("datas");

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key") || "";
    setAccessKey(k);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = accessKey ? `?key=${encodeURIComponent(accessKey)}` : "";
      const res = await fetch(`/api/admin/start-dates${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setFarmers(json.farmers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [accessKey]);

  useEffect(() => {
    if (tab === "datas") load();
  }, [load, tab]);

  const setEdit = (ownerId: string, value: string) => {
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(ownerId, value);
      return next;
    });
    setSaveStates((prev) => {
      const next = new Map(prev);
      next.set(ownerId, "idle");
      return next;
    });
  };

  const saveOne = async (farmer: FarmerRecord) => {
    if (!farmer.ownerId) return;
    const newValue = edits.get(farmer.ownerId) ?? farmer.startDate ?? "";
    const original = farmer.startDate ?? "";
    if (newValue === original) return; // nada mudou

    setSaveStates((prev) => {
      const next = new Map(prev);
      next.set(farmer.ownerId!, "saving");
      return next;
    });

    try {
      const qs = accessKey ? `?key=${encodeURIComponent(accessKey)}` : "";
      const res = await fetch(`/api/admin/start-dates${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: farmer.ownerId,
          startDate: newValue || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      // Atualiza o registro local pra refletir o novo valor
      setFarmers((prev) =>
        prev.map((f) =>
          f.ownerId === farmer.ownerId
            ? { ...f, startDate: newValue || null }
            : f
        )
      );
      setEdits((prev) => {
        const next = new Map(prev);
        next.delete(farmer.ownerId!);
        return next;
      });
      setSaveStates((prev) => {
        const next = new Map(prev);
        next.set(farmer.ownerId!, "saved");
        return next;
      });

      // Limpa o "saved" depois de 2s
      setTimeout(() => {
        setSaveStates((prev) => {
          const next = new Map(prev);
          if (next.get(farmer.ownerId!) === "saved") next.delete(farmer.ownerId!);
          return next;
        });
      }, 2000);
    } catch (e) {
      setSaveStates((prev) => {
        const next = new Map(prev);
        next.set(farmer.ownerId!, "error");
        return next;
      });
      console.error(e);
    }
  };

  const farmersBySquad = useMemo(() => {
    const map = new Map<string, FarmerRecord[]>();
    for (const f of farmers) {
      const key = f.squadId ?? "sem_squad";
      const arr = map.get(key) ?? [];
      arr.push(f);
      map.set(key, arr);
    }
    return map;
  }, [farmers]);

  const totalDefinidas = farmers.filter((f) => f.startDate).length;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-psa-ink text-white shadow-card">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full bg-psa-orange opacity-20 blur-[2px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 h-full w-1.5 bg-psa-orange"
        />
        <div className="relative px-8 py-8">
          {/* Botão voltar pro dashboard */}
          <div className="mb-5">
            <a
              href={`/${accessKey ? `?key=${encodeURIComponent(accessKey)}` : ""}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
              Voltar para o dashboard
            </a>
          </div>

          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-psa-orange/15 border border-psa-orange/30">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-psa-orange" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">
              PSA · Administração
            </span>
          </div>
          <h1 className="font-display text-[36px] leading-[1.05] font-extrabold tracking-tight text-white">
            Administração
            <br />
            <span className="text-psa-orange">de farmers.</span>
          </h1>
          <p className="mt-4 text-sm text-white/85 max-w-md">
            Gerencie quem aparece no dashboard, em qual squad, e a data de
            início como farmer.
          </p>
          {tab === "datas" && !loading && farmers.length > 0 && (
            <div className="mt-4 text-xs text-white/70">
              {totalDefinidas} de {farmers.length} farmers com data definida
            </div>
          )}
        </div>
      </section>

      {/* Abas */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl bg-psa-surface border border-psa-line p-1">
        {[
          { id: "datas" as const, label: "Datas de início" },
          { id: "gerenciar" as const, label: "Gerenciar farmers" },
        ].map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                active
                  ? "bg-psa-ink text-white"
                  : "text-psa-ink-soft hover:text-psa-ink hover:bg-psa-canvas"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Aba: Gerenciar farmers */}
      {tab === "gerenciar" && <FarmerManager accessKey={accessKey} />}

      {/* Aba: Datas de início — Erro */}
      {tab === "datas" && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-display font-semibold mb-1">Erro ao carregar</div>
          <div className="text-red-700">{error}</div>
          {error.includes("unauthorized") && (
            <div className="mt-2 text-xs text-red-700">
              Adicione <code className="px-1 py-0.5 bg-red-100 rounded">?key=SUA_CHAVE</code> à URL.
            </div>
          )}
        </div>
      )}

      {/* Aba: Datas de início — Lista de farmers */}
      {tab === "datas" && (loading ? (
        <div className="rounded-2xl bg-psa-surface border border-psa-line p-8 text-center text-sm text-psa-ink-soft">
          Carregando…
        </div>
      ) : (
        Array.from(farmersBySquad.entries()).map(([squadKey, list]) => (
          <section key={squadKey}>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-2 h-2 rounded-sm bg-psa-orange" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-psa-orange">
                {SQUAD_LABEL[squadKey] ?? "Sem squad"}
              </h2>
            </div>

            <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
              {list.map((f, i) => {
                const ownerId = f.ownerId;
                const edited = ownerId ? edits.get(ownerId) : undefined;
                const currentValue = edited ?? f.startDate ?? "";
                const dirty = edited !== undefined && edited !== (f.startDate ?? "");
                const state = ownerId ? saveStates.get(ownerId) ?? "idle" : "idle";
                const days = f.startDate ? daysBetween(f.startDate) : null;

                return (
                  <div
                    key={f.email}
                    className={`flex flex-wrap items-center gap-4 p-4 ${
                      i > 0 ? "border-t border-psa-line" : ""
                    }`}
                  >
                    <div className="min-w-[200px] flex-1">
                      <div className="font-medium text-psa-ink">{f.nome}</div>
                      <div className="text-xs text-psa-ink-soft">{f.email}</div>
                    </div>

                    {f.startDate && days !== null && (
                      <div className="text-xs text-psa-ink-soft whitespace-nowrap">
                        <span className="font-semibold text-psa-blue">{days}d</span>{" "}
                        desde {formatBR(f.startDate)}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={currentValue}
                        max={todayISO()}
                        onChange={(e) => ownerId && setEdit(ownerId, e.target.value)}
                        disabled={!ownerId}
                        className="rounded-lg border border-psa-line bg-white px-3 py-1.5 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10 disabled:opacity-50"
                      />
                      <button
                        onClick={() => saveOne(f)}
                        disabled={!ownerId || !dirty || state === "saving"}
                        className="px-3 py-1.5 rounded-lg bg-psa-blue text-white text-xs font-semibold hover:bg-psa-blue/90 disabled:bg-psa-line disabled:text-psa-ink-soft disabled:cursor-not-allowed transition-colors min-w-[70px]"
                      >
                        {state === "saving"
                          ? "Salvando..."
                          : state === "saved"
                          ? "✓ Salvo"
                          : state === "error"
                          ? "Erro"
                          : "Salvar"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      ))}
    </main>
  );
}