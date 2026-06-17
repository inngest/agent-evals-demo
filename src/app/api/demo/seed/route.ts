import { NextResponse } from "next/server";
import { incidents } from "@/content/incidents";
import { seededScores } from "@/content/seed-data";
import { incidentReceived, incidentSaved, inngest } from "@/inngest/client";
import { defaultDemoFlags, normalizeDemoFlags } from "@/lib/demo-flags";
import { authorizeDemoOpsRequest } from "@/lib/demo-ops-auth";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { seedScoreHistory } from "@/lib/scoring";

const DEFAULT_COUNT = 12;
const MAX_COUNT = 24;

export async function POST(request: Request) {
  const authorizationError = authorizeDemoOpsRequest(request, "seed");

  if (authorizationError) {
    return authorizationError;
  }

  const body = await request.json().catch(() => ({}));
  const count = clampCount(body.count);
  const now = Date.now();
  const selectedIncidents = Array.from({ length: count }, (_, index) => {
    return incidents[index % incidents.length];
  });
  const appUrl = `${new URL(request.url).origin}/api/inngest`;
  const dashboardUrl = getDeepLink("envDashboard");
  const registration = await getDevServerRegistration(dashboardUrl, appUrl);

  const runPayloads = selectedIncidents.map((incident, index) => {
    const ts = now - (selectedIncidents.length - index) * 5 * 60 * 1000;
    const clientRunId = `seed-${incident.id.toLowerCase()}-${index}`;
    const shouldRetry = index % 3 === 0;

    return {
      incident,
      clientRunId,
      ts,
      shouldRetry,
      flags: normalizeDemoFlags({
        ...defaultDemoFlags,
        llmOffline: false,
        failureCount: shouldRetry ? 1 : 0,
        latencyMs: index % 4 === 0 ? 250 : 0,
      }),
    };
  });

  const incidentEvents = runPayloads.map((payload) =>
    incidentReceived.create(
      {
        incidentId: payload.incident.id,
        title: payload.incident.title,
        body: payload.incident.body,
        flags: payload.flags,
        clientRunId: payload.clientRunId,
        requestedAt: new Date(payload.ts).toISOString(),
        source: "booth-demo",
      },
      { id: `seed-incident:${payload.clientRunId}`, ts: payload.ts }
    )
  );

  const savedPayloads = runPayloads.map((payload, index) => {
    const signal = index % 5 === 2 ? "discarded" : "saved";
    const ts = payload.ts + 90 * 1000;
    return {
      incident: payload.incident,
      clientRunId: payload.clientRunId,
      signal,
      ts,
      scoredAt: new Date(ts).toISOString(),
    } as const;
  });

  const savedEvents = savedPayloads.map((payload) =>
    incidentSaved.create(
      {
        incidentId: payload.incident.id,
        clientRunId: payload.clientRunId,
        signal: payload.signal,
        savedAt: payload.scoredAt,
        source: "booth-demo",
      },
      { id: `seed-saved:${payload.clientRunId}:${payload.ts}`, ts: payload.ts }
    )
  );

  await seedScoreHistory(
    seededScores.slice(0, Math.min(seededScores.length, count)).map((score) => ({
      incidentId: score.incidentId,
      clientRunId: score.runId,
      score: score.outcomeScore,
      scoredAt: score.scoredAt,
    }))
  );

  const retryDemoRuns = runPayloads.filter((run) => run.shouldRetry).length;
  const happyPathRuns = runPayloads.length - retryDemoRuns;
  const savedScoreSignals = savedPayloads.filter(
    (payload) => payload.signal === "saved"
  ).length;
  const discardedScoreSignals = savedPayloads.filter(
    (payload) => payload.signal === "discarded"
  ).length;

  try {
    await inngest.send([...incidentEvents, ...savedEvents]);

    return NextResponse.json({
      ok: true,
      runs: incidentEvents.length,
      scoreSignals: savedPayloads.length,
      durableScoreEvents: savedPayloads.length,
      retryDemoRuns,
      happyPathRuns,
      savedScoreSignals,
      discardedScoreSignals,
      eventsSent: incidentEvents.length + savedEvents.length,
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
        scoreSignals: savedPayloads.length,
        durableScoreEvents: savedPayloads.length,
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
