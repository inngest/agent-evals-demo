import { NextResponse } from "next/server";
import {
  inngest,
  supportTicketReceived,
  type SupportTicketReceivedData,
} from "@/inngest/client";
import {
  FAILURE_STEP_ID,
  currentSupportModel,
  defaultSupportTicketId,
  isSupportTicketId,
  type SupportModel,
} from "@/content/support-demo";
import { getDeepLink } from "@/lib/inngest-dashboard";
import { supportSessionMeta } from "@/lib/support-session-meta";
import { supportRunStore } from "@/lib/support-run-store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const supportRunId =
    typeof body.supportRunId === "string" && body.supportRunId.length > 0
      ? body.supportRunId
      : crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  const eventId = `support:${supportRunId}`;

  const data: SupportTicketReceivedData = {
    supportRunId,
    ticketId: isSupportTicketId(body.ticketId)
      ? body.ticketId
      : defaultSupportTicketId,
    model: normalizeModel(body.model),
    failureStep: body.failureStep === "none" ? "none" : FAILURE_STEP_ID,
    requestedAt,
    source: "booth-demo",
  };

  try {
    const result = await inngest.send(
      supportTicketReceived.create(data, {
        id: eventId,
        meta: supportSessionMeta(),
      }),
    );
    const ids = (result as { ids?: string[] } | undefined)?.ids;
    const inngestEventId =
      Array.isArray(ids) && ids.length > 0 ? ids[0] : undefined;

    supportRunStore.set(supportRunId, {
      supportRunId,
      requestedAt,
      sent: true,
      inngestEventId,
    });

    return NextResponse.json({
      ok: true,
      sent: true,
      supportRunId,
      inngestEventId,
      traceUrl: getDeepLink("runTrace"),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Inngest is not reachable";

    supportRunStore.set(supportRunId, {
      supportRunId,
      requestedAt,
      sent: false,
      error: message,
    });

    // 202, not 5xx: the booth falls back to a labelled replay rather than
    // stopping the demo.
    return NextResponse.json(
      {
        ok: true,
        sent: false,
        supportRunId,
        traceUrl: getDeepLink("runTrace"),
        error: message,
      },
      { status: 202 },
    );
  }
}

function normalizeModel(value: unknown): SupportModel {
  return value === "gpt-5.5" || value === "claude-opus-4.8"
    ? value
    : currentSupportModel;
}
