"use client";

/**
 * FarmerManager — gestão completa de farmers em uma única tabela.
 *
 * Cada linha mostra: farmer + email, squad (select), data de início (input)
 * e ação Remover. A remoção é binária — clicou em remover, some da listagem.
 * Pra trazer de volta, basta usar "Adicionar farmer".
 *
 * Filtro de squad no topo (chips). "Adicionar farmer" em um card acima.
 * Visual espelha o card "Detalhe por farmer" do dash (cabeçalho preto,
 * linhas com hover, rounded-2xl + shadow-card).
 *
 * O componente é responsável por TUDO (não há mais a página separada de
 * "Datas de início" — está embutido aqui na coluna).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import type { FarmerTag } from "@/lib/farmer-tags-store";

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

/**
 * Escolhe preto ou branco como texto pra dar contraste sobre uma cor
 * de fundo arbitrária (fórmula YIQ).
 */
function pickReadableTextColor(hex: string): "#000" | "#fff" {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return "#fff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "#fff";
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#000" : "#fff";
}

/**
 * TagCell — célula de tag de um farmer.
 *
 * Estados:
 * - Sem tag → botão "+ Adicionar tag" (texto discreto)
 * - Com tag → chip colorido clicável (abre picker)
 * - Picker aberto → dropdown com tags do vocabulário + "+ Criar nova" + "Remover"
 * - Criando tag → input de nome + color picker + Salvar/Cancelar
 */
type TagCellProps = {
  ownerId: string;
  currentTagName: string | null;
  vocabulary: FarmerTag[];
  isPickerOpen: boolean;
  onTogglePicker: () => void;
  onClosePicker: () => void;
  onAssign: (tagName: string | null) => void;
  creating: { ownerId: string; name: string; color: string } | null;
  onStartCreate: () => void;
  onChangeCreate: (patch: Partial<{ name: string; color: string }>) => void;
  onCancelCreate: () => void;
  onConfirmCreate: () => void;
};

