import { researchAgent } from "@/inngest/functions/research-agent";
import { researchScoreRun } from "@/inngest/functions/research-score-run";
import { researchScoreHeartbeat } from "@/inngest/functions/research-score-heartbeat";
import { researchExperimentBakeoff } from "@/inngest/functions/research-experiment-bakeoff";
import { flowControlDemo } from "@/inngest/functions/flow-control-demo";

export const functions = [
  researchAgent,
  researchScoreRun,
  researchScoreHeartbeat,
  researchExperimentBakeoff,
  flowControlDemo,
];

export { researchAgent } from "@/inngest/functions/research-agent";
export { researchScoreRun } from "@/inngest/functions/research-score-run";
export { researchScoreHeartbeat } from "@/inngest/functions/research-score-heartbeat";
export { researchExperimentBakeoff } from "@/inngest/functions/research-experiment-bakeoff";
export { flowControlDemo } from "@/inngest/functions/flow-control-demo";
export type { ResearchAgentResult } from "@/inngest/functions/research-agent";
