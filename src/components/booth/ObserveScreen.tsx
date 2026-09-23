import * as React from "react";
import { History } from "lucide-react";
import { observeCopy } from "@/content/booth-copy";
import type { RunTimeline } from "@/inngest/middlewares/step-tracker";
import { InngestLink } from "./DashboardLink";
import {
  formatSeconds,
  formatUsd,
  runTotals,
  type StepView,
} from "./run-view";
import { ScreenFrame } from "./ScreenFrame";

/**
 * The run as a trace waterfall: one row per step, bars on a shared clock.
 * A failed attempt is drawn in coral, the wait before the retry as a dashed
 * gap, and the successful attempt in ink. This is the in-app version of the
 * dashboard trace; the real one is a link away when someone asks for proof.
 */
export function ObserveScreen({
  timeline,
  views,
  replayReason,
  traceUrl,
  depth,
}: {
  timeline: RunTimeline | null;
  views: StepView[];
  replayReason: string | null;
  traceUrl: string | null;
  depth: boolean;
}) {
  const totals = runTotals(timeline, views);
  const origin = timeline?.startedAt ?? 0;
  const span = Math.max(totals.durationMs, 1);
  const position = (at: number) =>
    `${Math.max(0, Math.min(100, ((at - origin) / span) * 100))}%`;
  const width = (ms: number) =>
    `max(6px, ${Math.max(0, Math.min(100, (ms / span) * 100))}%)`;
  // Header and rows share one column template so the labels sit over their
  // numbers. With the code drawer open, tokens and cost drop out for width.
  const columns = depth
    ? "grid-cols-[250px_minmax(0,1fr)_90px]"
    : "grid-cols-[320px_minmax(0,1fr)_120px_120px_120px]";
  const headers = depth
    ? observeCopy.columns.slice(0, 3)
    : observeCopy.columns;

  return (
    <ScreenFrame
      eyebrow={observeCopy.eyebrow}
      headline={observeCopy.headline}
      replayReason={replayReason}
      caption={observeCopy.business}
      technical={observeCopy.technical}
      depth={depth}
      aside={
        traceUrl ? <InngestLink href={traceUrl} label={observeCopy.openInInngest} /> : null
      }
    >
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6">
        <div className={`grid grid-cols-4 ${depth ? "gap-3" : "gap-5"}`}>
          <Stat compact={depth} label={observeCopy.totals.time} value={formatSeconds(totals.durationMs)} />
          <Stat compact={depth} label="Steps" value={`${views.filter((v) => v.state === "done").length} / ${views.length}`} />
          <Stat compact={depth} label={observeCopy.totals.tokens} value={totals.tokens.toLocaleString("en-US")} />
          <Stat
            compact={depth}
            label={observeCopy.totals.cost}
            value={formatUsd(totals.costUsd)}
            note={depth ? undefined : observeCopy.costFootnote}
          />
        </div>

        <ol className="grid min-h-0 content-start border-[3px] border-[var(--ink)] bg-white">
          <li
            aria-hidden
            className={`mono grid items-center gap-6 border-b-2 border-[var(--ink)] bg-[var(--bone)] px-6 py-1.5 text-[15px] uppercase text-[var(--muted-copy)] ${columns}`}
          >
            {headers.map((header, index) => (
              <span key={header} className={index >= 2 ? "text-right" : undefined}>
                {header}
              </span>
            ))}
          </li>
          {views.map((view) => {
            const start = view.startedAt;
            const failed = view.failedAttempts[0];
            const failedEnd = failed ? failed.startedAt + failed.durationMs : undefined;

            return (
              <li
                key={view.def.id}
                className={`grid items-center gap-6 border-b border-[var(--rule-soft)] px-6 last:border-b-0 ${columns} ${depth ? "py-1" : "py-2.5"}`}
              >
                <div className="min-w-0">
                  <div
                    className={`flex items-center gap-2 font-semibold ${depth ? "text-[21px]" : "text-[24px]"}`}
                  >
                    <span className="truncate">{view.def.label}</span>
                    {view.memoized ? (
                      <History
                        className="size-5 shrink-0 text-[var(--teal)]"
                        aria-label="Replayed from memoized state"
                      />
                    ) : null}
                  </div>
                  <div className="mono truncate text-[16px] uppercase text-[var(--muted-copy)]">
                    {view.def.source}
                    {view.memoized ? " · not re-run" : ""}
                    {view.failedAttempts.length > 0 ? ` · ${observeCopy.failedAttempt}` : ""}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className={`relative ${depth ? "h-6" : "h-8"}`}>
                    {failed ? (
                      <>
                        <div
                          className="absolute inset-y-0 grid place-items-center bg-[var(--coral)] text-white"
                          style={{ left: position(failed.startedAt), width: width(failed.durationMs) }}
                          title={failed.errorMessage}
                        >
                          <span className="mono text-[15px]">503</span>
                        </div>
                        {failedEnd !== undefined && start !== undefined && start > failedEnd ? (
                          <div
                            className="mono absolute top-1/2 grid -translate-y-1/2 place-items-center border-t-[3px] border-dashed border-[var(--coral)] text-[14px] uppercase text-[var(--coral)]"
                            style={{ left: position(failedEnd), width: width(start - failedEnd) }}
                          >
                            <span className="-mt-7 whitespace-nowrap">{observeCopy.waitingForRetry}</span>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {start !== undefined && view.state !== "retrying" ? (
                      <div
                        className={`absolute inset-y-0 ${view.state === "done" ? "bg-[var(--ink)]" : "booth-bar-running bg-[var(--coral-soft)]"}`}
                        style={{
                          left: position(start),
                          width: width(view.durationMs ?? 0),
                        }}
                      />
                    ) : null}
                    {view.state === "retrying" && start !== undefined ? (
                      <div
                        className="absolute inset-y-0 grid place-items-center bg-[var(--coral)] text-white"
                        style={{ left: position(start), width: width(view.durationMs ?? 0) }}
                      >
                        <span className="mono text-[15px]">503</span>
                      </div>
                    ) : null}
                  </div>
                  {view.output ? (
                    <div
                      className={`mt-1 truncate leading-snug text-[var(--muted-copy)] ${depth ? "mono text-[14px]" : "text-[18px]"}`}
                    >
                      {depth ? `out: ${view.output}` : view.output}
                    </div>
                  ) : null}
                  {depth && view.input ? (
                    <div className="mono truncate text-[14px] leading-snug text-[var(--muted-copy)]">
                      in: {view.input}
                    </div>
                  ) : null}
                </div>

                <div className="mono text-right text-[20px]">
                  {view.durationMs !== undefined && view.state === "done"
                    ? formatSeconds(view.durationMs)
                    : "…"}
                </div>
                {!depth ? (
                  <>
                    <div className="mono text-right text-[20px] text-[var(--muted-copy)]">
                      {view.tokens > 0 ? view.tokens.toLocaleString("en-US") : "·"}
                    </div>
                    <div className="mono text-right text-[20px] text-[var(--muted-copy)]">
                      {view.costUsd > 0 ? formatUsd(view.costUsd) : "·"}
                    </div>
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </ScreenFrame>
  );
}

function Stat({
  label,
  value,
  note,
  compact,
}: {
  label: string;
  value: string;
  note?: string;
  compact: boolean;
}) {
  return (
    <div
      className={`border-[3px] border-[var(--ink)] bg-white ${compact ? "px-4 py-1.5" : "px-6 py-3"}`}
    >
      <div className="mono text-[17px] uppercase text-[var(--muted-copy)]">
        {label}
      </div>
      <div className="flex items-baseline gap-3">
        <span
          className={`display mt-1 font-semibold leading-none tabnum ${compact ? "text-[28px]" : "text-[44px]"}`}
        >
          {value}
        </span>
        {note ? (
          <span className="text-[15px] leading-tight text-[var(--muted-copy)]">
            {note}
          </span>
        ) : null}
      </div>
    </div>
  );
}
