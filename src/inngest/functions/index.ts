import { researchAgent } from "@/inngest/functions/research-agent";
import { researchScoreRun } from "@/inngest/functions/research-score-run";
import { researchScoreHeartbeat } from "@/inngest/functions/research-score-heartbeat";
import { researchExperimentBakeoff } from "@/inngest/functions/research-experiment-bakeoff";
import { flowControlDemo } from "@/inngest/functions/flow-control-demo";
// createScorer returns a real InngestFunction. A deferred scorer that is not
// served cannot be invoked, which is why the demo's defer() beat previously
// described code that never ran.
import { researchOutcomeScorer } from "@/inngest/scorers/research-outcome-scorer";

export const functions = [
  researchAgent,
  researchScoreRun,
  researchScoreHeartbeat,
  researchExperimentBakeoff,
  researchOutcomeScorer,
  flowControlDemo,
];

export { researchAgent } from "@/inngest/functions/research-agent";
export { researchScoreRun } from "@/inngest/functions/research-score-run";
export { researchScoreHeartbeat } from "@/inngest/functions/research-score-heartbeat";
export { researchExperimentBakeoff } from "@/inngest/functions/research-experiment-bakeoff";
export { flowControlDemo } from "@/inngest/functions/flow-control-demo";
export { researchOutcomeScorer } from "@/inngest/scorers/research-outcome-scorer";
export type { ResearchAgentResult } from "@/inngest/functions/research-agent";
