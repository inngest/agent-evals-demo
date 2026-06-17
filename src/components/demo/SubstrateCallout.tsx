"use client";

import { Layers } from "lucide-react";

/**
 * The shared-substrate message (Lauren's positioning beat). The score and
 * experiment data exist *because Inngest runs the agent*. A two-system setup
 * (Temporal + Braintrust, BullMQ + homegrown evals) can't cheaply capture it.
 *
 * Used in Act 1 ("variant=plant") and reinforced in Act 3 ("variant=reinforce").
 */
export function SubstrateCallout({
  variant = "plant",
  className = "",
}: {
  variant?: "plant" | "reinforce";
  className?: string;
}) {
  const copy =
    variant === "plant"
      ? "Every step, retry, and timing you just watched is captured because Inngest runs the agent. The trace is not a second system you bolted on."
      : "These scores and this experiment grid come from the same runs. One substrate. A Temporal + Braintrust or BullMQ + homegrown-evals stack would make you stitch and pay for this twice.";

  return (
    <div
      className={`border border-[var(--ink)] bg-[var(--bone)] p-3 ${className}`}
    >
      <div className="mono mb-1.5 flex items-center gap-2 text-[11px] uppercase text-[var(--coral)]">
        <Layers className="size-3.5" />
        Shared substrate
      </div>
      <p className="text-sm leading-6">{copy}</p>
    </div>
  );
}
