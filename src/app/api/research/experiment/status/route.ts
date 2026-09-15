import { NextResponse } from "next/server";
import { getTimelinesForKey } from "@/inngest/middlewares/step-tracker";
import {
  aggregateExperimentTimelines,
  normalizeCorpusRuns,
  scoreModelAgainstCorpus,
  summarizeCorpus,
  EXPERIMENT_MODELS,
  type ExperimentAggregate,
} from "@/lib/experiment-results";

/**
 * Aggregated results for one bakeoff batch.
 *
 * The previous Evaluate stage fired the experiment and offered a dashboard
 * link, so the outcome of the comparison never appeared in the demo itself.
 * This reads back the captured variant steps for the batch and returns the
 * per-variant rows the UI renders.
 */

const BAKEOFF_FUNCTION = "research-agent-model-bakeoff";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId") ?? undefined;
  const expected = Number(url.searchParams.get("count") ?? "8");
  const expectedRuns = Number.isFinite(expected) ? expected : 8;

  const timelines = getTimelinesForKey(batchId, BAKEOFF_FUNCTION);
  const aggregate = aggregateExperimentTimelines(timelines, expectedRuns);

  // Nothing captured at all means Inngest never ran the batch. Fall back to the
  // same maths the function uses so the comparison still renders, clearly
  // labeled, rather than leaving an empty panel on screen.
  if (timelines.length === 0) {
    return NextResponse.json({
      ok: true,
      batchId,
      simulated: true,
      ...simulatedAggregate(expectedRuns),
    });
  }

  return NextResponse.json({
    ok: true,
    batchId,
    simulated: false,
    ...aggregate,
  });
}

function simulatedAggregate(expectedRuns: number): ExperimentAggregate {
  const corpusSummary = summarizeCorpus(normalizeCorpusRuns(undefined, []));
  // Deterministic split so a rehearsal looks the same every time.
  const split = [Math.ceil(expectedRuns / 2), Math.floor(expectedRuns / 2)];

  const variants = EXPERIMENT_MODELS.map((model, index) => {
    const scored = scoreModelAgainstCorpus(model, corpusSummary);

    return {
      variant: model,
      runs: split[index] ?? 0,
      qualityScore: scored.qualityScore,
      costUsd: scored.costUsd,
      tokenCount: scored.tokenCount,
    };
  });

  const ranked = [...variants].sort((a, b) => b.qualityScore - a.qualityScore);
  const winner = ranked[0];
  const runnerUp = ranked[1];

  return {
    variants,
    winner: winner?.variant ?? null,
    qualityDelta:
      winner && runnerUp
        ? Number((winner.qualityScore - runnerUp.qualityScore).toFixed(3))
        : 0,
    costDelta:
      winner && runnerUp && runnerUp.costUsd > 0
        ? Number(
            ((winner.costUsd - runnerUp.costUsd) / runnerUp.costUsd).toFixed(3),
          )
        : 0,
    completedRuns: expectedRuns,
    totalRuns: expectedRuns,
  };
}
