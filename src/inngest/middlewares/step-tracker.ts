import { Middleware } from "inngest";

/**
 * Timeline step as seen by the demo UI. Steps are recorded in execution
 * order; `status` transitions running → completed | errored, with `retrying`
 * used when the step failed but attempts remain (Inngest will re-run it).
 */
export type TimelineStep = {
  /** SDK-side unique step id (hashed) */
  id: string;
  /** User-facing step id, e.g. "fetch-competitor-changelog" */
  displayName: string;
  stepType: string;
  status: "running" | "completed" | "errored" | "retrying";
  attempt: number;
  memoized: boolean;
  startedAt: number;
  durationMs?: number;
  /** Serialized step input, recorded explicitly by the function (if any) */
  input?: string;
  /** Serialized step output, captured automatically on completion */
  output?: string;
  /** Error message for the failed attempt (retrying/errored steps) */
  errorMessage?: string;
};

export type RunTimeline = {
  runId: string;
  eventId?: string;
  functionName: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  durationMs?: number;
  steps: TimelineStep[];
};

type TrackedRun = RunTimeline & { lastTouchedAt: number };

const MAX_TRACKED_RUNS = 20;
const MAX_RUNS_PER_KEY = 8;
const MAX_PAYLOAD_CHARS = 2000;

function serializePayload(value: unknown): string | undefined {
  if (value === undefined) return undefined;

  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }

  return text.length > MAX_PAYLOAD_CHARS
    ? `${text.slice(0, MAX_PAYLOAD_CHARS)}… [truncated]`
    : text;
}

/**
 * Records a step's input payload against its timeline entry. Middleware
 * cannot see closure inputs inside `step.run`, so functions report the
 * meaningful payload themselves (the demo's research agent does this via
 * `runResearchCall`). No-op when the run or step is not being tracked.
 */
export function recordStepInput(
  runId: string,
  displayName: string,
  input: unknown,
): void {
  const run = timelines.get(runId);
  if (!run) return;

  const step = run.steps.find(
    (step) => step.displayName === displayName && step.input === undefined,
  );
  if (!step) return;

  const serialized = serializePayload(input);
  if (serialized !== undefined) step.input = serialized;
}

const globalStepStore = globalThis as typeof globalThis & {
  __stepTimelines?: Map<string, TrackedRun>;
  __stepKeyIndex?: Map<string, string[]>;
};

const timelines =
  globalStepStore.__stepTimelines ??
  (globalStepStore.__stepTimelines = new Map<string, TrackedRun>());

// Lookup keys (platform event id and the demo's researchRunId correlation
// field) to the runIds they spawned, newest last. In local dev the event id
// seen by the app is a dev-server synthetic id that never matches the id
// inngest.send() returns, so the correlation field is the reliable local key.
const keyIndex =
  globalStepStore.__stepKeyIndex ??
  (globalStepStore.__stepKeyIndex = new Map<string, string[]>());

function indexRun(run: TrackedRun, keys: Array<string | undefined>) {
  for (const key of keys) {
    if (!key) continue;

    const existing = keyIndex.get(key) ?? [];
    const next = existing.filter((id) => id !== run.runId);
    next.push(run.runId);

    while (next.length > MAX_RUNS_PER_KEY) next.shift();

    keyIndex.set(key, next);
  }
}

function prune() {
  if (timelines.size <= MAX_TRACKED_RUNS) return;

  const byAge = [...timelines.values()].sort(
    (a, b) => a.lastTouchedAt - b.lastTouchedAt,
  );

  for (const run of byAge.slice(0, timelines.size - MAX_TRACKED_RUNS)) {
    timelines.delete(run.runId);
    for (const ids of keyIndex.values()) {
      const idx = ids.indexOf(run.runId);
      if (idx >= 0) ids.splice(idx, 1);
    }
  }
}

function trackedRun(
  ctx: {
    runId: string;
    attempt: number;
    event?: { id?: string; data?: Record<string, unknown> };
  },
  fn: { id(prefix?: string): string },
): TrackedRun {
  const correlationId =
    typeof ctx.event?.data?.researchRunId === "string"
      ? (ctx.event.data.researchRunId as string)
      : undefined;

  const existing = timelines.get(ctx.runId);

  if (existing) {
    existing.lastTouchedAt = Date.now();
    return existing;
  }

  const run: TrackedRun = {
    runId: ctx.runId,
    eventId: ctx.event?.id,
    functionName: fn.id(),
    status: "running",
    startedAt: Date.now(),
    lastTouchedAt: Date.now(),
    steps: [],
  };

  timelines.set(run.runId, run);
  indexRun(run, [run.eventId, correlationId]);
  prune();

  return run;
}

function stepDisplayName(stepInfo: {
  options: { displayName?: string; id?: string } & Record<string, unknown>;
}): string {
  return (
    stepInfo.options.displayName ??
    stepInfo.options.id ??
    (typeof stepInfo.options.name === "string"
      ? stepInfo.options.name
      : undefined) ??
    "step"
  );
}

/**
 * Records every step execution (start/complete/error) into an in-memory
 * timeline the demo status API reads. Works in both local dev and cloud
 * mode: middleware hooks fire inside our app process each time the executor
 * runs a step. Purely observational; never affects execution.
 */
