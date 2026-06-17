// src/content/code-snippets.ts (CODEVIEW owns)
//
// The four in-app annotated code snippets for the incident-triage demo, one
// per act. Each one mirrors the REAL Inngest v4 syntax in
// `src/inngest/functions/triage-agent.ts` and `score-incident.ts` so the code
// the demoer shows on screen is the code that actually ran through the local
// dev server. The `description` is the single line a demoer reads aloud while
// the snippet is on screen.
//
// Progression:
//   Act 1 — the durable think/tool loop (this is what genuinely executes)
//   Act 2 — defer() the outcome scorer + emit the localization score
//   Act 3 — group.experiment to bake off two models on resolved incidents
//   Act 4 — the vision: "the scorer is just your function returning 0..1"
//
// NOTE for FRONTEND (CodeView): snippets carry both a string `id` and a numeric
// `act` (1..4) so you can drive selection from the ActStepper by act number and
// still key React state on a stable id. `highlight.ts` highlights `code` as TS.

export type CodeSnippetId = "act1" | "act2" | "act3" | "act4";

export type CodeSnippet = {
  id: CodeSnippetId;
  act: 1 | 2 | 3 | 4;
  label: string; // stepper-friendly label, e.g. "Act 1"
  eyebrow: string; // short concept name shown above the code
  description: string; // ONE line the demoer reads aloud
  code: string; // TypeScript, highlighted by highlight.ts
};

