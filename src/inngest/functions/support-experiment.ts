import { experiment } from "inngest";
import { inngest, supportExperimentRequested } from "@/inngest/client";
import {
  challengerSupportModel,
  currentSupportModel,
} from "@/content/support-demo";
import { scoreVariant, variantStepName } from "@/lib/experiment-results";
import { SCORE } from "@/lib/score-names";

/** The experiment's wire id: also what the dashboard deep link targets. */
export const SUPPORT_EXPERIMENT_ID = "support-agent-model-split-test";

/**
 * Per-variant work time. Long enough that the booth sees the lanes fill run
 * by run, short enough that eight runs finish inside the split-test budget.
 */
const VARIANT_LATENCY_MS = 900;

export const supportExperiment = inngest.createFunction(
  {
    id: "support-agent-model-split-test",
    name: "Support agent model split test",
    retries: 2,
    triggers: [supportExperimentRequested],
  },
  async ({ event, step, group }) => {
    const { ticketId } = event.data;
    // A variant is just a function: this one swaps the model, but the same
    // shape splits prompts, retrievers, vendors or thresholds.
    const answerWith = (model: string) => () =>
      step.run(variantStepName(model), async () => {
        await new Promise((resolve) => setTimeout(resolve, VARIANT_LATENCY_MS));
        return scoreVariant(model, ticketId);
      });

    const { result, variant, experimentRef } = await group.experiment(
      SUPPORT_EXPERIMENT_ID,
      {
        variants: {
          [currentSupportModel]: answerWith(currentSupportModel),
          [challengerSupportModel]: answerWith(challengerSupportModel),
        },
        select: experiment.weighted({
          [currentSupportModel]: 50,
          [challengerSupportModel]: 50,
        }),
      },
    );

    // The same business metrics every live run is scored on, so the
    // experiment view compares variants on what the business cares about.
    const scores: Array<[string, number]> = [
      [SCORE.firstContactResolution, result.firstContactResolution],
      [SCORE.policyCompliance, result.policyCompliance],
      [SCORE.costPerTicket, result.costUsd],
      [SCORE.replyQuality, result.qualityScore],
    ];

    for (const [name, value] of scores) {
      await inngest.score.experiment({ experiment: experimentRef, name, value });
    }

    return {
      experimentRunId: event.data.experimentRunId,
      batchId: event.data.batchId,
      variant,
      ...result,
    };
  },
);
