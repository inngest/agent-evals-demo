import { experiment } from "inngest";
import { inngest, researchExperimentRequested } from "@/inngest/client";
import { modelExperimentResult } from "@/lib/mock-research";
import type { ResearchModel } from "@/content/research-demo";

const MODELS = ["gpt-5.5", "claude-opus-4.8"] as const satisfies readonly ResearchModel[];

export const researchExperimentBakeoff = inngest.createFunction(
  {
    id: "research-experiment-bakeoff",
    retries: 2,
    triggers: [researchExperimentRequested],
  },
  async ({ event, step, group }) => {
    const { result, variant, experimentRef } = await group.experiment(
      "competitive-research-model-bakeoff",
      {
        variants: {
          "gpt-5.5": () =>
            step.run("evaluate-gpt-5.5", async () => {
              return modelExperimentResult("gpt-5.5");
            }),
          "claude-opus-4.8": () =>
            step.run("evaluate-claude-opus-4.8", async () => {
              return modelExperimentResult("claude-opus-4.8");
            }),
        },
        select: experiment.weighted({ "gpt-5.5": 50, "claude-opus-4.8": 50 }),
      }
    );

    await inngest.score.experiment({
      experiment: experimentRef,
      name: "research_quality",
      value: result.qualityScore,
    });

    await inngest.score.experiment({
      experiment: experimentRef,
      name: "research_cost_usd",
      value: result.costUsd,
    });

    return {
      experimentRunId: event.data.experimentRunId,
      topic: event.data.topic,
      corpusRunIds: event.data.corpusRunIds,
      variant,
      ...result,
      models: MODELS,
    };
  }
);
