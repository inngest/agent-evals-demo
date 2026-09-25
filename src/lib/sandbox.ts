// Seam between the booth demo and Inngest Sandboxes (beta).
//
// Cloud mode runs the REAL durable sandbox steps: create, run the
// model-generated analysis script, destroy. Local mode (dev server, offline
// booth fallback) runs a deterministic simulated result inside a normal
// step.run so the local trace still shows the beat. The faked path is always
// the fallback, matching the repo-wide DEMO_TARGET pattern.
//
// Sandbox API requires inngest >= 4.20.0 and sandboxMiddleware() on the
// client (registered unconditionally in src/inngest/client.ts).

import type { GetStepTools } from "inngest";
import { inngest } from "@/inngest/client";
import { isCloud } from "@/lib/demo-target";

export type SandboxRunMode = "sandbox" | "simulated";

// One line of the order the refund is computed from. `damaged` lines are
// refunded in full; shipping is refunded only when the whole order is.
export type RefundLine = {
  sku: string;
  description: string;
  unitUsd: number;
  qty: number;
  damaged: boolean;
};

export type RefundCalculation = {
  refundUsd: number;
  lines: Array<{ sku: string; refundUsd: number }>;
  rule: string;
};

export type SandboxRefundResult = {
  mode: SandboxRunMode;
  sandboxId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  refund: RefundCalculation;
};

// Order #47790, the refund ticket's order, as the order API returned it. The
// generated script runs against this JSON deterministically.
export const refundOrderLines: RefundLine[] = [
  {
    sku: "BLND-PRO",
    description: "Pro blender",
    unitUsd: 624,
    qty: 1,
    damaged: true,
  },
  {
    sku: "SHIP-STD",
    description: "Standard shipping",
    unitUsd: 25,
    qty: 1,
    damaged: false,
  },
];

// The "model-generated" script: a stage prop, deterministic, never runs in
// the app process. In cloud mode it executes inside a real sandbox. The point
// of the beat: the agent does not do money arithmetic in its head, and the
// code it writes does not run next to your secrets.
const generatedRefundScript = `#!/usr/bin/env python3
"""Compute the refund owed for an order with damaged items."""
import json, sys
from decimal import Decimal, ROUND_HALF_UP

with open(sys.argv[1]) as f:
    lines = json.load(f)

def usd(x):
    return Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

goods = [l for l in lines if not l["sku"].startswith("SHIP-")]
all_damaged = all(l["damaged"] for l in goods)

refunds = []
for l in lines:
    is_ship = l["sku"].startswith("SHIP-")
    owed = l["damaged"] or (is_ship and all_damaged)
    refunds.append({"sku": l["sku"],
                    "refundUsd": float(usd(l["unitUsd"] * l["qty"]) if owed else 0)})

total = sum(Decimal(str(r["refundUsd"])) for r in refunds)
print(json.dumps({
    "refundUsd": float(usd(total)),
    "lines": refunds,
    "rule": "damaged items in full; shipping when every item is damaged",
}))
`;

export function sandboxNameForRun(supportRunId: string): string {
  return `refund-${supportRunId}`;
}

// One captured command: write the script + input via heredocs, then run it.
// File upload is direct-client only, so durable steps embed both inline.
export function buildRefundCommand(): string {
  return [
    "cat > /tmp/refund.py <<'PY'",
    generatedRefundScript.trimEnd(),
    "PY",
    "cat > /tmp/order.json <<'JSON'",
    JSON.stringify(refundOrderLines),
    "JSON",
    "python3 /tmp/refund.py /tmp/order.json",
  ].join("\n");
}

// JS mirror of the generated script. Used for the simulated local result so
// the shape always matches what the real sandbox would print.
function computeRefundLocal(lines: RefundLine[]): RefundCalculation {
  const goods = lines.filter((line) => !line.sku.startsWith("SHIP-"));
  const allDamaged = goods.every((line) => line.damaged);
  const refunds = lines.map((line) => {
    const owed =
      line.damaged || (line.sku.startsWith("SHIP-") && allDamaged);
    return {
      sku: line.sku,
      refundUsd: owed ? round2(line.unitUsd * line.qty) : 0,
    };
  });

  return {
    refundUsd: round2(refunds.reduce((sum, line) => sum + line.refundUsd, 0)),
    lines: refunds,
    rule: "damaged items in full; shipping when every item is damaged",
  };
}

