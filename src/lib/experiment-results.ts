import { modelExperimentResult } from "@/lib/mock-research";
import type { RunTimeline } from "@/inngest/middlewares/step-tracker";
import type { ResearchExperimentCorpusRun } from "@/inngest/client";

/**
 * Shared scoring and aggregation for the model A/B test.
 *
 * Three callers need identical numbers: the Inngest function that runs the
 * variants, the results endpoint that aggregates them back for the UI, and the
 * offline fallback when Inngest is unreachable. Keeping the maths here means
 * the rendered comparison always matches what the function actually computed.
 */

export const EXPERIMENT_MODELS = ["gpt-5.5", "claude-opus-4.8"] as const;

export type ExperimentModel = (typeof EXPERIMENT_MODELS)[number];

export type CorpusSummary = {
  runCount: number;
  scoredRunCount: number;
  positiveSignals: number;
  negativeSignals: number;
  averageFeedbackScore: number;
};

export type VariantAggregate = {
  variant: string;
  runs: number;
  qualityScore: number;
  costUsd: number;
  tokenCount: number;
};

export type ExperimentAggregate = {
  variants: VariantAggregate[];
  winner: string | null;
  /** Quality advantage of the winner over the runner-up, 0 when unavailable. */
  qualityDelta: number;
  /** Cost change of the winner vs the runner-up, as a signed fraction. */
  costDelta: number;
  completedRuns: number;
  totalRuns: number;
};

export function normalizeCorpusRuns(
  corpusRuns: ResearchExperimentCorpusRun[] | undefined,
  corpusRunIds: string[],
): ResearchExperimentCorpusRun[] {
  if (Array.isArray(corpusRuns) && corpusRuns.length > 0) {
    return corpusRuns;
  }

  return corpusRunIds.map((researchRunId) => ({ researchRunId }));
}

export function summarizeCorpus(
  corpusRuns: ResearchExperimentCorpusRun[],
): CorpusSummary {
  const scoredRuns = corpusRuns.filter((run) =>
    Number.isFinite(run.feedbackScore),
  );
  const positiveSignals = scoredRuns.filter(
    (run) => run.feedbackSignal === "useful" || run.feedbackSignal === "saved",
  ).length;
  const negativeSignals = scoredRuns.filter(
    (run) => run.feedbackSignal === "missed-context",
  ).length;
  const totalScore = scoredRuns.reduce((sum, run) => {
    return sum + (run.feedbackScore ?? 0);
  }, 0);

  return {
    runCount: corpusRuns.length,
    scoredRunCount: scoredRuns.length,
    positiveSignals,
    negativeSignals,
    averageFeedbackScore:
      scoredRuns.length > 0 ? round(totalScore / scoredRuns.length, 3) : 0.5,
  };
}

export function scoreModelAgainstCorpus(
  model: string,
  corpusSummary: CorpusSummary,
) {
  const base = modelExperimentResult(model);
  const feedbackLift = (corpusSummary.averageFeedbackScore - 0.5) * 0.08;
  const corpusSizeLift = Math.min(0.03, corpusSummary.runCount / 5000);

  return {
    ...base,
    qualityScore: clamp01(
      round(base.qualityScore + feedbackLift + corpusSizeLift, 3),
    ),
  };
}

/**
 * Collapses the captured A/B test timelines into per-variant rows.
 *
 * Each run's variant step is named `evaluate-research-brief-<variant>`, so the
 * variant that `group.experiment` actually selected is read back off the step
 * that ran - these are real selections, not a re-simulation.
 */
export function aggregateExperimentTimelines(
  timelines: RunTimeline[],
  expectedRuns: number,
): ExperimentAggregate {
  const totals = new Map<
    string,
    { runs: number; quality: number; cost: number; tokens: number }
  >();

  for (const model of EXPERIMENT_MODELS) {
    totals.set(model, { runs: 0, quality: 0, cost: 0, tokens: 0 });
  }

  let completedRuns = 0;

  for (const timeline of timelines) {
    if (timeline.status !== "completed") continue;

    const variantStep = timeline.steps.find(
      (step) =>
        step.displayName.startsWith(VARIANT_STEP_PREFIX) &&
        step.status === "completed" &&
        step.output,
    );

    if (!variantStep?.output) continue;

    const variant = variantStep.displayName.slice(VARIANT_STEP_PREFIX.length);
    let parsed: {
      qualityScore?: number;
      costUsd?: number;
      tokenCount?: number;
    } | null = null;

    try {
      parsed = JSON.parse(variantStep.output);
    } catch {
      continue;
    }

    if (!parsed || !Number.isFinite(parsed.qualityScore)) continue;

    const bucket = totals.get(variant) ?? {
      runs: 0,
      quality: 0,
      cost: 0,
      tokens: 0,
    };
    bucket.runs += 1;
    bucket.quality += parsed.qualityScore ?? 0;
    bucket.cost += parsed.costUsd ?? 0;
    bucket.tokens += parsed.tokenCount ?? 0;
    totals.set(variant, bucket);
    completedRuns += 1;
  }

  const variants: VariantAggregate[] = [...totals.entries()].map(
    ([variant, bucket]) => ({
      variant,
      runs: bucket.runs,
      // A variant with zero runs is reported as zero rather than hidden: an
      // empty row is information, a missing row looks like a bug.
      qualityScore: bucket.runs > 0 ? round(bucket.quality / bucket.runs, 3) : 0,
      costUsd: bucket.runs > 0 ? round(bucket.cost / bucket.runs, 3) : 0,
      tokenCount: bucket.runs > 0 ? Math.round(bucket.tokens / bucket.runs) : 0,
    }),
  );

  const ranked = [...variants]
    .filter((variant) => variant.runs > 0)
    .sort((a, b) => b.qualityScore - a.qualityScore);

  const winner = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;

  return {
    variants,
    winner: winner?.variant ?? null,
    qualityDelta:
      winner && runnerUp
        ? round(winner.qualityScore - runnerUp.qualityScore, 3)
        : 0,
    costDelta:
      winner && runnerUp && runnerUp.costUsd > 0
        ? round((winner.costUsd - runnerUp.costUsd) / runnerUp.costUsd, 3)
        : 0,
    completedRuns,
    totalRuns: expectedRuns,
  };
}

// Kept verbatim: Inngest step names are memoization keys, and renaming one
// re-executes it for in-flight runs and orphans historical trace rows. The
// product vocabulary changed; the wire identifier deliberately did not.
const VARIANT_STEP_PREFIX = "evaluate-research-brief-";

export function variantStepName(variant: string): string {
  return `${VARIANT_STEP_PREFIX}${variant}`;
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(1, value));
}
