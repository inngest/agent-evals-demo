import { NextResponse } from "next/server";
import {
  inngest,
  researchOutcomeRecorded,
  type ResearchOutcome,
} from "@/inngest/client";
import { researchSessionId } from "@/content/research-demo";
import { researchSessionMeta } from "@/lib/research-session-meta";
import { RESEARCH_OUTCOME_SCORE_NAME } from "@/inngest/scorers/research-outcome-scorer";

/**
 * Records the real-world outcome of a research brief, observed well after the
 * run finished. This is the trigger for the deferred-scoring beat: the score
 * lands on the ORIGINAL run, timestamped weeks later, via a real
 * createScorer/defer pair rather than being written inline.
 */

/** How far in the future the demo claims the outcome was observed. */
const DEFAULT_DAYS_LATER = 21;

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
  const outcome = normalizeOutcome(body.outcome);
  const daysLater = normalizeDaysLater(body.daysLater);
  const observedAt = new Date(
    Date.now() + daysLater * 24 * 60 * 60 * 1000,
  ).toISOString();

  let sent = true;

  try {
    await inngest.send(
      researchOutcomeRecorded.create(
        {
          researchRunId,
          parentRunId,
          sessionId: researchSessionId,
          outcome,
          daysLater,
          observedAt,
          source: "booth-demo",
        },
        {
          id: `research-outcome:${researchRunId}:${outcome}`,
          meta: researchSessionMeta(),
        },
      ),
    );
  } catch {
    // Foreground-safe for rehearsals, matching /api/research/signal: the
    // deferred-scoring story still renders when Inngest is unreachable.
    sent = false;
  }

  return NextResponse.json({
    ok: true,
    sent,
    researchRunId,
    outcome,
    daysLater,
    observedAt,
    scoreName: RESEARCH_OUTCOME_SCORE_NAME,
    score: outcome === "shipped" ? 1 : 0,
  });
}

function normalizeOutcome(value: unknown): ResearchOutcome {
  return value === "wrong" ? "wrong" : "shipped";
}

function normalizeDaysLater(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAYS_LATER;

  return Math.min(365, Math.round(parsed));
}
