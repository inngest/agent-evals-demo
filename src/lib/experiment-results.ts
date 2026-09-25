import {
  challengerSupportModel,
  costPer1kTokens,
  currentSupportModel,
  getSupportTicket,
  supportTickets,
  ticketTokenCount,
  type SupportTicketId,
} from "@/content/support-demo";
import { modelRole, type ModelRole } from "@/lib/demo-models";
import type { RunTimeline } from "@/inngest/middlewares/step-tracker";

/**
 * Shared scoring and aggregation for the model split test.
 *
 * Three callers need identical numbers: the Inngest function that runs the
 * variants, the results endpoint that aggregates them back for the UI, and the
 * booth's labelled fallback when Inngest is unreachable. Keeping the maths
 * here - with no server-only imports - means the rendered comparison always
 * matches what the function actually computed, and the client can build the
 * fallback without a network round trip.
 */

export const EXPERIMENT_MODELS = [
  currentSupportModel,
  challengerSupportModel,
] as const;

/** Model names come from env, so this is any string, not a fixed union. */
export type ExperimentModel = string;

export type VariantResult = {
  model: ExperimentModel;
  ticketId: SupportTicketId;
  /** 1 when the answer resolved the ticket with no follow-up or hand-off. */
  firstContactResolution: number;
  /** 1 when the answer passed the policy check. */
  policyCompliance: number;
  qualityScore: number;
  tokenCount: number;
  costUsd: number;
};

