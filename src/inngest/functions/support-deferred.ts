import { createDefer } from "inngest/experimental";
import { staticSchema } from "inngest";
import { inngest, supportTicketReceived } from "@/inngest/client";
import { attachScore } from "@/inngest/functions/support-score-run";
import { FOLLOW_UP_WINDOW, SCORE, SCORE_STEPS } from "@/lib/score-names";

export type SupportFcrData = {
  supportRunId: string;
  ticketId: string;
  turn: number;
  escalated: boolean;
};

/**
 * First-contact resolution: did this reply settle the ticket? Only known
 * when the customer does or does not come back, so the agent defers this
 * function as its run ends. A deferred run knows its parent
 * (`parents[0].runId`), so the score lands on the run it judges without the
 * run id travelling through the browser and back.
 *
 * The wait is its first step: a wait only sees events that arrive after it
 * starts, and a deferred run starts only once its parent has finished. A
 * customer's follow-up comes long after that; a visitor's vote can come
 * within a second, which is why CSAT is event-triggered instead
 * (support-score-run.ts). In production this window is days; at the booth
 * it is long enough to see a follow-up land.
 */
export const supportFcr = createDefer(
  inngest,
  {
    id: "support-agent-resolution",
    name: "Support agent first-contact resolution",
    retries: 2,
    schema: staticSchema<SupportFcrData>(),
  },
  async ({ event, parents, step }) => {
    const data = event.data;
    const parentRunId = parents[0]?.runId;

    // An escalated ticket was not resolved by the agent: no need to wait.
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
      { supportRunId: data.supportRunId, parentRunId },
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
