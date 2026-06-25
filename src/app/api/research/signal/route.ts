import { NextResponse } from "next/server";
import { inngest, researchFeedbackRecorded } from "@/inngest/client";
import { researchSessionId } from "@/content/research-demo";
import { researchSessionMeta } from "@/lib/research-session-meta";

type FeedbackSignal = "useful" | "missed-context" | "saved";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const researchRunId =
    typeof body.researchRunId === "string" && body.researchRunId.length > 0
      ? body.researchRunId
      : crypto.randomUUID();
  const parentRunId =
    typeof body.parentRunId === "string" && body.parentRunId.length > 0
      ? body.parentRunId
      : undefined;
  const signal = normalizeSignal(body.signal);
  const feedbackAt = new Date().toISOString();

  try {
    await inngest.send(
      researchFeedbackRecorded.create(
        {
          researchRunId,
          parentRunId,
          sessionId: researchSessionId,
          signal,
          feedbackAt,
          source: "booth-demo",
        },
        {
          id: `research-feedback:${researchRunId}:${feedbackAt}`,
          meta: researchSessionMeta(),
        }
      )
    );
  } catch {
    // Foreground-safe for rehearsals: the code/platform story still renders
    // even if the target Inngest environment is not reachable.
  }

  return NextResponse.json({
    ok: true,
    signal,
    score: signal === "missed-context" ? 0 : 1,
    feedbackAt,
  });
}

function normalizeSignal(value: unknown): FeedbackSignal {
  if (value === "missed-context" || value === "saved") {
    return value;
  }

  return "useful";
}
