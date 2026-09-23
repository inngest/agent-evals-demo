import * as React from "react";
import {
  Check,
  LoaderCircle,
  Star,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import { abTestCopy, inngestLinks } from "@/content/booth-copy";
import {
  challengerSupportModel,
  currentSupportModel,
  getSupportTicket,
} from "@/content/support-demo";
import { formatWinnerDelta } from "./run-view";
import type { Feedback, SplitTest } from "./useAbTest";
import { SPLIT_TEST_RUNS } from "./useAbTest";
import { InngestLink } from "./DashboardLink";
import { KeyCap, ScreenFrame } from "./ScreenFrame";

/**
 * Bars start at this quality rather than zero. At a booth the point is the
 * gap between variants, and 0.84 vs 0.91 on a zero-based bar is invisible
 * from across the aisle. The axis floor is printed on screen.
 */
const QUALITY_FLOOR = 0.5;

export function AbTestScreen({
  reply,
  feedback,
  onVote,
  split,
  onRunSplit,
  focus,
  replayReason,
  traceUrl,
  depth,
}: {
  reply: string | null;
  feedback: Feedback | null;
  onVote: (signal: "good" | "bad") => void;
  split: SplitTest;
  onRunSplit: () => void;
  /** Which half the driver is on; the code drawer follows it too. */
  focus: "feedback" | "split";
  replayReason: string | null;
  traceUrl: string | null;
  depth: boolean;
}) {
  // The vote lands on the run's trace; the split test has its own view. Each
  // link appears once there is something real behind it.
  const showExperiment = split.status !== "idle" && !split.simulated;
  return (
    <ScreenFrame
      eyebrow={abTestCopy.eyebrow}
      headline={abTestCopy.headline}
      replayReason={replayReason}
      aside={
        traceUrl || showExperiment ? (
          <div className="flex gap-3">
            {traceUrl ? <InngestLink href={traceUrl} label={inngestLinks.trace} /> : null}
            {showExperiment ? (
              <InngestLink href={split.experimentUrl} label={inngestLinks.experiment} />
            ) : null}
          </div>
        ) : null
      }
      caption={abTestCopy.business}
      technical={abTestCopy.technical}
      depth={depth}
    >
      {depth ? (
        // Beside the code drawer there is room for one panel. Show the one
        // in focus and collapse the other to a line, so the code on the
        // right always matches the panel on the left.
        <div className="grid h-full min-h-0 content-start gap-5">
          {focus === "feedback" ? (
            <>
              <FeedbackPanel reply={reply} feedback={feedback} onVote={onVote} />
              <CollapsedLine>
                {abTestCopy.split.title} <KeyCap>Space</KeyCap>
              </CollapsedLine>
            </>
          ) : (
            <>
              <CollapsedLine>
                {abTestCopy.feedback.title}
                <span className={feedback ? "text-[var(--teal)]" : undefined}>
                  {feedback
                    ? `${feedback.signal === "good" ? abTestCopy.feedback.good : abTestCopy.feedback.bad} · support_human_feedback = ${feedback.signal === "good" ? 1 : 0}`
                    : "No vote yet"}
                </span>
              </CollapsedLine>
              <SplitPanel split={split} onRun={onRunSplit} compact />
            </>
          )}
        </div>
      ) : (
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8">
          <FeedbackPanel reply={reply} feedback={feedback} onVote={onVote} />
          <SplitPanel split={split} onRun={onRunSplit} />
        </div>
      )}
    </ScreenFrame>
  );
}

function CollapsedLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono flex items-center gap-4 border-[3px] border-[var(--rule-soft)] bg-white px-6 py-2 text-[20px] uppercase text-[var(--muted-copy)]">
      {children}
    </div>
  );
}

