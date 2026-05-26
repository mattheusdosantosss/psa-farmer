type Props = {
  ganhos: number;
  perdidos: number;
  emAberto: number;
};

/**
 * Mini-visualização da distribuição de deals do farmer:
 * 3 barras horizontais (Ganhos, Perdidas, Aberto) com largura proporcional
 * ao maior valor entre os três.
 */
export default function DistBar({ ganhos, perdidos, emAberto }: Props) {
  const max = Math.max(ganhos, perdidos, emAberto, 1);
  const pct = (v: number) => `${Math.round((v / max) * 100)}%`;

  const Row = ({
    letter,
    value,
    color,
  }: {
    letter: string;
    value: number;
    color: string;
  }) => (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold text-psa-ink-soft w-2.5">{letter}</span>
      <div className="flex-1 h-1.5 bg-psa-line rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: pct(value), backgroundColor: color }}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-1 w-24">
      <Row letter="G" value={ganhos} color="#22c55e" />
      <Row letter="P" value={perdidos} color="#ef4444" />
      <Row letter="A" value={emAberto} color="#FF640F" />
    </div>
  );
}