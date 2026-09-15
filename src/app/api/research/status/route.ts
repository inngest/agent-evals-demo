import { NextResponse } from "next/server";
import {
  buildResearchRunSummary,
  researchSteps,
} from "@/content/research-demo";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { isCloud } from "@/lib/demo-target";
import {
  getTimelineForDemo,
  getTimelinesForKey,
} from "@/inngest/middlewares/step-tracker";
import {
  buildOfflineTimeline,
  offlineTimelineTotalMs,
} from "@/lib/offline-timeline";

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
  // An unknown run means the store never saw it, or the process restarted and
  // lost it. Anchor its start time on first sight, otherwise requestedAt is
  // recomputed on every poll, elapsed is always ~0, and the offline timeline
  // freezes at "queued" instead of progressing.
  const stored = researchRunStore.get(researchRunId) ?? adoptUnknownRun(researchRunId);
  const requestedAt = stored.requestedAt;
  const elapsed = Date.now() - new Date(requestedAt).getTime();
  // The sandbox beat (simulated locally, real in cloud) adds a beat of work.
  const totalSteps = researchSteps.length + (useSandbox ? 1 : 0);
  const eventIdParam = params.get("inngestEventId") ?? undefined;
  const cloudRunId = await resolveCloudRunId(eventIdParam, stored);
  const runId = cloudRunId ?? researchRunId;
  const traceUrl = getDeepLink("runTrace", { runId });

  // Real step data captured by stepTrackerMiddleware. When present it is
  // authoritative (honest step names, retries, memoized replays). When absent
  // we fall through to the labeled offline timeline below.
  // The Evaluate stage asks for the SCORING function's timeline by name, to
  // show the durable step that attached a score. Defaults to the agent run.
  const functionName = params.get("functionName") ?? "research-agent";
  const timeline = getTimelineForDemo(
    eventIdParam ?? stored?.inngestEventId,
    researchRunId,
    functionName,
  );

  // A scoring run has no offline rehearsal equivalent: either the step was
  // captured or it was not. Report it plainly instead of falling through to
  // the research-agent fallback below, which would be the wrong shape.
  if (functionName !== "research-agent") {
    // One researchRunId maps to SEVERAL scoring runs - the feedback signal and
    // the deferred outcome both trigger research-agent-score-run. Searching
    // every run under the key, rather than the newest, is what stops the first
    // score's step from being masked by the second's run.
    const scoringRuns = getTimelinesForKey(researchRunId, functionName);
    const stepName = params.get("stepName") ?? undefined;
    const matched = stepName
      ? scoringRuns.find((run) =>
          run.steps.some(
            (step) =>
              step.displayName === stepName && step.status === "completed",
          ),
        )
      : scoringRuns[scoringRuns.length - 1];
    const resolved = matched ?? timeline ?? null;

    return {
      ok: true,
      status: resolved?.status ?? "running",
      hadRetry: false,
      completedSteps:
        resolved?.steps.filter((step) => step.status === "completed").length ??
        0,
      totalSteps: resolved?.steps.length ?? 0,
      runId: resolved?.runId ?? runId,
      traceUrl: getDeepLink("runTrace", { runId: resolved?.runId ?? runId }),
      result: null,
      timeline: resolved,
    };
  }

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

  // Nothing has been observed for this run: Inngest never acknowledged it, or
  // the process restarted and lost the in-memory store. Render a clearly
  // labeled rehearsal timeline instead of inventing a completed run. It must
  // never claim a clean completion without the simulated flag travelling with
  // it - see src/lib/offline-timeline.ts for why.
  const failureArmed = params.get("failureStep")
    ? params.get("failureStep") !== "none"
    : true;
  const offlineTimeline = buildOfflineTimeline({
    runId,
    elapsedMs: elapsed,
    useSandbox,
    failureArmed,
    startedAt: new Date(requestedAt).getTime(),
  });
  const offlineComplete = offlineTimeline.status === "completed";
  const offlineTotalMs = offlineTimelineTotalMs(useSandbox);

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
      timeline: offlineTimeline,
      simulated: true,
    };
  }

  return {
    ok: true,
    status: offlineComplete ? "completed" : "running",
    hadRetry: offlineTimeline.steps.some(
      (step) => step.memoized || step.status === "retrying",
    ),
    completedSteps: offlineTimeline.steps.filter(
      (step) => step.status === "completed",
    ).length,
    totalSteps: Math.max(totalSteps, offlineTimeline.steps.length),
    runId,
    traceUrl,
    result: offlineComplete
      ? completedResult(researchRunId, useSandbox, { simulated: true })
      : null,
    error: stored?.error,
    timeline: offlineTimeline,
    simulated: true,
    elapsedMs: elapsed,
    expectedMs: offlineTotalMs,
  };
}

/**
 * Registers a first-seen timestamp for a run the store has no record of, so
 * elapsed time advances across polls. Marked `sent: false`: nothing here
 * implies Inngest ever accepted the run.
 */
function adoptUnknownRun(researchRunId: string): StoredResearchRun {
  const adopted: StoredResearchRun = {
    researchRunId,
    requestedAt: new Date().toISOString(),
    sent: false,
  };

  researchRunStore.set(researchRunId, adopted);

  return adopted;
}

function completedResult(
  researchRunId: string,
  useSandbox: boolean,
  { simulated = false }: { simulated?: boolean } = {},
) {
  const result = buildResearchRunSummary({ researchRunId });
  // In the offline path no sandbox was created, in either mode. Reporting
  // "sandbox" there would put a claim on screen that nothing backs.
  const sandboxMode = isCloud && !simulated ? "sandbox" : "simulated";

  return {
    ...result,
    ...(useSandbox
      ? {
          sandbox: {
            mode: sandboxMode,
            sandboxId: `sbx-${sandboxMode}-${researchRunId.slice(0, 8)}`,
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
