"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { evaluateCopy } from "@/content/loop-messaging";
import type { ExperimentAggregate } from "@/lib/experiment-results";

/**
 * Per-variant results of a model bakeoff, rendered in the demo rather than
 * deep-linked.
 *
 * Bars are sized against the best score rather than against zero: at a booth
 * the point is the gap between the two models, and a 0.89-vs-0.83 pair is
 * indistinguishable on a full-width scale from across the aisle.
 */
export function VariantComparison({
  aggregate,
  pending,
}: {
  aggregate: ExperimentAggregate & { simulated?: boolean };
  pending: boolean;
}) {
  const copy = evaluateCopy.compare;
  const best = Math.max(...aggregate.variants.map((v) => v.qualityScore), 0.01);

  return (
    <div className="border border-[var(--ink)] bg-white">
      {aggregate.simulated ? (
        <div className="mono flex items-center gap-1.5 border-b border-[var(--ink)] bg-[var(--coral)] px-2.5 py-1 text-[9px] uppercase text-white">
          <TriangleAlert className="size-3 shrink-0" />
          <span>{copy.simulated}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
          {copy.eyebrow}
        </span>
        <span className="mono text-[10px] uppercase">
          {copy.progress(aggregate.completedRuns, aggregate.totalRuns)}
        </span>
      </div>
      <div className="grid gap-1.5 border-t border-[var(--rule-soft)] bg-[var(--bone)] p-1.5">
        {aggregate.variants.map((variant) => {
          const isWinner =
            variant.variant === aggregate.winner && variant.runs > 0;

          return (
            <div
              key={variant.variant}
              className="border border-[var(--rule-soft)] bg-white px-2 py-1.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="mono truncate text-[11px]">
                  {variant.variant}
                  {isWinner ? (
                    <span className="ml-1.5 text-[var(--teal)]">
                      ★ {copy.winner}
                    </span>
                  ) : null}
                </span>
                <span className="mono shrink-0 text-[11px]">
                  {variant.runs} {copy.runsLabel}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2.5 min-w-0 flex-1 border border-[var(--rule-soft)] bg-[var(--bone)]">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.round((variant.qualityScore / best) * 100)}%`,
                      background: isWinner ? "var(--teal)" : "var(--citrine)",
                    }}
                  />
                </div>
                <span className="mono shrink-0 text-[11px]">
                  {variant.qualityScore.toFixed(2)}
                </span>
                <span className="mono shrink-0 text-[10px] text-[var(--muted-copy)]">
                  ${variant.costUsd.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
        {aggregate.winner && aggregate.qualityDelta !== 0 ? (
          <div className="mono px-0.5 text-[9px] uppercase text-[var(--muted-copy)]">
            ★ {aggregate.winner} · +{aggregate.qualityDelta.toFixed(2)} quality
            {aggregate.costDelta !== 0
              ? ` · ${formatCostDelta(aggregate.costDelta)} cost`
              : null}
          </div>
        ) : null}
        {pending ? (
          <div className="mono px-0.5 text-[9px] uppercase text-[var(--muted-copy)]">
            {copy.running}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatCostDelta(delta: number): string {
  const percent = Math.round(Math.abs(delta) * 100);
  return `${delta < 0 ? "-" : "+"}${percent}%`;
}
