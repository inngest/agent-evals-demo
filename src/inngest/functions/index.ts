import { triageAgent } from "@/inngest/functions/triage-agent";
import { scoreIncident } from "@/inngest/functions/score-incident";
import { experimentBakeoff } from "@/inngest/functions/experiment-bakeoff";
import { localizationScorer } from "@/inngest/scorers/localization-scorer";
import { researchAgent } from "@/inngest/functions/research-agent";
import { researchScoreRun } from "@/inngest/functions/research-score-run";
import { researchExperimentBakeoff } from "@/inngest/functions/research-experiment-bakeoff";

// FRONTEND: import this from `@/inngest/functions` in api/inngest/route.ts.
// localizationScorer + experimentBakeoff are served in BOTH modes (they're
// real InngestFunctions); they only ever fire in cloud mode because nothing
// triggers them locally.
export const functions = [
  triageAgent,
  scoreIncident,
  experimentBakeoff,
  localizationScorer,
  researchAgent,
  researchScoreRun,
  researchExperimentBakeoff,
];

export { triageAgent } from "@/inngest/functions/triage-agent";
export { scoreIncident } from "@/inngest/functions/score-incident";
export { experimentBakeoff } from "@/inngest/functions/experiment-bakeoff";
export { localizationScorer } from "@/inngest/scorers/localization-scorer";
export { researchAgent } from "@/inngest/functions/research-agent";
export { researchScoreRun } from "@/inngest/functions/research-score-run";
export { researchExperimentBakeoff } from "@/inngest/functions/research-experiment-bakeoff";
export type { TriageResult } from "@/inngest/functions/triage-agent";
export type { ResearchAgentResult } from "@/inngest/functions/research-agent";
