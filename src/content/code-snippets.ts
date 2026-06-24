export type CodeSnippetId = "act1" | "act2" | "act3" | "act4";

export type CodeSnippet = {
  id: CodeSnippetId;
  act: 1 | 2 | 3 | 4;
  label: string;
  eyebrow: string;
  description: string;
  code: string;
  highlightTerms?: string[];
};

const imports = `import { experiment } from "inngest";
import {
  inngest,
  researchRunRequested,
  researchRunCompleted,
  researchFeedbackRecorded,
  researchExperimentRequested,
} from "@/inngest/client";
import { runResearchCall, modelExperimentResult } from "@/lib/mock-research";`;

const durableResearchAgent = `export const researchAgent = inngest.createFunction(
  {
    id: "research-agent",
    retries: 4,
    triggers: [
      researchRunRequested,
      { cron: "TZ=America/Los_Angeles 0 9 */6 * *" },
    ],
  },
  async ({ event, step, attempt, runId }) => {
    if (attempt === 0) resetResearchCrashState();

    const product = await step.run("load-product-context", () =>
      runResearchCall("load-product-context", { attempt })
    );
    const notion = await step.run("fetch-notion-roadmap", () =>
      runResearchCall("fetch-notion-roadmap", { attempt })
    );
    const confluence = await step.run("fetch-confluence-rfps", () =>
      runResearchCall("fetch-confluence-rfps", { attempt })
    );
    const docs = await step.run("fetch-google-docs-notes", () =>
      runResearchCall("fetch-google-docs-notes", { attempt })
    );
    const slack = await step.run("fetch-slack-win-loss", () =>
      runResearchCall("fetch-slack-win-loss", { attempt })
    );
    const crm = await step.run("fetch-crm-deals", () =>
      runResearchCall("fetch-crm-deals", { attempt })
    );
    const support = await step.run("fetch-support-tickets", () =>
      runResearchCall("fetch-support-tickets", { attempt })
    );
    const churn = await step.run("fetch-churn-reasons", () =>
      runResearchCall("fetch-churn-reasons", { attempt })
    );
    const pricing = await step.run("fetch-pricing-pages", () =>
      runResearchCall("fetch-pricing-pages", { attempt })
    );

    // This API returns a 503 once. Inngest retries this boundary,
    // while every successful step above replays from memoized state.
    const changelog = await step.run("fetch-competitor-changelog", () =>
      runResearchCall("fetch-competitor-changelog", { attempt })
    );

    const web = await step.run("run-parallel-web-search", () =>
      runResearchCall("run-parallel-web-search", { attempt })
    );
    const aiSearch = await step.run("run-ai-search", () =>
      runResearchCall("run-ai-search", { attempt })
    );
    const g2 = await step.run("query-g2-reviews", () =>
      runResearchCall("query-g2-reviews", { attempt })
    );
    const github = await step.run("query-github-issues", () =>
      runResearchCall("query-github-issues", { attempt })
    );
    const forum = await step.run("query-community-forum", () =>
      runResearchCall("query-community-forum", { attempt })
    );
    const normalized = await step.run("normalize-evidence", () =>
      normalizeEvidence({ product, notion, confluence, docs, slack, crm, support, churn, pricing, changelog, web, aiSearch, g2, github, forum })
    );
    const ranked = await step.run("rank-findings", () =>
      rankFindings(normalized)
    );
    const brief = await step.run("synthesize-brief", () =>
      writeResearchBrief(ranked)
    );
    await step.run("publish-brief", () => publishToNotion(brief));
    await step.run("notify-stakeholders", () => notifySlack(brief));

    return { runId, brief };
  }
);`;

const scoreAndSessionAddition = `// ACT 2 ADDITION: two lines turn this autonomous run into eval data.
const quality = await step.run("evaluate-research-quality", () =>
  evaluateResearchQuality({ brief, ranked })
);

await step.sendEvent(
  "score-and-session",
  researchRunCompleted.create({
    researchRunId: event.data.researchRunId,
    parentRunId: runId,
    sessionId: "sess-competitive-research-q3",
    topic: event.data.topic,
    model: event.data.model,
    qualityScore: quality.value,
    tokenCount: quality.tokenCount,
    costUsd: quality.costUsd,
    sources: quality.sources,
    findings: quality.findings,
    completedAt: new Date().toISOString(),
    source: "booth-demo",
  })
);`;

const scoreFunction = `export const researchScoreRun = inngest.createFunction(
  {
    id: "research-score-run",
    triggers: [researchRunCompleted, researchFeedbackRecorded],
  },
  async ({ event, step }) => {
    if (event.name === "research/run.completed") {
      await step.score("attach-research-quality-score", {
        runId: event.data.parentRunId,
        name: "research_quality",
        value: event.data.qualityScore,
      });

      await step.score("attach-research-cost-score", {
        runId: event.data.parentRunId,
        name: "research_cost_usd",
        value: event.data.costUsd,
      });
    }

    return { sessionId: event.data.sessionId };
  }
);`;

