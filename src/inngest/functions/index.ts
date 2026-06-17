import { triageAgent } from "@/inngest/functions/triage-agent";
import { scoreIncident } from "@/inngest/functions/score-incident";
import { experimentBakeoff } from "@/inngest/functions/experiment-bakeoff";
import { localizationScorer } from "@/inngest/scorers/localization-scorer";

// FRONTEND: import this from `@/inngest/functions` in api/inngest/route.ts.
// localizationScorer + experimentBakeoff are served in BOTH modes (they're
// real InngestFunctions); they only ever fire in cloud mode because nothing
// triggers them locally.
export const functions = [
  triageAgent,
  scoreIncident,
  experimentBakeoff,
  localizationScorer,
];

export { triageAgent } from "@/inngest/functions/triage-agent";
export { scoreIncident } from "@/inngest/functions/score-incident";
export { experimentBakeoff } from "@/inngest/functions/experiment-bakeoff";
export { localizationScorer } from "@/inngest/scorers/localization-scorer";
export type { TriageResult } from "@/inngest/functions/triage-agent";
