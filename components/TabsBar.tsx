"use client";

import { SQUADS, SquadId } from "@/lib/teams";

export type TabValue = "all" | SquadId;

type Tab = { id: TabValue; label: string };

const TABS: Tab[] = [
  { id: "all", label: "Geral" },
  ...SQUADS.map((s) => ({ id: s.id, label: s.label })),
];

type Props = {
  value: TabValue;
  onChange: (next: TabValue) => void;
};

export default function TabsBar({ value, onChange }: Props) {
  return (
    <div className="inline-flex flex-wrap gap-1 bg-psa-canvas border border-psa-line rounded-xl p-1">
      {TABS.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? "bg-psa-ink text-white shadow-sm"
                : "text-psa-ink-soft hover:bg-psa-surface"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}