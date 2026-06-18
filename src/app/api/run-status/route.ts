import { NextResponse } from "next/server";
import { defaultIncidentId, getIncident } from "@/content/incidents";
import { localizationScore } from "@/lib/scoring";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { isCloud } from "@/lib/demo-target";
import type { RunStatusResponse, TriageResult } from "@/components/demo/types";

type StoredRun = {
  incidentId: string;
  clientRunId: string;
  eventId: string;
  requestedAt: string;
  sent: boolean;
  error?: string;
  // Real Inngest internal event id (from inngest.send) + the run id resolved
  // from it via the REST API in cloud mode. Lets the live run deep-link to its
  // exact trace instead of the client-minted id.
  inngestEventId?: string;
  inngestRunId?: string;
};

/**
 * In cloud mode, resolve the real Inngest run id for a triggered event so the
 * "Open trace" link lands on the exact run. Looks up the run by the internal
 * event id via the REST API (authenticated with the signing key), and caches
 * the result on the store entry so repeated polls only call the API once.
 * Returns undefined in local mode, before the run exists, or on any error —
 * callers fall back to the client-minted id.
 */
async function resolveCloudRunId(
  paramEventId: string | undefined,
  stored: StoredRun | undefined
): Promise<string | undefined> {
  if (!isCloud) return undefined;
  if (stored?.inngestRunId) return stored.inngestRunId;
  // Prefer the event id passed from the client (survives serverless instance
  // hops); fall back to the in-memory store when present.
  const eventId = paramEventId || stored?.inngestEventId;
  const signingKey = process.env.INNGEST_SIGNING_KEY;
  if (!eventId || !signingKey) return undefined;
  const base = process.env.INNGEST_API_BASE_URL || "https://api.inngest.com";
  try {
    const res = await fetch(`${base}/v1/events/${eventId}/runs`, {
      headers: { Authorization: `Bearer ${signingKey}` },
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { data?: Array<{ run_id?: string }> };
    const realRunId = json?.data?.[0]?.run_id;
    if (realRunId) {
      if (stored) stored.inngestRunId = realRunId; // cache when a store entry exists
      return realRunId;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const globalRunStore = globalThis as typeof globalThis & {
  __incidentTriageRuns?: Map<string, StoredRun>;
};

const runStore =
  globalRunStore.__incidentTriageRuns ??
  (globalRunStore.__incidentTriageRuns = new Map<string, StoredRun>());

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json(await buildStatus(url.searchParams));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  return NextResponse.json(await buildStatus(params));
}

async function buildStatus(
  params: URLSearchParams
): Promise<RunStatusResponse> {
  const clientRunId = params.get("clientRunId") ?? "";
  const stored = clientRunId ? runStore.get(clientRunId) : undefined;
  const incidentId =
    stored?.incidentId ??
    (params.get("incidentId") && getIncident(params.get("incidentId") ?? "")
      ? params.get("incidentId")
      : defaultIncidentId) ??
    defaultIncidentId;
  const incident = getIncident(incidentId) ?? getIncident(defaultIncidentId);
  const requestedAt = stored?.requestedAt ?? new Date().toISOString();
  const elapsed = Date.now() - new Date(requestedAt).getTime();
  const completionMs = 3600 + (incident?.toolPlan.length ?? 6) * 260;
  const retryAtMs = Math.min(1800, completionMs - 1200);
  const clientRunIdValue = clientRunId || stored?.clientRunId || "demo-run";
  // Prefer the real Inngest run id (cloud) so deep-links open the exact run;
  // fall back to the client-minted id locally or before the run is resolvable.
  const cloudRunId = await resolveCloudRunId(
    params.get("inngestEventId") ?? undefined,
    stored
  );
  const runId = cloudRunId ?? clientRunIdValue;
  const traceUrl = getDeepLink("runTrace", { runId });

  if (!incident) {
    return {
      ok: false,
      status: "failed",
      attempt: 0,
      hadRetry: false,
      runId,
      traceUrl,
      result: null,
      error: "No incidents are configured.",
    };
  }

  if (elapsed < 450) {
    return {
      ok: true,
      status: "queued",
      attempt: 0,
      hadRetry: false,
      runId,
      traceUrl,
      result: null,
      error: stored?.error,
    };
  }

  if (elapsed < completionMs) {
    return {
      ok: true,
      status: "running",
      attempt: elapsed > retryAtMs ? 1 : 0,
      hadRetry: elapsed > retryAtMs,
      runId,
      traceUrl,
      result: null,
      error: stored?.error,
    };
  }

  const result: TriageResult = {
    incidentId: incident.id,
    clientRunId: clientRunIdValue,
    rca: incident.rca,
    citedFiles: incident.citedFiles,
    iterations: incident.toolPlan.length + 1,
    toolCalls: incident.toolPlan.map((step) => step.tool),
    localizationScore: localizationScore(
      incident.citedFiles,
      incident.groundTruthFixFiles
    ),
  };

  return {
    ok: true,
    status: "completed",
    attempt: 1,
    hadRetry: true,
    runId,
    traceUrl,
    result,
    error: stored?.error,
  };
}
