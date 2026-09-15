import { experiment } from "inngest";
import { inngest, researchExperimentRequested } from "@/inngest/client";
import {
  EXPERIMENT_MODELS,
  normalizeCorpusRuns,
  scoreModelAgainstCorpus,
  summarizeCorpus,
  variantStepName,
} from "@/lib/experiment-results";

const MODELS = EXPERIMENT_MODELS;

export const researchExperimentBakeoff = inngest.createFunction(
  {
    id: "research-agent-model-bakeoff",
    // Display name only; `id` above is the wire key and must not change.
    name: "Research agent model A/B test",
    retries: 2,
    triggers: [researchExperimentRequested],
  },
  async ({ event, step, group }) => {
    const corpusRuns = normalizeCorpusRuns(
      event.data.corpusRuns,
      event.data.corpusRunIds
    );
    const corpusSummary = summarizeCorpus(corpusRuns);

    const { result, variant, experimentRef } = await group.experiment(
      "research-agent-model-bakeoff",
      {
        variants: {
          // Step names are memoization keys and are read back by
          // aggregateExperimentTimelines to recover the selected variant.
          // variantStepName() keeps both sides on one definition.
          "gpt-5.5": () =>
            step.run(variantStepName("gpt-5.5"), async () => {
              return scoreModelAgainstCorpus("gpt-5.5", corpusSummary);
            }),
          "claude-opus-4.8": () =>
            step.run(variantStepName("claude-opus-4.8"), async () => {
              return scoreModelAgainstCorpus("claude-opus-4.8", corpusSummary);
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

    await inngest.score.experiment({
      experiment: experimentRef,
      name: "research_corpus_feedback",
      value: corpusSummary.averageFeedbackScore,
    });

    return {
      experimentRunId: event.data.experimentRunId,
      batchId: event.data.batchId,
      topic: event.data.topic,
      corpusRunIds: event.data.corpusRunIds,
      corpusRuns,
      corpusSummary,
      variant,
      ...result,
      models: MODELS,
    };
  }
);
