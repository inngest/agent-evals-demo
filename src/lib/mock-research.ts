import { RetryAfterError } from "inngest";
import {
  buildResearchRunSummary,
  getResearchStep,
  researchSteps,
  type ResearchModel,
  type ResearchRunSummary,
  type ResearchStepId,
} from "@/content/research-demo";
import { startPostSpan, startGenAISpan } from "./otel";
import { recordStepInput } from "@/inngest/middlewares/step-tracker";
import {
  completeChat,
  isOpenRouterConfigured,
  OPENROUTER_MODEL,
} from "@/lib/openrouter";

type ResearchCallOptions = {
  attempt: number;
  failStep?: ResearchStepId;
  latencyMs?: number;
  /** Executor run id, used to record the step input on the live timeline */
  runId?: string;
  /** Meaningful input payload for this step, shown in the demo timeline */
  input?: unknown;
};

// The 503 beat fires exactly once per executor run id. Keying by runId (not a
// module flag with an attempt-based reset) is stable across the function
// re-executions Inngest performs to retry the failed step, in both local dev
// and cloud mode: the same run never re-fails, the next run fails fresh.
const crashedRuns = new Set<string>();

export async function runResearchCall(
  id: ResearchStepId,
  options: ResearchCallOptions,
) {
  const step = getResearchStep(id);
  const latency = Math.max(0, Math.min(options.latencyMs ?? 0, 2000));

  if (options.runId && options.input !== undefined) {
    recordStepInput(options.runId, id, options.input);
  }

  const useOpenRouter = id.match(/call-/) && isOpenRouterConfigured();

  let span = null;
  if (id.match(/call-/)) {
    span = await startGenAISpan(
      useOpenRouter ? `chat ${OPENROUTER_MODEL}` : "chat claude-opus-4-8",
      {},
    );
  } else if (id.match(/fetch-/)) {
    span = await startPostSpan("https://api.acme.com");
  }

  if (latency > 0 && !useOpenRouter) {
    await new Promise((resolve) => setTimeout(resolve, latency));
  }

  // Fire the beat once per run, regardless of how the executor reports
  // attempts across step-retry re-invocations.
  const beatKey = options.runId ?? "anonymous";
  const fireFailureBeat =
    options.failStep === id &&
    options.attempt === 0 &&
    !crashedRuns.has(beatKey);

  if (span) {
    if (fireFailureBeat) {
      span.setAttribute("http.response.status_code", 503);
    }
    await span.end();
  }

  if (fireFailureBeat) {
    if (crashedRuns.size > 500) crashedRuns.clear();
    crashedRuns.add(beatKey);
    throw new RetryAfterError(
      `${step.source} returned 503 while reading ${step.label}`,
      "16s",
    );
  }

  if (useOpenRouter) {
    return runRealModelCall(id, step.label, options);
  }

  return {
    id,
    label: step.label,
    source: step.source,
    detail: step.detail,
    output: step.output,
    tokens: step.tokens,
  };
}

const modelCallIntents: Partial<Record<ResearchStepId, { system: string }>> = {
  "call-llm-plan-research": {
    system:
      "You are a competitive research planner. Given a research topic, list the 3-5 most valuable evidence targets to check next and the rubric dimensions to grade. Be terse and concrete.",
  },
  "call-llm-synthesize-brief": {
    system:
      "You are a competitive intelligence analyst. Write a 3-paragraph executive brief: what changed, why it matters, and the recommended response. Be decisive and concrete.",
  },
};

async function runRealModelCall(
  id: ResearchStepId,
  label: string,
  options: ResearchCallOptions,
) {
  const intent = modelCallIntents[id] ?? {
    system: "You are a helpful research assistant. Be terse and concrete.",
  };
  const input = (options.input ?? {}) as Record<string, unknown>;
  const prompt =
    Object.entries(input)
      .map(([key, value]) =>
        `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
      )
      .join("\n") || "Research topic: competitive intelligence";
  const completion = await completeChat({
    system: intent.system,
    prompt,
  });

  return {
    id,
    label,
    source: `openrouter · ${completion.model}`,
    detail: `Real model call via OpenRouter (${completion.usage.totalTokens} tokens).`,
    output: completion.text,
    tokens: completion.usage.totalTokens,
  };
}

export function measureResearchQuality(args: {
  model: string;
  sources: string[];
  tokenCount: number;
}): number {
  const sourceCoverage = Math.min(1, args.sources.length / 12);
  const tokenPenalty = args.tokenCount > 15000 ? 0.04 : 0;
  const modelLift = args.model.includes("gpt") ? 0.08 : 0.02;

  return clamp01(0.74 + sourceCoverage * 0.12 + modelLift - tokenPenalty);
}

export function summarizeResearchRun(args: {
  researchRunId: string;
  model: string;
  completedAt?: string;
  qualityScore?: number;
}): ResearchRunSummary {
  const sources = [...new Set(researchSteps.map((step) => step.source))];
  const tokenCount = researchSteps.reduce((sum, step) => sum + step.tokens, 0);
  const qualityScore = measureResearchQuality({
    model: args.model,
    sources,
    tokenCount,
  });

  return buildResearchRunSummary({
    researchRunId: args.researchRunId,
    model: args.model,
    completedAt: args.completedAt,
    qualityScore: args.qualityScore ?? qualityScore,
  });
}

export function modelExperimentResult(model: string) {
  if (model.includes("gpt")) {
    return {
      model: "gpt-5.5" as const,
      qualityScore: 0.89,
      tokenCount: 13180,
      costUsd: 0.41,
      latencyMs: 1840,
    };
  }

  return {
    model: "claude-opus-4.8" as const,
    qualityScore: 0.83,
    tokenCount: 16840,
    costUsd: 0.56,
    latencyMs: 2210,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(1, value));
}
