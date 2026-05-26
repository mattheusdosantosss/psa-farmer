type Props = {
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  accent?: "orange" | "blue" | "ink";
  loading?: boolean;
};

export default function KpiCard({
  label,
  value,
  hint,
  accent = "ink",
  loading = false,
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

  return (
    <div className="group rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card hover:shadow-card-hover transition-shadow">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-psa-muted">
          {label}
        </span>
      </div>

      <div className="mt-3 min-h-[42px] flex items-baseline">
        {loading ? (
          <span className="skeleton h-9 w-24 inline-block" />
        ) : (
          <span className={`font-display text-[34px] leading-none font-bold ${accentColor}`}>
            {value}
          </span>
        )}
      </div>

      {hint && (
        <div className="mt-2 text-xs text-psa-muted">
          {loading ? <span className="skeleton h-3 w-32 inline-block" /> : hint}
        </div>
      )}
    </div>
  );
}