/**
 * Deferred outcome scorer - the real `createScorer` primitive, used for the
 * "score it weeks later" beat of the loop demo.
 *
 * This is the piece that makes `defer()` demonstrable. The code pane has
 * always shown a defer block, but the only createScorer in this repo was
 * localizationScorer, which belongs to the retired incident demo and is not
 * even served. So the primitive the stage narrates never executed anywhere.
 *
 * createScorer wraps createDefer: the ScorerResult returned here is forwarded
 * to client.score(...) inside a durable step. It is a real InngestFunction at
 * runtime, so it MUST be served - see functions/index.ts.
 *
 * runId attachment: the defer is fired from researchScoreRun, whose own run is
 * not the research run the score should land on. The parent research run id is
 * threaded through the event payload and passed explicitly.
 */

import { createScorer } from "inngest/experimental";
import { staticSchema } from "inngest";
import { inngest } from "@/inngest/client";
import type { ResearchOutcome } from "@/inngest/client";

export type ResearchOutcomeScorerData = {
  /** Inngest run id of the research run to attach the score to. */
  parentRunId: string;
  researchRunId: string;
  outcome: ResearchOutcome;
  daysLater: number;
  observedAt: string;
};

export const RESEARCH_OUTCOME_SCORE_NAME = "research_deferred_outcome";

/** A shipped recommendation is the positive outcome; wrong is the negative. */
export function outcomeScoreValue(outcome: ResearchOutcome): number {
  return outcome === "shipped" ? 1 : 0;
}

export const researchOutcomeScorer = createScorer(
  inngest,
  {
    id: "research-outcome-scorer",
    schema: staticSchema<ResearchOutcomeScorerData>(),
  },
  async ({ event }) => {
    const { parentRunId, outcome } = event.data;

    return {
      name: RESEARCH_OUTCOME_SCORE_NAME,
      value: outcomeScoreValue(outcome),
      runId: parentRunId,
    };
  },
);
