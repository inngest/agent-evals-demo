"use client";

import type { ActId, ActMeta } from "@/components/demo/types";

export const ACTS: ActMeta[] = [
  { id: 1, kicker: "Act 1", label: "Durable Agent" },
  { id: 2, kicker: "Act 2", label: "Scoring + Session" },
  { id: 3, kicker: "Act 3", label: "Experiment" },
  { id: 4, kicker: "Act 4", label: "Vision" },
];

export function ActStepper({
  activeAct,
  onActChange,
}: {
  activeAct: ActId;
  onActChange: (act: ActId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Demo acts"
      className="grid w-full grid-cols-4 border border-[var(--ink)] bg-white"
    >
      {ACTS.map((act, index) => {
        const isActive = act.id === activeAct;

        return (
          <button
            key={act.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            onClick={() => onActChange(act.id)}
            className={`demo-segment-button act-step-tab group flex min-h-[56px] flex-col items-start justify-center gap-1 text-left ${
              index > 0 ? "border-l border-[var(--ink)]" : ""
            }`}
          >
            <span className="mono text-[10px] uppercase leading-none tracking-wide opacity-70">
              {act.kicker}
            </span>
            <span className="display text-sm font-medium leading-5">
              {act.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
