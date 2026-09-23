import { supportAgent } from "@/inngest/functions/support-agent";
import { supportScoreRun } from "@/inngest/functions/support-score-run";
import { supportExperiment } from "@/inngest/functions/support-experiment";

export const functions = [supportAgent, supportScoreRun, supportExperiment];

export { supportAgent } from "@/inngest/functions/support-agent";
export { supportScoreRun } from "@/inngest/functions/support-score-run";
export { supportExperiment } from "@/inngest/functions/support-experiment";
export type { SupportAgentResult } from "@/inngest/functions/support-agent";
