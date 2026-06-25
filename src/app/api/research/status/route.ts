import { NextResponse } from "next/server";
import {
  buildResearchRunSummary,
  researchSteps,
} from "@/content/research-demo";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { isCloud } from "@/lib/demo-target";

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
  const stored = researchRunStore.get(researchRunId);
  const requestedAt = stored?.requestedAt ?? new Date().toISOString();
  const elapsed = Date.now() - new Date(requestedAt).getTime();
  const completionMs = 7600;
  const retryAtMs = 3100;
  const cloudRunId = await resolveCloudRunId(
    params.get("inngestEventId") ?? undefined,
    stored
  );
  const runId = cloudRunId ?? researchRunId;
  const traceUrl = getDeepLink("runTrace", { runId });

  if (elapsed < 400) {
    return {
      ok: true,
      status: "queued",
      hadRetry: false,
      completedSteps: 0,
      totalSteps: researchSteps.length,
      runId,
      traceUrl,
      result: null,
      error: stored?.error,
    };
  }

  if (elapsed < completionMs) {
    const completedSteps = Math.max(
      1,
      Math.min(
        researchSteps.length - 1,
        Math.floor((elapsed / completionMs) * researchSteps.length)
      )
    );

    return {
      ok: true,
      status: "running",
      hadRetry: elapsed > retryAtMs,
      completedSteps,
      totalSteps: researchSteps.length,
      runId,
      traceUrl,
      result: null,
      error: stored?.error,
    };
  }

  return {
    ok: true,
    status: "completed",
    hadRetry: true,
    completedSteps: researchSteps.length,
    totalSteps: researchSteps.length,
    runId,
    traceUrl,
    result: buildResearchRunSummary({ researchRunId }),
    error: stored?.error,
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
