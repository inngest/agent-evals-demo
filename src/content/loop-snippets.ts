// Code snippets for the Run / Observe / Evaluate loop demo. Kept separate
// from code-snippets.ts so the legacy act demos at /research, /booth-story,
// and /booth-control keep rendering unchanged.

/**
 * The Evaluate stage is split three ways so the code pane can follow whichever
 * sub-action the driver just used: score a run now, score it later via defer,
 * or compare models. One combined snippet meant the audience was looking at
 * three primitives at once while the driver talked about one.
 */
export type LoopSnippetId =
  | "run"
  | "observe"
  | "evaluate-score"
  | "evaluate-defer"
  | "evaluate-experiment";

export type LoopSnippet = {
  id: LoopSnippetId;
  stage: 1 | 2 | 3;
  label: string;
  eyebrow: string;
  description: string;
  code: string;
};

const runCode = `import { inngest, researchRunRequested } from "@/inngest/client";
import { callModel, fetchResearchCorpus } from "@/lib/research";

export const researchAgent = inngest.createFunction(
  {
    id: "research-agent",
    retries: 4,
    triggers: [researchRunRequested],
    // If the run dies mid-flight, destroy any sandbox it left behind.
    onFailure: cleanupSandboxByName,
  },
  async ({ event, step }) => {
    // Steps are marked by primitives: Inngest owns how and when each
    // one executes, retries it, and replays memoized results.
    // @demo-highlight-start
    const context = await step.run("load-research-context", () =>
      fetchResearchCorpus.internal({ topic: event.data.topic })
    );

    const changelog = await step.run("fetch-competitor-changelog", () =>
      fetchResearchCorpus.competitorChangelog(event.data.competitors)
    );
    // @demo-highlight-end

    // The model wrote an analysis script. Generated code never runs in
    // your process: give it an isolated Linux environment, then throw
    // it away. Durable steps, isolated execution.
    // @demo-highlight-start
    const sandbox = await step.sandbox.create("create-analysis-sandbox", {
      name: \`research-\${event.data.researchRunId}\`,
      vcpu: 1,
      memoryMb: 1024,
      runningTimeout: "60s",
    });

    const analysis = await sandbox.commands.run(
      "run-generated-analysis",
      renderAnalysisCommand(changelog),
      { timeout: "30s" }
    );

    await sandbox.destroy("destroy-analysis-sandbox");
    // @demo-highlight-end

    const brief = await step.run("call-llm-synthesize-brief", () =>
      callModel("gpt-5.5", { task: "write competitive research brief", context, analysis })
    );

    return { researchRunId: event.data.researchRunId, brief };
  }
);`;

const observeCode = `import { inngest, researchRunRequested } from "@/inngest/client";
import { callModel, fetchResearchCorpus } from "@/lib/research";

// The SAME function from the Run stage. Observability is not code you
// add: because durability is defined here, every run generates its own
// trace data by default. Inputs, outputs, timing, retries, tokens, cost.
export const researchAgent = inngest.createFunction(
  {
    id: "research-agent",
    retries: 4,
    triggers: [researchRunRequested],
  },
  async ({ event, step }) => {
    const context = await step.run("load-research-context", () =>
      fetchResearchCorpus.internal({ topic: event.data.topic })
    );

    // Steps above and below are traced automatically. Attach run
    // context once and Insights can group by it later.
    // @demo-highlight-start
    await step.metadata("attach-run-context").update(
      {
        topic: event.data.topic,
        model: "gpt-5.5",
        source: "booth-demo",
      },
      "userland.research"
    );
    // @demo-highlight-end

    const brief = await step.run("call-llm-synthesize-brief", () =>
      callModel("gpt-5.5", { task: "write competitive research brief", context })
    );

    return { researchRunId: event.data.researchRunId, brief };
  }
);

// Insights queries the runs, scores, and experiments your code already
// generated. No pipeline to build, no warehouse to sync.
// @demo-highlight-start
export const modelQualityByVariant = \`
  SELECT
    experiment_name,
    variant,
    AVG(score.value) FILTER (WHERE score.name = 'research_quality') AS quality,
    AVG(score.value) FILTER (WHERE score.name = 'research_token_cost_usd') AS cost,
    AVG(run.duration_ms) AS latency,
    COUNT(*) AS research_runs
  FROM inngest.scores score
  JOIN inngest.runs run ON run.id = score.run_id
  WHERE run.function_id = 'research-agent'
  GROUP BY experiment_name, variant
  ORDER BY quality DESC, cost ASC;
\`;
// @demo-highlight-end`;