function TagCell({
  currentTagName,
  vocabulary,
  isPickerOpen,
  onTogglePicker,
  onClosePicker,
  onAssign,
  creating,
  onStartCreate,
  onChangeCreate,
  onCancelCreate,
  onConfirmCreate,
}: TagCellProps) {
  // Resolve tag atual (nome → objeto com cor) — pode ser null se a tag foi
  // removida do vocabulário antes de desatribuir do farmer.
  const currentTag = currentTagName
    ? vocabulary.find((t) => t.name.toLowerCase() === currentTagName.toLowerCase()) ?? null
    : null;

  return (
    <div className="relative min-w-[170px]">
      {/* Botão principal: chip ou "+ Adicionar tag" */}
      {currentTag ? (
        <button
          onClick={onTogglePicker}
          className="inline-flex items-center text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded hover:opacity-85 transition-opacity"
          style={{
            backgroundColor: currentTag.color,
            color: pickReadableTextColor(currentTag.color),
          }}
          title="Clique para alterar"
        >
          {currentTag.name}
        </button>
      ) : currentTagName ? (
        <button
          onClick={onTogglePicker}
          className="inline-flex items-center text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-psa-canvas text-psa-ink-soft border border-psa-line hover:bg-white transition-colors"
          title="Tag removida do vocabulário — clique pra ajustar"
        >
          {currentTagName} (?)
        </button>
      ) : (
        <button
          onClick={onTogglePicker}
          className="text-[11px] font-semibold text-psa-blue hover:underline"
        >
          + Adicionar tag
        </button>
      )}

      {/* Dropdown */}
      {isPickerOpen && (
        <>
          {/* Backdrop que fecha ao clicar fora */}
          <div className="fixed inset-0 z-10" onClick={onClosePicker} />
          <div className="absolute left-0 top-full mt-1.5 z-20 w-64 rounded-xl bg-white border border-psa-line shadow-lg p-2">
            {creating ? (
              /* Editor de tag nova */
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-psa-ink-soft">
                  Nova tag
                </div>
                <input
                  type="text"
                  value={creating.name}
                  onChange={(e) => onChangeCreate({ name: e.target.value })}
                  placeholder="Nome da tag"
                  className="w-full px-2 py-1.5 text-sm border border-psa-line rounded-lg focus:outline-none focus:border-psa-orange"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onConfirmCreate();
                    if (e.key === "Escape") onCancelCreate();
                  }}
                />
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-psa-ink-soft">Cor:</label>
                  <input
                    type="color"
                    value={creating.color}
                    onChange={(e) => onChangeCreate({ color: e.target.value })}
                    className="w-8 h-8 rounded border border-psa-line cursor-pointer"
                  />
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ml-auto"
                    style={{
                      backgroundColor: creating.color,
                      color: pickReadableTextColor(creating.color),
                    }}
                  >
                    {creating.name || "preview"}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <button
                    onClick={onCancelCreate}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-psa-ink-soft hover:bg-psa-canvas transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={onConfirmCreate}
                    disabled={!creating.name.trim()}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-psa-orange hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              /* Lista de tags do vocabulário + ações */
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-psa-ink-soft px-2 pt-1 pb-1">
                  Escolha uma tag
                </div>
                {vocabulary.length === 0 && (
                  <div className="text-xs text-psa-ink-soft px-2 py-2 italic">
                    Nenhuma tag criada ainda.
                  </div>
                )}
                <div className="max-h-44 overflow-y-auto">
                  {vocabulary.map((t) => {
                    const selected = currentTagName?.toLowerCase() === t.name.toLowerCase();
                    return (
                      <button
                        key={t.name}
                        onClick={() => {
                          onAssign(t.name);
                          onClosePicker();
                        }}
                        className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-psa-canvas transition-colors ${
                          selected ? "bg-psa-canvas" : ""
                        }`}
                      >
                        <span
                          className="inline-block w-3 h-3 rounded"
                          style={{ backgroundColor: t.color }}
                          aria-hidden
                        />
                        <span className="text-sm text-psa-ink truncate">{t.name}</span>
                        {selected && (
                          <span className="ml-auto text-[10px] text-psa-blue font-bold">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-psa-line my-1" />
                <button
                  onClick={onStartCreate}
                  className="w-full text-left px-2 py-1.5 rounded-md text-sm font-semibold text-psa-orange hover:bg-psa-canvas transition-colors"
                >
                  + Criar nova tag
                </button>
                {currentTagName && (
                  <button
                    onClick={() => {
                      onAssign(null);
                      onClosePicker();
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-md text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Remover tag deste farmer
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function FarmerManager({ accessKey }: Props) {
  const [current, setCurrent] = useState<FarmerOverrideRow[]>([]);
  const [available, setAvailable] = useState<AvailableOwner[]>([]);
  const [startDates, setStartDates] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // edição de data de início (mapa por ownerId)
  const [dateEdits, setDateEdits] = useState<Map<string, string>>(new Map());
  const [rowState, setRowState] = useState<Map<string, SaveState>>(new Map());

  // adicionar farmer
  const [addOwnerId, setAddOwnerId] = useState("");
  const [addSquadId, setAddSquadId] = useState<SquadId>("dani");
  const [addState, setAddState] = useState<SaveState>("idle");

  // filtro
  const [filterSquad, setFilterSquad] = useState<FilterSquad>("todos");

  // modal de confirmação de remoção
  const [removeTarget, setRemoveTarget] = useState<FarmerOverrideRow | null>(null);

  // Tags: vocabulário global + atribuições por ownerId
  const [tagVocabulary, setTagVocabulary] = useState<FarmerTag[]>([]);
  const [tagAssignments, setTagAssignments] = useState<Record<string, string>>({});
  // Estado do dropdown aberto (ownerId) e do editor de tag nova
  const [openTagPicker, setOpenTagPicker] = useState<string | null>(null);
  const [creatingTag, setCreatingTag] = useState<{ ownerId: string; name: string; color: string } | null>(null);

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
      // Busca em paralelo: overrides, start-dates e tags (3 fontes do admin)
      const [overridesRes, startsRes, tagsRes] = await Promise.all([
        fetch(`/api/admin/farmer-overrides${qs}`),
        fetch(`/api/admin/start-dates${qs}`),
        fetch(`/api/admin/farmer-tags${qs}`),
      ]);
      const overridesJson = await overridesRes.json();
      const startsJson = await startsRes.json();
      const tagsJson = await tagsRes.json();
      if (!overridesRes.ok) throw new Error(overridesJson?.error || `HTTP ${overridesRes.status}`);
      if (!startsRes.ok) throw new Error(startsJson?.error || `HTTP ${startsRes.status}`);
      if (!tagsRes.ok) throw new Error(tagsJson?.error || `HTTP ${tagsRes.status}`);

      setCurrent(overridesJson.current);
      setAvailable(overridesJson.available);

      const sdMap = new Map<string, string | null>();
      for (const f of startsJson.farmers as StartDateRow[]) {
        if (f.ownerId) sdMap.set(f.ownerId, f.startDate);
      }
      setStartDates(sdMap);

      setTagVocabulary(Array.isArray(tagsJson.vocabulary) ? tagsJson.vocabulary : []);
      setTagAssignments(tagsJson.assignments && typeof tagsJson.assignments === "object" ? tagsJson.assignments : {});
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

  const moveSquad = (f: FarmerOverrideRow, newSquad: SquadId) => {
    if (newSquad === f.squadId) return;
    postOverride(f, { squadId: newSquad });
  };

  /**
   * Atribui (ou desatribui) uma tag existente a um farmer. Otimista:
   * atualiza a UI antes da resposta da API. Em caso de erro, recarrega
   * tudo pra ressincronizar.
   */
  const assignTag = async (ownerId: string, tagName: string | null) => {
    setTagAssignments((prev) => {
      const next = { ...prev };
      if (tagName) next[ownerId] = tagName;
      else delete next[ownerId];
      return next;
    });
    try {
      const res = await fetch(`/api/admin/farmer-tags${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "assignment", ownerId, tagName }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      console.error("[FarmerManager] falha ao atribuir tag, recarregando", e);
      await load();
    }
  };

  /**
   * Cria uma tag no vocabulário e já atribui ao farmer (operação combinada
   * que é o fluxo natural de "criar nova tag pra esse farmer").
   */
  const createAndAssignTag = async (ownerId: string, name: string, color: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/admin/farmer-tags${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "vocabulary", name: trimmed, color }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setTagVocabulary((prev) => {
        const norm = trimmed.toLowerCase();
        const filtered = prev.filter((t) => t.name.toLowerCase() !== norm);
        filtered.push({ name: trimmed, color });
        return filtered;
      });
      await assignTag(ownerId, trimmed);
      setCreatingTag(null);
      setOpenTagPicker(null);
    } catch (e) {
      console.error("[FarmerManager] falha ao criar tag", e);
      alert(`Não consegui criar a tag: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    }
  };

  /**
   * "Remover" — abre o modal de confirmação. Quem executa de verdade é
   * `confirmRemove` (chamado pelo modal). Independente do tipo de farmer,
   * o resultado é o mesmo: sai da listagem visível do dashboard.
   */
  const requestRemove = (farmer: FarmerOverrideRow) => {
    setRemoveTarget(farmer);
  };

  /**
   * Executa a remoção do farmer da listagem.
   *
   * - Adicionado (sem baseSquadId): DELETE override → some do KV
   * - Base (do código): força hidden=true via POST → sai da listagem do dash
   *
   * Em ambos os casos o resultado pro usuário é o mesmo: some da lista
   * visível e do dashboard. Pra trazer de volta, usa "Adicionar farmer"
   * normalmente — a re-adição cria/atualiza o override com hidden=false.
   */
  const confirmRemove = async () => {
    const farmer = removeTarget;
    if (!farmer) return;
    const isAdded = !farmer.baseSquadId;

    setRemoveTarget(null); // fecha o modal imediatamente
    setRow(farmer.ownerId, "saving");

    try {
      if (isAdded) {
        const res = await fetch(
          `/api/admin/farmer-overrides${qs ? qs + "&" : "?"}ownerId=${encodeURIComponent(farmer.ownerId)}`,
          { method: "DELETE" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        await load();
      } else {
        // base do código: marca hidden=true pra sumir da listagem
        await postOverride(farmer, { hidden: true });
        await load();
      }
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

  // Combina overrides + datas pra montar as linhas. Filtra ocultos
  // sempre — o conceito de "oculto" sumiu da UI; removidos somem.
  const rows: CombinedRow[] = useMemo(() => {
    const visible = current.filter((f) => !f.hidden);
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
  }, [current, startDates]);

  const filteredRows = filterSquad === "todos"
    ? rows
    : rows.filter((r) => r.squadId === filterSquad);

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

      {/* Filtro por squad */}
      <div className="flex flex-wrap items-center gap-3">
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
                <th className="text-left p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Tag</th>
                <th className="text-right p-3 font-display font-semibold text-[11px] uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-psa-ink-soft">
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

                return (
                  <tr
                    key={f.ownerId}
                    className="border-t border-psa-line hover:bg-psa-canvas transition-colors"
                  >
                    {/* Farmer + badges */}
                    <td className="p-3 align-top">
                      <div className="min-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-psa-ink">{f.nome}</span>
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

                    {/* Tag — chip atual (se houver) + dropdown pra escolher/criar */}
                    <td className="p-3 align-top">
                      <TagCell
                        ownerId={f.ownerId}
                        currentTagName={tagAssignments[f.ownerId] ?? null}
                        vocabulary={tagVocabulary}
                        isPickerOpen={openTagPicker === f.ownerId}
                        onTogglePicker={() =>
                          setOpenTagPicker((cur) => (cur === f.ownerId ? null : f.ownerId))
                        }
                        onClosePicker={() => {
                          setOpenTagPicker(null);
                          setCreatingTag(null);
                        }}
                        onAssign={(tagName) => assignTag(f.ownerId, tagName)}
                        creating={creatingTag?.ownerId === f.ownerId ? creatingTag : null}
                        onStartCreate={() =>
                          setCreatingTag({ ownerId: f.ownerId, name: "", color: "#F26B1F" })
                        }
                        onChangeCreate={(patch) =>
                          setCreatingTag((cur) => (cur ? { ...cur, ...patch } : cur))
                        }
                        onCancelCreate={() => setCreatingTag(null)}
                        onConfirmCreate={() => {
                          if (creatingTag) {
                            createAndAssignTag(creatingTag.ownerId, creatingTag.name, creatingTag.color);
                          }
                        }}
                      />
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
                          onClick={() => requestRemove(f)}
                          disabled={state === "saving"}
                          className="px-2.5 py-1.5 rounded-lg border border-red-200 text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                          title="Remover da listagem do dashboard"
                        >
                          Remover
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

      {/* Modal de confirmação de remoção */}
      <ConfirmModal
        open={removeTarget !== null}
        title="Tem certeza que deseja remover o usuário da listagem?"
        message={
          removeTarget
            ? `"${removeTarget.nome}" sairá da listagem e deixará de aparecer no dashboard. Pra trazê-lo de volta, basta usar "Adicionar farmer" novamente.`
            : ""
        }
        confirmLabel="Sim, remover"
        cancelLabel="Cancelar"
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
