export type ResearchModel = "gpt-5.5" | "claude-opus-4.8";

export type ResearchStepId =
  | "load-product-context"
  | "fetch-notion-roadmap"
  | "fetch-confluence-rfps"
  | "fetch-google-docs-notes"
  | "fetch-slack-win-loss"
  | "fetch-crm-deals"
  | "fetch-support-tickets"
  | "fetch-churn-reasons"
  | "fetch-pricing-pages"
  | "fetch-competitor-changelog"
  | "run-parallel-web-search"
  | "run-ai-search"
  | "query-g2-reviews"
  | "query-github-issues"
  | "query-community-forum"
  | "normalize-evidence"
  | "rank-findings"
  | "synthesize-brief"
  | "publish-brief"
  | "notify-stakeholders";

export type ResearchStep = {
  id: ResearchStepId;
  label: string;
  source: string;
  detail: string;
  output: string;
  tokens: number;
};

export type ResearchRunSummary = {
  researchRunId: string;
  sessionId: string;
  topic: string;
  model: ResearchModel;
  qualityScore: number;
  tokenCount: number;
  costUsd: number;
  sources: string[];
  findings: string[];
  completedAt: string;
};

export const defaultResearchTopic =
  "Competitive research brief for AI workflow platforms";

export const defaultResearchModel: ResearchModel = "gpt-5.5";

export const researchSessionId = "sess-competitive-research-q3";

export const researchSteps: ResearchStep[] = [
  {
    id: "load-product-context",
    label: "Product context",
    source: "internal product DB",
    detail: "Load ICP, packaging notes, and current positioning.",
    output: "Current ICP favors platform teams building durable AI workflows.",
    tokens: 420,
  },
  {
    id: "fetch-notion-roadmap",
    label: "Notion roadmap",
    source: "Notion",
    detail: "Read roadmap pages tagged evals, agents, and observability.",
    output: "Roadmap emphasizes online evals and production feedback loops.",
    tokens: 760,
  },
  {
    id: "fetch-confluence-rfps",
    label: "Confluence RFPs",
    source: "Confluence",
    detail: "Pull recent enterprise RFP answers about orchestration.",
    output: "Buyers ask for retries, audit trails, and model governance.",
    tokens: 690,
  },
  {
    id: "fetch-google-docs-notes",
    label: "Sales notes",
    source: "Google Docs",
    detail: "Collect call notes from competitive late-stage deals.",
    output: "Teams compare eval products separately from orchestration tools.",
    tokens: 820,
  },
  {
    id: "fetch-slack-win-loss",
    label: "Win-loss Slack",
    source: "Slack",
    detail: "Scan private win-loss channels for recurring language.",
    output: "Durability plus native observability is the clearest wedge.",
    tokens: 640,
  },
  {
    id: "fetch-crm-deals",
    label: "CRM deals",
    source: "HubSpot",
    detail: "Read recent deal metadata and competitor mentions.",
    output: "Qualified opportunities mention Braintrust, Temporal, and LangSmith.",
    tokens: 710,
  },
  {
    id: "fetch-support-tickets",
    label: "Support tickets",
    source: "Zendesk",
    detail: "Find agent reliability tickets and integration pain.",
    output: "Retry visibility and replay questions recur in onboarding tickets.",
    tokens: 540,
  },
  {
    id: "fetch-churn-reasons",
    label: "Churn reasons",
    source: "warehouse",
    detail: "Read coded churn notes from the last two quarters.",
    output: "Teams churn when workflow ownership is split across too many tools.",
    tokens: 510,
  },
  {
    id: "fetch-pricing-pages",
    label: "Pricing pages",
    source: "web fetch",
    detail: "Snapshot competitor pricing and plan language.",
    output: "Competitors price eval volume separately from execution volume.",
    tokens: 460,
  },
  {
    id: "fetch-competitor-changelog",
    label: "Changelog",
    source: "competitor API",
    detail: "Pull competitor launches from public changelog APIs.",
    output: "Recent launches cluster around eval dashboards and traces.",
    tokens: 590,
  },
  {
    id: "run-parallel-web-search",
    label: "Web search",
    source: "Parallel Web Systems",
    detail: "Search market pages, docs, and recent blog posts.",
    output: "The category language is shifting toward production agent quality.",
    tokens: 920,
  },
  {
    id: "run-ai-search",
    label: "AI search",
    source: "AI search API",
    detail: "Ask an AI search provider for current comparison summaries.",
    output: "Most comparisons separate durable execution from eval scoring.",
    tokens: 880,
  },
  {
    id: "query-g2-reviews",
    label: "G2 reviews",
    source: "G2",
    detail: "Extract review themes for workflow and eval competitors.",
    output: "Users complain about fragmented traces and manual score plumbing.",
    tokens: 620,
  },
  {
    id: "query-github-issues",
    label: "GitHub issues",
    source: "GitHub",
    detail: "Scan public issues for agent retry and checkpointing friction.",
    output: "Open-source users ask how to avoid rerunning expensive model calls.",
    tokens: 670,
  },
  {
    id: "query-community-forum",
    label: "Community forum",
    source: "Discourse",
    detail: "Read forum posts about agent failures and scheduled research.",
    output: "Autonomous reports need durable state and historical evaluation.",
    tokens: 430,
  },
  {
    id: "normalize-evidence",
    label: "Normalize evidence",
    source: "agent memory",
    detail: "Deduplicate citations and normalize source metadata.",
    output: "Twenty sources collapse into seven high-confidence themes.",
    tokens: 780,
  },
  {
    id: "rank-findings",
    label: "Rank findings",
    source: "scoring heuristic",
    detail: "Rank findings by recency, confidence, and revenue impact.",
    output: "Top finding: native evals are strongest when attached to runs.",
    tokens: 520,
  },
  {
    id: "synthesize-brief",
    label: "Synthesize brief",
    source: "model",
    detail: "Write the executive research brief with citations.",
    output: "Brief recommends leading with durable agent evals in production.",
    tokens: 1380,
  },
  {
    id: "publish-brief",
    label: "Publish brief",
    source: "Notion",
    detail: "Publish the brief to the competitive intelligence workspace.",
    output: "Published Q3 competitive research brief.",
    tokens: 240,
  },
  {
    id: "notify-stakeholders",
    label: "Notify team",
    source: "Slack",
    detail: "Post the summary and run link to product, sales, and DevRel.",
    output: "Stakeholders notified with the research run and score link.",
    tokens: 260,
  },
];

