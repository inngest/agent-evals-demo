import { supportAgent } from "@/inngest/functions/support-agent";
import { supportScoreRun } from "@/inngest/functions/support-score-run";
import { supportCsat, supportFcr } from "@/inngest/functions/support-deferred";
import { supportExperiment } from "@/inngest/functions/support-experiment";

export const functions = [
  supportAgent,
  supportScoreRun,
  supportCsat,
  supportFcr,
  supportExperiment,
];

export { supportAgent } from "@/inngest/functions/support-agent";
export { supportScoreRun } from "@/inngest/functions/support-score-run";
export { supportCsat, supportFcr } from "@/inngest/functions/support-deferred";
export { supportExperiment } from "@/inngest/functions/support-experiment";
export type { SupportAgentResult } from "@/inngest/functions/support-agent";