function FeedbackPanel({
  reply,
  feedback,
  onVote,
}: {
  reply: string | null;
  feedback: Feedback | null;
  onVote: (signal: "good" | "bad") => void;
}) {
  const copy = abTestCopy.feedback;

  return (
    <div className="grid min-h-0 content-start gap-5 border-[3px] border-[var(--ink)] bg-white p-7">
      <h2 className="display text-[34px] font-semibold">{copy.title}</h2>
      {reply ? (
        <blockquote className="line-clamp-4 border-l-[6px] border-[var(--ink)] pl-5 text-[23px] leading-[1.4]">
          {reply}
        </blockquote>
      ) : null}
      <div className="grid grid-cols-2 gap-4">
        <VoteButton
          active={feedback?.signal === "good"}
          onClick={() => onVote("good")}
          keyLabel="1"
          icon={<ThumbsUp className="size-8" />}
          label={copy.good}
        />
        <VoteButton
          active={feedback?.signal === "bad"}
          onClick={() => onVote("bad")}
          keyLabel="2"
          icon={<ThumbsDown className="size-8" />}
          label={copy.bad}
        />
      </div>
      <div className="mono min-h-[28px] text-[19px] uppercase">
        {feedback ? <Receipt feedback={feedback} /> : null}
      </div>
      <p className="text-[21px] leading-[1.4] text-[var(--muted-copy)]">
        {copy.explainer}
      </p>
    </div>
  );
}

function VoteButton({
  active,
  onClick,
  keyLabel,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  keyLabel: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="booth-vote flex h-[96px] items-center justify-center gap-4 border-[3px] border-[var(--ink)] text-[27px] font-semibold"
    >
      {icon}
      {label}
      <KeyCap>{keyLabel}</KeyCap>
    </button>
  );
}

