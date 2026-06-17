// src/content/code-snippets.ts (CODEVIEW owns)
//
// Cumulative booth code. Each act keeps the same durable-agent body on screen
// and adds only the new layer needed for that act:
//   Act 1: full Gester-style code-triage agent
//   Act 2: the same agent plus scoring/session events
//   Act 3: Acts 1 and 2 plus the experiment wrapper
//   Act 4: the tiny scorer + Insights query that explains the bigger vision

export type CodeSnippetId = "act1" | "act2" | "act3" | "act4";

export type CodeSnippet = {
  id: CodeSnippetId;
  act: 1 | 2 | 3 | 4;
  label: string;
  eyebrow: string;
  description: string;
  code: string;
};

function boothImports({
  clientExtras = [],
  scoringExtras = [],
  extra = "",
}: {
  clientExtras?: string[];
  scoringExtras?: string[];
  extra?: string;
} = {}) {
  const clientNames = ["inngest", "incidentReceived", ...clientExtras].join(", ");
  const scoringNames = ["localizationScore", ...scoringExtras].join(", ");

  return `import { ${clientNames} } from "@/inngest/client";
import { getIncident } from "@/content/incidents";
import { normalizeDemoFlags } from "@/lib/demo-flags";
import { nextTurn } from "@/lib/mock-llm";
import { executeTool, resetCrashState, type ToolName } from "@/lib/mock-tools";
import { modelStepName, toolStepName } from "@/lib/agent-step-names";
import { ${scoringNames} } from "@/lib/scoring";${extra}`;
}

const durableAgentCode = `const MAX_ITERATIONS = 14;

export type TriageResult = {
  incidentId: string;
  clientRunId: string;
  rca: string;
  citedFiles: string[];
  iterations: number;
  toolCalls: string[];
  localizationScore: number;
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

    // First attempt arms the demo failure. On retry the failed repo-read step
    // runs again, while all earlier step.run values replay from memory.
    if (attempt === 0) {
      resetCrashState();
    }

    const incident = getIncident(incidentId);
    const groundTruthFixFiles = incident?.groundTruthFixFiles ?? [];

    const toolCalls: string[] = [];
    let iterations = 0;
    let rca = "";
    let citedFiles: string[] = [];

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
);`;

const scoringAndSessionCode = `// ACT 2 ADDITION: saving the RCA starts a second durable function.
// The same clientRunId ties the trace, feedback, score, and session thread.
export const scoreIncident = inngest.createFunction(
  {
    id: "score-incident",
    retries: 2,
    triggers: [incidentSaved],
  },
  async ({ event, step }) => {
    const { incidentId, clientRunId, signal, savedAt } = event.data;

    const scored = await step.run("score-localization", () => {
      const incident = getIncident(incidentId);
      const truth = incident?.groundTruthFixFiles ?? [];
      const cited = signal === "saved" ? incident?.citedFiles ?? [] : [];

      return recordOutcomeScore(incidentId, clientRunId, cited, truth, {
        scoredAt: savedAt,
        source: "live",
      });
    });

    await step.sendEvent(
      "emit-rca-scored",
      rcaScored.create(
        {
          incidentId,
          clientRunId,
          citedFiles: scored.citedFiles,
          groundTruthFixFiles: scored.groundTruthFixFiles,
          score: scored.score,
          scoredAt: scored.scoredAt,
          source: "booth-demo",
        },
        { id: "scored:" + clientRunId + ":" + scored.scoredAt }
      )
    );

    return {
      sessionId: "sess-" + incidentId,
      clientRunId,
      score: scored.score,
    };
  }
);`;

