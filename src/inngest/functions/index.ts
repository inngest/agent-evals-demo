import { researchAgent } from "@/inngest/functions/research-agent";
import { researchScoreRun } from "@/inngest/functions/research-score-run";
import { researchScoreHeartbeat } from "@/inngest/functions/research-score-heartbeat";
import { researchExperimentBakeoff } from "@/inngest/functions/research-experiment-bakeoff";

export const functions = [
  researchAgent,
  researchScoreRun,
  researchScoreHeartbeat,
  researchExperimentBakeoff,
];

export { researchAgent } from "@/inngest/functions/research-agent";
export { researchScoreRun } from "@/inngest/functions/research-score-run";
export { researchScoreHeartbeat } from "@/inngest/functions/research-score-heartbeat";
export { researchExperimentBakeoff } from "@/inngest/functions/research-experiment-bakeoff";
export type { ResearchAgentResult } from "@/inngest/functions/research-agent";
