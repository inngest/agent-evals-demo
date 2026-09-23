import {
  inngest,
  supportFeedbackRecorded,
  supportRunCompleted,
  type SupportFeedbackRecordedData,
  type SupportRunCompletedData,
} from "@/inngest/client";
import { isCloud } from "@/lib/demo-target";

export const SUPPORT_FEEDBACK_SCORE_NAME = "support_human_feedback";
/** The step the booth waits on as the receipt for the visitor's vote. */
export const SUPPORT_FEEDBACK_STEP = "attach-human-feedback-score";

export const supportScoreRun = inngest.createFunction(
  {
    id: "support-agent-score-run",
    name: "Support agent metrics",
    retries: 2,
    triggers: [supportRunCompleted, supportFeedbackRecorded],
  },
  async ({ event, step }) => {
    if (event.name === "support/feedback.recorded") {
      const data = event.data as SupportFeedbackRecordedData;
      const value = data.signal === "good" ? 1 : 0;
      const targetRunId = getScoreTargetRunId(data.parentRunId);

      if (isCloud) {
        await step.score(SUPPORT_FEEDBACK_STEP, {
          ...(targetRunId ? { runId: targetRunId } : {}),
          name: SUPPORT_FEEDBACK_SCORE_NAME,
          value,
        });
      } else {
        // step.score is cloud-only, which would leave local mode with no
        // steps at all and so no receipt for the UI. Same step name, so the
        // visual is identical; only the attach is cloud-gated.
        await step.run(SUPPORT_FEEDBACK_STEP, async () => ({
          name: SUPPORT_FEEDBACK_SCORE_NAME,
          value,
          supportRunId: data.supportRunId,
        }));
      }

      return {
        supportRunId: data.supportRunId,
        signal: data.signal,
        score: value,
        scoreName: SUPPORT_FEEDBACK_SCORE_NAME,
        attached: isCloud && Boolean(targetRunId),
      };
    }

    // support/run.completed
    const data = event.data as SupportRunCompletedData;
    const targetRunId = getScoreTargetRunId(data.parentRunId);

    if (isCloud) {
      await step.score("attach-reply-quality-score", {
        ...(targetRunId ? { runId: targetRunId } : {}),
        name: "support_reply_quality",
        value: data.qualityScore,
      });

      await step.score("attach-cost-score", {
        ...(targetRunId ? { runId: targetRunId } : {}),
        name: "support_cost_usd",
        value: data.costUsd,
      });
    } else {
      await step.run("attach-reply-quality-score", async () => ({
        name: "support_reply_quality",
        value: data.qualityScore,
        supportRunId: data.supportRunId,
      }));
    }

    return {
      supportRunId: data.supportRunId,
      model: data.model,
      qualityScore: data.qualityScore,
      tokenCount: data.tokenCount,
      costUsd: data.costUsd,
    };
  },
);

function getScoreTargetRunId(runId: string | undefined): string | undefined {
  if (!runId) return undefined;

  // Demo correlation IDs are UUIDs. Inngest Cloud run IDs are ULIDs, and
  // passing a UUID to step.score() causes the metadata API to reject the run.
  return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(runId) ? runId : undefined;
}
