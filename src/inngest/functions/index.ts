import { triageAgent } from "@/inngest/functions/triage-agent";
import { scoreIncident } from "@/inngest/functions/score-incident";

// FRONTEND: import this from `@/inngest/functions` in api/inngest/route.ts.
export const functions = [triageAgent, scoreIncident];

export { triageAgent } from "@/inngest/functions/triage-agent";
export { scoreIncident } from "@/inngest/functions/score-incident";
export type { TriageResult } from "@/inngest/functions/triage-agent";
