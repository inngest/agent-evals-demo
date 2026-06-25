import { NextResponse } from "next/server";
import {
  researchSessionId,
  seededResearchRuns,
  defaultResearchTopic,
} from "@/content/research-demo";
import { inngest, researchExperimentRequested } from "@/inngest/client";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { researchSessionMeta } from "@/lib/research-session-meta";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const experimentRunId =
    typeof body.experimentRunId === "string" && body.experimentRunId.length > 0
      ? body.experimentRunId
      : crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  const corpusRunIds = seededResearchRuns.map((run) => run.researchRunId);

  try {
    const result = await inngest.send(
      researchExperimentRequested.create(
        {
          experimentRunId,
          topic:
            typeof body.topic === "string" && body.topic.length > 0
              ? body.topic
              : defaultResearchTopic,
          corpusRunIds,
          requestedAt,
          source: "booth-demo",
        },
        {
          id: `research-experiment:${experimentRunId}`,
          meta: researchSessionMeta(researchSessionId),
        }
      )
    );

    return NextResponse.json({
      ok: true,
      sent: true,
      experimentRunId,
      eventIds: (result as { ids?: string[] } | undefined)?.ids ?? [],
      experimentUrl: getDeepLink("experiment", {
        experimentId: "competitive-research-model-bakeoff",
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: true,
        sent: false,
        experimentRunId,
        experimentUrl: getDeepLink("experiment", {
          experimentId: "competitive-research-model-bakeoff",
        }),
        error:
          error instanceof Error ? error.message : "Inngest is not reachable",
      },
      { status: 202 }
    );
  }
}
