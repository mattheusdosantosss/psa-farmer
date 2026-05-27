"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SquadId = "dani" | "katyeli" | "leticia";

type CurrentFarmer = {
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

type ApiResponse = {
  current: CurrentFarmer[];
  available: AvailableOwner[];
};

const SQUAD_LABEL: Record<SquadId, string> = {
  dani: "Squad Dani",
  katyeli: "Squad Katyeli",
  leticia: "Squad Leticia",
};

const SQUAD_IDS: SquadId[] = ["dani", "katyeli", "leticia"];

type SaveState = "idle" | "saving" | "saved" | "error";

type Props = {
  accessKey: string;
};

export default function FarmerManager({ accessKey }: Props) {
  const [current, setCurrent] = useState<CurrentFarmer[]>([]);
  const [available, setAvailable] = useState<AvailableOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [rowState, setRowState] = useState<Map<string, SaveState>>(new Map());

  // estado do form "adicionar farmer"
  const [addOwnerId, setAddOwnerId] = useState("");
  const [addSquadId, setAddSquadId] = useState<SquadId>("dani");
  const [addState, setAddState] = useState<SaveState>("idle");

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
      const res = await fetch(`/api/admin/farmer-overrides${qs}`);
      const json = (await res.json()) as ApiResponse | { error: string };
      if (!res.ok) throw new Error(("error" in json && json.error) || `HTTP ${res.status}`);
      const data = json as ApiResponse;
      setCurrent(data.current);
      setAvailable(data.available);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    load();
  }, [load]);

  const moveSquad = async (farmer: CurrentFarmer, newSquad: SquadId) => {
    if (newSquad === farmer.squadId) return;
    setRow(farmer.ownerId, "saving");
    try {
      const res = await fetch(`/api/admin/farmer-overrides${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: farmer.ownerId,
          squadId: newSquad,
          hidden: farmer.hidden,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setCurrent((prev) =>
        prev.map((f) =>
          f.ownerId === farmer.ownerId
            ? { ...f, squadId: newSquad, source: "override" }
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

  const toggleHidden = async (farmer: CurrentFarmer) => {
    setRow(farmer.ownerId, "saving");
    try {
      const res = await fetch(`/api/admin/farmer-overrides${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: farmer.ownerId,
          squadId: farmer.squadId,
          hidden: !farmer.hidden,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setCurrent((prev) =>
        prev.map((f) =>
          f.ownerId === farmer.ownerId
            ? { ...f, hidden: !farmer.hidden, source: "override" }
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

  /**
   * Remoção unificada — comportamento depende do tipo do farmer:
   *
   * 1. Farmer adicionado (não está na lista base): DELETE override → some do dashboard.
   *    Confirma com a Pri porque a ação é destrutiva (precisa adicionar de novo pra voltar).
   *
   * 2. Farmer base COM override (squad ou hidden alterado): DELETE override → volta ao
   *    estado original do código. Não precisa confirmar (reversível: basta editar de novo).
   *
   * 3. Farmer base SEM override (puro do código): o "Remover" funciona como atalho pra
   *    ocultar do dashboard. Tecnicamente é o mesmo que clicar em "Ocultar", mas o botão
   *    fica vermelho pra reforçar a intenção. Confirma porque o farmer some da view padrão.
   */
  const removeFarmer = async (farmer: CurrentFarmer) => {
    const isAdded = !farmer.baseSquadId;
    const hasOverride = farmer.source === "override";
    const isBasePure = !isAdded && !hasOverride;

    if (isAdded) {
      if (
        !window.confirm(
          `Remover "${farmer.nome}" do dashboard?\n\nEle foi adicionado pelo admin e não está na lista base. Após remover, ele só volta se for adicionado novamente.`
        )
      ) {
        return;
      }
    } else if (isBasePure) {
      if (
        !window.confirm(
          `Ocultar "${farmer.nome}" do dashboard?\n\nEle faz parte da lista base do sistema e não pode ser apagado, mas ficará oculto. Você pode reativá-lo a qualquer momento clicando em "Mostrar".`
        )
      ) {
        return;
      }
      // Não tem override pra deletar — só esconde
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
      await load(); // recarrega tudo (farmer pode ter saído da lista ou voltado pra squad base)
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
        body: JSON.stringify({
          ownerId: addOwnerId,
          squadId: addSquadId,
          hidden: false,
        }),
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

  const visible = showHidden ? current : current.filter((f) => !f.hidden);
  const hiddenCount = current.filter((f) => f.hidden).length;

  const bySquad = useMemo(() => {
    const map = new Map<SquadId, CurrentFarmer[]>();
    for (const id of SQUAD_IDS) map.set(id, []);
    for (const f of visible) {
      const list = map.get(f.squadId);
      if (list) list.push(f);
    }
    return map;
  }, [visible]);

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
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            Nenhum owner disponível no HubSpot fora da lista atual. Para adicionar
            um novo farmer, o usuário precisa primeiro existir como owner ativo no
            HubSpot.
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
        <p className="mt-3 text-xs text-psa-ink-soft">
          Depois de adicionar, defina a data de início dele na aba "Datas de início".
        </p>
      </section>

      {/* Toggle de ocultos */}
      <div className="flex items-center justify-between text-xs text-psa-ink-soft">
        <span>
          {visible.length} {visible.length === 1 ? "farmer" : "farmers"} visíveis
          {hiddenCount > 0 && <> · {hiddenCount} ocultos</>}
        </span>
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowHidden((v) => !v)}
            className="font-semibold text-psa-blue hover:underline"
          >
            {showHidden ? "Esconder ocultos" : "Mostrar ocultos"}
          </button>
        )}
      </div>

      {/* Lista por squad */}
      {SQUAD_IDS.map((sid) => {
        const list = bySquad.get(sid) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={sid}>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-2 h-2 rounded-sm bg-psa-orange" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-psa-orange">
                {SQUAD_LABEL[sid]}
              </h2>
            </div>
            <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
              {list.map((f, i) => {
                const state = rowState.get(f.ownerId) ?? "idle";
                const moved =
                  f.baseSquadId && f.baseSquadId !== f.squadId
                    ? f.baseSquadId
                    : null;
                return (
                  <div
                    key={f.ownerId}
                    className={`flex flex-wrap items-center gap-4 p-4 ${
                      i > 0 ? "border-t border-psa-line" : ""
                    } ${f.hidden ? "opacity-60" : ""}`}
                  >
                    <div className="min-w-[200px] flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-psa-ink">{f.nome}</span>
                        {f.source === "override" && !moved && !f.hidden && f.baseSquadId === null && (
                          <span className="text-[10px] uppercase tracking-wider font-bold bg-psa-blue-soft text-psa-blue px-1.5 py-0.5 rounded">
                            Adicionado
                          </span>
                        )}
                        {f.hidden && (
                          <span className="text-[10px] uppercase tracking-wider font-bold bg-psa-canvas text-psa-ink-soft px-1.5 py-0.5 rounded">
                            Oculto
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-psa-ink-soft mt-0.5">{f.email}</div>
                      {moved && (
                        <div className="text-[10px] text-psa-ink-soft mt-1 italic">
                          movido de {SQUAD_LABEL[moved]}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={f.squadId}
                        onChange={(e) => moveSquad(f, e.target.value as SquadId)}
                        disabled={state === "saving"}
                        className="rounded-lg border border-psa-line bg-white px-3 py-1.5 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
                      >
                        {SQUAD_IDS.map((id) => (
                          <option key={id} value={id}>
                            {SQUAD_LABEL[id]}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => toggleHidden(f)}
                        disabled={state === "saving"}
                        className="px-3 py-1.5 rounded-lg border border-psa-line text-xs font-semibold text-psa-ink-soft hover:bg-psa-canvas transition-colors min-w-[80px]"
                        title={f.hidden ? "Voltar a mostrar no dashboard" : "Ocultar do dashboard"}
                      >
                        {f.hidden ? "Mostrar" : "Ocultar"}
                      </button>

                      <button
                        onClick={() => removeFarmer(f)}
                        disabled={state === "saving"}
                        className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                        title={
                          !f.baseSquadId
                            ? "Remover do sistema (foi adicionado pelo admin)"
                            : f.source === "override"
                            ? "Resetar para o estado original do código (volta squad/visibilidade do código)"
                            : "Ocultar do dashboard (faz parte da lista base, não pode ser apagado)"
                        }
                      >
                        {!f.baseSquadId
                          ? "Remover"
                          : f.source === "override"
                          ? "Resetar"
                          : "Remover"}
                      </button>

                      {state === "saving" && (
                        <span className="text-xs text-psa-ink-soft">Salvando…</span>
                      )}
                      {state === "saved" && (
                        <span className="text-xs text-psa-blue font-semibold">✓ Salvo</span>
                      )}
                      {state === "error" && (
                        <span className="text-xs text-red-600 font-semibold">Erro</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