export const codeSnippets: CodeSnippet[] = [
  // ── ACT 1 ───────────────────────────────────────────────────────────────
  // The durable agent loop. Mirrors triage-agent.ts: think-N + tool-N steps,
  // attempt-0 crash reset, the read_repo_file 503 that retries clean.
  {
    id: "act1",
    act: 1,
    label: "Act 1",
    eyebrow: "Durable agent loop",
    description:
      "Every model turn and every tool call is its own durable step, so when read_repo_file 503s, Inngest retries the function and replays the prior steps from memory instead of rerunning the whole investigation.",
    code: `export const triageAgent = inngest.createFunction(
  { id: "triage-agent", retries: 3, triggers: [incidentReceived] },
  async ({ event, step, attempt }) => {
    // First read_repo_file on the crash file 503s on attempt 0.
    // On retry this flag stays set, so the same tool call succeeds.
    if (attempt === 0) resetCrashState();

    let iteration = 0;
    const toolCalls: string[] = [];

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      // 1. The model turn is a durable step. On retry it replays instantly.
      const turn = await step.run(\`think-\${iteration}\`, () =>
        nextTurn({
          incidentId: event.data.incidentId,
          iteration,
          attempt,
          flags: event.data.flags,
        })
      );

      // 2. No more tools? The model wrote the RCA. We're done.
      if (turn.type === "final") {
        const incident = getIncident(event.data.incidentId)!;
        return {
          incidentId: event.data.incidentId,
          clientRunId: event.data.clientRunId,
          rca: turn.rca,
          citedFiles: turn.citedFiles,
          iterations: iteration,
          toolCalls,
          localizationScore: scoreLocalization(
            turn.citedFiles,
            incident.groundTruthFixFiles
          ),
        } satisfies TriageResult;
      }

      // 3. Each tool call is its own step. The 503 lands inside ONE of these,
      //    so only that step re-runs on retry — the rest stay memoized.
      for (const call of turn.calls) {
        toolCalls.push(call.name);
        await step.run(\`tool-\${call.name}-\${call.id}\`, () =>
          executeTool(event.data.incidentId, call.name, call.input, { attempt })
        );
      }
    }
  }
);`,
  },

  // ── ACT 2 ───────────────────────────────────────────────────────────────
  // Deferred outcome scoring. The agent answers FAST; the localization score
  // is computed after the human saves/discards, in its own durable function,
  // and emitted back as agent/rca.scored.
  {
    id: "act2",
    act: 2,
    label: "Act 2",
    eyebrow: "defer() the scorer",
    description:
      "The agent ships the RCA immediately, then a separate durable function scores how well it localized the bug once the run is saved, so grading never sits in the user's critical path.",
    code: `// Triggered by agent/incident.saved — runs AFTER the user has their RCA.
export const scoreIncident = inngest.createFunction(
  { id: "score-incident", retries: 2, triggers: [incidentSaved] },
  async ({ event, step }) => {
    if (event.data.signal === "discarded") return { scored: false };

    const result = getTriageResult(event.data.clientRunId);
    const incident = getIncident(event.data.incidentId)!;

    // Deferred outcome score: did the RCA cite the files the real fix touched?
    const score = await step.run("score-localization", () =>
      scoreLocalization(result.citedFiles, incident.groundTruthFixFiles)
    );

    // Emit the score back as an event so the trace, the session view, and the
    // score history all read the same number. The score exists BECAUSE Inngest
    // ran the agent — same substrate, no second eval system to wire up.
    await step.sendEvent(
      "emit-rca-scored",
      rcaScored.create(
        {
          incidentId: event.data.incidentId,
          clientRunId: event.data.clientRunId,
          citedFiles: result.citedFiles,
          groundTruthFixFiles: incident.groundTruthFixFiles,
          score,
          scoredAt: new Date().toISOString(),
          source: "booth-demo",
        },
        { id: \`scored:\${event.data.clientRunId}\` }
      )
    );

    return { scored: true, score };
  }
);`,
  },

  // ── ACT 3 ───────────────────────────────────────────────────────────────
  // The experiment. Same agent, same corpus, two models — graded by the same
  // localization scorer, grouped under one group.experiment so the results
  // page can compare them.
  {
    id: "act3",
    act: 3,
    label: "Act 3",
    eyebrow: "group.experiment",
    description:
      "Replay the resolved-incident corpus through two models under one experiment group, grade every run with the same localization scorer, and the dashboard ranks them on accuracy, latency, and cost.",
    code: `// A bakeoff is just the same triage run, fanned out over a corpus and two
// models, tagged into one experiment group so the results aggregate together.
const MODELS = ["gpt-5.5", "claude-opus-4.8"] as const;

export const runExperiment = inngest.createFunction(
  { id: "localization-bakeoff", triggers: [experimentRequested] },
  async ({ event, step }) => {
    for (const incidentId of event.data.corpusIncidentIds) {
      for (const model of MODELS) {
        // Each cell is one durable run, tagged with the experiment group so
        // every score rolls up under the same results page.
        await step.run(\`grade-\${model}-\${incidentId}\`, async () => {
          const turn = await runModelOnIncident(model, incidentId);
          const incident = getIncident(incidentId)!;

          return recordExperimentCell({
            group: "group.experiment",
            experiment: "exp-localization-bakeoff",
            incidentId,
            model,
            // the SAME scorer from Act 2 — one definition, reused everywhere
            outcomeScore: scoreLocalization(
              turn.citedFiles,
              incident.groundTruthFixFiles
            ),
          });
        });
      }
    }

    // Aggregate accuracy / latency / cost per model. The winner depends on how
    // you weight them — which is exactly what the sliders on screen do.
    return aggregateByModel("exp-localization-bakeoff");
  }
);`,
  },

  // ── ACT 4 ───────────────────────────────────────────────────────────────
  // The vision. The scorer is not a product feature you buy — it's a function
  // you write that returns 0..1, and everything else (history, experiments,
  // Insights) is just querying the data Inngest already captured.
  {
    id: "act4",
    act: 4,
    label: "Act 4",
    eyebrow: "The scorer is just your fn",
    description:
      "There is no special eval DSL here: a scorer is any function that returns a number between 0 and 1, and because the agent runs on Inngest, every score, session, and experiment is already queryable in Insights.",
    code: `// A "scorer" is not a framework. It's a function you write that returns 0..1.
// Swap this for an LLM judge, a regex, a diff check — anything.
export function scoreLocalization(cited: string[], truth: string[]): number {
  const truthSet = new Set(truth);
  const intersection = cited.filter((f) => truthSet.has(f)).length;
  const union = new Set([...cited, ...truth]).size;
  return union === 0 ? 0 : Math.min(1, intersection / union); // Jaccard, clamped
}

// Because the agent ran on Inngest, you didn't wire up a second system to get
// any of this. The scores, sessions, retries, and experiments are all just
// rows you query in Insights:
//
//   SELECT model, AVG(outcome_score) AS accuracy
//   FROM scores
//   WHERE experiment = 'exp-localization-bakeoff'
//   GROUP BY model
//   ORDER BY accuracy DESC;
//
// Same substrate that runs the agent runs the evals. That's the whole pitch:
// one durable execution layer, and observability + scoring fall out for free.`,
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