export const stepTrackerMiddleware = () => {
  class StepTrackerMiddleware extends Middleware.BaseMiddleware {
    readonly id = "demo:step-tracker";

    onRunStart({ ctx, fn }: Middleware.OnRunStartArgs) {
      trackedRun(ctx, fn);
    }

    // wrapStep fires for EVERY step op, including ones fulfilled from
    // memoized state on retries/replays (which never reach onStepStart).
    // Record those so the UI can show Inngest skipping completed work.
    async wrapStep({ ctx, fn, next, stepInfo }: Middleware.WrapStepArgs) {
      if (!stepInfo.memoized) {
        return next();
      }

      const run = trackedRun(ctx, fn);
      const existing = run.steps.find(
        (step) => step.id === stepInfo.hashedId,
      );

      if (existing) {
        // Replay of a step recorded in an earlier attempt: flag it so the
        // UI shows Inngest skipping completed work. Keep the original
        // duration; the replay itself is instant.
        existing.memoized = true;
      } else {
        run.steps.push({
          id: stepInfo.hashedId,
          displayName: stepDisplayName(stepInfo),
          stepType: String(stepInfo.stepType),
          status: "completed",
          attempt: ctx.attempt,
          memoized: true,
          startedAt: Date.now(),
          durationMs: 0,
        });
      }

      return next();
    }

    onStepStart({ ctx, fn, stepInfo }: Middleware.OnStepStartArgs) {
      if (stepInfo.memoized) {
        // Defensive: memoized steps are normally captured in wrapStep; if
        // they ever reach this hook, record them the same way.
        const run = trackedRun(ctx, fn);

        if (!run.steps.some((step) => step.id === stepInfo.hashedId)) {
          run.steps.push({
            id: stepInfo.hashedId,
            displayName: stepDisplayName(stepInfo),
            stepType: String(stepInfo.stepType),
            status: "completed",
            attempt: ctx.attempt,
            memoized: true,
            startedAt: Date.now(),
            durationMs: 0,
          });
        }

        return;
      }

      const run = trackedRun(ctx, fn);

      const previous = run.steps.findIndex(
        (step) => step.id === stepInfo.hashedId,
      );

      const step: TimelineStep = {
        id: stepInfo.hashedId,
        displayName: stepDisplayName(stepInfo),
        stepType: String(stepInfo.stepType),
        status: "running",
        attempt: ctx.attempt,
        memoized: false,
        startedAt: Date.now(),
      };

      if (previous >= 0) {
        // Carry the last failure forward: a step that 503'd and recovered
        // keeps the error visible in the timeline for the full story.
        step.errorMessage = run.steps[previous].errorMessage;
        run.steps[previous] = step;
      } else {
        run.steps.push(step);
      }
    }

    onStepComplete({
      ctx,
      fn,
      output,
      stepInfo,
    }: Middleware.OnStepCompleteArgs) {
      const run = trackedRun(ctx, fn);
      const step = run.steps.find((step) => step.id === stepInfo.hashedId);

      if (step && step.status === "running") {
        step.status = "completed";
        step.durationMs = Date.now() - step.startedAt;
        step.output = serializePayload(output);
      }
    }

    onStepError({
      ctx,
      fn,
      error,
      stepInfo,
      isFinalAttempt,
    }: Middleware.OnStepErrorArgs) {
      const run = trackedRun(ctx, fn);
      const step = run.steps.find((step) => step.id === stepInfo.hashedId);

      if (step) {
        step.status = isFinalAttempt ? "errored" : "retrying";
        step.durationMs = Date.now() - step.startedAt;
        step.errorMessage = error instanceof Error ? error.message : String(error);
      }
    }

    onRunComplete({ ctx }: Middleware.OnRunCompleteArgs) {
      const run = timelines.get(ctx.runId);

      if (run) {
        run.status = "completed";
        run.durationMs = Date.now() - run.startedAt;
        run.lastTouchedAt = Date.now();
      }
    }

    onRunError({ ctx, isFinalAttempt }: Middleware.OnRunErrorArgs) {
      const run = timelines.get(ctx.runId);

      if (run) {
        run.status = isFinalAttempt ? "failed" : "running";
        run.lastTouchedAt = Date.now();
      }
    }
  }

  return StepTrackerMiddleware;
};

/**
 * Finds the timeline for a demo run. Preference order: the researchRunId
 * correlation id (reliable in both local and cloud mode), then the platform
 * event id (cloud mode). Filtered to the requested function so follow-up runs
 * triggered by the same research run (e.g. the scorer) never shadow it.
 */
export function getTimelineForDemo(
  eventId: string | undefined,
  researchRunId: string | undefined,
  functionName = "research-agent",
): RunTimeline | null {
  const keys = [researchRunId, eventId].filter(
    (key): key is string => Boolean(key),
  );

  for (const key of keys) {
    const runIds = keyIndex.get(key);

    if (!runIds) continue;

    for (let i = runIds.length - 1; i >= 0; i -= 1) {
      const run = timelines.get(runIds[i]);

      if (run && run.functionName === functionName) {
        return {
          runId: run.runId,
          eventId: run.eventId,
          functionName: run.functionName,
          status: run.status,
          startedAt: run.startedAt,
          durationMs: run.durationMs,
          steps: run.steps,
        };
      }
    }
  }

  return null;
}
