import {
  buildResearchRunSummary,
  getResearchStep,
  researchSteps,
  type ResearchModel,
  type ResearchRunSummary,
  type ResearchStepId,
} from "@/content/research-demo";

type ResearchCallOptions = {
  attempt: number;
  failStep?: ResearchStepId;
  latencyMs?: number;
};

let hasCrashed = false;

export function resetResearchCrashState(): void {
  hasCrashed = false;
}

export async function runResearchCall(
  id: ResearchStepId,
  options: ResearchCallOptions
) {
  const step = getResearchStep(id);
  const latency = Math.max(0, Math.min(options.latencyMs ?? 0, 2000));

  if (latency > 0) {
    await new Promise((resolve) => setTimeout(resolve, latency));
  }

  if (options.failStep === id && !hasCrashed) {
    hasCrashed = true;
    throw new Error(`${step.source} returned 503 while reading ${step.label}`);
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

export function evaluateResearchQuality(args: {
  model: ResearchModel;
  sources: string[];
  tokenCount: number;
}): number {
  const sourceCoverage = Math.min(1, args.sources.length / 12);
  const tokenPenalty = args.tokenCount > 15000 ? 0.04 : 0;
  const modelLift = args.model === "gpt-5.5" ? 0.08 : 0.02;

  return clamp01(0.74 + sourceCoverage * 0.12 + modelLift - tokenPenalty);
}

export function summarizeResearchRun(args: {
  researchRunId: string;
  model: ResearchModel;
  completedAt?: string;
}): ResearchRunSummary {
  const sources = [...new Set(researchSteps.map((step) => step.source))];
  const tokenCount = researchSteps.reduce((sum, step) => sum + step.tokens, 0);
  const qualityScore = evaluateResearchQuality({
    model: args.model,
    sources,
    tokenCount,
  });

  return buildResearchRunSummary({
    researchRunId: args.researchRunId,
    model: args.model,
    completedAt: args.completedAt,
    qualityScore,
  });
}

export function modelExperimentResult(model: ResearchModel) {
  if (model === "gpt-5.5") {
    return {
      model,
      qualityScore: 0.89,
      tokenCount: 13180,
      costUsd: 0.41,
      latencyMs: 1840,
    };
  }

  return {
    model,
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
