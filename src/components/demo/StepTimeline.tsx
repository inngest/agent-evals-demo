"use client";

import * as React from "react";
import type { RunTimeline } from "@/inngest/middlewares/step-tracker";

/**
 * Live view of the steps the executor is actually running, as captured by
 * stepTrackerMiddleware. Shown in the Run stage: steps stream in while the
 * agent works, retries badge honestly, and memoized replays show Inngest
 * skipping already-completed work.
 */
export function StepTimeline({
  timeline,
  isRunning,
}: {
  timeline: RunTimeline | null;
  isRunning: boolean;
}) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

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
            <li
              key={step.id}
              className="flex min-w-0 items-center gap-2 px-2.5 py-1.5"
            >
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
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function dotState(status: RunTimeline["steps"][number]["status"]) {
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
