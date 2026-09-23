import * as React from "react";
import { History } from "lucide-react";
import { replayTag } from "@/content/booth-copy";

/**
 * The shared layout of every screen: eyebrow and headline on top, the
 * screen's content in the middle, and a caption bar at the bottom carrying
 * the business line (always) and the technical line ("Under the hood" only).
 *
 * Sized in stage pixels: the stage is a fixed 1920×1080 canvas scaled to the
 * display, so these numbers are what a 1080p TV shows.
 */
export function ScreenFrame({
  eyebrow,
  headline,
  replayReason,
  aside,
  caption,
  technical,
  depth,
  children,
}: {
  eyebrow: string;
  headline: string;
  /** Set when the run on screen is the labelled replay, not a live run. */
  replayReason?: string | null;
  /** Top-right slot, e.g. a status chip. */
  aside?: React.ReactNode;
  caption?: React.ReactNode;
  technical?: string;
  depth: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="booth-screen grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-8 px-16 pb-20 pt-12">
      {/* Links and chips share the eyebrow row, never the headline's, so the
          headline keeps its full width even beside the code drawer. */}
      <header>
        <div className="flex min-h-[44px] items-center justify-between gap-6">
          <div className="mono text-[20px] uppercase tracking-[0.08em] text-[var(--coral)]">
            {eyebrow}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {replayReason ? <ReplayChip reason={replayReason} /> : null}
            {aside}
          </div>
        </div>
        <h1
          className={`display mt-2 max-w-[1500px] font-semibold leading-[1.08] ${depth ? "text-[40px]" : "text-[52px]"}`}
        >
          {headline}
        </h1>
      </header>
      <div className="min-h-0">{children}</div>
      {caption || (depth && technical) ? (
        <footer className="grid gap-3 border-t-2 border-[var(--ink)] pt-5">
          {caption ? (
            <p
              className={`font-medium leading-[1.3] ${depth ? "text-[25px]" : "text-[30px]"}`}
            >
              {caption}
            </p>
          ) : null}
          {depth && technical ? (
            <p className="mono text-[18px] leading-[1.45] text-[var(--muted-copy)]">
              {technical}
            </p>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}

export function ReplayChip({ reason }: { reason: string }) {
  return (
    <span
      className="mono inline-flex items-center gap-2 border-2 border-[var(--coral)] bg-white px-3 py-1.5 text-[17px] uppercase text-[var(--coral)]"
      title={reason}
    >
      <History className="size-5" />
      {replayTag}
    </span>
  );
}

export function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mono inline-grid min-w-9 place-items-center border-2 border-current px-2 text-[18px] leading-8">
      {children}
    </kbd>
  );
}
