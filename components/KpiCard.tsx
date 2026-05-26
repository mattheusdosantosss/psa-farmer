type Props = {
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  accent?: "orange" | "blue" | "ink";
  loading?: boolean;
  featured?: boolean; // card maior, número maior (destaque)
  /** Quando passado, o card vira clicável (cursor + hover + border accent). */
  onClick?: () => void;
};

export default function KpiCard({
  label,
  value,
  hint,
  accent = "ink",
  loading = false,
  featured = false,
  onClick,
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
  const padding = featured ? "p-5" : "p-5";
  // O card featured é mais LARGO (col-span-2), então usar cqw daria um número
  // muito grande. Para o featured fixamos uma faixa mais discreta, alinhada
  // visualmente com os cards normais.
  const numberSize = featured
    ? "text-[clamp(1.5rem,2.4cqw,2rem)]"
    : "text-[clamp(1.5rem,5cqw,2.125rem)]";

  const interactive = !!onClick && !loading;
  const interactiveClasses = interactive
    ? "cursor-pointer hover:border-psa-orange/40 hover:bg-psa-canvas/40 text-left w-full"
    : "";

  const Wrapper: "button" | "div" = interactive ? "button" : "div";
  const wrapperProps = interactive
    ? { onClick, type: "button" as const, "aria-label": `Ver detalhes de ${label}` }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`group rounded-2xl bg-psa-surface border border-psa-line ${padding} shadow-card hover:shadow-card-hover transition-all min-w-0 overflow-hidden ${interactiveClasses}`}
      style={{ containerType: "inline-size" }}
    >
      <div className="flex items-center gap-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-psa-ink-soft">
          {label}
        </span>
      </div>

      <div className="mt-3 min-h-[42px] flex items-baseline min-w-0">
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
        <div className="mt-2 text-xs text-psa-ink-soft">
          {loading ? <span className="skeleton h-3 w-32 inline-block" /> : hint}
        </div>
      )}
    </Wrapper>
  );
}