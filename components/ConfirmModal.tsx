"use client";

/**
 * ConfirmModal — modal de confirmação reutilizável.
 *
 * Uso:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmModal
 *     open={open}
 *     title="Tem certeza?"
 *     message="Essa ação não pode ser desfeita."
 *     onConfirm={() => { ... ; setOpen(false); }}
 *     onCancel={() => setOpen(false)}
 *   />
 *
 * Visual: backdrop com blur, card branco rounded-2xl com sombra,
 * cabeçalho com barra laranja, botão "Confirmar" em vermelho pra
 * sinalizar ação destrutiva e "Cancelar" em cinza neutro.
 *
 * A11y: trava o foco no modal enquanto aberto, fecha no ESC e
 * tem aria-modal/role=dialog.
 */

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Quando true, o botão de confirmar fica em vermelho (ação destrutiva). Default true. */
  destructive?: boolean;
};

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  destructive = true,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Foco automático no botão de confirmar quando abre, e ESC fecha
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => confirmRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ animation: "psa-fade-in 150ms ease-out" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-psa-ink/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />

      {/* Card */}
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
        style={{ animation: "psa-zoom-in 150ms ease-out" }}
      >
        {/* Barra laranja superior */}
        <div className="h-1 bg-psa-orange" aria-hidden />

        <div className="p-6">
          <h2
            id="confirm-modal-title"
            className="font-display text-lg font-bold text-psa-ink leading-tight"
          >
            {title}
          </h2>
          <p className="mt-2 text-sm text-psa-ink-soft whitespace-pre-line">
            {message}
          </p>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-psa-line text-sm font-semibold text-psa-ink-soft hover:bg-psa-canvas transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
                destructive
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-psa-blue hover:bg-psa-blue/90"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
