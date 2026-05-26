"use client";

import {
  PRESET_OPTIONS,
  PRESET_LABELS,
  formatPeriodRange,
  type PeriodPreset,
  type PeriodValue,
} from "@/lib/periods";

type Props = {
  value: PeriodValue;
  onChange: (next: PeriodValue) => void;
};

export default function PeriodFilter({ value, onChange }: Props) {
  const handlePresetChange = (preset: PeriodPreset) => {
    // Recalcula só quando muda de preset; custom mantém datas atuais
    if (preset === "custom") {
      onChange({ ...value, preset });
    } else {
      // chamamos o recálculo no parent passando só o preset novo
      onChange({ preset, from: value.from, to: value.to });
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-psa-ink-soft mb-1.5">
          Período
        </label>
        <select
          value={value.preset}
          onChange={(e) => handlePresetChange(e.target.value as PeriodPreset)}
          className="rounded-lg border border-psa-line bg-psa-surface px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10 min-w-[180px]"
        >
          {PRESET_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {PRESET_LABELS[p]}
            </option>
          ))}
        </select>
        {value.preset !== "custom" && (
          <span className="mt-1 text-[11px] text-psa-ink-soft font-medium">
            {formatPeriodRange(value.from, value.to)}
          </span>
        )}
      </div>

      {value.preset === "custom" && (
        <>
          <div className="flex flex-col">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-psa-ink-soft mb-1.5">
              De
            </label>
            <input
              type="date"
              value={value.from}
              max={value.to}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="rounded-lg border border-psa-line bg-psa-surface px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-psa-ink-soft mb-1.5">
              Até
            </label>
            <input
              type="date"
              value={value.to}
              min={value.from}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="rounded-lg border border-psa-line bg-psa-surface px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
            />
          </div>
        </>
      )}
    </div>
  );
}