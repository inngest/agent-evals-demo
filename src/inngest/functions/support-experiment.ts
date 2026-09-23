import { experiment } from "inngest";
import { inngest, supportExperimentRequested } from "@/inngest/client";
import {
  challengerSupportModel,
  currentSupportModel,
} from "@/content/support-demo";
import { scoreVariant, variantStepName } from "@/lib/experiment-results";

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
    const answerWith = (model: typeof currentSupportModel) => () =>
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

    await inngest.score.experiment({
      experiment: experimentRef,
      name: "support_reply_quality",
      value: result.qualityScore,
    });

    await inngest.score.experiment({
      experiment: experimentRef,
      name: "support_cost_usd",
      value: result.costUsd,
    });

    return {
      experimentRunId: event.data.experimentRunId,
      batchId: event.data.batchId,
      variant,
      ...result,
    };
  },
);
