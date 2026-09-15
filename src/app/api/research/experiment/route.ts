import { NextResponse } from "next/server";
import {
  researchSessionId,
  seededResearchRuns,
  defaultResearchTopic,
} from "@/content/research-demo";
import {
  inngest,
  researchExperimentRequested,
  type ResearchExperimentCorpusRun,
  type ResearchFeedbackSignal,
} from "@/inngest/client";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { researchSessionMeta } from "@/lib/research-session-meta";

/**
 * Default fan-out for one bakeoff click. group.experiment selects a variant per
 * run, so a single run demonstrates nothing: a traffic split needs several.
 * Eight keeps both variants present with ~99% probability at a 50/50 weight.
 */
const DEFAULT_RUN_COUNT = 8;
const MAX_RUN_COUNT = 24;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const runCount = normalizeCount(body.count);
  const batchId =
    typeof body.batchId === "string" && body.batchId.length > 0
      ? body.batchId
      : crypto.randomUUID();
  const experimentRunId =
    typeof body.experimentRunId === "string" && body.experimentRunId.length > 0
      ? body.experimentRunId
      : crypto.randomUUID();
  const requestedAt = normalizeRequestedAt(body.requestedAt);
  const providedCorpusRuns = normalizeCorpusRuns(body.corpusRuns);
  const providedCorpusRunIds = normalizeCorpusRunIds(body.corpusRunIds);
  const fallbackCorpusRuns = seededResearchRuns.map((run) => ({
    researchRunId: run.researchRunId,
    sessionId: run.sessionId,
  }));
  const corpusRuns =
    providedCorpusRuns.length > 0 ? providedCorpusRuns : fallbackCorpusRuns;
  const corpusRunIds =
    providedCorpusRunIds.length > 0
      ? providedCorpusRunIds
      : corpusRuns.map((run) => run.researchRunId);
  const sessionId = corpusRuns[0]?.sessionId ?? researchSessionId;

  const topic =
    typeof body.topic === "string" && body.topic.length > 0
      ? body.topic
      : defaultResearchTopic;

  // One array send rather than N calls: an unreachable Inngest then fails once,
  // cleanly, instead of leaving a partial fan-out half-queued.
  const events = Array.from({ length: runCount }, (_, index) =>
    researchExperimentRequested.create(
      {
        experimentRunId: `${experimentRunId}-${index}`,
        topic,
        corpusRunIds,
        corpusRuns,
        batchId,
        requestedAt,
        source: "booth-demo",
      },
      {
        id: `research-experiment:${batchId}:${index}`,
        meta: researchSessionMeta(sessionId),
      }
    )
  );

  try {
    const result = await inngest.send(events);

    return NextResponse.json({
      ok: true,
      sent: true,
      batchId,
      experimentRunId,
      runCount,
      eventIds: (result as { ids?: string[] } | undefined)?.ids ?? [],
      experimentUrl: getDeepLink("experiment", {
        experimentId: "research-agent-model-bakeoff",
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: true,
        sent: false,
        batchId,
        experimentRunId,
        runCount,
        experimentUrl: getDeepLink("experiment", {
          experimentId: "research-agent-model-bakeoff",
        }),
        error:
          error instanceof Error ? error.message : "Inngest is not reachable",
      },
      { status: 202 }
    );
  }
}

function normalizeCount(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RUN_COUNT;

  return Math.min(MAX_RUN_COUNT, Math.round(parsed));
}

function normalizeCorpusRunIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => {
    return typeof item === "string" && item.length > 0;
  });
}

function normalizeCorpusRuns(value: unknown): ResearchExperimentCorpusRun[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeCorpusRun(item))
    .filter((item): item is ResearchExperimentCorpusRun => Boolean(item));
}

function normalizeCorpusRun(value: unknown): ResearchExperimentCorpusRun | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Record<string, unknown>;
  const researchRunId = item.researchRunId;

  if (typeof researchRunId !== "string" || researchRunId.length === 0) {
    return null;
  }

  const feedbackSignal = normalizeFeedbackSignal(item.feedbackSignal);
  const feedbackScore = Number(item.feedbackScore);
  const scoredAt = item.scoredAt;

  return {
    researchRunId,
    ...(typeof item.parentRunId === "string" && item.parentRunId.length > 0
      ? { parentRunId: item.parentRunId }
      : {}),
    ...(typeof item.sessionId === "string" && item.sessionId.length > 0
      ? { sessionId: item.sessionId }
      : {}),
    ...(feedbackSignal ? { feedbackSignal } : {}),
    ...(Number.isFinite(feedbackScore)
      ? { feedbackScore: Math.max(0, Math.min(1, feedbackScore)) }
      : {}),
    ...(typeof scoredAt === "string" && Number.isFinite(Date.parse(scoredAt))
      ? { scoredAt }
      : {}),
  };
}

function normalizeFeedbackSignal(value: unknown): ResearchFeedbackSignal | undefined {
  if (value === "useful" || value === "missed-context" || value === "saved") {
    return value;
  }

  return undefined;
}

function normalizeRequestedAt(value: unknown): string {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return value;
  }

  return new Date().toISOString();
}