const evaluateScoreCode = `import { createScorer } from "inngest/experimental";
import { inngest } from "@/inngest/client";
import { gradeResearchBrief } from "@/lib/research";

// A score is just your function returning 0..1. Durable, like
// everything else, and attached back to the run that did the work.
// @demo-highlight-start
export const researchQualityScorer = createScorer(
  inngest,
  { id: "research-quality-scorer" },
  async ({ event, step }) => {
    const rubric = await step.run("grade-against-rubric", () =>
      gradeResearchBrief(event.data.brief, event.data.sources)
    );

    return { name: "research_quality", value: rubric.score };
  }
);
// @demo-highlight-end

// A product signal is a score too. step.score attaches it to the
// run that produced the brief, inside a durable step.
// @demo-highlight-start
export const scoreFromFeedback = inngest.createFunction(
  { id: "research-agent-score-run", triggers: [researchFeedbackRecorded] },
  async ({ event, step }) => {
    await step.score("attach-research-human-feedback-score", {
      runId: event.data.parentRunId,
      name: "research_human_feedback",
      value: event.data.signal === "missed-context" ? 0 : 1,
    });
  }
);
// @demo-highlight-end`;

const evaluateDeferCode = `import { createScorer } from "inngest/experimental";
import { inngest } from "@/inngest/client";

// The outcome of a brief is not known when the run ends. It lands
// when someone ships the recommendation, days or weeks later.
export const researchOutcomeScorer = createScorer(
  inngest,
  { id: "research-outcome-scorer" },
  async ({ event }) => ({
    name: "research_deferred_outcome",
    value: event.data.outcome === "shipped" ? 1 : 0,
    // The ORIGINAL run, not the run doing the scoring.
    runId: event.data.parentRunId,
  })
);

export const scoreOnOutcome = inngest.createFunction(
  { id: "research-agent-score-run", triggers: [researchOutcomeRecorded] },
  async ({ event, defer }) => {
    // defer() scores a run that finalized long ago. No pipeline,
    // no join, no warehouse. The score lands on the original run.
    // @demo-highlight-start
    await defer("research-outcome:" + event.data.researchRunId, {
      function: researchOutcomeScorer,
      data: {
        parentRunId: event.data.parentRunId,
        outcome: event.data.outcome,
        observedAt: event.data.observedAt,
      },
    });
    // @demo-highlight-end
  }
);`;

const evaluateExperimentCode = `import { experiment } from "inngest";
import { inngest } from "@/inngest/client";
import { synthesizeBrief } from "@/lib/research";

export const modelBakeoff = inngest.createFunction(
  { id: "research-agent-model-bakeoff", triggers: [researchExperimentRequested] },
  async ({ step, group }) => {
    // Real traffic splits across the variants. Each run picks one.
    // @demo-highlight-start
    const { result, variant, experimentRef } = await group.experiment(
      "research-agent-model-bakeoff",
      {
        variants: {
          "gpt-5.5": () =>
            step.run("evaluate-research-brief-gpt-5.5", () =>
              synthesizeBrief({ model: "gpt-5.5" })
            ),
          "claude-opus-4.8": () =>
            step.run("evaluate-research-brief-claude-opus-4.8", () =>
              synthesizeBrief({ model: "claude-opus-4.8" })
            ),
        },
        select: experiment.weighted({ "gpt-5.5": 50, "claude-opus-4.8": 50 }),
      }
    );
    // @demo-highlight-end

    // Every score lands on the variant that produced it, so the
    // comparison is built from real runs, not a separate harness.
    // @demo-highlight-start
    await inngest.score.experiment({
      experiment: experimentRef,
      name: "research_quality",
      value: result.qualityScore,
    });
    // @demo-highlight-end

    return { variant, ...result };
  }
);`;

export const loopSnippets: LoopSnippet[] = [
  {
    id: "run",
    stage: 1,
    label: "Run",
    eyebrow: "Primitives + Sandboxes",
    description:
      "Primitives mark each durable step. When a step needs isolation, step.sandbox gives model-generated code its own Linux environment, traced and destroyed like any other step.",
    code: runCode,
  },
  {
    id: "observe",
    stage: 2,
    label: "Observe",
    eyebrow: "Traces + Insights, for free",
    description:
      "Not one line of observability code added. The same function generates traces by default, metadata makes runs groupable, and Insights queries the data the runs already produced.",
    code: observeCode,
  },
  {
    id: "evaluate-score",
    stage: 3,
    label: "Score now",
    eyebrow: "createScorer + step.score",
    description:
      "A score is your own function returning 0..1. createScorer makes it durable, and step.score attaches a product signal to the run that produced the work.",
    code: evaluateScoreCode,
  },
  {
    id: "evaluate-defer",
    stage: 3,
    label: "Score later",
    eyebrow: "defer",
    description:
      "The outcome is not known when the run ends. defer() scores a run that finalized days or weeks ago, and the score still lands on the original run.",
    code: evaluateDeferCode,
  },
  {
    id: "evaluate-experiment",
    stage: 3,
    label: "Compare models",
    eyebrow: "group.experiment",
    description:
      "group.experiment routes real traffic across variants. Every score attaches to the variant that produced it, so the comparison is built from real runs.",
    code: evaluateExperimentCode,
  },
];

export const defaultLoopSnippetId: LoopSnippetId = "run";

export function getLoopSnippet(id: LoopSnippetId): LoopSnippet | undefined {
  return loopSnippets.find((snippet) => snippet.id === id);
}
