"use client";

import * as React from "react";
import { Code2, Zap, ZapOff } from "lucide-react";
import {
  boothScreens,
  keyHints,
  type BoothScreenId,
} from "@/content/booth-copy";
import type { RunPhase } from "./useAgentRun";

/**
 * The driver's corner: elapsed time, where we are, run status, and whether
 * the outage is armed. Small and low-contrast on purpose: it is for the
 * person at the keyboard, not the audience.
 */
export function PresenterHud({
  screen,
  onJump,
  canJumpAhead,
  onToggleDepth,
  startedAt,
  phase,
  simulated,
  failureArmed,
  depth,
}: {
  screen: BoothScreenId;
  onJump: (screen: BoothScreenId) => void;
  /** False until a ticket is picked: later screens have no run to show. */
  canJumpAhead: boolean;
  onToggleDepth: () => void;
  startedAt: number | null;
  phase: RunPhase;
  simulated: boolean;
  failureArmed: boolean;
  depth: boolean;
}) {
  return (
    <div className="booth-hud mono pointer-events-auto absolute bottom-5 left-16 flex items-center gap-6 whitespace-nowrap text-[15px] uppercase text-[var(--muted-copy)]">
      <ElapsedTimer startedAt={startedAt} />
      <nav className="flex items-center gap-1.5" aria-label="Screens">
        {boothScreens.map((item) => {
          const locked = item.id !== "start" && !canJumpAhead;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onJump(item.id)}
              disabled={locked}
              title={locked ? "Pick a ticket first" : undefined}
              data-active={item.id === screen}
              className="booth-hud-dot px-2 py-0.5"
            >
              {item.label}
            </button>
          );
        })}
      </nav>
      <span className="inline-flex items-center gap-2">
        <span
          className="status-dot"
          data-state={
            phase === "complete" ? "complete" : phase === "failed" ? "error" : phase === "idle" ? "idle" : phase === "retrying" ? "retrying" : "running"
          }
        />
        {simulated ? "replay" : phase}
      </span>
      <span className="inline-flex items-center gap-1.5">
        {failureArmed ? <Zap className="size-4" /> : <ZapOff className="size-4" />}
        {failureArmed ? "outage on" : "outage off"}
      </span>
      <button
        type="button"
        onClick={onToggleDepth}
        data-active={depth}
        className="booth-hud-toggle inline-flex items-center gap-2"
        title="Toggle Under the hood (U)"
      >
        <Code2 className="size-4" />
        Under the hood: {depth ? "on" : "off"}
        <kbd className="booth-hud-key">U</kbd>
      </button>
      <span>? keys</span>
    </div>
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
    <span className="tabnum" style={late ? { color: "var(--coral)" } : undefined}>
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

export function KeyHintsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-[rgba(26,22,28,0.72)]"
      onClick={onClose}
    >
      <div className="grid gap-4 border-[3px] border-[var(--ink)] bg-white p-10">
        <h2 className="display text-[36px] font-semibold">Driver keys</h2>
        <dl className="grid grid-cols-[auto_auto] gap-x-10 gap-y-3 text-[24px]">
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
