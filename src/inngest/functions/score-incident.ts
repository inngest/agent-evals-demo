/**
 * Deferred outcome-scoring function.
 *
 * Triggered by `agent/incident.saved` (the operator saved or discarded the
 * RCA). It computes the localization score — Jaccard overlap of the RCA's
 * cited files vs the incident's ground-truth fix files — records it in the
 * score-history store, and emits `agent/rca.scored` so the UI can attach the
 * outcome score to the run/session.
 *
 * This is the "deferred outcome score" half of the scoring story: the fast
 * up/down (rcaFeedback) lands live; this one resolves slightly later as the
 * graded outcome. Both exist because Inngest ran the agent — the shared
 * substrate. A discarded RCA is recorded as score 0 (it was rejected), a saved
 * RCA is graded on its actual localization quality.
 *
 * TODO(launch): the recordOutcomeScore() call wraps the createDefer/defer seam
 * (see scoring.ts). When the real primitive ships, this function becomes the
 * defer().resolve(...) site.
 */

import { inngest, incidentSaved, rcaScored } from "@/inngest/client";
import { recordOutcomeScore } from "@/lib/scoring";
import { getIncident } from "@/content/incidents";

export const scoreIncident = inngest.createFunction(
  {
    id: "score-incident",
    retries: 2,
    triggers: [incidentSaved],
  },
  async ({ event, step }) => {
    const { incidentId, clientRunId, signal, savedAt } = event.data;

    const scored = await step.run("score-incident", async () => {
      const incident = getIncident(incidentId);
      const groundTruthFixFiles = incident?.groundTruthFixFiles ?? [];
      // A discarded RCA scores 0 (rejected); a saved one is graded on its
      // actual cited-file localization quality.
      const citedFiles = signal === "saved" ? incident?.citedFiles ?? [] : [];

      return recordOutcomeScore(
        incidentId,
        clientRunId,
        citedFiles,
        groundTruthFixFiles,
        { scoredAt: savedAt, source: "live" }
      );
    });

    await step.sendEvent(
      "emit-rca-scored",
      rcaScored.create(
        {
          incidentId,
          clientRunId,
          citedFiles: scored.citedFiles,
          groundTruthFixFiles: scored.groundTruthFixFiles,
          score: scored.score,
          scoredAt: scored.scoredAt,
          source: "booth-demo",
        },
        { id: `scored:${clientRunId}:${scored.scoredAt}` }
      )
    );

    return scored;
  }
);
