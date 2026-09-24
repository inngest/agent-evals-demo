"use client";

import * as React from "react";
import { Code2 } from "lucide-react";
import { consoleCopy, keyHints } from "@/content/booth-copy";
import type { RunPhase } from "./useAgentRun";

/**
 * The console's status bar, which doubles as the driver's corner: the
 * "Built on Inngest" mark, run status, elapsed demo time, and the Under the
 * hood toggle for a driver who forgets the U key.
 */
export function PresenterHud({
  onToggleDepth,
  startedAt,
  phase,
  simulated,
  depth,
}: {
  onToggleDepth: () => void;
  startedAt: number | null;
  phase: RunPhase;
  simulated: boolean;
  depth: boolean;
}) {
  return (
    <footer className="acme-statusbar flex items-center justify-between gap-6 whitespace-nowrap px-6 text-[16px]">
      <span className="inline-flex items-center gap-2 font-semibold">
        <span className="acme-inngest-mark" aria-hidden />
        {consoleCopy.builtOn}
      </span>
      <div className="flex items-center gap-6">
        <span className="inline-flex items-center gap-2">
          <span
            className="status-dot"
            data-state={
              phase === "complete"
                ? "complete"
                : phase === "failed"
                  ? "error"
                  : phase === "idle"
                    ? "idle"
                    : phase === "retrying"
                      ? "retrying"
                      : "running"
            }
          />
          {simulated ? "replay" : phase}
        </span>
        <ElapsedTimer startedAt={startedAt} />
        <button
          type="button"
          onClick={onToggleDepth}
          data-active={depth}
          className="acme-hud-toggle inline-flex items-center gap-2"
          title="Toggle Under the hood (U)"
        >
          <Code2 className="size-4" />
          Under the hood: {depth ? "on" : "off"}
          <kbd className="acme-hud-key">U</kbd>
        </button>
        <span>? keys</span>
      </div>
    </footer>
  );
}

function ElapsedTimer({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (startedAt === null) return <span className="tabnum">0:00</span>;

  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  // Past four minutes the demo is running long: tint the timer as a nudge.
  const late = seconds >= 240;

  return (
    <span className="tabnum" style={late ? { color: "var(--acme-bad)" } : undefined}>
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

export function KeyHintsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-[rgba(20,24,33,0.6)]"
      onClick={onClose}
    >
      <div className="acme-popover grid gap-5 p-10">
        <h2 className="text-[34px] font-semibold">Driver keys</h2>
        <dl className="grid grid-cols-[auto_auto] gap-x-10 gap-y-3 text-[23px]">
          {keyHints.map((hint) => (
            <React.Fragment key={hint.keys}>
              <dt className="mono font-semibold">{hint.keys}</dt>
              <dd>{hint.label}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}