export const researchFindings = [
  "Durable execution is the clearest differentiator when the agent touches many APIs.",
  "Online evals become easier to trust when scores attach to the same run that did the work.",
  "Experiment decisions should include quality, token cost, latency, and retry rate.",
];

export const seededResearchRuns: ResearchRunSummary[] = [
  {
    researchRunId: "seed-research-2026-06-01",
    sessionId: researchSessionId,
    topic: defaultResearchTopic,
    model: "gpt-5.5",
    qualityScore: 0.86,
    tokenCount: 13840,
    costUsd: 0.42,
    sources: ["Notion", "Slack", "HubSpot", "G2", "GitHub"],
    findings: researchFindings,
    completedAt: "2026-06-01T16:00:00.000Z",
  },
  {
    researchRunId: "seed-research-2026-06-07",
    sessionId: researchSessionId,
    topic: defaultResearchTopic,
    model: "claude-opus-4.8",
    qualityScore: 0.81,
    tokenCount: 15620,
    costUsd: 0.51,
    sources: ["Confluence", "Google Docs", "Slack", "Parallel", "Discourse"],
    findings: researchFindings,
    completedAt: "2026-06-07T16:00:00.000Z",
  },
  {
    researchRunId: "seed-research-2026-06-13",
    sessionId: researchSessionId,
    topic: defaultResearchTopic,
    model: "gpt-5.5",
    qualityScore: 0.9,
    tokenCount: 12920,
    costUsd: 0.39,
    sources: ["Notion", "Zendesk", "HubSpot", "AI search", "GitHub"],
    findings: researchFindings,
    completedAt: "2026-06-13T16:00:00.000Z",
  },
  {
    researchRunId: "seed-research-2026-06-19",
    sessionId: researchSessionId,
    topic: defaultResearchTopic,
    model: "claude-opus-4.8",
    qualityScore: 0.78,
    tokenCount: 17110,
    costUsd: 0.57,
    sources: ["Google Docs", "Slack", "G2", "Parallel", "web fetch"],
    findings: researchFindings,
    completedAt: "2026-06-19T16:00:00.000Z",
  },
];

export function getResearchStep(id: ResearchStepId): ResearchStep {
  const step = researchSteps.find((item) => item.id === id);

  if (!step) {
    throw new Error(`Unknown research step: ${id}`);
  }

  return step;
}

export function buildResearchRunSummary(args: {
  researchRunId: string;
  model?: ResearchModel;
  completedAt?: string;
  qualityScore?: number;
}): ResearchRunSummary {
  const tokenCount = researchSteps.reduce((sum, step) => sum + step.tokens, 0);
  const model = args.model ?? defaultResearchModel;

  return {
    researchRunId: args.researchRunId,
    sessionId: researchSessionId,
    topic: defaultResearchTopic,
    model,
    qualityScore: args.qualityScore ?? (model === "gpt-5.5" ? 0.88 : 0.82),
    tokenCount,
    costUsd: model === "gpt-5.5" ? 0.44 : 0.53,
    sources: [...new Set(researchSteps.map((step) => step.source))],
    findings: researchFindings,
    completedAt: args.completedAt ?? new Date().toISOString(),
  };
}
