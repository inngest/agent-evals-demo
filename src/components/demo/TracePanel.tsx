"use client";

import { Activity, AlertTriangle, ExternalLink, RotateCw } from "lucide-react";
import { DashboardLink } from "@/components/demo/DashboardLink";
import type { TraceStep, TriggerResponse } from "@/components/demo/types";
import { getDeepLink } from "@/lib/inngest-dashboard";

/**
 * Renders the agent trace: named model/tool steps including repo reads,
 * mocked side effects, and the retry/recover beat. In Act 2 a fast-score chip
 * + outcome-score chip attach to the trace, mirroring scores landing on the
 * run in the Inngest dashboard.
 */
export function TracePanel({
  trace,
  trigger,
  runId,
  showScores = false,
  liveSignal = null,
  outcomeScore = null,
}: {
  trace: TraceStep[];
  trigger: TriggerResponse | null;
  runId?: string;
  showScores?: boolean;
  liveSignal?: "up" | "down" | null;
  outcomeScore?: number | null;
}) {
  const traceUrl = showScores
    ? getDeepLink("scoresOnTrace", { runId })
    : getDeepLink("runTrace", { runId });

  return (
    <div className="grid h-full min-h-0 gap-0 overflow-hidden bg-white lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="grid min-h-0 grid-rows-[84px_minmax(0,1fr)] border-r border-[var(--rule-soft)]">
        <div className="flex h-[84px] items-center justify-between gap-3 border-b border-[var(--rule-soft)] p-4">
          <div>
            <div className="mono flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
              <Activity className="size-3.5" />
              Inngest trace
            </div>
            <div className="display mt-1 text-xl font-medium">triage-agent</div>
          </div>
          <DashboardLink
            href={traceUrl}
            className="inline-flex h-7 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-[var(--ink)] bg-white px-2.5 text-[0.8rem] font-medium transition-all hover:bg-[var(--bone)]"
          >
            <ExternalLink className="size-4" />
            {showScores ? "Open scores on trace" : "Open in Inngest"}
          </DashboardLink>
        </div>

        <div className="min-h-0 overflow-auto">
          {trace.length === 0 ? (
            <div className="grid h-full place-items-center p-6 text-center">
              <p className="max-w-xs text-sm leading-6 text-[var(--muted-copy)]">
                Run an investigation to populate the trace. You will see repo
                reads, mocked Linear/Slack/PR steps, the simulated 503, and
                the durable recovery.
              </p>
            </div>
          ) : (
            trace.map((step, index) => (
              <DashboardLink
                key={step.id}
                href={traceUrl}
                aria-label={`Open Inngest trace for ${step.label}`}
                className="grid grid-cols-[42px_1fr_auto] items-start gap-3 border-b border-[var(--rule-soft)] p-4 transition-colors hover:bg-[var(--bone)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--coral)]"
              >
                <div
                  className={`mono flex size-7 items-center justify-center border text-[11px] tabnum ${
                    step.status === "failed"
                      ? "border-[var(--coral)] bg-[var(--coral)] text-white"
                      : step.status === "complete"
                        ? "border-[var(--matcha)] bg-[var(--matcha)] text-white"
                        : step.status === "running"
                          ? "border-[var(--ink)] bg-[var(--cloud)]"
                          : "border-[var(--ink)] bg-white"
                  }`}
                >
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="display text-base font-medium">
                      {step.label}
                    </span>
                    <StepKindBadge kind={step.kind} />
                    {step.retried ? (
                      <span className="mono inline-flex items-center gap-1 border border-[var(--coral)] bg-white px-1.5 text-[10px] uppercase text-[var(--coral)]">
                        <RotateCw className="size-3" />
                        retried
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-copy)]">
                    {step.detail}
                  </p>
                  {step.status === "failed" ? (
                    <p className="mono mt-1 flex items-center gap-1 text-[11px] uppercase text-[var(--coral)]">
                      <AlertTriangle className="size-3" />
                      503 rate limited, Inngest will retry
                    </p>
                  ) : null}
                </div>
                <div className="mono text-right text-[11px] uppercase text-[var(--muted-copy)]">
                  <div>{step.status}</div>
                  {step.duration ? <div>{step.duration}</div> : null}
                </div>
              </DashboardLink>
            ))
          )}
        </div>
      </section>

      <aside className="grid h-full min-h-0 content-start gap-6 overflow-auto bg-[var(--bone)] p-5">
        <div>
          <div className="display text-lg font-medium">Agent payload</div>
          <dl className="mono mt-4 grid gap-3 text-[11px]">
            <Field label="Event" value="agent/incident.received" />
            <Field
              label="Bug"
              value={trigger?.incidentId ?? "not sent yet"}
            />
            <Field
              label="Event ID"
              value={trigger?.eventId ?? "not sent yet"}
              breakAll
            />
            <Field
              label="Engine"
              value={
                trigger?.sent ? "real Inngest run" : "waiting for dev server"
              }
            />
          </dl>
        </div>

        {showScores ? (
          <div className="border border-[var(--ink)] bg-white p-4">
            <div className="mono mb-3 text-[11px] uppercase text-[var(--muted-copy)]">
              Scores on this run
            </div>
            <div className="grid gap-3">
              <ScoreChip
                label="fast score (human)"
                value={
                  liveSignal === "up"
                    ? "1.00 · up"
                    : liveSignal === "down"
                      ? "0.00 · down"
                      : "awaiting feedback"
                }
                tone={
                  liveSignal === "up"
                    ? "good"
                    : liveSignal === "down"
                      ? "bad"
                      : "neutral"
                }
              />
              <ScoreChip
                label="outcome score (deferred)"
                value={
                  outcomeScore === null
                    ? "scoring after save"
                    : outcomeScore.toFixed(2)
                }
                tone={
                  outcomeScore === null
                    ? "neutral"
                    : outcomeScore >= 0.7
                      ? "good"
                      : outcomeScore >= 0.4
                        ? "warn"
                        : "bad"
                }
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--muted-copy)]">
              Both scores attach to the same run. The fast one is live; the
              localization score defers until the analysis is saved.
            </p>
          </div>
        ) : trigger?.sent === false ? (
          <div className="border border-[var(--coral)] bg-white p-4 text-sm leading-6">
            Start the Inngest dev server to see the live trace. The foreground
            demo stays deterministic.
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function StepKindBadge({ kind }: { kind: TraceStep["kind"] }) {
  const map: Record<TraceStep["kind"], { label: string; cls: string }> = {
    think: {
      label: "think",
      cls: "border-[var(--rule-soft)] text-[var(--muted-copy)]",
    },
    tool: { label: "tool", cls: "border-[var(--ink)] text-[var(--ink)]" },
    score: { label: "score", cls: "border-[var(--coral)] text-[var(--coral)]" },
    final: {
      label: "final",
      cls: "border-[var(--matcha)] text-[var(--matcha)]",
    },
  };
  const { label, cls } = map[kind];
  return (
    <span
      className={`mono inline-flex items-center border bg-white px-1.5 text-[10px] uppercase ${cls}`}
    >
      {label}
    </span>
  );
}

function ScoreChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const toneCls =
    tone === "good"
      ? "border-[var(--matcha)] text-[var(--matcha)]"
      : tone === "warn"
        ? "border-[var(--coral)] text-[var(--coral)]"
        : tone === "bad"
          ? "border-[var(--coral)] text-[var(--coral)]"
          : "border-[var(--rule-soft)] text-[var(--muted-copy)]";
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--rule-soft)] pb-2">
      <span className="mono text-[11px] uppercase">{label}</span>
      <span
        className={`mono tabnum inline-flex h-5 items-center border px-1.5 text-[11px] ${toneCls}`}
      >
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  breakAll,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b border-[var(--rule-soft)] pb-2">
      <dt className="uppercase text-[var(--muted-copy)]">{label}</dt>
      <dd className={breakAll ? "break-all" : ""}>{value}</dd>
    </div>
  );
}