const experimentCode = `// ACT 3 ADDITION: the experiment is the same run and same scorer,
// repeated across a resolved bug corpus and tagged as one group.
const experimentRequested = eventType("agent/experiment.requested", {
  schema: staticSchema<{ corpusIncidentIds: string[] }>(),
});

const MODELS = ["gpt-5.5", "claude-opus-4.8"] as const;

export const localizationBakeoff = inngest.createFunction(
  {
    id: "localization-bakeoff",
    triggers: [experimentRequested],
  },
  async ({ event, step }) => {
    for (const incidentId of event.data.corpusIncidentIds) {
      for (const model of MODELS) {
        await step.run("grade-" + model + "-" + incidentId, async () => {
          const turn = await runModelOnIncident(model, incidentId);
          const incident = getIncident(incidentId)!;

          return recordExperimentCell({
            group: "group.experiment",
            experimentId: "exp-localization-bakeoff",
            incidentId,
            model,
            outcomeScore: localizationScore(
              turn.citedFiles,
              incident.groundTruthFixFiles
            ),
          });
        });
      }
    }

    return aggregateByModel("exp-localization-bakeoff");
  }
);`;

const scorerVisionCode = `export function localizationScore(cited: string[], truth: string[]): number {
  const truthSet = new Set(truth);
  const intersection = cited.filter((file) => truthSet.has(file)).length;
  const union = new Set([...cited, ...truth]).size;

  return union === 0 ? 0 : Math.min(1, intersection / union);
}

// Because the agent, scorer, and experiment all ran on Inngest, Insights can
// query the same execution data. No second eval system is required.
//
// SELECT model, AVG(outcome_score) AS accuracy, AVG(latency_ms) AS latency
// FROM scores
// WHERE experiment_id = 'exp-localization-bakeoff'
// GROUP BY model
// ORDER BY accuracy DESC;`;

const act1Code = [boothImports(), durableAgentCode].join("\n\n");
const act2Code = [
  boothImports({
    clientExtras: ["incidentSaved", "rcaScored"],
    scoringExtras: ["recordOutcomeScore"],
  }),
  durableAgentCode,
  scoringAndSessionCode,
].join("\n\n");
const act3Code = [
  boothImports({
    clientExtras: ["incidentSaved", "rcaScored"],
    scoringExtras: ["recordOutcomeScore"],
    extra: `
import { eventType, staticSchema } from "inngest";`,
  }),
  durableAgentCode,
  scoringAndSessionCode,
  experimentCode,
].join("\n\n");

export const codeSnippets: CodeSnippet[] = [
  {
    id: "act1",
    act: 1,
    label: "Act 1",
    eyebrow: "Full Gester-style agent",
    description:
      "This is the whole code-triage function: repo reads and mocked Linear, Slack, code-suggestion, and PR tool calls are durable steps.",
    code: act1Code,
  },
  {
    id: "act2",
    act: 2,
    label: "Act 2",
    eyebrow: "Agent plus score/session",
    description:
      "Same agent, with the saved-analysis function added underneath. The clientRunId ties feedback, deferred score, and session history to the run that produced the RCA.",
    code: act2Code,
  },
  {
    id: "act3",
    act: 3,
    label: "Act 3",
    eyebrow: "Agent plus experiment",
    description:
      "Acts 1 and 2 stay intact. The experiment wrapper reruns the resolved bug corpus across two models and reuses the exact same localization scorer.",
    code: act3Code,
  },
  {
    id: "act4",
    act: 4,
    label: "Act 4",
    eyebrow: "Scorer plus Insights",
    description:
      "The big idea is small code: a scorer returns 0 to 1, then Insights can query runs, scores, sessions, and experiments from the same substrate.",
    code: scorerVisionCode,
  },
];

export const defaultCodeSnippetId: CodeSnippetId = "act1";

export function getCodeSnippet(id: CodeSnippetId): CodeSnippet | undefined {
  return codeSnippets.find((snippet) => snippet.id === id);
}

export function getCodeSnippetForAct(
  act: 1 | 2 | 3 | 4
): CodeSnippet | undefined {
  return codeSnippets.find((snippet) => snippet.act === act);
}
