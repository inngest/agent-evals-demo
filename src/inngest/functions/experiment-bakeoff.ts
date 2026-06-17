/**
 * Act 3 — the REAL group.experiment primitive.
 *
 * Triggered by `agent/experiment.requested` (one per corpus incident; SEED's
 * cloud seeder emits these). Runs a real A/B bake-off between two models over
 * the same incident, scoring INSIDE each variant so the live inngest.score()
 * auto-associates with the experiment + selected variant in the dashboard.
 *
 * Local mode never fires this — Act 3 reads `seededExperiment` from
 * seed-data.ts there. This function only runs in cloud (it's served in both
 * modes but only triggered by the cloud seeder).
 */

import { experiment } from "inngest";
import { inngest, experimentRequested } from "@/inngest/client";
import { localizationScore } from "@/lib/scoring";
import { getIncident } from "@/content/incidents";

export const experimentBakeoff = inngest.createFunction(
  {
    id: "experiment-bakeoff",
    retries: 2,
    triggers: [experimentRequested],
  },
  async ({ event, step, group }) => {
    const { incidentId } = event.data;
    const incident = getIncident(incidentId);
    const truth = incident?.groundTruthFixFiles ?? [];
    const cited = incident?.citedFiles ?? [];

    const { result, variant } = await group.experiment(
      "localization-bakeoff",
      {
        variants: {
          "gpt-5.5": () =>
            step.run("gpt-5.5", async () => {
              const value = localizationScore(cited, truth);
              // Live score, no ids → targets the current step, so it
              // auto-associates with this experiment + variant.
              await inngest.score({ name: "rca_localization", value });
              return value;
            }),
          "claude-opus-4.8": () =>
            step.run("claude-opus-4.8", async () => {
              const value = localizationScore(cited, truth);
              await inngest.score({ name: "rca_localization", value });
              return value;
            }),
        },
        // weighted: run-id seeded + deterministic. Swap to
        // experiment.bucket(incidentId) if the SAME incident should always hit
        // the same model across the corpus — one-liner change on `select`.
        select: experiment.weighted({ "gpt-5.5": 50, "claude-opus-4.8": 50 }),
        withVariant: true,
      }
    );

    return { incidentId, variant, score: result };
  }
);
