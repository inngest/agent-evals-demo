import { NextResponse } from "next/server";

export function authorizeDemoOpsRequest(
  request: Request,
  operation: "seed" | "reset"
) {
  const expectedToken = process.env.DEMO_SEED_TOKEN;
  const isProductionRuntime = process.env.NODE_ENV === "production";

  if (!isProductionRuntime) {
    return null;
  }

  if (!expectedToken) {
    return NextResponse.json(
      {
        ok: false,
        error: `${capitalize(operation)} endpoint locked. Configure DEMO_SEED_TOKEN and send it as x-demo-seed-token.`,
      },
      { status: 403 }
    );
  }

  const providedToken = request.headers.get("x-demo-seed-token");

  if (!providedToken || !constantTimeEquals(providedToken, expectedToken)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid or missing x-demo-seed-token.",
      },
      { status: 401 }
    );
  }

  return null;
}

function constantTimeEquals(a: string, b: string) {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);

  if (aBytes.byteLength !== bBytes.byteLength) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < aBytes.byteLength; index += 1) {
    mismatch |= aBytes[index] ^ bBytes[index];
  }

  return mismatch === 0;
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
