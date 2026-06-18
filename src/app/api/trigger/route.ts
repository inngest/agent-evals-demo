import { NextResponse } from "next/server";
import { inngest, incidentReceived } from "@/inngest/client";
import { defaultDemoFlags, normalizeDemoFlags } from "@/lib/demo-flags";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { defaultIncidentId, getIncident } from "@/content/incidents";

type StoredRun = {
  incidentId: string;
  clientRunId: string;
  eventId: string;
  requestedAt: string;
  sent: boolean;
  error?: string;
  // Real Inngest internal event id (returned by inngest.send) and the run id
  // resolved from it via the REST API in cloud mode. Used to deep-link the
  // live run to its exact trace in the cloud dashboard.
  inngestEventId?: string;
  inngestRunId?: string;
};

const globalRunStore = globalThis as typeof globalThis & {
  __incidentTriageRuns?: Map<string, StoredRun>;
};

const runStore =
  globalRunStore.__incidentTriageRuns ??
  (globalRunStore.__incidentTriageRuns = new Map<string, StoredRun>());

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const incidentId =
    typeof body.incidentId === "string" && getIncident(body.incidentId)
      ? body.incidentId
      : defaultIncidentId;
  const incident = getIncident(incidentId);

  if (!incident) {
    return NextResponse.json(
      { ok: false, error: `Unknown incident: ${incidentId}` },
      { status: 400 }
    );
  }

  const clientRunId =
    typeof body.clientRunId === "string" && body.clientRunId.length > 0
      ? body.clientRunId
      : crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  const eventId = `incident:${clientRunId}`;
  const flags = normalizeDemoFlags(body.flags ?? defaultDemoFlags);
  const dashboardUrl = getDeepLink("envDashboard");
  const traceUrl = getDeepLink("runTrace", { runId: clientRunId });

  try {
    const sendResult = await inngest.send(
      incidentReceived.create(
        {
          incidentId: incident.id,
          title: incident.title,
          body: incident.body,
          flags,
          clientRunId,
          requestedAt,
          source: "booth-demo",
        },
        { id: eventId }
      )
    );

    // inngest.send returns the real internal event id(s); keep the first so
    // run-status can resolve the live run id from it in cloud mode.
    const ids = (sendResult as { ids?: string[] } | undefined)?.ids;
    const inngestEventId =
      Array.isArray(ids) && ids.length > 0 ? ids[0] : undefined;

    runStore.set(clientRunId, {
      incidentId: incident.id,
      clientRunId,
      eventId,
      requestedAt,
      sent: true,
      inngestEventId,
    });

    return NextResponse.json({
      ok: true,
      sent: true,
      incidentId: incident.id,
      clientRunId,
      eventId,
      dashboardUrl,
      traceUrl,
      runId: clientRunId,
      inngestEventId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Inngest dev server unavailable";

    runStore.set(clientRunId, {
      incidentId: incident.id,
      clientRunId,
      eventId,
      requestedAt,
      sent: false,
      error: message,
    });

    return NextResponse.json(
      {
        ok: true,
        sent: false,
        incidentId: incident.id,
        clientRunId,
        eventId,
        dashboardUrl,
        traceUrl,
        runId: clientRunId,
        error: message,
      },
      { status: 202 }
    );
  }
}
