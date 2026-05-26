type Props = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "orange" | "blue" | "neutral";
};

export default function KpiCard({ label, value, hint, accent = "neutral" }: Props) {
  const accentBar =
    accent === "orange"
      ? "bg-psa-orange"
      : accent === "blue"
      ? "bg-psa-blue"
      : "bg-psa-gray";

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-black/5 overflow-hidden">
      <div className={`h-1 ${accentBar}`} />
      <div className="p-5">
        <div className="text-xs uppercase tracking-wide text-psa-gray font-medium">
          {label}
        </div>
        <div className="mt-2 text-3xl font-semibold text-psa-blue-dark">
          {value}
        </div>
        {hint && <div className="mt-1 text-xs text-psa-gray">{hint}</div>}
      </div>
    </div>
  );
}