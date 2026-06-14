import { NextResponse } from "next/server";
import { authorizeDemoOpsRequest } from "@/lib/demo-ops-auth";
import { resetScoreHistory } from "@/lib/scoring";

export async function POST(request: Request) {
  const authorizationError = authorizeDemoOpsRequest(request, "reset");

  if (authorizationError) {
    return authorizationError;
  }

  await resetScoreHistory();

  return NextResponse.json({
    ok: true,
    resetAt: new Date().toISOString(),
  });
}