const experimentFunction = `export const researchExperimentBakeoff = inngest.createFunction(
  {
    id: "research-experiment-bakeoff",
    triggers: [researchExperimentRequested],
  },
  async ({ event, step, group }) => {
    const { result, variant } = await group.experiment(
      "competitive-research-model-bakeoff",
      {
        variants: {
          "gpt-5.5": () =>
            step.run("evaluate-gpt-5.5", async () => {
              const outcome = modelExperimentResult("gpt-5.5");
              await inngest.score({
                name: "research_quality",
                value: outcome.qualityScore,
              });
              await inngest.score({
                name: "research_cost_usd",
                value: outcome.costUsd,
              });
              return outcome;
            }),
          "claude-opus-4.8": () =>
            step.run("evaluate-claude-opus-4.8", async () => {
              const outcome = modelExperimentResult("claude-opus-4.8");
              await inngest.score({
                name: "research_quality",
                value: outcome.qualityScore,
              });
              await inngest.score({
                name: "research_cost_usd",
                value: outcome.costUsd,
              });
              return outcome;
            }),
        },
        select: experiment.weighted({
          "gpt-5.5": 50,
          "claude-opus-4.8": 50,
        }),
        withVariant: true,
      }
    );

    return {
      experimentRunId: event.data.experimentRunId,
      variant,
      qualityScore: result.qualityScore,
      tokenCount: result.tokenCount,
      costUsd: result.costUsd,
    };
  }
);`;

const insightQuery = `SELECT
  model,
  AVG(score.value) FILTER (WHERE score.name = 'research_quality') AS quality,
  AVG(score.value) FILTER (WHERE score.name = 'research_cost_usd') AS cost,
  AVG(run.duration_ms) AS latency,
  COUNT(*) AS research_runs
FROM inngest.scores score
JOIN inngest.runs run ON run.id = score.run_id
WHERE run.function_id IN ('research-agent', 'research-experiment-bakeoff')
GROUP BY model
ORDER BY quality DESC, cost ASC;`;

const act1Code = [imports, durableResearchAgent].join("\n\n");
const act2Code = [
  imports,
  durableResearchAgent.replace(
    "    return { runId, brief };",
    `    ${scoreAndSessionAddition.replace(/\n/g, "\n    ")}

    return { runId, brief, quality };`
  ),
  scoreFunction,
].join("\n\n");
const act3Code = [imports, durableResearchAgent, scoreFunction, experimentFunction].join(
  "\n\n"
);

export const codeSnippets: CodeSnippet[] = [
  {
    id: "act1",
    act: 1,
    label: "Act 1",
    eyebrow: "Durable research agent",
    description:
      "A scheduled research agent touches internal tools, public APIs, and model calls as named durable steps. The changelog API fails once so the trace can show retry and replay.",
    code: act1Code,
    highlightTerms: [
      'triggers: [',
      '{ cron: "TZ=America/Los_Angeles 0 9 */6 * *" }',
      'step.run("fetch-competitor-changelog"',
      "returns a 503 once",
    ],
  },
  {
    id: "act2",
    act: 2,
    label: "Act 2",
    eyebrow: "Add scores and sessions",
    description:
      "The original agent stays intact. The highlighted addition evaluates the brief, emits a score/session event, and a second function attaches quality and cost to the run.",
    code: act2Code,
    highlightTerms: [
      "ACT 2 ADDITION",
      'step.run("evaluate-research-quality"',
      'step.sendEvent(',
      'researchRunCompleted.create',
      'id: "research-score-run"',
      'step.score("attach-research-quality-score"',
      'step.score("attach-research-cost-score"',
    ],
  },
  {
    id: "act3",
    act: 3,
    label: "Act 3",
    eyebrow: "Add experimentation",
    description:
      "The experiment function runs the same research task as a model bakeoff and scores quality plus token cost for each selected variant.",
    code: act3Code,
    highlightTerms: [
      'id: "research-experiment-bakeoff"',
      'group.experiment(',
      '"gpt-5.5"',
      '"claude-opus-4.8"',
      "experiment.weighted",
      "research_cost_usd",
    ],
  },
  {
    id: "act4",
    act: 4,
    label: "Query",
    eyebrow: "Queryable run history",
    description:
      "Optional close: because the agent, scores, and experiment all ran on Inngest, Insights can query the same execution data.",
    code: insightQuery,
    highlightTerms: ["research_quality", "research_cost_usd", "GROUP BY model"],
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
