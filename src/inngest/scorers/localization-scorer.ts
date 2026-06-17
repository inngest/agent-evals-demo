/**
 * Deferred outcome scorer (Act 2 hero) — the REAL createScorer primitive.
 *
 * This is the cloud-mode replacement for the recordOutcomeScore() seam (the
 * TODO(launch) in scoring.ts + score-incident.ts). createScorer wraps
 * createDefer: the ScorerResult this handler returns is forwarded to
 * client.score(...) inside a durable step.run("score", ...). It is a real
 * InngestFunction at runtime, so it is SERVED alongside the other functions
 * (see functions/index.ts) and TRIGGERED from a parent via the defer ctx arg:
 *
 *   await defer("localization:<id>", { function: localizationScorer, data });
 *
 * runId attachment: createScorer defaults runId to the parent run's id
 * (event.data.parent.runId via the defer chain). But here the defer is fired
 * from score-incident, whose run is NOT the triage run the dashboard score
 * should land on. So we pass runId explicitly = the triage-agent run id,
 * threaded through the event payload (TriageResult.runId → score-incident →
 * here). See score-incident.ts for the thread.
 */

import { createScorer } from "inngest/experimental";
import { staticSchema } from "inngest";
import { inngest } from "@/inngest/client";
import { localizationScore } from "@/lib/scoring";

export type LocalizationScorerData = {
  // The Inngest run id of the triage-agent run to attach the score to.
  // This is ctx.runId from the triage run, NOT the client-minted clientRunId.
  parentRunId: string;
  citedFiles: string[];
  groundTruthFixFiles: string[];
};

export const localizationScorer = createScorer(
  inngest,
  {
    id: "localization-scorer",
    schema: staticSchema<LocalizationScorerData>(),
  },
  async ({ event }) => {
    const { parentRunId, citedFiles, groundTruthFixFiles } = event.data;
    return {
      name: "rca_localization_outcome",
      value: localizationScore(citedFiles, groundTruthFixFiles), // number 0..1
      runId: parentRunId,
    }; // ScorerResult → client.score(...) under the hood
  }
);