export function parseRefundStdout(stdout: string): RefundCalculation | null {
  try {
    const parsed = JSON.parse(stdout) as RefundCalculation;

    if (typeof parsed.refundUsd === "number" && Array.isArray(parsed.lines)) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

// The full step tools for our client, including the step.sandbox surface
// enabled by sandboxMiddleware(). Using the SDK's own type avoids drift.
type SandboxStepContext = GetStepTools<typeof inngest>;

// The one entry point the support agent calls. Cloud runs real durable
// sandbox steps; local simulates inside a normal step so the trace keeps the
// beat. Sandbox destroy stays on the success path as a normal step, per beta
// guidance; leaked-sandbox cleanup lives in the function's onFailure handler.
export async function runSandboxRefund(args: {
  step: SandboxStepContext;
  supportRunId: string;
}): Promise<SandboxRefundResult> {
  const name = sandboxNameForRun(args.supportRunId);

  if (isCloud) {
    const sandbox = await args.step.sandbox.create("create-refund-sandbox", {
      name,
      vcpu: 1,
      memoryMb: 1024,
      runningTimeout: "60s",
    });

    const result = await sandbox.commands.run(
      "compute-refund",
      buildRefundCommand(),
      { cwd: "/tmp", timeout: "45s" }
    );

    await sandbox.destroy("destroy-refund-sandbox");

    // A script that fails or prints garbage must not invent a refund: fall
    // back to the audited local mirror, and the trace shows the bad exit.
    const refund =
      parseRefundStdout(result.stdout) ?? computeRefundLocal(refundOrderLines);

    return {
      mode: "sandbox",
      sandboxId: sandbox.id,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.output.truncated,
      refund,
    };
  }

  return args.step.run("compute-refund", async () => {
    await sleep(650);
    const refund = computeRefundLocal(refundOrderLines);
    const stdout = `${JSON.stringify(refund)}\n`;

    return {
      mode: "simulated",
      sandboxId: `sbx-simulated-${args.supportRunId.slice(0, 8)}`,
      exitCode: 0,
      stdout,
      stderr: "",
      truncated: false,
      refund,
    } satisfies SandboxRefundResult;
  });
}

// Best-effort cleanup for the agent's onFailure handler: find any sandbox
// named for this run and destroy it. Cloud-only; no-ops locally.
export async function destroySandboxesNamed(name: string): Promise<number> {
  if (!isCloud) return 0;

  try {
    const list = await inngest.sandboxes.list({ limit: 100 });
    const matches = list.items.filter(
      (item) => item.name === name || item.id === name
    );
    let destroyed = 0;

    for (const match of matches) {
      try {
        const sandbox = await inngest.sandboxes.get(match.id);
        await sandbox?.destroy();
        destroyed += 1;
      } catch {
        // Best effort only.
      }
    }

    return destroyed;
  } catch {
    return 0;
  }
}

export type SandboxAccess = {
  mode: SandboxRunMode;
  reason: string;
  checkedAt: string;
};

const globalSandboxAccess = globalThis as typeof globalThis & {
  __sandboxAccess?: { value: SandboxAccess; expiresAt: number };
};

/**
 * Ceiling on the entitlement probe. The Inngest client has no timeout of its
 * own, so without this a stalled uplink hangs every caller of
 * checkSandboxAccess - including /api/demo/status, which the preflight and
 * the booth read before the doors open. Failing
 * closed to "simulated" after a short wait is always better than hanging.
 */
const SANDBOX_PROBE_TIMEOUT_MS = 2500;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Entitlement probe for the UI toggle: is the beta enabled for this env?
// Cached for 60s so status polls stay cheap.
export async function checkSandboxAccess(): Promise<SandboxAccess> {
  const cached = globalSandboxAccess.__sandboxAccess;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await probeSandboxAccess();
  globalSandboxAccess.__sandboxAccess = {
    value,
    expiresAt: Date.now() + 60_000,
  };

  return value;
}

async function probeSandboxAccess(): Promise<SandboxAccess> {
  if (!isCloud) {
    return {
      mode: "simulated",
      reason: "Sandboxes are cloud-only; local dev server runs the simulated beat",
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    await withTimeout(
      inngest.sandboxes.list({ limit: 1 }),
      SANDBOX_PROBE_TIMEOUT_MS,
      "Sandbox entitlement probe timed out",
    );

    return {
      mode: "sandbox",
      reason: "Sandbox beta enabled for this environment",
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      mode: "simulated",
      reason:
        error instanceof Error
          ? `Sandbox beta unavailable (${error.message}); simulated beat will run`
          : "Sandbox beta unavailable; simulated beat will run",
      checkedAt: new Date().toISOString(),
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
