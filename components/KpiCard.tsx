type Props = {
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  accent?: "orange" | "blue" | "ink";
  loading?: boolean;
  featured?: boolean; // card maior, número maior (destaque)
};

export default function KpiCard({
  label,
  value,
  hint,
  accent = "ink",
  loading = false,
  featured = false,
}: Props) {
  const accentColor =
    accent === "orange"
      ? "text-psa-orange"
      : accent === "blue"
      ? "text-psa-blue"
      : "text-psa-ink";

  const dotColor =
    accent === "orange"
      ? "bg-psa-orange"
      : accent === "blue"
      ? "bg-psa-blue"
      : "bg-psa-ink";

  // Tamanhos
  const padding = featured ? "p-6" : "p-5";
  // Featured: número grande e responsivo, mas SEMPRE caberá no container
  // graças ao tamanho relativo à largura do próprio card (cqw) com guardrails.
  const numberSize = featured
    ? "text-[clamp(1.75rem,4cqw,2.75rem)]"
    : "text-[clamp(1.5rem,5cqw,2.125rem)]";

  return (
    <div
      className={`group rounded-2xl bg-psa-surface border border-psa-line ${padding} shadow-card hover:shadow-card-hover transition-shadow min-w-0 overflow-hidden`}
      style={{ containerType: "inline-size" }}
    >
      <div className="flex items-center gap-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-psa-ink-soft">
          {label}
        </span>
      </div>

      <div className={`${featured ? "mt-4" : "mt-3"} min-h-[42px] flex items-baseline min-w-0`}>
        {loading ? (
          <span className="skeleton h-9 w-24 inline-block" />
        ) : (
          <span
            className={`font-display font-bold leading-none tabular-nums whitespace-nowrap ${accentColor} ${numberSize}`}
          >
            {value}
          </span>
        )}
      </div>

      {hint && (
        <div className={`${featured ? "mt-3" : "mt-2"} text-xs text-psa-ink-soft`}>
          {loading ? <span className="skeleton h-3 w-32 inline-block" /> : hint}
        </div>
      )}
    </div>
  );
}