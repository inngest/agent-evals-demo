import {
  inngest,
  researchFeedbackRecorded,
  researchOutcomeRecorded,
  researchRunCompleted,
  type ResearchFeedbackRecordedData,
  type ResearchOutcomeRecordedData,
  type ResearchRunCompletedData,
} from "@/inngest/client";
import { isCloud } from "@/lib/demo-target";
import {
  RESEARCH_OUTCOME_SCORE_NAME,
  outcomeScoreValue,
  researchOutcomeScorer,
} from "@/inngest/scorers/research-outcome-scorer";

export const researchScoreRun = inngest.createFunction(
  {
    id: "research-agent-score-run",
    name: "Research agent score run",
    retries: 2,
    triggers: [
      researchRunCompleted,
      researchFeedbackRecorded,
      researchOutcomeRecorded,
    ],
  },
  async ({ event, step, defer }) => {
    // Explicit per-event branching. The previous shape tested one name and
    // then ASSUMED ResearchRunCompletedData, so a third trigger would have
    // fallen through and read undefined fields off the wrong payload.
    if (event.name === "research/outcome.recorded") {
      const data = event.data as ResearchOutcomeRecordedData;
      const targetRunId = getScoreTargetRunId(data.parentRunId);
      const value = outcomeScoreValue(data.outcome);

      if (isCloud && targetRunId) {
        // The hero beat: the score is produced by a real deferred scorer
        // function, not written inline here.
        await defer(`research-outcome:${data.researchRunId}`, {
          function: researchOutcomeScorer,
          data: {
            parentRunId: targetRunId,
            researchRunId: data.researchRunId,
            outcome: data.outcome,
            daysLater: data.daysLater,
            observedAt: data.observedAt,
          },
        });
      } else {
        // Local mode has no run to attach to, but the beat must still produce
        // a visible durable step so the timeline looks identical offline.
        await step.run("score-research-outcome", async () => ({
          name: RESEARCH_OUTCOME_SCORE_NAME,
          value,
          researchRunId: data.researchRunId,
        }));
      }

      return {
        researchRunId: data.researchRunId,
        sessionId: data.sessionId,
        outcome: data.outcome,
        daysLater: data.daysLater,
        observedAt: data.observedAt,
        scoreName: RESEARCH_OUTCOME_SCORE_NAME,
        score: value,
        deferred: isCloud && Boolean(targetRunId),
      };
    }

    if (event.name === "research/feedback.recorded") {
      const data = event.data as ResearchFeedbackRecordedData;
      const signalScore =
        data.signal === "useful" || data.signal === "saved" ? 1 : 0;
      const targetRunId = getScoreTargetRunId(data.parentRunId);

      if (isCloud) {
        await step.score("attach-research-human-feedback-score", {
          ...(targetRunId ? { runId: targetRunId } : {}),
          name: "research_human_feedback",
          value: signalScore,
        });
      } else {
        // step.score is cloud-only, which left local mode with no steps at all
        // and therefore no timeline for the UI to show. Same step name, so the
        // visual is identical; only the attach is cloud-gated.
        await step.run("attach-research-human-feedback-score", async () => ({
          name: "research_human_feedback",
          value: signalScore,
          researchRunId: data.researchRunId,
        }));
      }

      return {
        researchRunId: data.researchRunId,
        sessionId: data.sessionId,
        signal: data.signal,
        score: signalScore,
        scoreName: "research_human_feedback",
        attached: isCloud && Boolean(targetRunId),
      };
    }

    // research/run.completed
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
    } else {
      await step.run("attach-research-quality-score", async () => ({
        name: "research_quality",
        value: qualityScore,
        researchRunId: data.researchRunId,
      }));
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
