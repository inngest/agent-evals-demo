import * as React from "react";
import { Zap, ZapOff } from "lucide-react";
import { startCopy, durableCopy } from "@/content/booth-copy";
import { supportTickets } from "@/content/support-demo";
import { KeyCap } from "./ScreenFrame";

export function StartScreen({
  focusedIndex,
  onFocus,
  onPick,
  failureArmed,
  depth,
}: {
  focusedIndex: number;
  onFocus: (index: number) => void;
  onPick: (index: number) => void;
  failureArmed: boolean;
  depth: boolean;
}) {
  return (
    <section className="booth-screen flex h-full flex-col justify-center gap-14 px-24 pb-20">
      <div>
        <div className="mono text-[22px] uppercase tracking-[0.08em] text-[var(--coral)]">
          {startCopy.eyebrow}
        </div>
        <h1 className="display mt-5 max-w-[1500px] text-[76px] font-semibold leading-[1.04]">
          {startCopy.headline}
        </h1>
      </div>

      <div>
        <div className="mb-6 flex items-center justify-between gap-6">
          <h2 className="text-[34px] font-medium">{startCopy.prompt}</h2>
          <span
            className="mono inline-flex items-center gap-2 text-[18px] uppercase text-[var(--muted-copy)]"
            data-armed={failureArmed}
          >
            {failureArmed ? (
              <Zap className="size-5 text-[var(--coral)]" />
            ) : (
              <ZapOff className="size-5" />
            )}
            {failureArmed ? durableCopy.failureArmed : durableCopy.failureOff}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-8">
          {supportTickets.map((ticket, index) => {
            const focused = index === focusedIndex;

            return (
              <button
                key={ticket.id}
                type="button"
                data-focused={focused}
                onMouseEnter={() => onFocus(index)}
                onClick={() => onPick(index)}
                className="booth-ticket group grid min-h-[300px] content-start gap-5 border-[3px] border-[var(--ink)] bg-white p-8 text-left"
              >
                <div className="flex items-center justify-between">
                  <KeyCap>{index + 1}</KeyCap>
                  <span className="mono text-[18px] uppercase text-[var(--muted-copy)]">
                    {ticket.customer}
                  </span>
                </div>
                <div className="display text-[40px] font-semibold leading-[1.1]">
                  {ticket.title}
                </div>
                <p className="text-[23px] leading-[1.4] text-[var(--muted-copy)]">
                  “{ticket.message}”
                </p>
              </button>
            );
          })}
        </div>
        {depth ? (
          <p className="mono mt-8 text-[20px] text-[var(--muted-copy)]">
            {startCopy.technical}
          </p>
        ) : null}
      </div>
    </section>
  );
}
