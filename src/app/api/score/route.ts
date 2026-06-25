import { NextResponse } from "next/server";
import { inngest, incidentSaved, rcaFeedback } from "@/inngest/client";
import { defaultIncidentId, getIncident } from "@/content/incidents";
import { getScoreHistory, recordOutcomeScore } from "@/lib/scoring";

type ScoreSignal = "up" | "down" | "saved" | "discarded";

export async function GET() {
  const history = await getScoreHistory();

  return NextResponse.json({ history });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const signal = normalizeSignal(body.signal);
  const incidentId =
    typeof body.incidentId === "string" && getIncident(body.incidentId)
      ? body.incidentId
      : defaultIncidentId;
  const incident = getIncident(incidentId);
  const clientRunId =
    typeof body.clientRunId === "string" && body.clientRunId.length > 0
      ? body.clientRunId
      : crypto.randomUUID();
  const now = new Date().toISOString();
  let liveScore: number | null = null;
  let outcomeScore: number | null = null;

  if (signal === "up" || signal === "down") {
    liveScore = signal === "up" ? 1 : 0;

    try {
      await inngest.send(
        rcaFeedback.create(
          {
            incidentId,
            clientRunId,
            signal,
            feedbackAt: now,
            source: "booth-demo",
          },
          { id: `feedback:${clientRunId}:${now}` }
        )
      );
    } catch {
      // Feedback is foreground-safe; the booth path keeps moving if Inngest is
      // not running, while local dev shows the event when it is available.
    }
  } else {
    const citedFiles = signal === "saved" ? incident?.citedFiles ?? [] : [];
    const groundTruthFixFiles = incident?.groundTruthFixFiles ?? [];
    const outcome = await recordOutcomeScore(
      incidentId,
      clientRunId,
      citedFiles,
      groundTruthFixFiles,
      { scoredAt: now, source: "live" }
    );
    outcomeScore = outcome.score;

    try {
      await inngest.send(
        incidentSaved.create(
          {
            incidentId,
            clientRunId,
            signal,
            savedAt: now,
            source: "booth-demo",
          },
          { id: `saved:${clientRunId}:${now}` }
        )
      );
    } catch {
      // Same foreground-safe behavior as fast feedback.
    }
  }

  return NextResponse.json({
    ok: true,
    signal,
    liveScore,
    outcomeScore,
    history: await getScoreHistory(),
  });
}

function normalizeSignal(value: unknown): ScoreSignal {
  if (
    value === "up" ||
    value === "down" ||
    value === "saved" ||
    value === "discarded"
  ) {
    return value;
  }

  return "saved";
}
