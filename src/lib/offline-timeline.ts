import { researchSteps } from "@/content/research-demo";
import type { RunTimeline, TimelineStep } from "@/inngest/middlewares/step-tracker";

/**
 * Builds a labeled rehearsal timeline for the case where Inngest never
 * acknowledged the run (no keys, no network, dev server down).
 *
 * This exists to replace a worse behavior: the status route used to invent
 * progress from wall-clock time and then return a fully "completed" result,
 * including a fabricated sandbox summary, while the step list stayed empty.
 * The booth screen claimed an isolated environment had executed when nothing
 * had run at all, and the one question any engineer asks - "where are the
 * steps?" - had no good answer.
 *
 * So the shape here is deliberately identical to a captured run: same display
 * names, same ordering, same 503-then-replay beat. The single difference is
 * `simulated: true`, which the UI renders as an unmissable badge. The demo
 * stays legible and stays honest at the same time.
 */

/** Where the sandbox beat sits in the real function, between the changelog
 * fetch and the market search (research-agent.ts). */
const SANDBOX_STEP_NAME = "run-generated-analysis";
const SANDBOX_AFTER_STEP = "fetch-competitor-changelog";
/** The step the demo arms to fail once, matching the UI's failure toggle. */
const FAILING_STEP = "fetch-competitor-changelog";

const RETRY_AT_MS = 3100;
const RETRY_CLEARS_AT_MS = 4200;

export type OfflineTimelineArgs = {
  runId: string;
  elapsedMs: number;
  useSandbox: boolean;
  failureArmed: boolean;
  startedAt: number;
};

type PlannedStep = {
  displayName: string;
  output: string;
  tokens: number;
};

function planSteps(useSandbox: boolean): PlannedStep[] {
  const planned: PlannedStep[] = [];

  for (const step of researchSteps) {
    planned.push({
      displayName: step.id,
      output: step.output,
      tokens: step.tokens,
    });

    if (useSandbox && step.id === SANDBOX_AFTER_STEP) {
      planned.push({
        displayName: SANDBOX_STEP_NAME,
        output: "Analysis script executed; momentum scored per competitor.",
        tokens: 0,
      });
    }
  }

  return planned;
}

export function offlineTimelineTotalMs(useSandbox: boolean): number {
  return useSandbox ? 8800 : 7600;
}

export function buildOfflineTimeline({
  runId,
  elapsedMs,
  useSandbox,
  failureArmed,
  startedAt,
}: OfflineTimelineArgs): RunTimeline {
  const planned = planSteps(useSandbox);
  const totalMs = offlineTimelineTotalMs(useSandbox);
  const perStepMs = totalMs / planned.length;

  // The failing step is still being retried right now: earlier steps have not
  // been replayed yet, so nothing is memoized at this point.
  const inRetryWindow =
    failureArmed &&
    elapsedMs >= RETRY_AT_MS &&
    elapsedMs < RETRY_CLEARS_AT_MS;
  const retryResolved = failureArmed && elapsedMs >= RETRY_CLEARS_AT_MS;

  const steps: TimelineStep[] = [];

  planned.forEach((plan, index) => {
    const stepStartMs = index * perStepMs;
    const stepEndMs = stepStartMs + perStepMs;
    const isFailing = failureArmed && plan.displayName === FAILING_STEP;

    if (elapsedMs < stepStartMs) return;

    const startedAtMs = startedAt + stepStartMs;
    const base = {
      id: `offline-${index}-${plan.displayName}`,
      displayName: plan.displayName,
      stepType: "run",
      startedAt: startedAtMs,
    };

    if (isFailing && inRetryWindow) {
      steps.push({
        ...base,
        status: "retrying",
        attempt: 0,
        memoized: false,
        durationMs: Math.round(perStepMs),
        errorMessage: "competitor API returned 503",
      });
      return;
    }

    const completed = elapsedMs >= stepEndMs;

    steps.push({
      ...base,
      status: completed ? "completed" : "running",
      // After the retry resolves Inngest replays the run: steps that already
      // succeeded come back memoized rather than re-executing.
      attempt: isFailing && retryResolved ? 1 : 0,
      memoized: retryResolved && !isFailing && stepEndMs < RETRY_AT_MS,
      ...(completed ? { durationMs: Math.round(perStepMs) } : {}),
      ...(completed
        ? {
            output: JSON.stringify({
              id: plan.displayName,
              output: plan.output,
              source: "simulated",
              tokens: plan.tokens,
            }),
          }
        : {}),
      ...(isFailing && retryResolved
        ? { errorMessage: "competitor API returned 503 (attempt 1 succeeded)" }
        : {}),
    });
  });

  const allComplete =
    steps.length === planned.length &&
    steps.every((step) => step.status === "completed");

  return {
    runId,
    functionName: "research-agent",
    status: allComplete ? "completed" : "running",
    startedAt,
    ...(allComplete ? { durationMs: Math.round(totalMs) } : {}),
    steps,
    simulated: true,
  };
}
