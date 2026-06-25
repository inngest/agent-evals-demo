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
      const targetRunId = getScoreTargetRunId(data.parentRunId);

      if (isCloud) {
        await step.score("attach-human-feedback-score", {
          ...(targetRunId ? { runId: targetRunId } : {}),
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
    const targetRunId = getScoreTargetRunId(data.parentRunId);

    if (isCloud) {
      await step.score("attach-research-quality-score", {
        ...(targetRunId ? { runId: targetRunId } : {}),
        name: "research_quality",
        value: qualityScore,
      });

      await step.score("attach-research-cost-score", {
        ...(targetRunId ? { runId: targetRunId } : {}),
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

function getScoreTargetRunId(runId: string | undefined): string | undefined {
  if (!runId) return undefined;

  // Demo correlation IDs are UUIDs. Inngest Cloud run IDs are ULIDs, and
  // passing a UUID to step.score() causes the metadata API to reject the run.
  return isUlid(runId) ? runId : undefined;
}

function isUlid(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value);
}
