import { researchSteps, researchSessionId } from "@/content/research-demo";
import {
  inngest,
  researchFeedbackRecorded,
  researchRunCompleted,
  researchRunRequested,
  type ResearchFeedbackSignal,
  type ResearchRunRequestedData,
} from "@/inngest/client";
import {
  resetResearchCrashState,
  runResearchCall,
  summarizeResearchRun,
} from "@/lib/mock-research";
import { isCloud } from "@/lib/demo-target";
import {
  researchSessionKey,
  researchSessionMeta,
} from "@/lib/research-session-meta";

export type ResearchAgentResult = ReturnType<typeof summarizeResearchRun> & {
  parentRunId?: string;
};

export const researchAgent = inngest.createFunction(
  {
    id: "research-agent",
    name: "Research agent",
    retries: 4,
    triggers: [researchRunRequested],
  },
  async ({ event, step, attempt, runId }): Promise<ResearchAgentResult> => {
    const data = event.data as Partial<ResearchRunRequestedData>;
    const researchRunId =
      data.researchRunId ?? `scheduled-research-${new Date().toISOString()}`;
    const model = data.model ?? "gpt-5.5";
    const failureStep =
      data.failureStep === "none"
        ? undefined
        : data.failureStep ?? "fetch-competitor-changelog";
    const latencyMs = data.latencyMs ?? 0;
    const seededQualityScore = normalizeSeededQualityScore(
      data.seededQualityScore
    );
    const seededFeedbackSignal = normalizeSeededFeedbackSignal(
      data.seededFeedbackSignal
    );
    const seededFeedbackAt = normalizeSeededFeedbackAt(data.seededFeedbackAt);
    const sessionId =
      event.meta?.sessions?.[researchSessionKey] ?? researchSessionId;

    if (attempt === 0) {
      resetResearchCrashState();
    }

    const researchContext = await step.run("load-research-context", () =>
      runResearchCall("load-research-context", {
        attempt,
        failStep: failureStep,
        latencyMs,
      })
    );
    const llmPlan = await step.run("call-llm-plan-research", () =>
      runResearchCall("call-llm-plan-research", {
        attempt,
        failStep: failureStep,
        latencyMs,
      })
    );
    const competitorChangelog = await step.run("fetch-competitor-changelog", () =>
      runResearchCall("fetch-competitor-changelog", {
        attempt,
        failStep: failureStep,
        latencyMs,
      })
    );
    const marketSources = await step.run("search-market-sources", () =>
      runResearchCall("search-market-sources", {
        attempt,
        failStep: failureStep,
        latencyMs,
      })
    );
    const brief = await step.run("call-llm-synthesize-brief", () =>
      runResearchCall("call-llm-synthesize-brief", {
        attempt,
        failStep: failureStep,
        latencyMs,
      })
    );
    const scoredBrief = await step.run("score-research-quality", () =>
      runResearchCall("score-research-quality", {
        attempt,
        failStep: failureStep,
        latencyMs,
      })
    );
    const published = await step.run("publish-brief", () =>
      runResearchCall("publish-brief", { attempt, failStep: failureStep, latencyMs })
    );
    const notified = await step.run("notify-stakeholders", () =>
      runResearchCall("notify-stakeholders", { attempt, failStep: failureStep, latencyMs })
    );

    const summary = summarizeResearchRun({
      researchRunId,
      model,
      qualityScore: seededQualityScore,
    });
    const sources = [
      researchContext,
      llmPlan,
      competitorChangelog,
      marketSources,
      brief,
      scoredBrief,
      published,
      notified,
    ].map((item) => item.source);
    const uniqueSources = [...new Set(sources)];

    if (isCloud) {
      await step.metadata("attach-research-run-metadata").update(
        {
          researchRunId,
          topic: summary.topic,
          cadence: data.cadence ?? "manual",
          model: summary.model,
          tokenCount: summary.tokenCount,
          costUsd: summary.costUsd,
          qualityScore: summary.qualityScore,
          sourceCount: uniqueSources.length,
          failureStep: failureStep ?? "none",
          source: "booth-demo",
        },
        "userland.research"
      );
    }

    // Act 2's addition in the code view: this event is the durable boundary
    // that lets the scoring/session function attach eval data to this run.
    await step.sendEvent(
      "emit-research-run-completed",
      researchRunCompleted.create(
        {
          ...summary,
          parentRunId: isCloud ? runId : researchRunId,
          sessionId,
          sources: uniqueSources,
          source: "booth-demo",
        },
        {
          id: `research-completed:${researchRunId}`,
          meta: researchSessionMeta(sessionId),
        }
      )
    );

    if (seededFeedbackSignal) {
      await step.sendEvent(
        "emit-seeded-research-feedback",
        researchFeedbackRecorded.create(
          {
            researchRunId,
            parentRunId: isCloud ? runId : researchRunId,
            sessionId,
            signal: seededFeedbackSignal,
            feedbackAt: seededFeedbackAt,
            source: "booth-demo",
          },
          {
            id: `research-feedback:${researchRunId}:${seededFeedbackSignal}`,
            ts: Date.parse(seededFeedbackAt),
            meta: researchSessionMeta(sessionId),
          }
        )
      );
    }

    return {
      ...summary,
      parentRunId: isCloud ? runId : undefined,
    };
  }
);

export const researchStepCount = researchSteps.length;

function normalizeSeededFeedbackSignal(
  value: unknown
): ResearchFeedbackSignal | undefined {
  if (value === "useful" || value === "missed-context" || value === "saved") {
    return value;
  }

  return undefined;
}

function normalizeSeededQualityScore(value: unknown): number | undefined {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, score));
}

function normalizeSeededFeedbackAt(value: unknown): string {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return value;
  }

  return new Date().toISOString();
}
