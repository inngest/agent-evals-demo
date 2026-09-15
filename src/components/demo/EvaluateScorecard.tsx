"use client";

import * as React from "react";
import { evaluateCopy } from "@/content/loop-messaging";

export type ScoreRow = {
  /** The score's name as it appears in Inngest, e.g. research_human_feedback. */
  name: string;
  value: number;
  /** The run the score attaches to. Rendered so two rows can be seen sharing one. */
  runId?: string;
  at: string;
  /** Short provenance badge: "via defer()", "attached via step.score", etc. */
  note?: string;
  pending?: boolean;
};

/**
 * The Evaluate stage's persistent readout.
 *
 * The stage used to hand off to the dashboard for every result, so nothing the
 * driver did produced a visible effect in the demo. These tiles fill in as
 * scores land, and the score rows deliberately repeat the run id: the whole
 * deferred-scoring argument is two scores, weeks apart, on the same run.
 */
export function EvaluateScorecard({
  quality,
  human,
  outcome,
  winner,
  runId,
  rows,
}: {
  quality: number | null;
  human: number | null;
  outcome: number | null;
  winner: string | null;
  runId?: string;
  rows: ScoreRow[];
}) {
  const tiles = evaluateCopy.scorecard.tiles;

  return (
    <div className="border border-[var(--ink)] bg-white">
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
          {evaluateCopy.scorecard.eyebrow}
        </span>
        {runId ? (
          <span className="mono truncate text-[10px] uppercase text-[var(--muted-copy)]">
            {shortRunId(runId)}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-4 gap-1.5 border-t border-[var(--rule-soft)] bg-[var(--bone)] p-1.5">
        <Tile label={tiles.quality} value={formatScore(quality)} />
        <Tile label={tiles.human} value={formatScore(human)} />
        <Tile label={tiles.outcome} value={formatScore(outcome)} />
        <Tile label={tiles.variant} value={winner ?? "—"} small={Boolean(winner)} />
      </div>
      {rows.length > 0 ? (
        <ul className="divide-y divide-[var(--rule-soft)] border-t border-[var(--rule-soft)]">
          {rows.map((row) => (
            <li key={`${row.name}-${row.at}`} className="px-2.5 py-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="mono truncate text-[11px]">{row.name}</span>
                <span className="mono shrink-0 text-[11px]">
                  {row.pending ? "…" : row.value.toFixed(2)}
                </span>
              </div>
              <div className="mono mt-0.5 truncate text-[9px] uppercase text-[var(--muted-copy)]">
                {row.runId
                  ? `${evaluateCopy.scoreNow.attachedTo} ${shortRunId(row.runId)}`
                  : null}
                {row.note ? (
                  <span className="ml-1.5 text-[var(--teal)]">{row.note}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="border border-[var(--rule-soft)] bg-white px-1.5 py-1">
      <div className="mono text-[9px] uppercase text-[var(--muted-copy)]">
        {label}
      </div>
      <div
        className={`mono truncate ${small ? "text-[11px]" : "text-[19px] leading-6"}`}
      >
        {value}
      </div>
    </div>
  );
}

function formatScore(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

/** Short enough to fit, long enough that two rows can be compared by eye. */
function shortRunId(runId: string): string {
  return runId.length > 12 ? `${runId.slice(0, 6)}…${runId.slice(-4)}` : runId;
}
