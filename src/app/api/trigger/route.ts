import { NextResponse } from "next/server";
import { inngest, queryRequested } from "@/inngest/client";
import { defaultDemoFlags, normalizeDemoFlags } from "@/lib/demo-flags";
import { canonicalPrompt } from "@/content/seed-data";
import { getInngestRunsUrl } from "@/lib/inngest-dashboard";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clientRunId = crypto.randomUUID();
  const flags = normalizeDemoFlags(body.flags ?? defaultDemoFlags);
  const prompt =
    typeof body.prompt === "string" && body.prompt.trim().length > 0
      ? body.prompt.trim()
      : canonicalPrompt;
  const dashboardUrl = getInngestRunsUrl();

  try {
    const result = await inngest.send(
      queryRequested.create(
        {
          prompt,
          flags,
          clientRunId,
          requestedAt: new Date().toISOString(),
          source: "booth-demo",
        },
        { id: `query:${clientRunId}` }
      )
    );

    return NextResponse.json({
      ok: true,
      sent: true,
      clientRunId,
      eventId: `query:${clientRunId}`,
      dashboardUrl,
      traceUrl: dashboardUrl,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: true,
        sent: false,
        clientRunId,
        eventId: `query:${clientRunId}`,
        dashboardUrl,
        traceUrl: dashboardUrl,
        error:
          error instanceof Error
            ? error.message
            : "Inngest dev server unavailable",
      },
      { status: 202 }
    );
  }
}
