import {
  challengerSupportModel,
  currentSupportModel,
  getSupportTicket,
  supportSessionId,
  supportTickets,
} from "@/content/support-demo";
import {
  inngest,
  supportExperimentRequested,
  supportFeedbackRecorded,
  supportRunCompleted,
  supportTicketReceived,
} from "@/inngest/client";
import { ticketForExperimentRun } from "@/lib/experiment-results";
import { isOpenRouterConfigured } from "@/lib/openrouter";
import { supportSessionMeta } from "@/lib/support-session-meta";

/**
 * Keeps the scores page full without anyone at the booth: on a schedule,
 * send a batch of support tickets, then vote on each reply the way a
 * visitor would. The in-app twin of scripts/populate-scores.mjs.
 *
 * Opt-in: nothing is registered unless POPULATE_SCORES_CRON is set, e.g.
 * "0 * * * *" for hourly. POPULATE_SCORES_RUNS (default 12) sets the batch size and
 * POPULATE_SCORES_EXPERIMENT_RUNS (default 0) adds split-test runs.
 */
const schedule = process.env.POPULATE_SCORES_CRON?.trim();
const RUNS = envCount("POPULATE_SCORES_RUNS", 12, 100);
const EXPERIMENT_RUNS = envCount("POPULATE_SCORES_EXPERIMENT_RUNS", 0, 24);

// Votes lean the way the ticket goes, with noise so CSAT is not a flat
// line, and some replies get no vote: real visitors don't all click.
const VOTE_RATE = 0.8;
const GOOD_VOTE_RATE = { good: 0.9, bad: 0.2 };

const populateScoresCron = schedule
  ? inngest.createFunction(
      {
        id: "populate-scores",
        name: "Populate scores",
        triggers: [{ cron: schedule }],
      },
      async ({ step }) => {
        // A real model key means every run is a paid completion: a schedule
        // must never spend tokens unattended.
        if (isOpenRouterConfigured()) {
          return { skipped: "OPENROUTER_API_KEY is set; runs would call a real model" };
        }

        const batch = await step.run("plan-batch", () => {
          const batchId = crypto.randomUUID();
          const requestedAt = new Date().toISOString();

          return {
            batchId,
            requestedAt,
            tickets: Array.from({ length: RUNS }, (_, index) => ({
              supportRunId: `populate-${batchId}-${index}`,
              ticketId: supportTickets[index % supportTickets.length]!.id,
              model: Math.random() < 0.5 ? currentSupportModel : challengerSupportModel,
            })),
          };
        });

        await step.sendEvent(
          "send-tickets",
          batch.tickets.map((ticket) =>
            supportTicketReceived.create(
              {
                ...ticket,
                turn: 1,
                failureStep: "none",
                synthetic: true,
                requestedAt: batch.requestedAt,
                source: "booth-demo",
              },
              {
                id: `support:${ticket.supportRunId}`,
                meta: supportSessionMeta(),
              },
            ),
          ),
        );

        if (EXPERIMENT_RUNS > 0) {
          await step.sendEvent(
            "send-split-test",
            Array.from({ length: EXPERIMENT_RUNS }, (_, index) =>
              supportExperimentRequested.create(
                {
                  experimentRunId: `populate-${batch.batchId}-${index}`,
                  ticketId: ticketForExperimentRun(index),
                  batchId: `populate-${batch.batchId}`,
                  requestedAt: batch.requestedAt,
                  source: "booth-demo",
                },
                {
                  id: `support-experiment:populate-${batch.batchId}:${index}`,
                  meta: supportSessionMeta(),
                },
              ),
            ),
          );
        }

        return {
          batchId: batch.batchId,
          tickets: batch.tickets.length,
          experimentRuns: EXPERIMENT_RUNS,
        };
      },
    )
  : null;

/**
 * The visitor half: votes on each reply the cron's tickets produced, once
 * the run has finished. Booth runs aren't synthetic, so they never match.
 */
const populateScoresVote = schedule
  ? inngest.createFunction(
      {
        id: "populate-scores-vote",
        name: "Populate scores: vote",
        idempotency: "event.data.supportRunId",
        triggers: [{ event: supportRunCompleted, if: "event.data.synthetic == true" }],
      },
      async ({ event, step }) => {
        const data = event.data;
        const signal = await step.run("decide-vote", () => {
          if (Math.random() >= VOTE_RATE) return null;
          const group = getSupportTicket(data.ticketId).group;
          return Math.random() < GOOD_VOTE_RATE[group] ? "good" : "bad";
        });

        if (!signal) return { supportRunId: data.supportRunId, voted: false };

        const feedbackAt = new Date(event.ts).toISOString();
        await step.sendEvent(
          "send-vote",
          supportFeedbackRecorded.create(
            {
              supportRunId: data.supportRunId,
              parentRunId: data.parentRunId,
              sessionId: supportSessionId,
              signal,
              feedbackAt,
              source: "booth-demo",
            },
            {
              id: `support-feedback:${data.supportRunId}:${feedbackAt}`,
              meta: supportSessionMeta(),
            },
          ),
        );

        return { supportRunId: data.supportRunId, voted: true, signal };
      },
    )
  : null;

export const populateScoresFunctions = [populateScoresCron, populateScoresVote].filter(
  (fn) => fn !== null,
);

function envCount(name: string, fallback: number, max: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(max, Math.round(parsed))
    : fallback;
}
