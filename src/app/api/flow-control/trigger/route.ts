import { NextResponse } from "next/server";
import {
  flowControlDemoRequested,
  inngest,
  type FlowControlDemoRequestedData,
} from "@/inngest/client";
import { getDeepLink } from "@/lib/inngest-dashboard";

const DEFAULT_COUNT = 8;
const MAX_COUNT = 24;
const DEFAULT_WORK_MS = 7500;
const MAX_WORK_MS = 9000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const count = clampNumber(body.count, DEFAULT_COUNT, 1, MAX_COUNT);
  const workMs = clampNumber(body.workMs, DEFAULT_WORK_MS, 1000, MAX_WORK_MS);
  const accountId = normalizeString(body.accountId, "acme");
  const accountName = normalizeString(body.accountName, "Acme Corp");
  const batchId = normalizeString(
    body.batchId,
    `video-${compactTimestamp(new Date())}`
  );
  const now = Date.now();
  const events = Array.from({ length: count }, (_, index) => {
    const requestNumber = index + 1;
    const requestId = `${batchId}-${String(requestNumber).padStart(3, "0")}`;
    const requestedAt = new Date(now + index).toISOString();
    const data: FlowControlDemoRequestedData = {
      requestId,
      batchId,
      accountId,
      accountName,
      workMs,
      requestedAt,
      source: "booth-demo",
    };

    return flowControlDemoRequested.create(data, {
      id: `customer-enrichment-queue:${batchId}:${requestNumber}`,
      ts: now + index,
    });
  });

  try {
    const result = await inngest.send(events);
    const ids = (result as { ids?: string[] } | undefined)?.ids ?? [];

    return NextResponse.json({
      ok: true,
      sent: true,
      eventsSent: events.length,
      eventIds: ids,
      batchId,
      accountId,
      accountName,
      workMs,
      dashboardUrl: getDeepLink("envDashboard"),
      triggeredAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        eventsSent: 0,
        batchId,
        accountId,
        accountName,
        workMs,
        dashboardUrl: getDeepLink("envDashboard"),
        error:
          error instanceof Error
            ? error.message
            : "Inngest event delivery failed",
      },
      { status: 503 }
    );
  }
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  const numberValue = Number(value ?? fallback);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(numberValue)));
}

function compactTimestamp(date: Date) {
  return date.toISOString().replace(/[-:.]/g, "").replace("Z", "");
}
