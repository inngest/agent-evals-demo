import {
  inngest,
  supportRunCompleted,
  type SupportRunCompletedData,
} from "@/inngest/client";
import { isCloud } from "@/lib/demo-target";
import { SCORE, SCORE_STEPS } from "@/lib/score-names";

/**
 * Business metrics for every support run, attached to the run they judge.
 *
 * These are known the moment the agent finishes: policy, cost, escalation.
 * The customer's vote and first-contact resolution are not; the agent defers
 * a function for each (support-deferred.ts) that waits for the answer.
 */
export const supportScoreRun = inngest.createFunction(
  {
    id: "support-agent-score-run",
    name: "Support agent metrics",
    retries: 2,
    triggers: [supportRunCompleted],
  },
  async ({ event, step }) => {
    const attach = (
      stepId: string,
      name: string,
      value: number,
      data: { supportRunId: string; parentRunId?: string },
    ) => attachScore(step, stepId, name, value, data);

    const data = event.data as SupportRunCompletedData;

    await attach(
      SCORE_STEPS.policyCompliance,
      SCORE.policyCompliance,
      data.policyPassed ? 1 : 0,
      data,
    );
    await attach(SCORE_STEPS.costPerTicket, SCORE.costPerTicket, data.costUsd, data);
    await attach(
      SCORE_STEPS.replyQuality,
      SCORE.replyQuality,
      data.qualityScore,
      data,
    );
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
      replyQuality: data.qualityScore,
    };
  },
);

export type ScoreStep = Parameters<Parameters<typeof inngest.createFunction>[1]>[0]["step"];

/**
 * Attaches one score to the run it judges. step.score is cloud-only, which
 * would leave local mode with no steps at all and so no receipt for the UI:
 * locally a same-named step.run records it, so the visual is identical.
 */
export async function attachScore(
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
