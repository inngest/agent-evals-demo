/**
 * Deferred outcome-scoring function.
 *
 * Triggered by `agent/incident.saved` (the operator saved or discarded the
 * RCA). It computes the localization score: Jaccard overlap of the RCA's
 * cited files vs the incident's ground-truth fix files. It records it in the
 * score-history store, and emits `agent/rca.scored` so the UI can attach the
 * outcome score to the run/session.
 *
 * This is the "deferred outcome score" half of the scoring story: the fast
 * up/down (rcaFeedback) lands live; this one resolves slightly later as the
 * graded outcome. Both exist because Inngest ran the agent: the shared
 * substrate. A discarded RCA is recorded as score 0 (it was rejected), a saved
 * RCA is graded on its actual localization quality.
 *
 * CLOUD: the recordOutcomeScore() seam is replaced by deferring the REAL
 * createScorer (localization-scorer.ts) via the `defer` ctx arg. The faked
 * branch below (recordOutcomeScore + rcaScored emit) is unchanged for local.
 */

import { inngest, incidentSaved, rcaScored } from "@/inngest/client";
import { recordOutcomeScore } from "@/lib/scoring";
import { getIncident } from "@/content/incidents";
import { isCloud } from "@/lib/demo-target";
import { localizationScorer } from "@/inngest/scorers/localization-scorer";

export const scoreIncident = inngest.createFunction(
  {
    id: "score-incident",
    retries: 2,
    triggers: [incidentSaved],
  },
  async ({ event, step, defer }) => {
    const { incidentId, clientRunId, signal, savedAt } = event.data;

    if (isCloud) {
      const incident = getIncident(incidentId);
      const groundTruthFixFiles = incident?.groundTruthFixFiles ?? [];
      const citedFiles = signal === "saved" ? incident?.citedFiles ?? [] : [];

      // Deterministic defer id so a score-incident retry doesn't fire the
      // scorer twice. defer() returns void (fire-and-forget) per the verified
      // DeferFn signature — not a Promise.
      //
      // OPEN INTEGRATION QUESTION (flagged in INTEGRATION-PLAN §2b): the
      // scorer attaches its score to `parentRunId`, which must be the Inngest
      // run id the dashboard knows. The saved event only carries `clientRunId`
      // (the event idempotency key, `incident:${clientRunId}`), and the app
      // treats clientRunId as the run identity end-to-end (see
      // api/run-status/route.ts mapping runId = clientRunId). The real triage
      // run id (ctx.runId, now surfaced on TriageResult.runId) is NOT available
      // at this saved-event site without a lookup. Passing clientRunId here
      // matches the app's run-identity convention; if the Cloud dashboard
      // requires Inngest's internal run id, FRONTEND must thread
      // TriageResult.runId into the saved event payload and feed THAT here.
      defer(`localization:${clientRunId}`, {
        function: localizationScorer,
        data: { parentRunId: clientRunId, citedFiles, groundTruthFixFiles },
      });

      // Keep emitting rcaScored for UI parity (the panel still listens).
      await step.sendEvent(
        "emit-rca-scored",
        rcaScored.create(
          {
            incidentId,
            clientRunId,
            citedFiles,
            groundTruthFixFiles,
            score: 0, // resolved by the deferred scorer; UI re-fetches trend
            scoredAt: savedAt,
            source: "booth-demo",
          },
          { id: `scored:${clientRunId}:${savedAt}` }
        )
      );

      return { incidentId, clientRunId, deferred: true };
    }

    // ── LOCAL (faked) path — unchanged from today ────────────────────────────
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
