import { NextResponse } from "next/server";
import { inngest, querySaved } from "@/inngest/client";
import {
  getScoreHistory,
  scoreSavedQuery,
  type ScoreSignal,
} from "@/lib/scoring";

export async function GET() {
  const history = await getScoreHistory();

  return NextResponse.json({ history });
}

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
    // The foreground score is intentionally demo-safe, so a missing dev server
    // or Cloud outage must never interrupt the booth path.
  }

  return NextResponse.json({ score, history: await getScoreHistory() });
}
