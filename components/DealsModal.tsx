"use client";

import { useEffect } from "react";
import type { DealLite, TicketLite } from "@/lib/aggregate";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

export type ModalKind = "ganhos" | "perdidos" | "aberto" | "tramite";

type Props = {
  open: boolean;
  onClose: () => void;
  farmerName: string;
  kind: ModalKind;
  deals?: DealLite[];   // pra ganhos/perdidos/aberto
  tickets?: TicketLite[]; // pra tramite
};

const TITLES: Record<ModalKind, { titulo: string; itemSing: string; itemPlural: string }> = {
  ganhos: { titulo: "Negócios ganhos", itemSing: "negócio fechado", itemPlural: "negócios fechados" },
  perdidos: { titulo: "Negócios perdidos", itemSing: "negócio perdido", itemPlural: "negócios perdidos" },
  aberto: { titulo: "Negócios em aberto", itemSing: "negócio em aberto", itemPlural: "negócios em aberto" },
  tramite: { titulo: "Tickets em trâmite", itemSing: "ticket em trâmite", itemPlural: "tickets em trâmite" },
};

export default function DealsModal({
  open,
  onClose,
  farmerName,
  kind,
  deals,
  tickets,
}: Props) {
  // Fecha com ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Bloqueia scroll do body
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const isTickets = kind === "tramite";
  const items = isTickets ? tickets ?? [] : deals ?? [];
  const total = items.length;
  const labels = TITLES[kind];

  // KPIs do header (só pra ganhos: ganhos/receita/ticket médio)
  const isGanhos = kind === "ganhos";
  const receitaTotal = isGanhos ? (deals ?? []).reduce((s, d) => s + d.amount, 0) : 0;
  const ticketMedio = isGanhos && total > 0 ? receitaTotal / total : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deals-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Conteúdo */}
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3
                id="deals-modal-title"
                className="font-display text-xl font-bold truncate"
              >
                {farmerName}
              </h3>
              <div className="mt-1 text-xs text-psa-orange font-semibold uppercase tracking-wider">
                {labels.titulo} · {total} {total === 1 ? labels.itemSing : labels.itemPlural}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-2xl leading-none px-2 -mt-1"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          {/* KPIs (só pra ganhos) */}
          {isGanhos && total > 0 && (
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="bg-white/5 rounded-xl px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                  Ganhos
                </div>
                <div className="mt-1 font-display text-2xl font-bold text-psa-orange tabular-nums">
                  {total}
                </div>
              </div>
              <div className="bg-white/5 rounded-xl px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                  Receita Total
                </div>
                <div className="mt-1 font-display text-xl font-bold text-psa-orange tabular-nums whitespace-nowrap">
                  {brl(receitaTotal)}
                </div>
              </div>
              <div className="bg-white/5 rounded-xl px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                  Ticket Médio
                </div>
                <div className="mt-1 font-display text-xl font-bold text-psa-orange tabular-nums whitespace-nowrap">
                  {brl(ticketMedio)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {total === 0 ? (
            <div className="p-12 text-center text-sm text-white/60">
              Nenhum {labels.itemSing} encontrado no período.
            </div>
          ) : (
            <ol className="divide-y divide-white/10">
              {isTickets
                ? (tickets ?? []).map((t, i) => (
                    <li
                      key={t.id}
                      className="px-6 py-3 flex items-center gap-4 hover:bg-white/[0.03] transition-colors"
                    >
                      <span className="text-xs font-mono text-white/40 tabular-nums w-8">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0 text-sm text-white/90 truncate">
                        {t.subject}
                      </div>
                      <div className="text-xs text-white/60 tabular-nums whitespace-nowrap">
                        {fmtDate(t.createdate)}
                      </div>
                    </li>
                  ))
                : (deals ?? []).map((d, i) => (
                    <li
                      key={d.id}
                      className="px-6 py-3 flex items-center gap-4 hover:bg-white/[0.03] transition-colors"
                    >
                      <span className="text-xs font-mono text-white/40 tabular-nums w-8">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0 text-sm text-white/90 truncate">
                        {d.dealname}
                      </div>
                      {isGanhos && (
                        <div className="text-xs font-medium text-psa-orange tabular-nums whitespace-nowrap">
                          {brl(d.amount)}
                        </div>
                      )}
                      <div className="text-xs text-white/60 tabular-nums whitespace-nowrap w-16 text-right">
                        {fmtDate(isGanhos ? d.closedate : d.createdate)}
                      </div>
                    </li>
                  ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}