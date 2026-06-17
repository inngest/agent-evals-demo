/**
 * Durable incident-triage agent — "Gester's small sibling."
 *
 * An Inngest-flavored incident arrives via `agent/incident.received`. The agent
 * runs a think/tool loop against five mock tools (get_run, get_run_steps,
 * search_code, read_repo_file, get_recent_commits), then posts a root-cause
 * analysis (RCA). Each think turn and each tool call is its own `step.run`, so
 * the whole loop is memoized and replayable through the real local Inngest dev
 * server.
 *
 * The durability beat (Act 1): on the first attempt, the read_repo_file step
 * that hits the incident's crashFile throws a simulated 503. Inngest retries
 * the function; every prior step returns memoized; the failed tool step
 * re-executes, the module-scoped crash flag is now set, and it succeeds. This
 * is visible in the real trace.
 *
 * Positioning (Lauren — shared substrate): the run, its steps, the retry, and
 * the score that follows all exist *because Inngest ran the agent*. A
 * two-system setup can't cheaply capture this.
 */

import { inngest, incidentReceived } from "@/inngest/client";
import { nextTurn } from "@/lib/mock-llm";
import { executeTool, resetCrashState, type ToolName } from "@/lib/mock-tools";
import { normalizeDemoFlags } from "@/lib/demo-flags";
import { localizationScore } from "@/lib/scoring";
import { getIncident } from "@/content/incidents";

// Safety bound on the loop so a malformed corpus can't spin forever. Real
// incidents resolve in ~5–7 tool calls (≈12 trace steps including think turns).
const MAX_ITERATIONS = 10;

export type TriageResult = {
  incidentId: string;
  clientRunId: string;
  rca: string; // the full markdown RCA text (mock-llm output)
  citedFiles: string[]; // parsed from the RCA / returned by mock-llm
  iterations: number; // tool-loop count
  toolCalls: string[]; // tool names in call order, for trace display
  localizationScore: number; // 0..1 — same value emitted in rcaScored
};

export const triageAgent = inngest.createFunction(
  {
    id: "triage-agent",
    retries: 4,
    triggers: [incidentReceived],
  },
  async ({ event, step, attempt }): Promise<TriageResult> => {
    const flags = normalizeDemoFlags(event.data.flags);
    const { incidentId, clientRunId } = event.data;

    // On the first attempt, arm the crash beat. The module-scoped flag in
    // mock-tools survives the function retry within the worker process, so on
    // the retry the failed read_repo_file step recovers instead of re-throwing.
    if (attempt === 0) {
      resetCrashState();
    }

    const incident = getIncident(incidentId);
    const groundTruthFixFiles = incident?.groundTruthFixFiles ?? [];

    const toolCalls: string[] = [];
    let iterations = 0;
    let rca = "";
    let citedFiles: string[] = [];

    // think / tool loop
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      iterations = iteration;

      const turn = await step.run(`think-${iteration}`, () =>
        nextTurn({ incidentId, iteration, attempt, flags })
      );

      if (turn.type === "final") {
        rca = turn.rca;
        citedFiles = turn.citedFiles;
        break;
      }

      // Execute each planned tool call as its own durable step. The crash
      // tool (read_repo_file on the incident's crashFile) throws here on the
      // first attempt → the step fails → Inngest retries the whole function.
      for (const call of turn.calls) {
        toolCalls.push(call.name);
        await step.run(`tool-${iteration}-${call.name}`, () =>
          executeTool(incidentId, call.name as ToolName, call.input, { attempt })
        );
      }
    }

    // Deferred-style outcome score. Computed inline here (see scoring.ts TODO
    // for the real createDefer/defer swap). The score-incident fn re-derives
    // and records this on the saved signal; we attach it to the result so the
    // trace/return value carries it immediately.
    const score = localizationScore(citedFiles, groundTruthFixFiles);

    return {
      incidentId,
      clientRunId,
      rca,
      citedFiles,
      iterations,
      toolCalls,
      localizationScore: score,
    };
  }
);
