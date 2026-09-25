import {
  FAILURE_STEP_ID,
  REPLY_STEP_ID,
  SANDBOX_STEP_ID,
  costPer1kTokens,
  sandboxStep,
  supportSteps,
  type ActivityStep,
} from "@/content/support-demo";
import type {
  FailedAttempt,
  RunTimeline,
  TimelineStep,
} from "@/inngest/middlewares/step-tracker";

/**
 * Pure derivations from a captured (or replayed) timeline to what the booth
 * draws: one view per agent step, the drafted reply, and the run totals.
 * Kept out of the components so every screen reads the same numbers.
 */

export type NodeState = "pending" | "running" | "retrying" | "done" | "errored";

export type StepView = {
  def: ActivityStep;
  state: NodeState;
  /** Finished before the outage and replayed from memoized state after it. */
  memoized: boolean;
  /** This step failed at least once and was retried. */
  recovered: boolean;
  startedAt?: number;
  durationMs?: number;
  failedAttempts: FailedAttempt[];
  errorMessage?: string;
  output?: string;
  input?: string;
  /** The policy check blocked the draft (the step itself succeeded). */
  flagged: boolean;
  tokens: number;
  costUsd: number;
};

export type RunTotals = {
  durationMs: number;
  tokens: number;
  costUsd: number;
  replayedSteps: number;
  retries: number;
};

export function buildStepViews(
  timeline: RunTimeline | null,
  model: string,
): StepView[] {
  const failureIndex = supportSteps.findIndex((def) => def.id === FAILURE_STEP_ID);
  const failed = timeline?.steps.some(
    (step) =>
      step.displayName === FAILURE_STEP_ID &&
      (step.status === "retrying" || (step.failedAttempts?.length ?? 0) > 0),
  );

  const views: StepView[] = supportSteps.map((def, index) => {
    const captured = timeline?.steps.find((step) => step.displayName === def.id);
    const payload = parseStepOutput(captured);
    const tokens = payload?.tokens ?? 0;

    return {
      def,
      state: nodeState(captured),
      // Inngest replays finished steps from memoized state on every re-entry,
      // so the raw flag ends up true for most steps of most runs. The claim
      // the booth makes is narrower and always true: the steps that finished
      // before the outage were not run again when the failed step retried.
      memoized: Boolean(failed) && index < failureIndex && captured?.memoized === true,
      recovered:
        (captured?.failedAttempts?.length ?? 0) > 0 ||
        (captured?.status === "completed" && captured.attempt > 0),
      startedAt: captured?.startedAt,
      durationMs: captured?.durationMs,
      failedAttempts: captured?.failedAttempts ?? [],
      errorMessage: captured?.errorMessage,
      output: payload?.output,
      input: captured?.input,
      flagged: payload?.flagged === true || payload?.passed === false,
      tokens,
      costUsd: (tokens / 1000) * costPer1kTokens(model),
    };
  });

  const sandbox = sandboxView(timeline);
  if (sandbox) {
    views.splice(
      views.findIndex((view) => view.def.id === "policy-check"),
      0,
      sandbox,
    );
  }

  return views;
}

/**
 * The sandboxed refund, when this run has one. Locally it is one simulated
 * step.run; in cloud it is the sandbox command step, whose output is the
 * command result with the script's JSON on stdout.
 */
function sandboxView(timeline: RunTimeline | null): StepView | null {
  const captured = timeline?.steps.find(
    (step) => step.displayName === SANDBOX_STEP_ID,
  );
  if (!captured) return null;

  const refundUsd = parseRefundUsd(captured.output);

  return {
    def: sandboxStep,
    state: nodeState(captured),
    memoized: false,
    recovered: false,
    startedAt: captured.startedAt,
    durationMs: captured.durationMs,
    failedAttempts: captured.failedAttempts ?? [],
    errorMessage: captured.errorMessage,
    output:
      refundUsd === null
        ? undefined
        : `$${refundUsd.toFixed(2)} refund${isSimulated(captured.output) ? " · simulated locally" : ""}`,
    input: captured.input,
    flagged: false,
    tokens: 0,
    costUsd: 0,
  };
}

function parseRefundUsd(output: string | undefined): number | null {
  const parsed = parseJson(output);
  const refund = parsed?.refund ?? parseJson(parsed?.stdout)?.refund ?? parseJson(parsed?.stdout);
  return typeof refund?.refundUsd === "number" ? refund.refundUsd : null;
}

function isSimulated(output: string | undefined): boolean {
  return parseJson(output)?.mode === "simulated";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(text: unknown): any {
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function nodeState(step: TimelineStep | undefined): NodeState {
  if (!step) return "pending";
  if (step.status === "completed") return "done";
  if (step.status === "retrying") return "retrying";
  if (step.status === "errored") return "errored";
  return "running";
}

type StepPayload = {
  output?: string;
  tokens?: number;
  source?: string;
  flagged?: boolean;
  passed?: boolean;
};

function parseStepOutput(step: TimelineStep | undefined): StepPayload | null {
  if (!step?.output) return null;

  try {
    const parsed = JSON.parse(step.output) as StepPayload;
    return typeof parsed === "object" && parsed ? parsed : null;
  } catch {
    return null;
  }
}

/** The policy check blocked the draft: the ticket went to a human. */
export function isEscalated(views: StepView[]): boolean {
  return views.some((view) => view.def.id === "policy-check" && view.flagged);
}

/** The drafted reply, as soon as the draft step completes. */
export function replyText(views: StepView[]): string | null {
  return views.find((view) => view.def.id === REPLY_STEP_ID)?.output ?? null;
}

export function runTotals(
  timeline: RunTimeline | null,
  views: StepView[],
): RunTotals {
  const lastEnd = views.reduce((latest, view) => {
    if (view.startedAt === undefined) return latest;
    return Math.max(latest, view.startedAt + (view.durationMs ?? 0));
  }, timeline?.startedAt ?? 0);

  return {
    durationMs:
      timeline?.durationMs ??
      (timeline ? Math.max(0, lastEnd - timeline.startedAt) : 0),
    tokens: views.reduce((sum, view) => sum + view.tokens, 0),
    costUsd: views.reduce((sum, view) => sum + view.costUsd, 0),
    replayedSteps: views.filter((view) => view.memoized).length,
    retries: views.reduce((sum, view) => sum + view.failedAttempts.length, 0),
  };
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatUsd(value: number, digits = 3): string {
  return `$${value.toFixed(digits)}`;
}
