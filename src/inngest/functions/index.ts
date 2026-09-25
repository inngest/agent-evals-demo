import { supportAgent } from "@/inngest/functions/support-agent";
import {
  supportCsat,
  supportScoreRun,
} from "@/inngest/functions/support-score-run";
import { supportFcr } from "@/inngest/functions/support-deferred";
import { supportExperiment } from "@/inngest/functions/support-experiment";

export const functions = [
  supportAgent,
  supportScoreRun,
  supportCsat,
  supportFcr,
  supportExperiment,
];

export { supportAgent } from "@/inngest/functions/support-agent";
export {
  supportCsat,
  supportScoreRun,
} from "@/inngest/functions/support-score-run";
export { supportFcr } from "@/inngest/functions/support-deferred";
export { supportExperiment } from "@/inngest/functions/support-experiment";
export type { SupportAgentResult } from "@/inngest/functions/support-agent";
