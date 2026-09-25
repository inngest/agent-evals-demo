import {
  FAILURE_STEP_ID,
  REPLY_STEP_ID,
  SANDBOX_STEP_ID,
  costPer1kTokens,
  sandboxStep,
  supportSteps,
  type ActivityStep,
} from "@/content/support-demo";
import type { RefundCalculation } from "@/content/refund-sandbox";
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
  /** The sandboxed refund's lifecycle and output (that row only). */
  sandbox?: SandboxDetail;
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
      views.findIndex((view) => view.def.id === REPLY_STEP_ID),
      0,
      sandbox,
    );
  }

  return views;
}

/** One step of the sandbox's life, as the trace records it. */
export type SandboxStage = {
  id: string;
  label: string;
  state: NodeState;
  durationMs?: number;
};

export type SandboxDetail = {
  /** Local mode: one step.run stands in for create, run and destroy. */
  simulated: boolean;
  stages: SandboxStage[];
  /** What the script printed, once it has run. */
  output: RefundCalculation | null;
};

const SANDBOX_STAGES = [
  { id: "create-refund-sandbox", label: "Create sandbox" },
  { id: SANDBOX_STEP_ID, label: "Run refund script" },
  { id: "destroy-refund-sandbox", label: "Destroy sandbox" },
] as const;

/**
 * The sandboxed refund, when this run has one. In cloud it is three durable
 * steps (create, run the script, destroy); the command step's output carries
 * the script's JSON on stdout, base64 on the wire. Locally it is one
 * simulated step.run.
 */
function sandboxView(timeline: RunTimeline | null): StepView | null {
  const captured = SANDBOX_STAGES.map((stage) => ({
    ...stage,
    step: timeline?.steps.find((step) => step.displayName === stage.id),
  }));
  const seen = captured.filter((stage) => stage.step);
  if (seen.length === 0) return null;

  const run = captured[1]!.step;
  const simulated = parseJson(run?.output)?.mode === "simulated";
  const stages = (simulated ? [captured[1]!] : captured).map((stage) => ({
    id: stage.id,
    label: stage.label,
    state: nodeState(stage.step),
    durationMs: stage.step?.durationMs,
  }));
  const last = stages[stages.length - 1]!;
  const output = parseRefund(run?.output);
  const first = seen[0]!.step!;
  const failed = seen.find(
    (stage) => stage.step?.status === "retrying" || stage.step?.status === "errored",
  )?.step;

  return {
    def: sandboxStep,
    // Done only when the sandbox is gone, not just when the script ran.
    state: failed ? nodeState(failed) : last.state === "done" ? "done" : "running",
    memoized: false,
    recovered: false,
    startedAt: first.startedAt,
    durationMs: stages.every((stage) => stage.durationMs !== undefined)
      ? stages.reduce((sum, stage) => sum + (stage.durationMs ?? 0), 0)
      : undefined,
    failedAttempts: [],
    errorMessage: failed?.errorMessage,
    output:
      output === null
        ? undefined
        : `$${output.refundUsd.toFixed(2)} refund${simulated ? " · simulated locally" : ""}`,
    input: run?.input,
    flagged: false,
    tokens: 0,
    costUsd: 0,
    sandbox: { simulated, stages, output },
  };
}

function parseRefund(output: string | undefined): RefundCalculation | null {
  const parsed = parseJson(output);
  const refund = parsed?.refund ?? parseJson(commandStdout(parsed?.result));
  return typeof refund?.refundUsd === "number" && Array.isArray(refund.lines)
    ? (refund as RefundCalculation)
    : null;
}

function commandStdout(
  result: { stdout?: unknown; encoding?: unknown } | undefined,
): string | undefined {
  if (typeof result?.stdout !== "string") return undefined;
  if (result.encoding !== "base64") return result.stdout;

  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(result.stdout), (char) => char.charCodeAt(0)),
    );
  } catch {
    return undefined;
  }
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
