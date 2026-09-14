// Code snippets for the Run / Observe / Evaluate loop demo. Kept separate
// from code-snippets.ts so the legacy act demos at /research, /booth-story,
// and /booth-control keep rendering unchanged.

export type LoopSnippetId = "run" | "observe" | "evaluate";

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

const evaluateCode = `import { createScorer } from "inngest/experimental";
import { inngest, researchRunRequested } from "@/inngest/client";
import { gradeResearchBrief, synthesizeBrief } from "@/lib/research";

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

export const researchAgent = inngest.createFunction(
  { id: "research-agent", triggers: [researchRunRequested] },
  async ({ event, step, group, defer }) => {
    const evidence = await step.run("load-research-evidence", () =>
      loadEvidence({ topic: event.data.topic })
    );

    // Evaluate LATER: defer() scores this run after it finalizes.
    // The scorer can use data that lands days or even weeks later.
    // @demo-highlight-start
    defer("score-brief-quality", {
      function: researchQualityScorer,
      data: {
        researchRunId: event.data.researchRunId,
        brief,
        sources: evidence.sources,
      },
    });
    // @demo-highlight-end

    // Evaluate NOW: the same model step becomes an experiment.
    // Every score lands on the variant that produced it.
    // @demo-highlight-start
    const { result: brief, variant, experimentRef } = await group.experiment(
      "research-agent-model-bakeoff",
      {
        variants: {
          "gpt-5.5": () =>
            step.run("synthesize-gpt-5.5", () =>
              synthesizeBrief({ model: "gpt-5.5", evidence })
            ),
          "claude-opus-4.8": () =>
            step.run("synthesize-opus-4.8", () =>
              synthesizeBrief({ model: "claude-opus-4.8", evidence })
            ),
        },
        select: experiment.weighted({ "gpt-5.5": 50, "claude-opus-4.8": 50 }),
      }
    );

    await inngest.score.experiment({
      experiment: experimentRef,
      name: "research_token_cost_usd",
      value: brief.costUsd,
    });
    // @demo-highlight-end

    return { researchRunId: event.data.researchRunId, variant, brief };
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
    id: "evaluate",
    stage: 3,
    label: "Evaluate",
    eyebrow: "Scores + Experiments + Defer",
    description:
      "createScorer turns any rubric into a durable score function. defer() evaluates after the run finalizes, and group.experiment routes real traffic across models with scores attached per variant.",
    code: evaluateCode,
  },
];

export const defaultLoopSnippetId: LoopSnippetId = "run";

export function getLoopSnippet(id: LoopSnippetId): LoopSnippet | undefined {
  return loopSnippets.find((snippet) => snippet.id === id);
}
