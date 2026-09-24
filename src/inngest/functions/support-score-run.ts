import {
  inngest,
  supportFeedbackRecorded,
  supportRunCompleted,
  supportTicketReceived,
  type SupportFeedbackRecordedData,
  type SupportRunCompletedData,
} from "@/inngest/client";
import { isCloud } from "@/lib/demo-target";
import { FOLLOW_UP_WINDOW, SCORE, SCORE_STEPS } from "@/lib/score-names";

export const SUPPORT_FEEDBACK_SCORE_NAME = SCORE.csat;
/** The step the booth waits on as the receipt for the visitor's vote. */
export const SUPPORT_FEEDBACK_STEP = SCORE_STEPS.csat;

/**
 * Business metrics for every support run, attached to the run they judge.
 *
 * These are known the moment the agent finishes: policy, cost, escalation,
 * and the customer's vote. First-contact resolution is not; see
 * supportResolution below.
 */
export const supportScoreRun = inngest.createFunction(
  {
    id: "support-agent-score-run",
    name: "Support agent metrics",
    retries: 2,
    triggers: [supportRunCompleted, supportFeedbackRecorded],
  },
  async ({ event, step }) => {
    const attach = (
      stepId: string,
      name: string,
      value: number,
      data: { supportRunId: string; parentRunId?: string },
    ) => attachScore(step, stepId, name, value, data);

    if (event.name === "support/feedback.recorded") {
      const data = event.data as SupportFeedbackRecordedData;
      const value = await attach(
        SCORE_STEPS.csat,
        SCORE.csat,
        data.signal === "good" ? 1 : 0,
        data,
      );

      return {
        supportRunId: data.supportRunId,
        signal: data.signal,
        score: value,
        scoreName: SCORE.csat,
      };
    }

    // support/run.completed
    const data = event.data as SupportRunCompletedData;

    await attach(
      SCORE_STEPS.policyCompliance,
      SCORE.policyCompliance,
      data.policyPassed ? 1 : 0,
      data,
    );
    await attach(SCORE_STEPS.costPerTicket, SCORE.costPerTicket, data.costUsd, data);
    await attach(
      SCORE_STEPS.escalatedToHuman,
      SCORE.escalatedToHuman,
      data.escalated ? 1 : 0,
      data,
    );

    return {
      supportRunId: data.supportRunId,
      ticketId: data.ticketId,
      turn: data.turn,
      model: data.model,
      policyCompliance: data.policyPassed ? 1 : 0,
      escalated: data.escalated,
      costUsd: data.costUsd,
    };
  },
);

/**
 * First-contact resolution: did this reply settle the ticket? That is only
 * known later, when the customer does or does not come back, so this
 * function waits for it, durably. The wait is its first step because a wait
 * only sees events that arrive after it starts.
 */
export const supportResolution = inngest.createFunction(
  {
    id: "support-agent-resolution",
    name: "Support agent first-contact resolution",
    retries: 2,
    triggers: [supportRunCompleted],
  },
  async ({ event, step }) => {
    const data = event.data as SupportRunCompletedData;

    // An escalated ticket was not resolved by the agent: no need to wait.
    // Otherwise wait for the customer. In production this window is days;
    // at the booth it is long enough to see a follow-up land.
    const followUp = data.escalated
      ? null
      : await step.waitForEvent(SCORE_STEPS.waitForFollowUp, {
          event: supportTicketReceived,
          if: `async.data.followUpOf == '${data.supportRunId}'`,
          timeout: FOLLOW_UP_WINDOW,
        });

    const resolved = !data.escalated && !followUp;
    await attachScore(
      step,
      SCORE_STEPS.firstContactResolution,
      SCORE.firstContactResolution,
      resolved ? 1 : 0,
      data,
    );

    return {
      supportRunId: data.supportRunId,
      ticketId: data.ticketId,
      turn: data.turn,
      firstContactResolution: resolved ? 1 : 0,
      followedUp: Boolean(followUp),
    };
  },
);

type ScoreStep = Parameters<Parameters<typeof inngest.createFunction>[1]>[0]["step"];

/**
 * Attaches one score to the run it judges. step.score is cloud-only, which
 * would leave local mode with no steps at all and so no receipt for the UI:
 * locally a same-named step.run records it, so the visual is identical.
 */
async function attachScore(
  step: ScoreStep,
  stepId: string,
  name: string,
  value: number,
  data: { supportRunId: string; parentRunId?: string },
): Promise<number> {
  const targetRunId = getScoreTargetRunId(data.parentRunId);

  if (isCloud) {
    await step.score(stepId, {
      ...(targetRunId ? { runId: targetRunId } : {}),
      name,
      value,
    });
  } else {
    await step.run(stepId, async () => ({
      name,
      value,
      supportRunId: data.supportRunId,
    }));
  }

  return value;
}

function getScoreTargetRunId(runId: string | undefined): string | undefined {
  if (!runId) return undefined;

  // Demo correlation IDs are UUIDs. Inngest Cloud run IDs are ULIDs, and
  // passing a UUID to step.score() causes the metadata API to reject the run.
  return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(runId) ? runId : undefined;
}
