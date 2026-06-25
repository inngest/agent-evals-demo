import { NextResponse } from "next/server";
import {
  defaultResearchTopic,
  seededResearchRuns,
} from "@/content/research-demo";
import {
  inngest,
  researchExperimentRequested,
  researchRunRequested,
} from "@/inngest/client";
import { authorizeDemoOpsRequest } from "@/lib/demo-ops-auth";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { researchSessionMeta } from "@/lib/research-session-meta";

export async function POST(request: Request) {
  const authorizationError = authorizeDemoOpsRequest(request, "seed");

  if (authorizationError) {
    return authorizationError;
  }

  const now = Date.now();
  const runEvents = seededResearchRuns.map((run, index) => {
    const ts = now - (seededResearchRuns.length - index) * 6 * 24 * 60 * 60 * 1000;

    return researchRunRequested.create(
      {
        researchRunId: run.researchRunId,
        topic: defaultResearchTopic,
        cadence: "seeded",
        model: run.model,
        failureStep: index % 2 === 0 ? "fetch-competitor-changelog" : undefined,
        latencyMs: 0,
        requestedAt: new Date(ts).toISOString(),
        source: "booth-demo",
      },
      {
        id: `seed-research:${run.researchRunId}`,
        ts,
        meta: researchSessionMeta(run.sessionId),
      }
    );
  });

  const experimentEvents = seededResearchRuns.map((run, index) => {
    const ts = now - (seededResearchRuns.length - index) * 6 * 24 * 60 * 60 * 1000 + 120000;

    return researchExperimentRequested.create(
      {
        experimentRunId: `seed-experiment-${index + 1}`,
        topic: defaultResearchTopic,
        corpusRunIds: seededResearchRuns.map((item) => item.researchRunId),
        requestedAt: new Date(ts).toISOString(),
        source: "booth-demo",
      },
      {
        id: `seed-research-experiment:${index + 1}`,
        ts,
        meta: researchSessionMeta(run.sessionId),
      }
    );
  });

  try {
    await inngest.send([...runEvents, ...experimentEvents]);

    return NextResponse.json({
      ok: true,
      runEvents: runEvents.length,
      experimentEvents: experimentEvents.length,
      eventsSent: runEvents.length + experimentEvents.length,
      dashboardUrl: getDeepLink("envDashboard"),
      experimentUrl: getDeepLink("experiment", {
        experimentId: "research-agent-model-bakeoff",
      }),
      seededAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        runEvents: runEvents.length,
        experimentEvents: experimentEvents.length,
        eventsSent: 0,
        dashboardUrl: getDeepLink("envDashboard"),
        error:
          error instanceof Error ? error.message : "Inngest is not reachable",
      },
      { status: 503 }
    );
  }
}
