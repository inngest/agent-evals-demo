import { experiment } from "inngest";
import {
  inngest,
  researchExperimentRequested,
  type ResearchExperimentCorpusRun,
} from "@/inngest/client";
import { modelExperimentResult } from "@/lib/mock-research";
import type { ResearchModel } from "@/content/research-demo";

const MODELS = ["gpt-5.5", "claude-opus-4.8"] as const satisfies readonly ResearchModel[];

export const researchExperimentBakeoff = inngest.createFunction(
  {
    id: "research-agent-model-bakeoff",
    name: "Research agent model bakeoff",
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
          "gpt-5.5": () =>
            step.run("evaluate-research-brief-gpt-5.5", async () => {
              return scoreModelAgainstCorpus("gpt-5.5", corpusSummary);
            }),
          "claude-opus-4.8": () =>
            step.run("evaluate-research-brief-claude-opus-4.8", async () => {
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

type CorpusSummary = {
  runCount: number;
  scoredRunCount: number;
  positiveSignals: number;
  negativeSignals: number;
  averageFeedbackScore: number;
};

function normalizeCorpusRuns(
  corpusRuns: ResearchExperimentCorpusRun[] | undefined,
  corpusRunIds: string[]
): ResearchExperimentCorpusRun[] {
  if (Array.isArray(corpusRuns) && corpusRuns.length > 0) {
    return corpusRuns;
  }

  return corpusRunIds.map((researchRunId) => ({ researchRunId }));
}

function summarizeCorpus(corpusRuns: ResearchExperimentCorpusRun[]): CorpusSummary {
  const scoredRuns = corpusRuns.filter((run) =>
    Number.isFinite(run.feedbackScore)
  );
  const positiveSignals = scoredRuns.filter(
    (run) => run.feedbackSignal === "useful" || run.feedbackSignal === "saved"
  ).length;
  const negativeSignals = scoredRuns.filter(
    (run) => run.feedbackSignal === "missed-context"
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

function scoreModelAgainstCorpus(
  model: ResearchModel,
  corpusSummary: CorpusSummary
) {
  const base = modelExperimentResult(model);
  const feedbackLift = (corpusSummary.averageFeedbackScore - 0.5) * 0.08;
  const corpusSizeLift = Math.min(0.03, corpusSummary.runCount / 5000);

  return {
    ...base,
    qualityScore: clamp01(
      round(base.qualityScore + feedbackLift + corpusSizeLift, 3)
    ),
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(1, value));
}
