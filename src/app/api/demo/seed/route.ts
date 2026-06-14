import { NextResponse } from "next/server";
import { canonicalPrompt } from "@/content/seed-data";
import {
  inngest,
  queryRequested,
  querySaved,
} from "@/inngest/client";
import { defaultDemoFlags, normalizeDemoFlags } from "@/lib/demo-flags";
import { authorizeDemoOpsRequest } from "@/lib/demo-ops-auth";
import { getInngestRunsUrl } from "@/lib/inngest-dashboard";
import { seedScoreHistory } from "@/lib/scoring";

const DEFAULT_COUNT = 14;
const MAX_COUNT = 30;

export async function POST(request: Request) {
  const authorizationError = authorizeDemoOpsRequest(request, "seed");

  if (authorizationError) {
    return authorizationError;
  }

  const body = await request.json().catch(() => ({}));
  const count = clampCount(body.count);
  const now = Date.now();
  const dashboardUrl = getInngestRunsUrl();
  const appUrl = `${new URL(request.url).origin}/api/inngest`;
  const registration = await getDevServerRegistration(dashboardUrl, appUrl);

  const seededRuns = Array.from({ length: count }, (_, index) => {
    const clientRunId = crypto.randomUUID();
    const offsetMs = (count - index) * 4 * 60 * 1000;
    const ts = now - offsetMs;
    const shouldRetry = index > 0 && (index % 4 === 1 || index % 7 === 0);
    const flags = normalizeDemoFlags({
      ...defaultDemoFlags,
      llmOffline: shouldRetry,
      failureCount: shouldRetry ? (index % 7 === 0 ? 2 : 1) : 0,
      latencyMs: index % 3 === 0 ? 300 : 0,
    });

    return { clientRunId, flags, shouldRetry, ts };
  });
  const queryEvents = seededRuns.map((run) => {
    return queryRequested.create(
      {
        prompt: canonicalPrompt,
        flags: run.flags,
        clientRunId: run.clientRunId,
        requestedAt: new Date(run.ts).toISOString(),
        source: "booth-demo",
      },
      {
        id: `seed-query:${run.clientRunId}`,
        ts: run.ts,
      }
    );
  });

  const scorePayloads = seededRuns.map((run, index) => {
    const ts = now - (count - index) * 4 * 60 * 1000 + 90 * 1000;
    const signal = index % 5 === 0 ? "discarded" : "saved";

    return {
      runId: run.clientRunId,
      signal,
      ts,
      scoredAt: new Date(ts).toISOString(),
    } as const;
  });
  const retryDemoRuns = seededRuns.filter((run) => run.shouldRetry).length;
  const happyPathRuns = seededRuns.length - retryDemoRuns;
  const savedScoreSignals = scorePayloads.filter(
    (payload) => payload.signal === "saved"
  ).length;
  const discardedScoreSignals = scorePayloads.filter(
    (payload) => payload.signal === "discarded"
  ).length;

  const scoreEvents = scorePayloads.map((payload) =>
    querySaved.create(
      {
        runId: payload.runId,
        signal: payload.signal,
        savedAt: payload.scoredAt,
        source: "booth-demo",
      },
      {
        id: `seed-score:${payload.runId}:${payload.ts}`,
        ts: payload.ts,
      }
    )
  );

  await seedScoreHistory(
    scorePayloads.map((payload) => ({
      runId: payload.runId,
      signal: payload.signal,
      scoredAt: payload.scoredAt,
    }))
  );

  try {
    await inngest.send([...queryEvents, ...scoreEvents]);

    return NextResponse.json({
      ok: true,
      runs: queryEvents.length,
      scoreSignals: scorePayloads.length,
      durableScoreEvents: scorePayloads.length,
      retryDemoRuns,
      happyPathRuns,
      savedScoreSignals,
      discardedScoreSignals,
      eventsSent: queryEvents.length + scoreEvents.length,
      dashboardUrl,
      appUrl,
      registered: registration.registered,
      devServerUrls: registration.urls,
      seededAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        runs: 0,
        scoreSignals: scorePayloads.length,
        durableScoreEvents: scorePayloads.length,
        retryDemoRuns,
        happyPathRuns,
        savedScoreSignals,
        discardedScoreSignals,
        eventsSent: 0,
        dashboardUrl,
        appUrl,
        registered: registration.registered,
        devServerUrls: registration.urls,
        error:
          error instanceof Error
            ? error.message
            : "Inngest server unavailable",
      },
      { status: 503 }
    );
  }
}

function clampCount(value: unknown) {
  const count = Number(value ?? DEFAULT_COUNT);

  if (!Number.isFinite(count)) {
    return DEFAULT_COUNT;
  }

  return Math.max(1, Math.min(MAX_COUNT, Math.floor(count)));
}

async function getDevServerRegistration(dashboardUrl: string, appUrl: string) {
  if (!dashboardUrl.startsWith("http://localhost")) {
    return { registered: true, urls: [] as string[] };
  }

  try {
    const response = await fetch(new URL("/dev", dashboardUrl), {
      signal: AbortSignal.timeout(1000),
    });
    const body = (await response.json()) as {
      startOpts?: { urls?: string[] };
    };
    const urls = body.startOpts?.urls ?? [];

    return {
      registered: urls.includes(appUrl),
      urls,
    };
  } catch {
    return { registered: false, urls: [] as string[] };
  }
}