export type VariantAggregate = {
  variant: string;
  runs: number;
  /** Share of this variant's tickets resolved on first contact, 0..1. */
  fcrRate: number;
  /** Share of this variant's answers that passed the policy check, 0..1. */
  policyRate: number;
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

/**
 * Canned quality by role. The split test's winner is scripted, not measured:
 * whichever models env names, the challenger wins.
 */
const BASE_QUALITY: Record<ModelRole, number> = {
  current: 0.84,
  challenger: 0.91,
};

/** Token usage relative to the canned ticket outputs. */
const TOKEN_FACTOR: Record<ModelRole, number> = {
  current: 1,
  challenger: 0.96,
};

/**
 * Small deterministic per-ticket variation so the bars move as runs land,
 * instead of every run reporting an identical score.
 */
const TICKET_JITTER: Record<SupportTicketId, number> = {
  "where-is-my-order": 0.01,
  "change-address": 0.005,
  "damaged-item": -0.015,
  "cancel-subscription": -0.01,
};

/**
 * The business outcome, scripted by role like the quality: on the tickets
 * that go badly today, the current model repeats today's failure (a refund
 * over the limit, a misread intent) and the challenger gets them right.
 */
function outcomeFor(role: ModelRole, ticketId: SupportTicketId) {
  const ticket = getSupportTicket(ticketId);
  if (role === "challenger" || ticket.group === "good") {
    return { firstContactResolution: 1, policyCompliance: 1 };
  }

  const policyCompliance = ticket.outputs["policy-check"].flagged ? 0 : 1;
  return { firstContactResolution: 0, policyCompliance };
}

export function scoreVariant(
  model: ExperimentModel,
  ticketId: SupportTicketId,
): VariantResult {
  const ticket = getSupportTicket(ticketId);
  const role = modelRole(model);
  const tokenCount = Math.round(ticketTokenCount(ticket) * TOKEN_FACTOR[role]);

  return {
    model,
    ticketId: ticket.id,
    ...outcomeFor(role, ticket.id),
    qualityScore: clamp01(round(BASE_QUALITY[role] + TICKET_JITTER[ticket.id], 3)),
    tokenCount,
    costUsd: round((tokenCount / 1000) * costPer1kTokens(model), 4),
  };
}

/** Which ticket split-test run `index` replays. Cycles the preset tickets. */
export function ticketForExperimentRun(index: number): SupportTicketId {
  return supportTickets[index % supportTickets.length]!.id;
}

// Step names are memoization keys and are read back by
// aggregateExperimentTimelines to recover the selected variant.
const VARIANT_STEP_PREFIX = "answer-ticket-with-";

export function variantStepName(variant: string): string {
  return `${VARIANT_STEP_PREFIX}${variant}`;
}

/** Collapses the captured split-test timelines into per-variant rows. */
export function aggregateExperimentTimelines(
  timelines: RunTimeline[],
  expectedRuns: number,
): ExperimentAggregate {
  return aggregateVariantResults(collectVariantResults(timelines), expectedRuns);
}

/**
 * Per-run variant results, in the order the runs finished.
 *
 * Each run's variant step is named `answer-ticket-with-<variant>`, so the
 * variant that `group.experiment` actually selected is read back off the step
 * that ran - these are real selections, not a re-simulation.
 */
export function collectVariantResults(timelines: RunTimeline[]): VariantResult[] {
  const results: Array<VariantResult & { finishedAt: number }> = [];

  for (const timeline of timelines) {
    if (timeline.status !== "completed") continue;

    const variantStep = timeline.steps.find(
      (step) =>
        step.displayName.startsWith(VARIANT_STEP_PREFIX) &&
        step.status === "completed" &&
        step.output,
    );

    if (!variantStep?.output) continue;

    try {
      const parsed = JSON.parse(variantStep.output) as Partial<VariantResult>;

      if (!Number.isFinite(parsed.qualityScore)) continue;

      results.push({
        model: variantStep.displayName.slice(
          VARIANT_STEP_PREFIX.length,
        ) as ExperimentModel,
        ticketId: parsed.ticketId ?? ticketForExperimentRun(0),
        firstContactResolution: parsed.firstContactResolution ?? 0,
        policyCompliance: parsed.policyCompliance ?? 0,
        qualityScore: parsed.qualityScore ?? 0,
        tokenCount: parsed.tokenCount ?? 0,
        costUsd: parsed.costUsd ?? 0,
        finishedAt: timeline.startedAt + (timeline.durationMs ?? 0),
      });
    } catch {
      continue;
    }
  }

  return results
    .sort((a, b) => a.finishedAt - b.finishedAt)
    .map((result) => ({
      model: result.model,
      ticketId: result.ticketId,
      firstContactResolution: result.firstContactResolution,
      policyCompliance: result.policyCompliance,
      qualityScore: result.qualityScore,
      tokenCount: result.tokenCount,
      costUsd: result.costUsd,
    }));
}

export function aggregateVariantResults(
  results: VariantResult[],
  expectedRuns: number,
): ExperimentAggregate {
  const totals = new Map<
    string,
    { runs: number; fcr: number; policy: number; quality: number; cost: number; tokens: number }
  >();
  const empty = () => ({ runs: 0, fcr: 0, policy: 0, quality: 0, cost: 0, tokens: 0 });

  for (const model of EXPERIMENT_MODELS) {
    totals.set(model, empty());
  }

  for (const result of results) {
    const bucket = totals.get(result.model) ?? empty();
    bucket.runs += 1;
    bucket.fcr += result.firstContactResolution;
    bucket.policy += result.policyCompliance;
    bucket.quality += result.qualityScore;
    bucket.cost += result.costUsd;
    bucket.tokens += result.tokenCount;
    totals.set(result.model, bucket);
  }

  const variants: VariantAggregate[] = [...totals.entries()].map(
    ([variant, bucket]) => ({
      variant,
      runs: bucket.runs,
      fcrRate: bucket.runs > 0 ? round(bucket.fcr / bucket.runs, 3) : 0,
      policyRate: bucket.runs > 0 ? round(bucket.policy / bucket.runs, 3) : 0,
      // A variant with zero runs is reported as zero rather than hidden: an
      // empty row is information, a missing row looks like a bug.
      qualityScore: bucket.runs > 0 ? round(bucket.quality / bucket.runs, 3) : 0,
      costUsd: bucket.runs > 0 ? round(bucket.cost / bucket.runs, 4) : 0,
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
    // A winner needs a comparison: one variant alone has beaten nothing.
    winner: winner && runnerUp ? winner.variant : null,
    qualityDelta:
      winner && runnerUp
        ? round(winner.qualityScore - runnerUp.qualityScore, 3)
        : 0,
    costDelta:
      winner && runnerUp && runnerUp.costUsd > 0
        ? round((winner.costUsd - runnerUp.costUsd) / runnerUp.costUsd, 3)
        : 0,
    completedRuns: results.length,
    totalRuns: expectedRuns,
  };
}

/**
 * The labelled fallback when the split test never ran in Inngest: the same
 * maths over a deterministic alternating split, so a rehearsal always looks
 * the same.
 */
export function simulatedVariantResults(expectedRuns: number): VariantResult[] {
  return Array.from({ length: expectedRuns }, (_, index) =>
    scoreVariant(
      EXPERIMENT_MODELS[index % EXPERIMENT_MODELS.length]!,
      ticketForExperimentRun(Math.floor(index / EXPERIMENT_MODELS.length)),
    ),
  );
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(1, value));
}
