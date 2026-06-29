export type CodeSnippetId = "act1" | "act2" | "act3" | "act4";

export type CodeSnippet = {
  id: CodeSnippetId;
  act: 1 | 2 | 3 | 4;
  label: string;
  eyebrow: string;
  description: string;
  code: string;
};

const act1Code = `import { inngest, researchRunRequested } from "@/inngest/client";
import { fetchResearchCorpus, synthesizeBrief } from "@/lib/research";

export const researchAgent = inngest.createFunction(
  {
    id: "research-agent",
    retries: 4,
    // @demo-highlight-start
    triggers: [researchRunRequested],
    // @demo-highlight-end
  },
  async ({ event, step }) => {
    // Internal systems: Notion, Confluence, Google Docs, Slack, CRM.
    // @demo-highlight-start
    const internalContext = await step.run("load-internal-context", () =>
      fetchResearchCorpus.internal({
        topic: event.data.topic,
        sessionId: event.data.sessionId,
      })
    );
    // @demo-highlight-end

    // This API returns a 503 once. Inngest retries this step while every
    // successful step above replays from memoized state.
    // @demo-highlight-start
    const changelog = await step.run("fetch-competitor-changelog", () =>
      fetchResearchCorpus.competitorChangelog(event.data.competitors)
    );
    // @demo-highlight-end

    // ...support tickets, pricing pages, web search, AI search, G2, GitHub...

    const brief = await step.run("synthesize-brief", () =>
      synthesizeBrief({
        model: "gpt-5.5",
        internalContext,
        changelog,
      })
    );

    return { researchRunId: event.data.researchRunId, brief };
  }
);`;

const act2Code = `import { staticSchema } from "inngest";
import { createScorer } from "inngest/experimental";
import { inngest, researchRunRequested } from "@/inngest/client";
import {
  fetchResearchCorpus,
  gradeResearchBrief,
  synthesizeBrief,
  type ResearchBrief,
} from "@/lib/research";

export const researchAgent = inngest.createFunction(
  { id: "research-agent", triggers: [researchRunRequested] },
  async ({ event, step, defer }) => {
    const internalContext = await step.run("load-internal-context", () =>
      fetchResearchCorpus.internal({ topic: event.data.topic })
    );

    const brief = await step.run("synthesize-brief", () =>
      synthesizeBrief({ model: "gpt-5.5", internalContext })
    );

    // @demo-highlight-start
    defer("score-brief-quality", {
      function: researchQualityScorer,
      data: {
        researchRunId: event.data.researchRunId,
        brief,
        sources: internalContext.sources,
      },
    });

    defer("score-saved-outcome", {
      function: researchSavedOutcomeScorer,
      data: { researchRunId: event.data.researchRunId },
    });
    // @demo-highlight-end

    return { researchRunId: event.data.researchRunId, brief };
  }
);

type QualityInput = {
  researchRunId: string;
  brief: ResearchBrief;
  sources: string[];
};

// @demo-highlight-start
export const researchQualityScorer = createScorer(
  inngest,
  { id: "research-quality-scorer", schema: staticSchema<QualityInput>() },
  async ({ event, step }) => {
    const rubric = await step.run("grade-against-rubric", () =>
      gradeResearchBrief(event.data.brief, event.data.sources)
    );

    return { name: "research_quality", value: rubric.score };
  }
);
// @demo-highlight-end

// @demo-highlight-start
export const researchSavedOutcomeScorer = createScorer(
  inngest,
  { id: "research-saved-outcome-scorer" },
  async ({ event, step }) => {
    const saved = await step.waitForEvent("wait-for-brief-save", {
      event: "research/brief.saved",
      if: "async.data.researchRunId == event.data.researchRunId",
      timeout: "7d",
    });

    return { name: "research_saved", value: Boolean(saved) };
  }
);
// @demo-highlight-end`;

const act3Code = `import { experiment } from "inngest";
import { inngest, researchRunRequested } from "@/inngest/client";
import { researchQualityScorer } from "@/inngest/scorers/research-quality-scorer";
import { fetchResearchCorpus, synthesizeBrief } from "@/lib/research";

export const researchAgent = inngest.createFunction(
  { id: "research-agent", triggers: [researchRunRequested] },
  async ({ event, step, group, defer }) => {
    const evidence = await step.run("load-research-evidence", () =>
      fetchResearchCorpus.all({ topic: event.data.topic })
    );

    // Act 1 used one durable model step here. Act 3 swaps that step for
    // an experiment without changing the rest of the agent.
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
            step.run("synthesize-claude-opus-4.8", () =>
              synthesizeBrief({ model: "claude-opus-4.8", evidence })
            ),
        },
        select: experiment.weighted({
          "gpt-5.5": 50,
          "claude-opus-4.8": 50,
        }),
      }
    );
    // @demo-highlight-end

    // score.experiment() runs at function-body level, outside step.run().
    // @demo-highlight-start
    await inngest.score.experiment({
      experiment: experimentRef,
      name: "research_token_cost_usd",
      value: brief.costUsd,
    });

    defer("score-brief-quality", {
      function: researchQualityScorer,
      experiment: experimentRef,
      data: {
        researchRunId: event.data.researchRunId,
        brief,
        selectedModel: variant,
      },
    });
    // @demo-highlight-end

    return { researchRunId: event.data.researchRunId, variant, brief };
  }
);`;

const insightQuery = `SELECT
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
ORDER BY quality DESC, cost ASC;`;

export const codeSnippets: CodeSnippet[] = [
  {
    id: "act1",
    act: 1,
    label: "Act 1",
    eyebrow: "Durable research agent",
    description:
      "A scheduled research agent moves through named durable steps. One competitor API fails once so the trace can show retry, replay, and memoized progress.",
    code: act1Code,
  },
  {
    id: "act2",
    act: 2,
    label: "Act 2",
    eyebrow: "Add deferred scoring",
    description:
      "The original agent gets a small defer addition. createScorer turns rubric and outcome checks into durable score functions attached back to the parent run.",
    code: act2Code,
  },
  {
    id: "act3",
    act: 3,
    label: "Act 3",
    eyebrow: "Add experimentation",
    description:
      "The same model step becomes group.experiment. experimentRef lets live and deferred scores land on the selected variant over time.",
    code: act3Code,
  },
  {
    id: "act4",
    act: 4,
    label: "Query",
    eyebrow: "Queryable run history",
    description:
      "Optional close: because the agent, scores, and experiment all ran on Inngest, Insights can query the same execution data.",
    code: insightQuery,
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
