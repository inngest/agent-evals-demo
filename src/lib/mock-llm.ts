/**
 * Mock LLM — deterministic agent driver for the incident-triage demo.
 *
 * There is no Anthropic key at the booth. Given the active incident and the
 * current 1-based loop iteration, this returns the next assistant turn:
 *   - while the incident's `toolPlan` has remaining steps → a `tool_use` turn
 *     emitting the next planned tool call;
 *   - once the plan is exhausted → a `final` turn carrying the canned RCA and
 *     its cited files.
 *
 * The default durability beat is the tool 503 (see mock-tools.ts). An optional
 * LLM-failure variant is gated behind `flags.llmOffline`: on early attempts it
 * throws a RetryAfterError so the function retries through the real dev server.
 */

import { RetryAfterError } from "inngest";
import { getIncident } from "@/content/incidents";
import type { ToolName } from "@/lib/mock-tools";
import { normalizeDemoFlags, wait, type DemoFlags } from "@/lib/demo-flags";

export type LlmTurn =
  | {
      type: "tool_use";
      calls: Array<{ id: string; name: ToolName; input: Record<string, unknown> }>;
    }
  | { type: "final"; rca: string; citedFiles: string[] };

export async function nextTurn(args: {
  incidentId: string;
  iteration: number; // 1-based loop index
  attempt: number;
  flags: DemoFlags;
}): Promise<LlmTurn> {
  const flags = normalizeDemoFlags(args.flags);
  const attempt = Math.max(0, args.attempt);
  const iteration = Math.max(1, args.iteration);

  // Simulate the model's "thinking" latency; tunable from DemoControls.
  await wait(450 + flags.latencyMs);

  // Optional LLM-failure variant (not the default beat). When the operator
  // flips llmOffline, the first `failureCount` attempts throw so the function
  // retries through the real local dev server before recovering.
  if (flags.llmOffline && attempt < flags.failureCount) {
    throw new RetryAfterError("Model provider unavailable: 503", "750ms");
  }

  const incident = getIncident(args.incidentId);

  if (!incident) {
    return {
      type: "final",
      rca: `**Summary** — Unknown incident \`${args.incidentId}\`; cannot investigate.`,
      citedFiles: [],
    };
  }

  const plan = incident.toolPlan;

  // toolPlan is 0-indexed; iteration is 1-based. Step N of the plan is emitted
  // on iteration N. Once the plan is exhausted, emit the final RCA.
  if (iteration <= plan.length) {
    const step = plan[iteration - 1];
    return {
      type: "tool_use",
      calls: [
        {
          id: `toolu_${incident.id}_${iteration}`,
          name: step.tool,
          input: step.input,
        },
      ],
    };
  }

  return {
    type: "final",
    rca: incident.rca,
    citedFiles: incident.citedFiles,
  };
}
