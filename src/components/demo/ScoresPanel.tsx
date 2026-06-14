"use client";

import * as React from "react";
import { Check, Trophy } from "lucide-react";
import { seededScoreTrend } from "@/content/seed-data";
import type { ScoreHistory } from "@/lib/scoring";

export function ScoresPanel({
  history,
  saved,
}: {
  history: ScoreHistory | null;
  saved: boolean;
}) {
  const [tab, setTab] = React.useState<"score" | "experiment">("score");
  const trend = history?.trend.length ? history.trend : seededScoreTrend;
  const current = trend[trend.length - 1] ?? 0.92;
  const sourceLabel =
    history?.source === "inngest-insights"
      ? "Inngest Insights"
      : history?.source === "memory"
        ? "live demo signals"
        : "seeded demo baseline";
  const signalCount = (count: number) => {
    if (history?.source === "inngest-insights") {
      return `${count} from Insights`;
    }

    if (history?.source === "memory") {
      return `${count} observed`;
    }

    return `${count} seeded`;
  };

  return (
    <div className="grid h-full min-h-0 gap-0 overflow-hidden bg-white lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="grid min-h-0 grid-rows-[84px_minmax(0,1fr)] border-r border-[var(--rule-soft)]">
        <div className="flex h-[84px] items-center justify-between gap-3 border-b border-[var(--rule-soft)] p-4">
          <div>
            <div className="mono flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
              <Trophy className="size-3.5" />
              Online eval signal
            </div>
            <div className="display mt-1 text-xl font-medium">
              Current query score
            </div>
            <p className="mono mt-1 text-[10px] uppercase text-[var(--muted-copy)]">
              {sourceLabel}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTab("score")}
              data-active={tab === "score"}
              className="demo-segment-button mono h-9 w-[128px] px-4 text-center text-[11px] uppercase"
            >
              Score
            </button>
            <button
              type="button"
              onClick={() => setTab("experiment")}
              data-active={tab === "experiment"}
              className="demo-segment-button mono h-9 w-[128px] px-4 text-center text-[11px] uppercase"
            >
              Experiment
            </button>
          </div>
        </div>

        {tab === "score" ? (
          <div className="grid min-h-0 content-center gap-8 overflow-auto p-6">
            <div>
              <div className="display flex items-end gap-3 text-7xl font-medium tabnum">
                {current.toFixed(2)}
                <span className="mb-3 inline-flex size-9 items-center justify-center bg-[var(--teal)] text-white">
                  <Check className="size-5" />
                </span>
              </div>
              <p className="mono mt-3 text-xs uppercase text-[var(--muted-copy)]">
                based on: saved to dashboard
              </p>
            </div>
            <Sparkline values={trend} saved={saved} />
          </div>
        ) : (
          <div className="grid min-h-0 content-center gap-6 overflow-auto p-6">
            <ExperimentBar label="GPT-5.5" value={58} color="var(--blue)" />
            <ExperimentBar label="Opus 4.7" value={42} color="var(--coral)" />
          </div>
        )}
      </section>

      <aside className="grid h-full min-h-0 content-between gap-6 overflow-auto bg-[var(--bone)] p-5">
        <div>
          <div className="display text-lg font-medium">Behavior signals</div>
          <div className="mt-4 grid gap-3">
            {[
              [
                "saved_to_dashboard",
                saved ? "observed" : signalCount(history?.savedCount ?? 0),
              ],
              ["discarded_query", signalCount(history?.discardedCount ?? 0)],
              ["score_source", sourceLabel],
            ].map(([label, value]) => (
              <div
                key={label}
                className="mono flex items-center justify-between border-b border-[var(--rule-soft)] pb-2 text-[11px]"
              >
                <span>{label}</span>
                <span className="text-[var(--muted-copy)]">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border border-[var(--ink)] bg-white p-4">
          <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
            Launch seam
          </div>
          <p className="mt-2 text-sm leading-6">
            The panel reloads from the score-history API. It uses seeded demo
            signals by default and can read Inngest Insights when
            <span className="mono"> INNGEST_INSIGHTS_SCORE_QUERY</span> is set.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Sparkline({ values, saved }: { values: number[]; saved: boolean }) {
  const width = 620;
  const height = 170;
  const min = 0.76;
  const max = 0.96;
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - ((value - min) / (max - min)) * height;
    return [x, y] as const;
  });
  const path = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");

  return (
    <div className="grid gap-3">
      <div className="mono flex items-center justify-between text-[11px] uppercase text-[var(--muted-copy)]">
        <span>2-week quality trend</span>
        <span>{saved ? "+ saved signal" : "seeded"}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
        <path
          d="M 0 150 H 620"
          stroke="rgba(26,22,28,0.12)"
          strokeWidth="1"
        />
        <path
          d="M 0 85 H 620"
          stroke="rgba(26,22,28,0.12)"
          strokeWidth="1"
        />
        <path d={path} fill="none" stroke="var(--teal)" strokeWidth="4" />
        {points.map(([x, y], index) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={index === points.length - 1 ? 6 : 3}
            fill={index === points.length - 1 ? "var(--coral)" : "var(--teal)"}
          />
        ))}
      </svg>
    </div>
  );
}

function ExperimentBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="grid gap-2">
      <div className="mono flex items-center justify-between text-[11px] uppercase">
        <span>{label}</span>
        <span>{value}% win rate</span>
      </div>
      <div className="h-10 border border-[var(--ink)] bg-[var(--cloud)]">
        <div
          className="h-full"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}
