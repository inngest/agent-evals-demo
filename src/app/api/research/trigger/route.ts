import { NextResponse } from "next/server";
import {
  inngest,
  researchRunRequested,
  type ResearchRunRequestedData,
} from "@/inngest/client";
import {
  defaultResearchModel,
  defaultResearchTopic,
  type ResearchModel,
  type ResearchStepId,
} from "@/content/research-demo";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { researchSessionMeta } from "@/lib/research-session-meta";

type StoredResearchRun = {
  researchRunId: string;
  requestedAt: string;
  sent: boolean;
  inngestEventId?: string;
  inngestRunId?: string;
  error?: string;
};

const globalResearchRunStore = globalThis as typeof globalThis & {
  __researchRuns?: Map<string, StoredResearchRun>;
};

const researchRunStore =
  globalResearchRunStore.__researchRuns ??
  (globalResearchRunStore.__researchRuns = new Map<string, StoredResearchRun>());

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const researchRunId =
    typeof body.researchRunId === "string" && body.researchRunId.length > 0
      ? body.researchRunId
      : crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  const model = normalizeModel(body.model);
  const failureStep = normalizeFailureStep(body.failureStep);
  const latencyMs = normalizeLatency(body.latencyMs);
  const eventId = `research:${researchRunId}`;
  const dashboardUrl = getDeepLink("envDashboard");
  const traceUrl = getDeepLink("runTrace", { runId: researchRunId });

  const data: ResearchRunRequestedData = {
    researchRunId,
    topic:
      typeof body.topic === "string" && body.topic.length > 0
        ? body.topic
        : defaultResearchTopic,
    cadence: "manual",
    model,
    failureStep,
    latencyMs,
    requestedAt,
    source: "booth-demo",
  };

  try {
    const result = await inngest.send(
      researchRunRequested.create(data, {
        id: eventId,
        meta: researchSessionMeta(),
      })
    );
    const ids = (result as { ids?: string[] } | undefined)?.ids;
    const inngestEventId =
      Array.isArray(ids) && ids.length > 0 ? ids[0] : undefined;

    researchRunStore.set(researchRunId, {
      researchRunId,
      requestedAt,
      sent: true,
      inngestEventId,
    });

    return NextResponse.json({
      ok: true,
      sent: true,
      researchRunId,
      eventId,
      inngestEventId,
      dashboardUrl,
      traceUrl,
      runId: researchRunId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Inngest is not reachable";

    researchRunStore.set(researchRunId, {
      researchRunId,
      requestedAt,
      sent: false,
      error: message,
    });

    return NextResponse.json(
      {
        ok: true,
        sent: false,
        researchRunId,
        eventId,
        dashboardUrl,
        traceUrl,
        runId: researchRunId,
        error: message,
      },
      { status: 202 }
    );
  }
}

function normalizeModel(value: unknown): ResearchModel {
  return value === "claude-opus-4.8" ? "claude-opus-4.8" : defaultResearchModel;
}

function normalizeFailureStep(value: unknown): ResearchStepId | undefined {
  return value === "none" ? undefined : "fetch-competitor-changelog";
}

function normalizeLatency(value: unknown): number {
  const latency = Number(value ?? 0);

  if (!Number.isFinite(latency)) return 0;

  return Math.max(0, Math.min(2000, Math.floor(latency)));
}
