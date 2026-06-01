"use client";

import { Activity, ExternalLink } from "lucide-react";
import type { TraceStep, TriggerResponse } from "@/components/demo/types";

export function TracePanel({
  trace,
  trigger,
}: {
  trace: TraceStep[];
  trigger: TriggerResponse | null;
}) {
  return (
    <div className="grid h-full min-h-0 gap-0 overflow-hidden bg-white lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="grid min-h-0 grid-rows-[84px_minmax(0,1fr)] border-r border-[var(--rule-soft)]">
        <div className="flex h-[84px] items-center justify-between gap-3 border-b border-[var(--rule-soft)] p-4">
          <div>
            <div className="mono flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
              <Activity className="size-3.5" />
              Inngest trace
            </div>
            <div className="display mt-1 text-xl font-medium">
              write-query
            </div>
          </div>
          <a
            href={trigger?.traceUrl ?? "#"}
            target={trigger?.traceUrl ? "_blank" : undefined}
            rel={trigger?.traceUrl ? "noreferrer" : undefined}
            aria-disabled={!trigger?.traceUrl}
            className={`inline-flex h-7 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-[var(--ink)] bg-white px-2.5 text-[0.8rem] font-medium transition-all ${
              trigger?.traceUrl
                ? "hover:bg-[var(--bone)]"
                : "pointer-events-none opacity-50"
            }`}
          >
            <ExternalLink className="size-4" />
            View trace
          </a>
        </div>

        <div className="min-h-0 overflow-auto">
          {trace.map((step, index) => (
            <div
              key={step.id}
              className="grid grid-cols-[42px_1fr_auto] items-start gap-3 border-b border-[var(--rule-soft)] p-4"
            >
              <div
                className={`mono flex size-7 items-center justify-center border text-[11px] tabnum ${
                  step.status === "failed"
                    ? "border-[var(--coral)] bg-[var(--coral)] text-white"
                    : step.status === "complete"
                      ? "border-[var(--teal)] bg-[var(--teal)] text-white"
                      : "border-[var(--ink)] bg-white"
                }`}
              >
                {index + 1}
              </div>
              <div>
                <div className="display text-base font-medium">{step.label}</div>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-copy)]">
                  {step.detail}
                </p>
              </div>
              <div className="mono text-right text-[11px] uppercase text-[var(--muted-copy)]">
                <div>{step.status}</div>
                {step.duration ? <div>{step.duration}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className="grid h-full min-h-0 content-between gap-6 overflow-auto bg-[var(--bone)] p-5">
        <div>
          <div className="display text-lg font-medium">Run payload</div>
          <dl className="mono mt-4 grid gap-3 text-[11px]">
            <div className="grid gap-1 border-b border-[var(--rule-soft)] pb-2">
              <dt className="uppercase text-[var(--muted-copy)]">Event</dt>
              <dd>app/query.requested</dd>
            </div>
            <div className="grid gap-1 border-b border-[var(--rule-soft)] pb-2">
              <dt className="uppercase text-[var(--muted-copy)]">Event ID</dt>
              <dd className="break-all">{trigger?.eventId ?? "not sent yet"}</dd>
            </div>
            <div className="grid gap-1 border-b border-[var(--rule-soft)] pb-2">
              <dt className="uppercase text-[var(--muted-copy)]">Engine</dt>
              <dd>{trigger?.sent ? "real Inngest run" : "waiting for dev server"}</dd>
            </div>
          </dl>
        </div>
        {trigger?.sent === false ? (
          <div className="border border-[var(--coral)] bg-white p-4 text-sm leading-6">
            Start the Inngest dev server to see the live trace. The foreground
            demo stays deterministic.
          </div>
        ) : null}
      </aside>
    </div>
  );
}
