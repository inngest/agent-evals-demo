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
    const { result, variant } = await group.experiment(
      "competitive-research-model-bakeoff",
      {
        variants: {
          "gpt-5.5": () =>
            step.run("evaluate-gpt-5.5", async () => {
              const outcome = modelExperimentResult("gpt-5.5");
              await inngest.score({
                name: "research_quality",
                value: outcome.qualityScore,
              });
              await inngest.score({
                name: "research_cost_usd",
                value: outcome.costUsd,
              });
              return outcome;
            }),
          "claude-opus-4.8": () =>
            step.run("evaluate-claude-opus-4.8", async () => {
              const outcome = modelExperimentResult("claude-opus-4.8");
              await inngest.score({
                name: "research_quality",
                value: outcome.qualityScore,
              });
              await inngest.score({
                name: "research_cost_usd",
                value: outcome.costUsd,
              });
              return outcome;
            }),
        },
        select: experiment.weighted({ "gpt-5.5": 50, "claude-opus-4.8": 50 }),
        withVariant: true,
      }
    );

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
