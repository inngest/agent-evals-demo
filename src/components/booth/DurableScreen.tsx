"use client";

import * as React from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  History,
  LoaderCircle,
  RotateCw,
  Send,
} from "lucide-react";
import { durableCopy, inngestLinks } from "@/content/booth-copy";
import {
  FAILURE_STEP_ID,
  type SupportTicket,
} from "@/content/support-demo";
import type { RunPhase } from "./useAgentRun";
import { replyText, type StepView } from "./run-view";
import { InngestLink } from "./DashboardLink";
import { ScreenFrame } from "./ScreenFrame";

// Matches FAILURE_RETRY_AFTER_MS in mock-support.ts. Not imported: that
// module is server-only.
const RETRY_AFTER_MS = 3000;

export function DurableScreen({
  ticket,
  views,
  phase,
  replayReason,
  traceUrl,
  depth,
}: {
  ticket: SupportTicket;
  views: StepView[];
  phase: RunPhase;
  replayReason: string | null;
  /** Deep link to this run; null until the live run is known, or on replay. */
  traceUrl: string | null;
  depth: boolean;
}) {
  const reply = replyText(views);
  const replayed = views.filter((view) => view.memoized).length;
  const drafting =
    views.find((view) => view.def.id === "call-llm-draft-reply")?.state ===
    "running";
  const sent = views.find((view) => view.def.id === "send-reply")?.state === "done";

  const caption =
    phase === "complete"
      ? durableCopy.business.done(replayed)
      : phase === "retrying"
        ? durableCopy.business.retrying
        : durableCopy.business.running;

  return (
    <ScreenFrame
      eyebrow={durableCopy.eyebrow}
      headline={durableCopy.headline}
      replayReason={replayReason}
      aside={traceUrl ? <InngestLink href={traceUrl} label={inngestLinks.trace} /> : null}
      caption={caption}
      technical={durableCopy.technical}
      depth={depth}
    >
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6">
        {/* Beside the code drawer six columns are too narrow for the labels,
            so the pipeline wraps to two rows of three. The extra row gap and
            bottom margin hold the retry callout under the order lookup. */}
        <ol
          className={
            depth
              ? "mb-[76px] grid grid-cols-3 gap-x-5 gap-y-[80px]"
              : "mb-[76px] grid grid-cols-6 gap-4"
          }
        >
          {views.map((view, index) => (
            <PipelineNode
              key={view.def.id}
              view={view}
              index={index}
              showArrow={!depth && index < views.length - 1}
              compact={depth}
            />
          ))}
        </ol>

        {/* With the code drawer open there is no room for the conversation
            under a two-row pipeline; the drawer carries that beat instead. */}
        <div className={depth ? "hidden" : "grid min-h-0 content-start gap-5"}>
          <ChatBubble side="customer" who={`${durableCopy.customerLabel} · ${ticket.customer}`}>
            {ticket.message}
          </ChatBubble>
          <ChatBubble
            side="agent"
            who={durableCopy.agentLabel}
            footer={
              sent ? (
                <span className="inline-flex items-center gap-2">
                  <Send className="size-5" /> Sent to {ticket.customer}
                </span>
              ) : null
            }
          >
            {reply ?? (
              <span className="inline-flex items-center gap-3 opacity-70">
                <LoaderCircle className="size-7 animate-spin" />
                {drafting ? durableCopy.drafting : "Gathering customer and order data…"}
              </span>
            )}
          </ChatBubble>
        </div>
      </div>
    </ScreenFrame>
  );
}

