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
  /**
   * True only for the offline rehearsal timeline built when Inngest is
   * unreachable. Real captured runs never set it. The UI badges it loudly.
   */
  simulated?: boolean;
};

type TrackedRun = RunTimeline & { lastTouchedAt: number };

const MAX_TRACKED_RUNS = 64;
const MAX_RUNS_PER_KEY = 16;
const MAX_PAYLOAD_CHARS = 2000;
/**
 * Model-call steps carry the artifact the booth actually shows (the research
 * brief). A real OpenRouter completion runs well past the default cap, so
 * those steps get a larger budget. Everything else stays small: the status
 * route ships the whole timeline on an 800ms poll.
 */
const MAX_PAYLOAD_CHARS_LARGE = 6000;
/** Runs touched this recently are never evicted, even under pressure. */
const EVICTION_GRACE_MS = 10 * 60 * 1000;

function payloadBudget(displayName: string): number {
  return displayName.startsWith("call-")
    ? MAX_PAYLOAD_CHARS_LARGE
    : MAX_PAYLOAD_CHARS;
}

/**
 * Serializes a step payload, clamping it to `maxChars`. Overflow MUST stay
 * parseable: the UI does `JSON.parse(step.output)` to pull the brief out, and
 * an unparseable payload silently removes the research output card.
 *
 * When the value is a plain object we clamp its longest string fields and keep
 * the envelope shape, so consumers still read `output`/`source`/`tokens` and
 * merely see clipped prose. Anything else falls back to a preview wrapper.
 * Both forms carry `__truncated` so the UI can badge them.
 */
function serializePayload(
  value: unknown,
  maxChars: number = MAX_PAYLOAD_CHARS,
): string | undefined {
  if (value === undefined) return undefined;

  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }

  if (text.length <= maxChars) return text;

  const clamped = clampObjectStrings(value, maxChars, text.length);
  if (clamped !== undefined) return clamped;

  return JSON.stringify({
    __truncated: true,
    __chars: text.length,
    preview: text.slice(0, maxChars),
  });
}

/**
 * Shrinks the longest string properties of a plain object until the whole
 * thing serializes under `maxChars`. Returns undefined when the value is not a
 * plain object or cannot be brought under budget this way.
 */
function clampObjectStrings(
  value: unknown,
  maxChars: number,
  originalChars: number,
): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const draft: Record<string, unknown> = {
    ...(value as Record<string, unknown>),
    __truncated: true,
    __chars: originalChars,
  };

  const stringKeys = Object.keys(draft).filter(
    (key) => typeof draft[key] === "string",
  );
  if (stringKeys.length === 0) return undefined;

  // Longest field first: clipping it buys the most room per pass.
  stringKeys.sort(
    (a, b) => (draft[b] as string).length - (draft[a] as string).length,
  );

  for (const key of stringKeys) {
    let text = JSON.stringify(draft);
    if (text.length <= maxChars) return text;

    const current = draft[key] as string;
    const overflow = text.length - maxChars;
    const nextLength = Math.max(0, current.length - overflow - 16);

    draft[key] = current.slice(0, nextLength);
    text = JSON.stringify(draft);
    if (text.length <= maxChars) return text;
  }

  const final = JSON.stringify(draft);
  return final.length <= maxChars ? final : undefined;
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

  const serialized = serializePayload(input, payloadBudget(displayName));
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

  // A *completed* run stops being touched, which makes it the oldest entry and
  // therefore the first eviction candidate. That is exactly the run the booth
  // is still showing, so anything recent is off-limits no matter how full the
  // store gets. Without this, one experiment fan-out blanks the Run stage.
  const cutoff = Date.now() - EVICTION_GRACE_MS;
  const byAge = [...timelines.values()]
    .filter((run) => run.lastTouchedAt < cutoff)
    .sort((a, b) => a.lastTouchedAt - b.lastTouchedAt);

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
        step.output = serializePayload(output, payloadBudget(step.displayName));
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
