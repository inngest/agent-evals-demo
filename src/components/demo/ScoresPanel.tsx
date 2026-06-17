"use client";

import * as React from "react";
import {
  ExternalLink,
  Save,
  ThumbsDown,
  ThumbsUp,
  TimerReset,
  Trash2,
} from "lucide-react";
import { DashboardLink } from "@/components/demo/DashboardLink";
import type { Incident } from "@/content/incidents";
import { seededScores, seededSessions } from "@/content/seed-data";
import type { ScoreHistory } from "@/lib/scoring";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { Button } from "@/components/ui/button";

export function ScoresPanel({
  incident,
  clientRunId,
  liveSignal,
  outcomeScore,
  history,
  onSignal,
}: {
  incident: Incident;
  clientRunId?: string;
  liveSignal: "up" | "down" | null;
  outcomeScore: number | null;
  history: ScoreHistory | null;
  onSignal: (signal: "up" | "down" | "saved" | "discarded") => void;
}) {
  const session =
    seededSessions.find((item) => item.incidentId === incident.id) ??
    seededSessions[0];
  const seededScore =
    seededScores.find((item) => item.incidentId === incident.id) ??
    seededScores[0];
  const trend = history?.trend.length
    ? history.trend
    : seededScores.map((score) => score.outcomeScore);
  const currentOutcome = outcomeScore ?? seededScore?.outcomeScore ?? 0;
  const sessionUrl = getDeepLink("session", {
    sessionId: session?.sessionId ?? `sess-${incident.id}`,
  });
  const traceUrl = getDeepLink("scoresOnTrace", {
    runId: clientRunId ?? seededScore?.runId,
  });

  return (
    <div className="grid h-full min-h-0 overflow-hidden bg-white xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r border-[var(--rule-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-soft)] p-4">
          <div>
            <div className="mono flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
              <TimerReset className="size-3.5" />
              Scores on the run
            </div>
            <div className="display mt-1 text-xl font-medium">
              Fast signal plus deferred localization
            </div>
          </div>
          <DashboardLink
            href={traceUrl}
            className="demo-segment-button mono inline-flex h-8 items-center gap-2 px-3 text-[11px] uppercase"
          >
            <ExternalLink className="size-3.5" />
            Open scores
          </DashboardLink>
        </div>

        <div className="grid min-h-0 gap-5 overflow-auto p-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <MetricBox
              label="fast score"
              value={
                liveSignal === "up"
                  ? "1.00"
                  : liveSignal === "down"
                    ? "0.00"
                    : "waiting"
              }
              detail={
                liveSignal
                  ? `${liveSignal} feedback captured`
                  : "operator feedback lands live"
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-10 border-[var(--ink)]"
                onClick={() => onSignal("up")}
              >
                <ThumbsUp className="size-4" />
                Up
              </Button>
              <Button
                variant="outline"
                className="h-10 border-[var(--ink)]"
                onClick={() => onSignal("down")}
              >
                <ThumbsDown className="size-4" />
                Down
              </Button>
            </div>
            <MetricBox
              label="outcome score"
              value={currentOutcome.toFixed(2)}
              detail="Jaccard overlap of cited files vs fix files"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="h-10 bg-[var(--ink)] text-white hover:bg-[var(--coral)] hover:text-[var(--ink)]"
                onClick={() => onSignal("saved")}
              >
                <Save className="size-4" />
                Save
              </Button>
              <Button
                variant="outline"
                className="h-10 border-[var(--ink)]"
                onClick={() => onSignal("discarded")}
              >
                <Trash2 className="size-4" />
                Discard
              </Button>
            </div>
          </div>

          <div className="grid min-h-0 content-start gap-5">
            <div>
              <div className="mono mb-2 text-[11px] uppercase text-[var(--muted-copy)]">
                score history
              </div>
              <Sparkline values={trend} />
            </div>
            <div className="grid gap-2">
              <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
                recent scored runs
              </div>
              {(history?.points ?? []).slice(-5).map((point) => (
                <div
                  key={point.clientRunId}
                  className="mono flex items-center justify-between border-b border-[var(--rule-soft)] py-2 text-[11px]"
                >
                  <span>{point.incidentId}</span>
                  <span className="tabnum text-[var(--muted-copy)]">
                    {point.score.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <aside className="grid min-h-0 content-start gap-4 overflow-auto bg-[var(--bone)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
              session thread
            </div>
            <div className="display mt-1 text-lg font-medium">
              {session?.sessionId ?? `sess-${incident.id}`}
            </div>
          </div>
          <DashboardLink
            href={sessionUrl}
            className="demo-segment-button grid size-8 place-items-center"
            aria-label="Open session in Inngest"
            title="Open session in Inngest"
          >
            <ExternalLink className="size-4" />
          </DashboardLink>
        </div>
        <p className="text-sm leading-6 text-[var(--muted-copy)]">
          One bug report, multiple runs. The same substrate that executed the
          agent stores the feedback and the deferred score history.
        </p>
        <div className="grid gap-3">
          {(session?.runs ?? []).map((run) => (
            <div key={run.runId} className="border border-[var(--ink)] bg-white p-3">
              <div className="mono flex items-center justify-between text-[11px] uppercase">
                <span>{run.status}</span>
                <span className="tabnum">{run.outcomeScore.toFixed(2)}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[var(--muted-copy)]">
                <span>attempt {run.attempt}</span>
                <span>{run.iterations} loops</span>
                <span>{Math.round(run.durationMs / 100) / 10}s</span>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function MetricBox({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border border-[var(--ink)] bg-white p-4">
      <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
        {label}
      </div>
      <div className="display mt-2 text-5xl font-medium tabnum">{value}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-copy)]">{detail}</p>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 620;
  const height = 170;
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - Math.max(0, Math.min(1, value)) * height;
    return [x, y] as const;
  });
  const path = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full border border-[var(--rule-soft)] bg-white">
      <path d="M 0 136 H 620" stroke="rgba(26,22,28,0.12)" />
      <path d="M 0 68 H 620" stroke="rgba(26,22,28,0.12)" />
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
  );
}
