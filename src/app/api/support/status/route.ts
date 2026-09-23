import { NextResponse } from "next/server";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { isCloud } from "@/lib/demo-target";
import {
  getTimelineForDemo,
  getTimelinesForKey,
} from "@/inngest/middlewares/step-tracker";
import {
  supportRunStore,
  type StoredSupportRun,
} from "@/lib/support-run-store";

/**
 * Live timeline for one support run, as captured by stepTrackerMiddleware.
 *
 * Reports only what was observed. When nothing has been captured yet the
 * status is "pending" with a null timeline; the booth decides when that has
 * gone on too long and switches to its labelled replay. There is deliberately
 * no server-side fabrication here.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const supportRunId = params.get("supportRunId") ?? "";
  const stored = supportRunStore.get(supportRunId);
  const eventId = params.get("inngestEventId") ?? stored?.inngestEventId;
  const functionName = params.get("functionName") ?? "support-agent";

  // The A/B beat asks for the SCORING function's timeline by name, to show the
  // durable step that attached the visitor's vote. One supportRunId maps to
  // several scoring runs (run completion and feedback), so search them all
  // for the requested step rather than taking the newest.
  if (functionName !== "support-agent") {
    const stepName = params.get("stepName") ?? undefined;
    const runs = getTimelinesForKey(supportRunId, functionName);
    const matched = stepName
      ? runs.find((run) =>
          run.steps.some(
            (step) =>
              step.displayName === stepName && step.status === "completed",
          ),
        )
      : runs[runs.length - 1];

    return NextResponse.json({
      ok: true,
      status: matched?.status ?? "pending",
      timeline: matched ?? null,
    });
  }

  const timeline = getTimelineForDemo(eventId, supportRunId, functionName);
  const cloudRunId = timeline ? undefined : await resolveCloudRunId(eventId, stored);
  const runId = timeline?.runId ?? cloudRunId;

  return NextResponse.json({
    ok: true,
    status: timeline?.status ?? "pending",
    sent: stored?.sent ?? false,
    runId,
    traceUrl: getDeepLink("runTrace", { runId }),
    timeline,
  });
}

async function resolveCloudRunId(
  eventId: string | undefined,
  stored: StoredSupportRun | undefined,
): Promise<string | undefined> {
  if (!isCloud) return undefined;
  if (stored?.inngestRunId) return stored.inngestRunId;

  const signingKey = process.env.INNGEST_SIGNING_KEY;

  if (!eventId || !signingKey) return undefined;

  const base = process.env.INNGEST_API_BASE_URL || "https://api.inngest.com";

  try {
    const response = await fetch(`${base}/v1/events/${eventId}/runs`, {
      headers: { Authorization: `Bearer ${signingKey}` },
      cache: "no-store",
    });

    if (!response.ok) return undefined;

    const body = (await response.json()) as { data?: Array<{ run_id?: string }> };
    const runId = body.data?.[0]?.run_id;

    if (runId && stored) {
      stored.inngestRunId = runId;
    }

    return runId;
  } catch {
    return undefined;
  }
}
