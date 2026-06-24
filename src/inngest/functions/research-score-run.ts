import {
  inngest,
  researchFeedbackRecorded,
  researchRunCompleted,
  type ResearchFeedbackRecordedData,
  type ResearchRunCompletedData,
} from "@/inngest/client";
import { isCloud } from "@/lib/demo-target";

export const researchScoreRun = inngest.createFunction(
  {
    id: "research-score-run",
    retries: 2,
    triggers: [researchRunCompleted, researchFeedbackRecorded],
  },
  async ({ event, step }) => {
    if (event.name === "research/feedback.recorded") {
      const data = event.data as ResearchFeedbackRecordedData;
      const signalScore =
        data.signal === "useful" || data.signal === "saved" ? 1 : 0;

      if (isCloud && data.parentRunId) {
        await step.score("attach-human-feedback-score", {
          runId: data.parentRunId,
          name: "research_human_feedback",
          value: signalScore,
        });
      }

      return {
        researchRunId: data.researchRunId,
        sessionId: data.sessionId,
        signal: data.signal,
        score: signalScore,
      };
    }

    const data = event.data as ResearchRunCompletedData;
    const qualityScore = data.qualityScore;

    if (isCloud && data.parentRunId) {
      await step.score("attach-research-quality-score", {
        runId: data.parentRunId,
        name: "research_quality",
        value: qualityScore,
      });

      await step.score("attach-research-cost-score", {
        runId: data.parentRunId,
        name: "research_cost_usd",
        value: data.costUsd,
      });
    }

    return {
      researchRunId: data.researchRunId,
      sessionId: data.sessionId,
      model: data.model,
      qualityScore,
      tokenCount: data.tokenCount,
      costUsd: data.costUsd,
      sourceCount: data.sources.length,
    };
  }
);
