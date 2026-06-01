import { NextResponse } from "next/server";
import { runMockQuery } from "@/lib/mock-query";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sql = typeof body.sql === "string" ? body.sql : "";
  const rows = await runMockQuery(sql, 0);

  return NextResponse.json({ rows });
}
