import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    ok: true,
    resetAt: new Date().toISOString(),
  });
}
