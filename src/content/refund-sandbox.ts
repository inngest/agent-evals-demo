/**
 * The refund ticket's sandbox beat, client-safe: the order the refund is
 * computed from, the script that computes it, and a JS mirror of that script
 * for the simulated local run. lib/sandbox.ts runs it; the thread shows it.
 */

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

// Order #47790, the refund ticket's order, as the order API returned it. The
// generated script runs against this JSON deterministically.
export const refundOrderLines: RefundLine[] = [
  {
    sku: "BLND-PRO",
    description: "Pro blender base",
    unitUsd: 575,
    qty: 1,
    damaged: false,
  },
  {
    sku: "JAR-64OZ",
    description: "64 oz glass jar",
    unitUsd: 49,
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

// The refund script. Canned, not written by a model at the booth: in a real
// agent the model would write it. It never runs in the app process; in cloud
// mode it executes inside a real sandbox. The point of the beat: the agent
// does not do money arithmetic in its head, and code it writes does not run
// next to your secrets.
export const refundScript = `#!/usr/bin/env python3
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

// JS mirror of the refund script. Used for the simulated local result so
// the shape always matches what the real sandbox would print.
export function computeRefundLocal(lines: RefundLine[]): RefundCalculation {
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
