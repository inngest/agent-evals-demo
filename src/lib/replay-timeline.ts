import {
  FAILURE_STEP_ID,
  getSupportTicket,
  supportSteps,
  type SupportTicketId,
} from "@/content/support-demo";
import type { RunTimeline, TimelineStep } from "@/inngest/middlewares/step-tracker";

/**
 * Builds the labelled replay timeline the booth falls back to when a live run
 * is unavailable (no keys, no network, dev server down, or a stalled run).
 *
 * The shape is deliberately identical to a captured run: same step names,
 * same ordering, same timings as the real function, same 503-then-retry beat
 * with memoized replays. The single difference is `simulated: true`, which the
 * UI renders as a visible "Replay" tag. The demo stays legible and stays
 * honest at the same time.
 *
 * Pure and client-safe: the booth builds it locally, so the fallback works
 * even when the app's own API is what went away.
 */

/** Matches FAILURE_RETRY_AFTER_MS in mock-support.ts. */
const RETRY_AFTER_MS = 3000;
const SEND_EVENT_MS = 150;

export type ReplayTimelineArgs = {
  runId: string;
  ticketId: SupportTicketId;
  elapsedMs: number;
  failureArmed: boolean;
  startedAt: number;
};

type Segment = {
  stepIndex: number;
  startMs: number;
  endMs: number;
  kind: "attempt" | "failed" | "memoized";
};

/** Lays the run out on a clock: attempts, the failed try, and replays. */
function planSegments(failureArmed: boolean): Segment[] {
  const segments: Segment[] = [];
  let clock = 0;

  supportSteps.forEach((step, stepIndex) => {
    const isFailing = failureArmed && step.id === FAILURE_STEP_ID;

    if (isFailing) {
      segments.push({
        stepIndex,
        startMs: clock,
        endMs: clock + step.latencyMs,
        kind: "failed",
      });
      clock += step.latencyMs + RETRY_AFTER_MS;

      // The retry re-enters the function: every earlier step is replayed from
      // memoized state, instantly, before the failed step runs again.
      for (let earlier = 0; earlier < stepIndex; earlier += 1) {
        segments.push({ stepIndex: earlier, startMs: clock, endMs: clock, kind: "memoized" });
      }
    }

    segments.push({
      stepIndex,
      startMs: clock,
      endMs: clock + step.latencyMs,
      kind: "attempt",
    });
    clock += step.latencyMs;
  });

  return segments;
}

export function replayTimelineTotalMs(failureArmed: boolean): number {
  const segments = planSegments(failureArmed);

  return (segments[segments.length - 1]?.endMs ?? 0) + SEND_EVENT_MS;
}

export function buildReplayTimeline({
  runId,
  ticketId,
  elapsedMs,
  failureArmed,
  startedAt,
}: ReplayTimelineArgs): RunTimeline {
  const ticket = getSupportTicket(ticketId);
  const segments = planSegments(failureArmed);
  const totalMs = replayTimelineTotalMs(failureArmed);
  const steps: TimelineStep[] = [];

  for (const segment of segments) {
    if (elapsedMs < segment.startMs) break;

    const def = supportSteps[segment.stepIndex]!;
    const existing = steps.find((step) => step.displayName === def.id);
    const done = elapsedMs >= segment.endMs;
    const output = JSON.stringify({
      id: def.id,
      label: def.label,
      source: def.source,
      output: ticket.outputs[def.id].output,
      tokens: ticket.outputs[def.id].tokens,
    });

    if (segment.kind === "memoized") {
      if (existing) existing.memoized = true;
      continue;
    }

    if (segment.kind === "failed") {
      steps.push({
        id: `replay-${def.id}`,
        displayName: def.id,
        stepType: "run",
        status: done ? "retrying" : "running",
        attempt: 0,
        memoized: false,
        startedAt: startedAt + segment.startMs,
        ...(done
          ? {
              durationMs: segment.endMs - segment.startMs,
              errorMessage: `${def.source} returned 503 Service Unavailable`,
            }
          : {}),
      });
      continue;
    }

    const retried = existing && existing.status === "retrying";
    const step: TimelineStep = {
      id: `replay-${def.id}`,
      displayName: def.id,
      stepType: "run",
      status: done ? "completed" : "running",
      attempt: retried ? 1 : 0,
      memoized: false,
      startedAt: startedAt + segment.startMs,
      ...(done ? { durationMs: segment.endMs - segment.startMs, output } : {}),
      ...(retried && existing
        ? {
            errorMessage: existing.errorMessage,
            failedAttempts: [
              {
                startedAt: existing.startedAt,
                durationMs: existing.durationMs ?? 0,
                errorMessage: existing.errorMessage,
              },
            ],
          }
        : {}),
    };

    if (existing) {
      steps[steps.indexOf(existing)] = step;
    } else {
      steps.push(step);
    }
  }

  const allComplete = elapsedMs >= totalMs;

  return {
    runId,
    functionName: "support-agent",
    status: allComplete ? "completed" : "running",
    startedAt,
    ...(allComplete ? { durationMs: totalMs } : {}),
    steps,
    simulated: true,
  };
}
