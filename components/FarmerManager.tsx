"use client";

/**
 * FarmerManager — gestão completa de farmers em uma única tabela.
 *
 * Cada linha mostra: farmer + email, squad (select), data de início (input),
 * status (Ativo/Oculto/Adicionado) e ações (Ocultar/Mostrar + Remover/Resetar).
 *
 * Filtro de squad no topo (chips). "Adicionar farmer" em um card acima.
 * Visual espelha o card "Detalhe por farmer" do dash (cabeçalho preto,
 * linhas com hover, rounded-2xl + shadow-card).
 *
 * O componente é responsável por TUDO (não há mais a página separada de
 * "Datas de início" — está embutido aqui na coluna).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type SquadId = "dani" | "katyeli" | "leticia";

type FarmerOverrideRow = {
  ownerId: string;
  nome: string;
  email: string;
  squadId: SquadId;
  baseSquadId: SquadId | null;
  source: "base" | "override";
  hidden: boolean;
};

type AvailableOwner = {
  ownerId: string;
  nome: string;
  email: string;
};

type StartDateRow = {
  email: string;
  ownerId: string | null;
  nome: string;
  squadId: SquadId | null;
  startDate: string | null;
};

type CombinedRow = FarmerOverrideRow & {
  startDate: string | null;
};

const SQUAD_LABEL: Record<SquadId, string> = {
  dani: "Squad Dani",
  katyeli: "Squad Katyeli",
  leticia: "Squad Leticia",
};

const SQUAD_IDS: SquadId[] = ["dani", "katyeli", "leticia"];

type SaveState = "idle" | "saving" | "saved" | "error";
type FilterSquad = "todos" | SquadId;

type Props = { accessKey: string };

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (iso: string) => {
  const start = new Date(iso);
  const today = new Date(todayISO());
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));
};
const formatBR = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

export default function FarmerManager({ accessKey }: Props) {
  const [current, setCurrent] = useState<FarmerOverrideRow[]>([]);
  const [available, setAvailable] = useState<AvailableOwner[]>([]);
  const [startDates, setStartDates] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  // edição de data de início (mapa por ownerId)
  const [dateEdits, setDateEdits] = useState<Map<string, string>>(new Map());
  const [rowState, setRowState] = useState<Map<string, SaveState>>(new Map());

  // adicionar farmer
  const [addOwnerId, setAddOwnerId] = useState("");
  const [addSquadId, setAddSquadId] = useState<SquadId>("dani");
  const [addState, setAddState] = useState<SaveState>("idle");

  // filtro
  const [filterSquad, setFilterSquad] = useState<FilterSquad>("todos");

  const setRow = (ownerId: string, s: SaveState) =>
    setRowState((prev) => {
      const next = new Map(prev);
      next.set(ownerId, s);
      return next;
    });

  const qs = useMemo(
    () => (accessKey ? `?key=${encodeURIComponent(accessKey)}` : ""),
    [accessKey]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Busca em paralelo: overrides (current + available) e start-dates
      const [overridesRes, startsRes] = await Promise.all([
        fetch(`/api/admin/farmer-overrides${qs}`),
        fetch(`/api/admin/start-dates${qs}`),
      ]);
      const overridesJson = await overridesRes.json();
      const startsJson = await startsRes.json();
      if (!overridesRes.ok) throw new Error(overridesJson?.error || `HTTP ${overridesRes.status}`);
      if (!startsRes.ok) throw new Error(startsJson?.error || `HTTP ${startsRes.status}`);

      setCurrent(overridesJson.current);
      setAvailable(overridesJson.available);

      const sdMap = new Map<string, string | null>();
      for (const f of startsJson.farmers as StartDateRow[]) {
        if (f.ownerId) sdMap.set(f.ownerId, f.startDate);
      }
      setStartDates(sdMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    load();
  }, [load]);

  const postOverride = async (
    farmer: FarmerOverrideRow,
    patch: { squadId?: SquadId; hidden?: boolean }
  ) => {
    setRow(farmer.ownerId, "saving");
    try {
      const res = await fetch(`/api/admin/farmer-overrides${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: farmer.ownerId,
          squadId: patch.squadId ?? farmer.squadId,
          hidden: patch.hidden ?? farmer.hidden,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setCurrent((prev) =>
        prev.map((f) =>
          f.ownerId === farmer.ownerId
            ? {
                ...f,
                squadId: patch.squadId ?? f.squadId,
                hidden: patch.hidden ?? f.hidden,
                source: "override",
              }
            : f
        )
      );
      setRow(farmer.ownerId, "saved");
      setTimeout(() => setRow(farmer.ownerId, "idle"), 1500);
    } catch (e) {
      setRow(farmer.ownerId, "error");
      console.error(e);
    }
  };

  const toggleHidden = (f: FarmerOverrideRow) => postOverride(f, { hidden: !f.hidden });
  const moveSquad = (f: FarmerOverrideRow, newSquad: SquadId) => {
    if (newSquad === f.squadId) return;
    postOverride(f, { squadId: newSquad });
  };

  /**
   * Comportamento do "Remover":
   * - Adicionado (sem baseSquadId): apaga o override → some do dashboard (com confirm)
   * - Base com override: apaga o override → volta squad/visibilidade do código
   * - Base puro: vira atalho pra ocultar (com confirm)
   */
  const removeFarmer = async (farmer: FarmerOverrideRow) => {
    const isAdded = !farmer.baseSquadId;
    const isBasePure = !isAdded && farmer.source === "base";

    if (isAdded) {
      if (
        !window.confirm(
          `Remover "${farmer.nome}" do dashboard?\n\nEle foi adicionado pelo admin e não está na lista base. Após remover, ele só volta se for adicionado novamente.`
        )
      ) return;
    } else if (isBasePure) {
      if (
        !window.confirm(
          `Ocultar "${farmer.nome}" do dashboard?\n\nEle faz parte da lista base do sistema e não pode ser apagado, mas ficará oculto. Você pode reativá-lo a qualquer momento clicando em "Mostrar".`
        )
      ) return;
      await toggleHidden(farmer);
      return;
    }

    setRow(farmer.ownerId, "saving");
    try {
      const res = await fetch(
        `/api/admin/farmer-overrides${qs ? qs + "&" : "?"}ownerId=${encodeURIComponent(farmer.ownerId)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setRow(farmer.ownerId, "error");
      console.error(e);
    }
  };

  const addFarmer = async () => {
    if (!addOwnerId) return;
    setAddState("saving");
    try {
      const res = await fetch(`/api/admin/farmer-overrides${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: addOwnerId, squadId: addSquadId, hidden: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setAddState("saved");
      setAddOwnerId("");
      setTimeout(() => setAddState("idle"), 1500);
      await load();
    } catch (e) {
      setAddState("error");
      console.error(e);
    }
  };

  const setDateEdit = (ownerId: string, value: string) => {
    setDateEdits((prev) => {
      const next = new Map(prev);
      next.set(ownerId, value);
      return next;
    });
    setRow(ownerId, "idle");
  };

  const saveDate = async (ownerId: string) => {
    const newValue = dateEdits.get(ownerId) ?? "";
    const original = startDates.get(ownerId) ?? "";
    if (newValue === original) return;

    setRow(ownerId, "saving");
    try {
      const res = await fetch(`/api/admin/start-dates${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, startDate: newValue || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setStartDates((prev) => {
        const next = new Map(prev);
        next.set(ownerId, newValue || null);
        return next;
      });
      setDateEdits((prev) => {
        const next = new Map(prev);
        next.delete(ownerId);
        return next;
      });
      setRow(ownerId, "saved");
      setTimeout(() => setRow(ownerId, "idle"), 1500);
    } catch (e) {
      setRow(ownerId, "error");
      console.error(e);
    }
  };

  // Combina overrides + datas pra montar as linhas
  const rows: CombinedRow[] = useMemo(() => {
    const visible = showHidden ? current : current.filter((f) => !f.hidden);
    const arr = visible.map((f) => ({
      ...f,
      startDate: startDates.get(f.ownerId) ?? null,
    }));
    // Ordena por squad (na ordem SQUAD_IDS) e depois nome
    const order: Record<SquadId, number> = { dani: 0, katyeli: 1, leticia: 2 };
    arr.sort((a, b) => {
      const sa = order[a.squadId];
      const sb = order[b.squadId];
      if (sa !== sb) return sa - sb;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
    return arr;
  }, [current, startDates, showHidden]);

  const filteredRows = filterSquad === "todos"
    ? rows
    : rows.filter((r) => r.squadId === filterSquad);

  const hiddenCount = current.filter((f) => f.hidden).length;
  const countsBySquad = useMemo(() => {
    const c: Record<FilterSquad, number> = { todos: rows.length, dani: 0, katyeli: 0, leticia: 0 };
    for (const r of rows) c[r.squadId] += 1;
    return c;
  }, [rows]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-psa-surface border border-psa-line p-8 text-center text-sm text-psa-ink-soft">
        Carregando…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <div className="font-display font-semibold mb-1">Erro ao carregar</div>
        <div className="text-red-700">{error}</div>
        {error.includes("unauthorized") && (
          <div className="mt-2 text-xs text-red-700">
            Adicione <code className="px-1 py-0.5 bg-red-100 rounded">?key=SUA_CHAVE</code> à URL.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Card "Adicionar farmer" */}
      <section className="rounded-2xl bg-psa-surface border border-psa-line shadow-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-block w-2 h-2 rounded-sm bg-psa-orange" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-psa-orange">
            Adicionar farmer
          </h2>
        </div>
        {available.length === 0 ? (
          <p className="text-sm text-psa-ink-soft">
            Nenhum owner disponível no HubSpot fora da lista atual. Para adicionar um novo
            farmer, o usuário precisa primeiro existir como owner ativo no HubSpot.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col flex-1 min-w-[240px]">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-psa-ink-soft mb-1">
                Usuário do HubSpot
              </label>
              <select
                value={addOwnerId}
                onChange={(e) => setAddOwnerId(e.target.value)}
                className="rounded-lg border border-psa-line bg-white px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
              >
                <option value="">— escolha —</option>
                {available.map((o) => (
                  <option key={o.ownerId} value={o.ownerId}>
                    {o.nome} ({o.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-psa-ink-soft mb-1">
                Squad
              </label>
              <select
                value={addSquadId}
                onChange={(e) => setAddSquadId(e.target.value as SquadId)}
                className="rounded-lg border border-psa-line bg-white px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
              >
                {SQUAD_IDS.map((id) => (
                  <option key={id} value={id}>
                    {SQUAD_LABEL[id]}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={addFarmer}
              disabled={!addOwnerId || addState === "saving"}
              className="px-4 py-2 rounded-lg bg-psa-blue text-white text-sm font-semibold hover:bg-psa-blue/90 disabled:bg-psa-line disabled:text-psa-ink-soft disabled:cursor-not-allowed transition-colors min-w-[120px]"
            >
              {addState === "saving"
                ? "Adicionando..."
                : addState === "saved"
                ? "✓ Adicionado"
                : addState === "error"
                ? "Erro"
                : "Adicionar"}
            </button>
          </div>
        )}
      </section>

      {/* Filtro por squad + toggle ocultos */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-psa-surface border border-psa-line p-1">
          {(["todos", ...SQUAD_IDS] as FilterSquad[]).map((id) => {
            const active = filterSquad === id;
            const label = id === "todos" ? "Todos" : SQUAD_LABEL[id];
            return (
              <button
                key={id}
                onClick={() => setFilterSquad(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
                  active
                    ? "bg-psa-ink text-white"
                    : "text-psa-ink-soft hover:text-psa-ink hover:bg-psa-canvas"
                }`}
              >
                <span>{label}</span>
                <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded ${
                  active ? "bg-white/15" : "bg-psa-canvas text-psa-ink-soft"
                }`}>
                  {countsBySquad[id]}
                </span>
              </button>
            );
          })}
        </div>

        {hiddenCount > 0 && (
          <button
            onClick={() => setShowHidden((v) => !v)}
            className="text-xs font-semibold text-psa-blue hover:underline"
          >
            {showHidden ? `Esconder ${hiddenCount} ocultos` : `Mostrar ${hiddenCount} ocultos`}
          </button>
        )}
      </div>

      {/* Tabela única — espelha o "Detalhe por farmer" do dash */}
      <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-psa-ink text-white">
              <tr>
                <th className="text-left p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Farmer</th>
                <th className="text-left p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Squad</th>
                <th className="text-left p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Data de início</th>
                <th className="text-right p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-sm text-psa-ink-soft">
                    Nenhum farmer nesse filtro.
                  </td>
                </tr>
              )}
              {filteredRows.map((f) => {
                const state = rowState.get(f.ownerId) ?? "idle";
                const editedDate = dateEdits.get(f.ownerId);
                const currentDate = editedDate ?? f.startDate ?? "";
                const dateDirty = editedDate !== undefined && editedDate !== (f.startDate ?? "");
                const days = f.startDate ? daysBetween(f.startDate) : null;
                const moved = f.baseSquadId && f.baseSquadId !== f.squadId ? f.baseSquadId : null;
                const isAdded = !f.baseSquadId;

                return (
                  <tr
                    key={f.ownerId}
                    className={`border-t border-psa-line hover:bg-psa-canvas transition-colors ${
                      f.hidden ? "opacity-60" : ""
                    }`}
                  >
                    {/* Farmer + badges */}
                    <td className="p-3 align-top">
                      <div className="min-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-psa-ink">{f.nome}</span>
                          {isAdded && (
                            <span className="text-[9px] uppercase tracking-wider font-bold bg-psa-blue-soft text-psa-blue px-1.5 py-0.5 rounded">
                              Adicionado
                            </span>
                          )}
                          {f.hidden && (
                            <span className="text-[9px] uppercase tracking-wider font-bold bg-psa-canvas text-psa-ink-soft px-1.5 py-0.5 rounded">
                              Oculto
                            </span>
                          )}
                          {moved && (
                            <span
                              className="text-[9px] italic text-psa-ink-soft"
                              title={`Movido de ${SQUAD_LABEL[moved]}`}
                            >
                              ← {SQUAD_LABEL[moved]}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-psa-ink-soft mt-0.5">{f.email}</div>
                      </div>
                    </td>

                    {/* Squad select */}
                    <td className="p-3 align-top">
                      <select
                        value={f.squadId}
                        onChange={(e) => moveSquad(f, e.target.value as SquadId)}
                        disabled={state === "saving"}
                        className="rounded-lg border border-psa-line bg-white px-2.5 py-1.5 text-xs text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
                      >
                        {SQUAD_IDS.map((id) => (
                          <option key={id} value={id}>{SQUAD_LABEL[id]}</option>
                        ))}
                      </select>
                    </td>

                    {/* Data de início */}
                    <td className="p-3 align-top">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="date"
                            value={currentDate}
                            max={todayISO()}
                            onChange={(e) => setDateEdit(f.ownerId, e.target.value)}
                            className="rounded-lg border border-psa-line bg-white px-2.5 py-1.5 text-xs text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
                          />
                          {dateDirty && (
                            <button
                              onClick={() => saveDate(f.ownerId)}
                              disabled={state === "saving"}
                              className="px-2 py-1.5 rounded-lg bg-psa-blue text-white text-[10px] font-semibold hover:bg-psa-blue/90 transition-colors"
                            >
                              {state === "saving" ? "..." : "Salvar"}
                            </button>
                          )}
                        </div>
                        {f.startDate && days !== null && !dateDirty && (
                          <span className="text-[10px] text-psa-ink-soft">
                            <span className="font-semibold text-psa-blue">{days}d</span>{" "}
                            desde {formatBR(f.startDate)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Ações */}
                    <td className="p-3 align-top">
                      <div className="flex items-center justify-end gap-1.5">
                        {state === "saved" && (
                          <span className="text-[10px] text-psa-blue font-semibold mr-1">✓ Salvo</span>
                        )}
                        {state === "error" && (
                          <span className="text-[10px] text-red-600 font-semibold mr-1">Erro</span>
                        )}
                        <button
                          onClick={() => toggleHidden(f)}
                          disabled={state === "saving"}
                          className="px-2.5 py-1.5 rounded-lg border border-psa-line text-[11px] font-semibold text-psa-ink-soft hover:bg-psa-canvas transition-colors"
                          title={f.hidden ? "Voltar a mostrar no dashboard" : "Ocultar do dashboard"}
                        >
                          {f.hidden ? "Mostrar" : "Ocultar"}
                        </button>
                        <button
                          onClick={() => removeFarmer(f)}
                          disabled={state === "saving"}
                          className="px-2.5 py-1.5 rounded-lg border border-red-200 text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                          title={
                            isAdded
                              ? "Remover do sistema (foi adicionado pelo admin)"
                              : f.source === "override"
                              ? "Resetar para o estado original do código"
                              : "Ocultar do dashboard (faz parte da lista base, não pode ser apagado)"
                          }
                        >
                          {isAdded ? "Remover" : f.source === "override" ? "Resetar" : "Remover"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
