import { NextResponse } from "next/server";
import {
  inngest,
  supportFeedbackRecorded,
  type SupportFeedbackSignal,
} from "@/inngest/client";
import { supportSessionId } from "@/content/support-demo";
import { supportSessionMeta } from "@/lib/support-session-meta";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const supportRunId =
    typeof body.supportRunId === "string" && body.supportRunId.length > 0
      ? body.supportRunId
      : crypto.randomUUID();
  const parentRunId =
    typeof body.parentRunId === "string" && body.parentRunId.length > 0
      ? body.parentRunId
      : undefined;
  const signal: SupportFeedbackSignal = body.signal === "bad" ? "bad" : "good";
  const feedbackAt = new Date().toISOString();
  let sent = true;

  try {
    await inngest.send(
      supportFeedbackRecorded.create(
        {
          supportRunId,
          parentRunId,
          sessionId: supportSessionId,
          signal,
          feedbackAt,
          source: "booth-demo",
        },
        {
          id: `support-feedback:${supportRunId}:${feedbackAt}`,
          meta: supportSessionMeta(),
        },
      ),
    );
  } catch {
    // Foreground-safe for rehearsals: the vote still renders even if the
    // target Inngest environment is not reachable. `sent` says so.
    sent = false;
  }

  return NextResponse.json({
    ok: true,
    sent,
    signal,
    score: signal === "good" ? 1 : 0,
    feedbackAt,
  });
}
