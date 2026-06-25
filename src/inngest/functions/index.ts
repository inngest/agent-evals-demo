import { researchAgent } from "@/inngest/functions/research-agent";
import { researchScoreRun } from "@/inngest/functions/research-score-run";
import { researchExperimentBakeoff } from "@/inngest/functions/research-experiment-bakeoff";

export const functions = [
  researchAgent,
  researchScoreRun,
  researchExperimentBakeoff,
];

export { researchAgent } from "@/inngest/functions/research-agent";
export { researchScoreRun } from "@/inngest/functions/research-score-run";
export { researchExperimentBakeoff } from "@/inngest/functions/research-experiment-bakeoff";
export type { ResearchAgentResult } from "@/inngest/functions/research-agent";
