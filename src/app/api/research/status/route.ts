import { NextResponse } from "next/server";
import {
  buildResearchRunSummary,
  researchSteps,
} from "@/content/research-demo";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { isCloud } from "@/lib/demo-target";
import { getTimelineForDemo } from "@/inngest/middlewares/step-tracker";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json(await buildStatus(url.searchParams));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  return NextResponse.json(await buildStatus(params));
}

async function buildStatus(params: URLSearchParams) {
  const researchRunId = params.get("researchRunId") ?? "demo-research-run";
  const useSandbox = params.get("useSandbox") === "true";
  const stored = researchRunStore.get(researchRunId);
  const requestedAt = stored?.requestedAt ?? new Date().toISOString();
  const elapsed = Date.now() - new Date(requestedAt).getTime();
  const totalSteps = researchSteps.length + (useSandbox ? 1 : 0);
  // The sandbox beat (simulated locally, real in cloud) adds a beat of work.
  const completionMs = useSandbox ? 8800 : 7600;
  const retryAtMs = 3100;
  const eventIdParam = params.get("inngestEventId") ?? undefined;
  const cloudRunId = await resolveCloudRunId(eventIdParam, stored);
  const runId = cloudRunId ?? researchRunId;
  const traceUrl = getDeepLink("runTrace", { runId });

  // Real step data captured by stepTrackerMiddleware. When present it is
  // authoritative (honest step names, retries, memoized replays); the
  // timing simulation below is the fallback when no run has been observed.
  const timeline = getTimelineForDemo(
    eventIdParam ?? stored?.inngestEventId,
    researchRunId,
  );

  if (timeline) {
    const completedSteps = timeline.steps.filter(
      (step) => step.status === "completed",
    ).length;
    const hadRetry = timeline.steps.some(
      (step) => step.memoized || step.status === "retrying",
    );

    if (timeline.status === "failed") {
      return {
        ok: true,
        status: "failed",
        hadRetry,
        completedSteps,
        totalSteps: timeline.steps.length,
        runId: timeline.runId,
        traceUrl: getDeepLink("runTrace", { runId: timeline.runId }),
        result: null,
        error: "Run failed after exhausting retries",
        timeline,
      };
    }

    if (timeline.status === "completed") {
      return {
        ok: true,
        status: "completed",
        hadRetry,
        completedSteps: timeline.steps.length,
        totalSteps: timeline.steps.length,
        runId: timeline.runId,
        traceUrl: getDeepLink("runTrace", { runId: timeline.runId }),
        result: completedResult(researchRunId, useSandbox),
        timeline,
      };
    }

    return {
      ok: true,
      status: "running",
      hadRetry,
      completedSteps,
      totalSteps: timeline.steps.length,
      runId: timeline.runId,
      traceUrl: getDeepLink("runTrace", { runId: timeline.runId }),
      result: null,
      error: stored?.error,
      timeline,
    };
  }

  if (elapsed < 400) {
    return {
      ok: true,
      status: "queued",
      hadRetry: false,
      completedSteps: 0,
      totalSteps,
      runId,
      traceUrl,
      result: null,
      error: stored?.error,
    };
  }

  if (elapsed < completionMs) {
    const completedSteps = Math.max(
      1,
      Math.min(totalSteps - 1, Math.floor((elapsed / completionMs) * totalSteps))
    );

    return {
      ok: true,
      status: "running",
      hadRetry: elapsed > retryAtMs,
      completedSteps,
      totalSteps,
      runId,
      traceUrl,
      result: null,
      error: stored?.error,
    };
  }

  const result = completedResult(researchRunId, useSandbox);

  return {
    ok: true,
    status: "completed",
    hadRetry: true,
    completedSteps: totalSteps,
    totalSteps,
    runId,
    traceUrl,
    result,
    error: stored?.error,
  };
}

function completedResult(researchRunId: string, useSandbox: boolean) {
  const result = buildResearchRunSummary({ researchRunId });

  return {
    ...result,
    ...(useSandbox
      ? {
          sandbox: {
            mode: isCloud ? "sandbox" : "simulated",
            sandboxId: `sbx-${isCloud ? "cloud" : "simulated"}-${researchRunId.slice(0, 8)}`,
            exitCode: 0,
            totalLaunches: 7,
            competitorCount: 3,
            topThemes: ["evals", "queues", "workflows"],
          },
        }
      : {}),
  };
}

async function resolveCloudRunId(
  eventIdParam: string | undefined,
  stored: StoredResearchRun | undefined
): Promise<string | undefined> {
  if (!isCloud) return undefined;
  if (stored?.inngestRunId) return stored.inngestRunId;

  const eventId = eventIdParam || stored?.inngestEventId;
  const signingKey = process.env.INNGEST_SIGNING_KEY;

  if (!eventId || !signingKey) return undefined;

  const base = process.env.INNGEST_API_BASE_URL || "https://api.inngest.com";

  try {
    const response = await fetch(`${base}/v1/events/${eventId}/runs`, {
      headers: { Authorization: `Bearer ${signingKey}` },
      cache: "no-store",
    });

    if (!response.ok) return undefined;

    const body = (await response.json()) as { data?: Array<{ run_id?: string }> };
    const runId = body.data?.[0]?.run_id;

    if (runId && stored) {
      stored.inngestRunId = runId;
    }

    return runId;
  } catch {
    return undefined;
  }
}
