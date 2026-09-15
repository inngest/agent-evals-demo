export type ResearchModel = "gpt-5.5" | "claude-opus-4.8";

export type ResearchStepId =
  | "load-research-context"
  | "call-llm-plan-research"
  | "fetch-competitor-changelog"
  | "search-market-sources"
  | "call-llm-synthesize-brief"
  | "score-research-quality"
  | "publish-brief"
  | "notify-stakeholders";

/**
 * The synthesis step id. The loop demo string-matches this to pull the brief
 * out of the captured timeline, so both sides import it from here rather than
 * repeating the literal: renaming the step in one place only would silently
 * remove the research output card.
 */
export const BRIEF_STEP_ID = "call-llm-synthesize-brief" satisfies ResearchStepId;

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
  // Narrative models ("gpt-5.5") in mock mode, real OpenRouter model ids
  // ("openai/gpt-5.5") when the key is configured.
  model: string;
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
    id: "load-research-context",
    label: "Load research context",
    source: "internal context graph",
    detail: "Load roadmap, CRM, support, sales notes, and win-loss context.",
    output: "Internal context favors durable AI workflows with native eval loops.",
    tokens: 2860,
  },
  {
    id: "call-llm-plan-research",
    label: "Call LLM planner",
    source: "gpt-5.5",
    detail: "Ask the model to choose the next evidence targets and rubric.",
    output: "Planner selected competitor changelogs, review sites, and GitHub issues.",
    tokens: 1280,
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
    id: "search-market-sources",
    label: "Search market sources",
    source: "Parallel + G2 + GitHub",
    detail: "Search current pages, reviews, issues, and community discussions.",
    output: "Market language is shifting toward production agent quality.",
    tokens: 3140,
  },
  {
    id: "call-llm-synthesize-brief",
    label: "Call LLM synthesis",
    source: "model",
    detail: "Ask the model to synthesize the evidence into an executive brief.",
    output: "Brief recommends leading with durable agent evals in production.",
    tokens: 1380,
  },
  {
    id: "score-research-quality",
    label: "Score research quality",
    source: "eval rubric",
    detail: "Grade source coverage, citation quality, and competitive specificity.",
    output: "Rubric score is high enough to publish and attach to the run.",
    tokens: 520,
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
  model?: string;
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