function Receipt({ feedback }: { feedback: Feedback }) {
  const copy = abTestCopy.feedback;
  const value = feedback.signal === "good" ? 1 : 0;

  if (feedback.receipt === "pending") {
    return (
      <span className="inline-flex items-center gap-2 text-[var(--muted-copy)]">
        <LoaderCircle className="size-5 animate-spin" /> {copy.pendingReceipt}
      </span>
    );
  }

  if (feedback.receipt === "offline") {
    return (
      <span className="inline-flex items-center gap-2 text-[var(--coral)]">
        <TriangleAlert className="size-5" /> {copy.offline}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-[var(--teal)]">
      <Check className="size-5" strokeWidth={3} />
      {feedback.receipt === "recorded" ? copy.recorded : copy.sent} ·
      support_human_feedback = {value}
    </span>
  );
}

function SplitPanel({
  split,
  onRun,
  compact = false,
}: {
  split: SplitTest;
  onRun: () => void;
  compact?: boolean;
}) {
  const copy = abTestCopy.split;
  const { aggregate } = split;
  const winner = split.status === "complete" ? aggregate.winner : null;
  const winnerRow = aggregate.variants.find((row) => row.variant === winner);
  const loserRow = aggregate.variants.find(
    (row) => row.variant !== winner && row.runs > 0,
  );
  const latest =
    split.status === "running" ? split.results[split.results.length - 1] : undefined;

  return (
    <div
      className={`grid min-h-0 content-start border-[3px] border-[var(--ink)] bg-white ${compact ? "gap-2.5 px-5 py-4" : "gap-5 p-7"}`}
    >
      <div className="flex items-center justify-between gap-6">
        <h2 className={`display font-semibold ${compact ? "text-[28px]" : "text-[34px]"}`}>
          {copy.title}
        </h2>
        {split.status === "idle" ? (
          <button
            type="button"
            onClick={onRun}
            className="booth-primary inline-flex h-[64px] items-center gap-4 px-7 text-[25px] font-semibold"
          >
            {copy.run}
            <KeyCap>Space</KeyCap>
          </button>
        ) : split.status === "running" ? (
          <span className="mono inline-flex items-center gap-3 text-[20px] uppercase text-[var(--muted-copy)]">
            <LoaderCircle className="size-6 animate-spin" /> {copy.running}
          </span>
        ) : null}
      </div>

      {split.simulated ? (
        <div className="mono inline-flex w-fit items-center gap-2 border-2 border-[var(--coral)] px-3 py-1 text-[17px] uppercase text-[var(--coral)]">
          <TriangleAlert className="size-5" /> {copy.simulated}
        </div>
      ) : null}

      <RoutingFeed split={split} compact={compact} />

      <div className={`grid ${compact ? "gap-3" : "gap-4"}`}>
        {[currentSupportModel, challengerSupportModel].map((model) => {
          const row = aggregate.variants.find((variant) => variant.variant === model);
          const runs = split.results.filter((result) => result.model === model);
          const isWinner = winner === model;

          return (
            <div
              key={model}
              className={`grid border-[3px] ${compact ? "gap-2 px-4 py-3" : "gap-3 p-5"}`}
              data-winner={isWinner}
              style={{
                borderColor: isWinner ? "var(--teal)" : "var(--rule-soft)",
              }}
            >
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-baseline gap-3">
                  <span className="mono text-[26px] font-semibold">{model}</span>
                  <span className="mono text-[17px] uppercase text-[var(--muted-copy)]">
                    {model === currentSupportModel ? "current" : "challenger"}
                  </span>
                  {isWinner ? (
                    <span className="mono inline-flex items-center gap-1.5 bg-[var(--teal)] px-2.5 py-0.5 text-[18px] uppercase text-white">
                      <Star className="size-4 fill-current" /> {copy.winner}
                    </span>
                  ) : null}
                </div>
                <span className="mono text-[19px] uppercase text-[var(--muted-copy)]">
                  {runs.length} {copy.runsLabel}
                </span>
              </div>

              <div className="flex h-9 gap-1.5">
                {Array.from({ length: SPLIT_TEST_RUNS }, (_, index) => {
                  const run = runs[index];
                  return (
                    <div
                      key={index}
                      className="booth-run-chip mono flex flex-1 items-center justify-center gap-1.5 text-[14px]"
                      data-filled={Boolean(run)}
                      // The ticket that just landed, so the eye can follow it.
                      data-latest={Boolean(run) && run === latest}
                      title={run ? getSupportTicket(run.ticketId).title : undefined}
                    >
                      {run ? (
                        <>
                          <span className="uppercase opacity-70">
                            {getSupportTicket(run.ticketId).tag}
                          </span>
                          {run.qualityScore.toFixed(2)}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_80px_190px] items-center gap-4">
                <div className="h-6 bg-[var(--bone)]" aria-label={copy.quality}>
                  <div
                    className="h-full transition-[width] duration-500"
                    style={{
                      width: `${row && row.runs > 0 ? Math.max(2, ((row.qualityScore - QUALITY_FLOOR) / (1 - QUALITY_FLOOR)) * 100) : 0}%`,
                      background: isWinner ? "var(--teal)" : "var(--ink)",
                    }}
                  />
                </div>
                <span className="mono text-right text-[24px] font-semibold tabnum">
                  {row && row.runs > 0 ? row.qualityScore.toFixed(2) : "–"}
                </span>
                <span className="mono text-right text-[20px] tabnum text-[var(--muted-copy)]">
                  {row && row.runs > 0 ? `$${row.costUsd.toFixed(3)} ${copy.cost}` : "–"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between gap-6">
        <span className="mono text-[15px] uppercase text-[var(--muted-copy)]">
          {copy.quality} · axis starts at {QUALITY_FLOOR.toFixed(1)}
        </span>
        {winnerRow && loserRow ? (
          <span className="text-[25px] font-semibold text-[var(--teal)]">
            {winner}: {formatWinnerDelta(aggregate)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One line narrating the split as it happens: what is about to be split,
 * then each ticket as it lands (which model got it, what it scored), then a
 * summary of where the traffic went. The lanes below show the same data; this
 * line says it out loud for anyone who walked up mid-run.
 */
function RoutingFeed({
  split,
  compact,
}: {
  split: SplitTest;
  compact: boolean;
}) {
  const feed = abTestCopy.split.feed;
  const total = SPLIT_TEST_RUNS;
  const latest = split.results[split.results.length - 1];
  let text: string;

  if (split.status === "idle") {
    text = feed.idle(total);
  } else if (split.status === "complete") {
    const counts = split.aggregate.variants
      .map((row) => `${row.runs} → ${row.variant}`)
      .join(" · ");
    text = feed.done(split.results.length, counts);
  } else if (latest) {
    text = feed.routed(
      split.results.length,
      total,
      getSupportTicket(latest.ticketId).title,
      latest.model,
      latest.qualityScore.toFixed(2),
    );
  } else {
    text = feed.starting;
  }

  return (
    <div
      // Keyed on progress so each new ticket re-runs the entry animation.
      key={`${split.status}-${split.results.length}`}
      className={`booth-feed mono border-l-4 border-[var(--coral)] bg-[var(--bone)] px-4 text-[18px] text-[var(--ink)] ${compact ? "py-1.5" : "py-2"}`}
      aria-live="polite"
    >
      {text}
    </div>
  );
}
