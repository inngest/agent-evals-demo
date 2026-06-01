import { NextResponse } from "next/server";
import { inngest, querySaved } from "@/inngest/client";
import { scoreSavedQuery, type ScoreSignal } from "@/lib/scoring";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const runId =
    typeof body.runId === "string" && body.runId.length > 0
      ? body.runId
      : crypto.randomUUID();
  const signal: ScoreSignal =
    body.signal === "discarded" ? "discarded" : "saved";
  const score = await scoreSavedQuery(runId, signal);

  try {
    await inngest.send(
      querySaved.create(
        {
          runId,
          signal,
          savedAt: score.scoredAt,
          source: "booth-demo",
        },
        { id: `score:${runId}:${score.scoredAt}` }
      )
    );
  } catch {
    // The foreground score is intentionally mocked, so a missing dev server
    // must never interrupt the booth path.
  }

  return NextResponse.json({ score });
}
