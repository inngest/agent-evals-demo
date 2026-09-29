import { NextResponse } from "next/server";
import { getTimelinesForKey } from "@/inngest/middlewares/step-tracker";
import {
  aggregateVariantResults,
  collectVariantResults,
} from "@/lib/experiment-results";
import { SUPPORT_EXPERIMENT_ID } from "@/inngest/functions/support-experiment";

/**
 * Captured results for one split-test batch: every finished run's variant and
 * score, in finish order, plus the aggregate. Reports only what ran; the booth
 * owns the decision to fall back to its labelled simulation.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId") ?? undefined;
  const expected = Number(url.searchParams.get("count") ?? "8");
  const expectedRuns = Number.isFinite(expected) ? expected : 8;

  const timelines = getTimelinesForKey(batchId, SUPPORT_EXPERIMENT_ID);
  const results = collectVariantResults(timelines);

  return NextResponse.json({
    ok: true,
    batchId,
    captured: timelines.length,
    results,
    ...aggregateVariantResults(results, expectedRuns),
  });
}
