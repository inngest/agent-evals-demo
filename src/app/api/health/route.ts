import { NextResponse } from "next/server";

/**
 * Liveness probe for the platform (Render healthCheckPath). Deliberately does
 * zero I/O: no Inngest call, no filesystem read, no seed data import.
 *
 * `/api/demo/status` is the *diagnostic* endpoint and it talks to the Inngest
 * API. Pointing a healthcheck at it means a slow uplink can fail the check,
 * and a failed check restarts the instance - which wipes the in-memory step
 * timeline store and blanks the Run and Observe stages mid-demo. Health and
 * diagnostics are separate endpoints for that reason; do not merge them.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true });
}