function PipelineNode({
  view,
  index,
  showArrow,
  compact,
}: {
  view: StepView;
  index: number;
  showArrow: boolean;
  compact: boolean;
}) {
  const { state } = view;

  return (
    <li className="relative min-w-0">
      <div
        className={`booth-node grid content-between gap-1 border-[3px] ${compact ? "h-[164px] p-4" : "h-[176px] p-5"}`}
        data-state={state}
      >
        <div className="flex items-center justify-between">
          <span className="mono text-[18px] opacity-70">
            {String(index + 1).padStart(2, "0")}
          </span>
          <NodeIcon state={state} />
        </div>
        <div>
          <div className="display text-[27px] font-semibold leading-[1.1]">
            {view.def.label}
          </div>
          <div className="mono mt-1 text-[17px] uppercase opacity-70">
            {view.def.source}
          </div>
        </div>
        <div className="mono min-h-[26px] text-[17px] uppercase">
          <NodeStatus view={view} />
        </div>
      </div>
      {showArrow ? (
        <ArrowRight
          aria-hidden
          className="absolute -right-[18px] top-[84px] z-10 size-5 text-[var(--muted-copy)]"
        />
      ) : null}
      {view.def.id === FAILURE_STEP_ID ? (
        <div className="absolute inset-x-0 top-[calc(100%+12px)]">
          <FailureCallout view={view} />
        </div>
      ) : null}
    </li>
  );
}

function NodeIcon({ state }: { state: StepView["state"] }) {
  if (state === "done") return <Check className="size-7" strokeWidth={3} />;
  if (state === "running")
    return <LoaderCircle className="size-7 animate-spin" />;
  if (state === "retrying") return <CircleAlert className="size-7" />;
  if (state === "errored") return <CircleAlert className="size-7" />;
  return null;
}

function NodeStatus({ view }: { view: StepView }) {
  if (view.state === "retrying") return <>503 · will retry</>;
  if (view.state === "errored") return <>Failed</>;
  if (view.state === "running") return <>Running…</>;

  if (view.state === "done") {
    if (view.memoized) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[var(--teal-on-ink)]">
          <History className="size-4" /> {durableCopy.memoized}
        </span>
      );
    }
    if (view.recovered) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[var(--teal-on-ink)]">
          <RotateCw className="size-4" /> Retried · ok
        </span>
      );
    }
    return <>{((view.durationMs ?? 0) / 1000).toFixed(1)}s</>;
  }

  return <span className="opacity-60">Waiting</span>;
}

function FailureCallout({ view }: { view: StepView }) {
  if (view.state === "retrying") {
    return (
      <div className="booth-callout mono grid gap-0.5 bg-[var(--coral)] px-3 py-2 text-[17px] uppercase leading-tight text-white">
        <span className="font-semibold">{durableCopy.callout.failing}</span>
        <RetryCountdown />
      </div>
    );
  }

  if (view.state === "done" && view.recovered) {
    return (
      <div className="booth-callout mono bg-[var(--teal)] px-3 py-2 text-[17px] uppercase leading-tight text-white">
        {durableCopy.callout.recovered}
      </div>
    );
  }

  return null;
}

function ChatBubble({
  side,
  who,
  footer,
  children,
}: {
  side: "customer" | "agent";
  who: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const agent = side === "agent";

  return (
    <div className={agent ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          agent
            ? "booth-bubble max-w-[min(1180px,100%)] border-[3px] border-[var(--ink)] bg-[var(--ink)] px-7 py-5 text-white"
            : "booth-bubble max-w-[min(1180px,100%)] border-[3px] border-[var(--ink)] bg-white px-7 py-5"
        }
      >
        <div className="mono mb-2 text-[17px] uppercase opacity-70">{who}</div>
        <div className="text-[27px] leading-[1.4]">{children}</div>
        {footer ? (
          <div className="mono mt-3 text-[17px] uppercase text-[var(--teal-on-ink)]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Seconds until Inngest retries the failed step. Mounted only while the step
 * is retrying, so its mount time is the moment the screen first saw the 503.
 */
function RetryCountdown() {
  const [since] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(since);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  const secondsLeft = Math.ceil((RETRY_AFTER_MS - (now - since)) / 1000);

  return (
    <span>
      {secondsLeft > 0 ? durableCopy.callout.retrying(secondsLeft) : "Retrying now…"}
    </span>
  );
}
