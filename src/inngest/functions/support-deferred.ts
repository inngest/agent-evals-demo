import { createDefer } from "inngest/experimental";
import { staticSchema } from "inngest";
import {
  inngest,
  supportFeedbackRecorded,
  supportTicketReceived,
} from "@/inngest/client";
import { attachScore } from "@/inngest/functions/support-score-run";
import {
  FOLLOW_UP_WINDOW,
  SCORE,
  SCORE_STEPS,
  VOTE_WINDOW,
} from "@/lib/score-names";

/**
 * The two scores that are only known after the agent has finished: did the
 * customer like the reply, and did it settle the ticket? The agent defers one
 * function for each at the end of its run. A deferred run knows its parent
 * (`parents[0].runId`), so the score lands on the run it judges without the
 * run id travelling through the browser and back.
 *
 * Each waits durably as its first step: a wait only sees events that arrive
 * after it starts.
 */
export type SupportDeferredData = {
  supportRunId: string;
  ticketId: string;
  turn: number;
  escalated: boolean;
};

const schema = staticSchema<SupportDeferredData>();

/** CSAT: the visitor's 👍/👎 on the reply. The first vote counts. */
export const supportCsat = createDefer(
  inngest,
  { id: "support-agent-csat", name: "Support agent CSAT", retries: 2, schema },
  async ({ event, parents, step }) => {
    const data = event.data;
    const parentRunId = parents[0]?.runId;
    const vote = await step.waitForEvent(SCORE_STEPS.waitForVote, {
      event: supportFeedbackRecorded,
      if: `async.data.supportRunId == '${data.supportRunId}'`,
      timeout: VOTE_WINDOW,
    });

    if (!vote) {
      return { supportRunId: data.supportRunId, voted: false };
    }

    const value = await attachScore(
      step,
      SCORE_STEPS.csat,
      SCORE.csat,
      vote.data.signal === "good" ? 1 : 0,
      { supportRunId: data.supportRunId, parentRunId },
    );

    return {
      supportRunId: data.supportRunId,
      voted: true,
      signal: vote.data.signal,
      score: value,
    };
  },
);

/**
 * First-contact resolution: did this reply settle the ticket? Only known
 * when the customer does or does not come back. In production this window
 * is days; at the booth it is long enough to see a follow-up land.
 */
export const supportFcr = createDefer(
  inngest,
  {
    id: "support-agent-resolution",
    name: "Support agent first-contact resolution",
    retries: 2,
    schema,
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
