import { NextResponse } from "next/server";
import { inngest, supportExperimentRequested } from "@/inngest/client";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { ticketForExperimentRun } from "@/lib/experiment-results";
import { supportSessionMeta } from "@/lib/support-session-meta";
import { SUPPORT_EXPERIMENT_ID } from "@/inngest/functions/support-experiment";

/**
 * Default fan-out for one split-test click. group.experiment selects a variant
 * per run, so a single run demonstrates nothing: a traffic split needs several.
 * Eight keeps both variants present with ~99% probability at a 50/50 weight.
 */
const DEFAULT_RUN_COUNT = 8;
const MAX_RUN_COUNT = 24;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const runCount = normalizeCount(body.count);
  const batchId =
    typeof body.batchId === "string" && body.batchId.length > 0
      ? body.batchId
      : crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  const experimentUrl = getDeepLink("experiment", {
    experimentId: SUPPORT_EXPERIMENT_ID,
  });

  // One array send rather than N calls: an unreachable Inngest then fails once,
  // cleanly, instead of leaving a partial fan-out half-queued.
  const events = Array.from({ length: runCount }, (_, index) =>
    supportExperimentRequested.create(
      {
        experimentRunId: `${batchId}-${index}`,
        ticketId: ticketForExperimentRun(index),
        batchId,
        requestedAt,
        source: "booth-demo",
      },
      {
        id: `support-experiment:${batchId}:${index}`,
        meta: supportSessionMeta(),
      },
    ),
  );

  try {
    await inngest.send(events);

    return NextResponse.json({
      ok: true,
      sent: true,
      batchId,
      runCount,
      experimentUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: true,
        sent: false,
        batchId,
        runCount,
        experimentUrl,
        error:
          error instanceof Error ? error.message : "Inngest is not reachable",
      },
      { status: 202 },
    );
  }
}

function normalizeCount(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RUN_COUNT;

  return Math.min(MAX_RUN_COUNT, Math.round(parsed));
}
