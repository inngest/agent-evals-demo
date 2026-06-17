/**
 * Durable code-triage agent: "Gester's small sibling."
 *
 * A bug report arrives via `agent/incident.received`. The agent runs a
 * think/tool loop across mocked repo, Linear, Slack, code-suggestion, and PR
 * tools, then posts a root-cause analysis (RCA). Each think turn and each tool
 * call is its own `step.run`, so the whole loop is memoized and replayable
 * through the real local Inngest dev server.
 *
 * The durability beat (Act 1): on the first attempt, the read_repo_file step
 * that hits the active bug's crashFile throws a simulated 503. Inngest retries
 * the function; every prior step returns memoized; the failed tool step
 * re-executes, the module-scoped crash flag is now set, and it succeeds. This
 * is visible in the real trace.
 *
 * Positioning (Lauren, shared substrate): the run, its repo reads, side
 * effects, retry, and score all exist *because Inngest ran the agent*. A
 * two-system setup can't cheaply capture this.
 */

import { inngest, incidentReceived } from "@/inngest/client";
import { nextTurn } from "@/lib/mock-llm";
import { executeTool, resetCrashState, type ToolName } from "@/lib/mock-tools";
import { normalizeDemoFlags } from "@/lib/demo-flags";
import { localizationScore } from "@/lib/scoring";
import { getIncident } from "@/content/incidents";
import { modelStepName, toolStepName } from "@/lib/agent-step-names";
import { isCloud } from "@/lib/demo-target";

// Safety bound on the loop so a malformed corpus can't spin forever. The
// flagship issue resolves after repo reads plus mocked Linear/Slack/PR actions.
const MAX_ITERATIONS = 14;

export type TriageResult = {
  incidentId: string;
  clientRunId: string;
  rca: string; // the full markdown RCA text (mock-llm output)
  citedFiles: string[]; // parsed from the RCA / returned by mock-llm
  iterations: number; // tool-loop count
  toolCalls: string[]; // tool names in call order, for trace display
  localizationScore: number; // 0..1, same value emitted in rcaScored
  // The Inngest run id (ctx.runId) the dashboard knows. The deferred scorer
  // must attach its score to THIS id, not the client-minted clientRunId
  // (which is only the event idempotency key). Cloud mode only; undefined local.
  runId?: string;
};

export const triageAgent = inngest.createFunction(
  {
    id: "triage-agent",
    retries: 4,
    triggers: [incidentReceived],
  },
  async ({ event, step, attempt, runId }): Promise<TriageResult> => {
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
      const plannedStep = incident?.toolPlan[iteration - 1];

      const turn = await step.run(modelStepName(plannedStep, iteration), () =>
        nextTurn({ incidentId, iteration, attempt, flags })
      );

      if (turn.type === "final") {
        rca = turn.rca;
        citedFiles = turn.citedFiles;
        break;
      }

      // Execute each planned tool call as its own durable step. The crash
      // tool (read_repo_file on the active bug's crashFile) throws here on the
      // first attempt → the step fails → Inngest retries the whole function.
      for (const call of turn.calls) {
        toolCalls.push(call.name);
        await step.run(
          toolStepName(
            { tool: call.name as ToolName, input: call.input },
            iteration
          ),
          () =>
            executeTool(incidentId, call.name as ToolName, call.input, {
              attempt,
            })
        );
      }
    }

    // Deferred-style outcome score. Computed inline here (see scoring.ts TODO
    // for the real createDefer/defer swap). The score-incident fn re-derives
    // and records this on the saved signal; we attach it to the result so the
    // trace/return value carries it immediately.
    const score = localizationScore(citedFiles, groundTruthFixFiles);

    // CLOUD: write the localization score at the RUN level (omit stepId).
    // step.score is durable + memoized — it survives the Act 1 retry and won't
    // double-write on replay. Requires scoreMiddleware() on the client (§3);
    // without it ctx.step.score does not exist. Run-level (no stepId) is the
    // verified-safe shape this week; step-level has a dev-server bug.
    if (isCloud) {
      await step.score("rca-localization-score", {
        name: "rca_localization",
        value: score, // number 0..1 → ScoreValue
      });
    }

    return {
      incidentId,
      clientRunId,
      rca,
      citedFiles,
      iterations,
      toolCalls,
      localizationScore: score,
      // Surface the real Inngest run id so the deferred scorer can attach the
      // outcome score to the run the dashboard knows. Cloud only.
      runId: isCloud ? runId : undefined,
    };
  }
);
