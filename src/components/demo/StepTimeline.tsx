"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { RunTimeline } from "@/inngest/middlewares/step-tracker";

type TimelineStep = RunTimeline["steps"][number];

/**
 * Live view of the steps the executor is actually running, as captured by
 * stepTrackerMiddleware. Shown in the Run stage: steps stream in while the
 * agent works, retries badge honestly, and memoized replays show Inngest
 * skipping already-completed work. Steps with captured payloads expand to
 * reveal their input and output — the full agent process on demand.
 */
export function StepTimeline({
  timeline,
  isRunning,
}: {
  timeline: RunTimeline | null;
  isRunning: boolean;
}) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    const scroller = scrollerRef.current;

    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [timeline?.steps.length]);

  if (!timeline || timeline.steps.length === 0) {
    return null;
  }

  const totalMs = timeline.steps.reduce(
    (sum, step) => sum + (step.durationMs ?? 0),
    0,
  );
  const replayed = timeline.steps.filter((step) => step.memoized).length;

  return (
    <div className="border border-[var(--ink)] bg-white">
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
          steps
        </span>
        <span className="mono text-[10px] uppercase">
          {timeline.steps.length} recorded
          {replayed > 0 ? (
            <span className="ml-1.5 text-[var(--teal)]">
              {replayed} replayed
            </span>
          ) : null}
          {totalMs > 0 ? (
            <span className="ml-1.5 text-[var(--muted-copy)]">
              {Math.round(totalMs)}ms
            </span>
          ) : null}
        </span>
      </div>
      <div
        ref={scrollerRef}
        className="max-h-56 overflow-y-auto border-t border-[var(--rule-soft)] bg-[var(--bone)]"
      >
        <ol className="divide-y divide-[var(--rule-soft)]">
          {timeline.steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              isRunning={isRunning}
              expanded={expanded[step.id] === true}
              onToggle={() =>
                setExpanded((current) => ({
                  ...current,
                  [step.id]: !(current[step.id] === true),
                }))
              }
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

function StepRow({
  step,
  isRunning,
  expanded,
  onToggle,
}: {
  step: TimelineStep;
  isRunning: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const details = stepDetails(step);

  return (
    <li>
      <button
        type="button"
        className="flex min-w-0 w-full items-center gap-2 px-2.5 py-1.5 text-left disabled:cursor-default"
        onClick={onToggle}
        disabled={!details}
        aria-expanded={details ? expanded : undefined}
      >
        {details ? (
          <ChevronRight
            className={`size-3 shrink-0 text-[var(--muted-copy)] transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <span
          className="status-dot"
          data-state={dotState(step.status)}
          aria-hidden
        />
        <span className="mono min-w-0 flex-1 truncate text-[11px]">
          {step.displayName}
        </span>
        {step.memoized ? (
          <span className="mono shrink-0 border border-[var(--rule-soft)] bg-white px-1 py-px text-[8px] uppercase text-[var(--teal)]">
            memoized
          </span>
        ) : null}
        {step.status === "retrying" ? (
          <span className="mono shrink-0 border border-[var(--rule-soft)] bg-white px-1 py-px text-[8px] uppercase text-[var(--citrine)]">
            retrying
          </span>
        ) : null}
        {step.status === "errored" ? (
          <span className="mono shrink-0 border border-[var(--rule-soft)] bg-white px-1 py-px text-[8px] uppercase text-[var(--coral)]">
            errored
          </span>
        ) : null}
        <span className="mono w-14 shrink-0 text-right text-[10px] text-[var(--muted-copy)]">
          {step.status === "running" && isRunning
            ? "…"
            : step.durationMs !== undefined
              ? `${Math.round(step.durationMs)}ms`
              : ""}
        </span>
      </button>
      {details && expanded ? (
        <div className="grid gap-1.5 border-t border-[var(--rule-soft)] bg-white px-2.5 py-2 pl-8">
          {step.errorMessage ? (
            <PayloadBlock label="error" text={step.errorMessage} tone="coral" />
          ) : null}
          {step.input !== undefined ? (
            <PayloadBlock label="input" text={prettyPrint(step.input)} />
          ) : null}
          {step.output !== undefined ? (
            <PayloadBlock label="output" text={prettyPrint(step.output)} />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function PayloadBlock({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone?: "coral";
}) {
  return (
    <div className="min-w-0 border border-[var(--rule-soft)] bg-[var(--bone)]">
      <span
        className={`mono block border-b border-[var(--rule-soft)] px-1.5 py-1 text-[8px] uppercase ${tone === "coral" ? "text-[var(--coral)]" : "text-[var(--muted-copy)]"}`}
      >
        {label}
      </span>
      <pre className="mono max-h-40 overflow-auto px-1.5 py-1 text-[10px] leading-4 whitespace-pre-wrap break-all">
        {text}
      </pre>
    </div>
  );
}

function stepDetails(step: TimelineStep): boolean {
  return (
    step.input !== undefined ||
    step.output !== undefined ||
    step.errorMessage !== undefined
  );
}

function prettyPrint(serialized: string): string {
  try {
    return JSON.stringify(JSON.parse(serialized), null, 2);
  } catch {
    return serialized;
  }
}

function dotState(status: TimelineStep["status"]) {
  switch (status) {
    case "running":
      return "running";
    case "retrying":
      return "retrying";
    case "errored":
      return "error";
    case "completed":
      return "complete";
  }
}
