import { NextResponse } from "next/server";
import { defaultIncidentId, getIncident } from "@/content/incidents";
import { localizationScore } from "@/lib/scoring";
import { getDeepLink } from "@/lib/inngest-dashboard";
import type { RunStatusResponse, TriageResult } from "@/components/demo/types";

type StoredRun = {
  incidentId: string;
  clientRunId: string;
  eventId: string;
  requestedAt: string;
  sent: boolean;
  error?: string;
};

const globalRunStore = globalThis as typeof globalThis & {
  __incidentTriageRuns?: Map<string, StoredRun>;
};

const runStore =
  globalRunStore.__incidentTriageRuns ??
  (globalRunStore.__incidentTriageRuns = new Map<string, StoredRun>());

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json(buildStatus(url.searchParams));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  return NextResponse.json(buildStatus(params));
}

function buildStatus(params: URLSearchParams): RunStatusResponse {
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
  const runId = clientRunId || stored?.clientRunId || "demo-run";
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
    clientRunId: runId,
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
