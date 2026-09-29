"use client";

import * as React from "react";
import { FlaskConical, History, LoaderCircle, X } from "lucide-react";
import { consoleCopy, inngestLinks } from "@/content/booth-copy";
import { challengerSupportModel, currentSupportModel } from "@/content/support-demo";
import { InngestLink } from "./DashboardLink";
import { SPLIT_TEST_RUNS, type SplitTest } from "./useAbTest";

const copy = consoleCopy.split;

/**
 * The admin's split test: send the next tickets 50/50 across two models and
 * score every answer. The console only shows progress; the results are
 * read in Inngest.
 */
export function SplitTestPopover({
  split,
  onStart,
  onClose,
  rightOffset,
  maxWidth,
}: {
  split: SplitTest;
  onStart: () => void;
  onClose: () => void;
  /** Stage pixels from the right edge: clears the code drawer when open. */
  rightOffset: number;
  /** Stage pixels: keeps the popover inside a narrow, portrait stage. */
  maxWidth: number;
}) {
  const done = split.results.length;

  return (
    <div
      className="acme-popover absolute top-[92px] z-40 grid w-[720px] gap-5 p-7"
      style={{ right: rightOffset, maxWidth }}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <FlaskConical className="size-7 text-[var(--acme-accent)]" />
          <h2 className="text-[27px] font-semibold leading-tight">{copy.title}</h2>
        </div>
        <button type="button" className="acme-icon-button" onClick={onClose} aria-label="Close (Esc)">
          <X className="size-6" />
        </button>
      </header>

      <p className="text-[21px] leading-[1.45] text-[var(--acme-muted)]">
        {copy.body(SPLIT_TEST_RUNS, currentSupportModel, challengerSupportModel)}
      </p>

      {split.status === "idle" ? (
        <button type="button" className="acme-button justify-self-start" onClick={onStart}>
          {copy.start}
        </button>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-[20px]">
              <span className="inline-flex items-center gap-2 font-semibold">
                {split.status === "running" ? <LoaderCircle className="size-5 animate-spin" /> : null}
                {split.status === "running" && done === 0
                  ? copy.running
                  : copy.progress(done, SPLIT_TEST_RUNS)}
              </span>
              {split.simulated ? (
                <span className="acme-pill" data-tone="warn">
                  <History className="size-4" /> {copy.replay}
                </span>
              ) : null}
            </div>
            <div className="acme-progress">
              <span style={{ width: `${(done / SPLIT_TEST_RUNS) * 100}%` }} />
            </div>
          </div>

          {split.status === "complete" ? (
            <div className="flex items-center justify-between gap-4">
              {split.simulated ? <span /> : (
                <InngestLink href={split.experimentUrl} label={inngestLinks.experiment} />
              )}
              <button type="button" className="acme-button" data-tone="quiet" onClick={onStart}>
                {copy.again}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
