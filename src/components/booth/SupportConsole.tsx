"use client";

import * as React from "react";
import { FlaskConical } from "lucide-react";
import { consoleCopy } from "@/content/booth-copy";
import type { BoothSnippetId } from "@/content/booth-snippets";
import {
  getSupportTicket,
  supportTickets,
  type SupportTicketId,
} from "@/content/support-demo";
import type { HighlightedBoothSnippet } from "@/lib/highlight";
import { openDashboard } from "./DashboardLink";
import { Inbox, type TicketStatus } from "./Inbox";
import { KeyHintsOverlay, PresenterHud } from "./PresenterHud";
import { SplitTestPopover } from "./SplitTestPopover";
import { Thread, type FollowUpStage, type TurnView } from "./Thread";
import { UnderTheHood } from "./UnderTheHood";
import { buildStepViews, isEscalated } from "./run-view";
import type { AgentRun } from "./useAgentRun";
import { useFeedback, useSplitTest } from "./useAbTest";
import { useAgentRun } from "./useAgentRun";

/** The canvas the console is designed on. Scaled as a whole to the display. */
const STAGE_W = 1920;
const STAGE_H = 1080;
const DRAWER_W = 760;
/** Below this width:height the window is portrait (a split screen, a phone). */
const TALL_BELOW_ASPECT = 1.3;
/** Pause before the customer starts typing a follow-up, then before it lands. */
const TYPING_AFTER_MS = 1_200;
const FOLLOW_UP_AFTER_MS = 3_200;

/**
 * Acme Support: a helpdesk whose AI agent is an Inngest function. It is the
 * booth's stage-setter, a product everyone recognises, so that when the
 * driver clicks through to the trace the audience already knows what every
 * step in it did.
 *
 * Opening a ticket starts a real run. The agent's activity in the thread is
 * the same six durable steps the trace shows; the vote is a score on that
 * run; the split test is a real group.experiment. Each one links to Inngest.
 */
export function SupportConsole({
  snippets,
  qrSvg,
}: {
  snippets: HighlightedBoothSnippet[];
  qrSvg: string;
}) {
  const [depth, setDepth] = React.useState(false);
  const [failureArmed, setFailureArmed] = React.useState(true);
  const [showKeys, setShowKeys] = React.useState(false);
  const [showSplit, setShowSplit] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  // Tickets already worked this session keep their outcome in the inbox.
  const [worked, setWorked] = React.useState<ReadonlyMap<SupportTicketId, TicketStatus>>(
    new Map(),
  );
  const stage = useStage();

  const { run: first, start: startFirst, reset: resetFirst } = useAgentRun();
  const { run: second, start: startSecond, reset: resetSecond } = useAgentRun();
  const { feedback, vote, reset: resetFeedback } = useFeedback();
  const { split, start: startSplit, reset: resetSplit } = useSplitTest();
  // Keyed by the run it follows, so a new ticket starts with no follow-up.
  const [followUp, setFollowUp] = React.useState<{ of: string | null; stage: FollowUpStage }>({
    of: null,
    stage: "none",
  });

  const ticket = first.ticketId ? getSupportTicket(first.ticketId) : null;
  const followUpStage: FollowUpStage =
    followUp.of !== null && followUp.of === first.supportRunId ? followUp.stage : "none";
  const turns: TurnView[] = [first, ...(second.phase !== "idle" ? [second] : [])].map(toTurn);
  const latest = turns[turns.length - 1]!;
  const traceUrl = latest.traceUrl;
  // The thread is done when its last run is, and no follow-up is pending.
  const complete =
    latest.run.phase === "complete" && (!ticket?.followUp || second.phase !== "idle");
  const outcome: TicketStatus = isEscalated(latest.views) ? "escalated" : "resolved";

  // A ticket that goes badly with a follow-up: once the first reply lands,
  // the customer writes back and the agent runs again as turn 2.
  React.useEffect(() => {
    if (first.phase !== "complete" || !ticket?.followUp || !first.supportRunId) return;
    if (second.phase !== "idle") return;

    const of = first.supportRunId;
    const ticketId = ticket.id;
    const typing = window.setTimeout(
      () => setFollowUp({ of, stage: "typing" }),
      TYPING_AFTER_MS,
    );
    const send = window.setTimeout(() => {
      setFollowUp({ of, stage: "sent" });
      void startSecond(ticketId, false, { followUpOf: first.simulated ? null : of });
    }, FOLLOW_UP_AFTER_MS);

    return () => {
      window.clearTimeout(typing);
      window.clearTimeout(send);
    };
  }, [first.phase, first.simulated, first.supportRunId, second.phase, startSecond, ticket]);

  const statusOf = React.useCallback(
    (id: SupportTicketId): TicketStatus => {
      if (id === first.ticketId) return complete ? outcome : "working";
      return worked.get(id) ?? "open";
    },
    [complete, first.ticketId, outcome, worked],
  );

  const pickTicket = React.useCallback(
    (index: number) => {
      const picked = supportTickets[index];
      if (!picked) return;

      // The ticket being left keeps its badge in the inbox.
      if (first.ticketId && complete) {
        const left = first.ticketId;
        setWorked((current) => new Map(current).set(left, outcome));
      }
      resetFeedback();
      resetSecond();
      setStartedAt((current) => current ?? Date.now());
      void startFirst(picked.id, failureArmed);
    },
    [complete, failureArmed, first.ticketId, outcome, resetFeedback, resetSecond, startFirst],
  );

  const reset = React.useCallback(() => {
    resetFirst();
    resetSecond();
    resetFeedback();
    resetSplit();
    setWorked(new Map());
    setStartedAt(null);
    setShowKeys(false);
    setShowSplit(false);
  }, [resetFeedback, resetFirst, resetSecond, resetSplit]);

  const castVote = React.useCallback(
    (signal: "good" | "bad") => {
      if (!complete) return;
      // The vote judges the conversation's last reply, so it scores that run.
      void vote(signal, { supportRunId: latest.run.supportRunId, runId: latest.run.runId });
    },
    [complete, latest.run.runId, latest.run.supportRunId, vote],
  );

  const runSplit = React.useCallback(() => {
    setShowSplit(true);
    void startSplit();
  }, [startSplit]);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();

      switch (key) {
        case "1":
        case "2":
        case "3":
        case "4":
          pickTicket(Number(key) - 1);
          return;
        case "g":
          castVote("good");
          return;
        case "b":
          castVote("bad");
          return;
        case "s":
          if (!showSplit) setShowSplit(true);
          else if (split.status !== "running") runSplit();
          return;
        case "u":
          setDepth((current) => !current);
          return;
        case "f":
          setFailureArmed((current) => !current);
          return;
        case "d":
          if (showSplit && split.status === "complete" && !split.simulated) {
            openDashboard(split.experimentUrl);
          } else if (traceUrl) {
            openDashboard(traceUrl);
          }
          return;
        case "r":
          reset();
          return;
        case "?":
          setShowKeys((current) => !current);
          return;
        case "escape":
          setShowKeys(false);
          setShowSplit(false);
          return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [castVote, pickTicket, reset, runSplit, showSplit, split, traceUrl]);

  const snippetId: BoothSnippetId = showSplit
    ? "abtest-split"
    : latest.run.phase === "complete"
      ? "scores"
      : "durable";
  const snippet = snippets.find((item) => item.id === snippetId) ?? snippets[0];
  const drawer = depth && snippet;

  return (
    <main className="booth-viewport fixed inset-0 overflow-hidden bg-[#0e1117]">
      <div
        className="acme-console absolute left-1/2 top-1/2 grid overflow-hidden"
        style={{
          width: stage.width,
          height: stage.height,
          transform: `translate(-50%, -50%) scale(${stage.scale})`,
          gridTemplateRows: "auto minmax(0,1fr) auto",
        }}
        data-layout={stage.tall ? "tall" : "wide"}
      >
        <header className="acme-topbar flex items-center justify-between gap-6 px-8" data-tall={stage.tall}>
          <div className="flex items-center gap-4">
            <span className="acme-logo" aria-hidden>
              A
            </span>
            <span className="text-[27px] font-semibold">
              {consoleCopy.brand} <span className="font-normal opacity-70">{consoleCopy.product}</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="acme-button"
              data-tone="quiet"
              data-active={showSplit}
              onClick={() => setShowSplit((current) => !current)}
              title="Split-test a model (S)"
              aria-label={consoleCopy.split.button}
            >
              <FlaskConical className="size-5" />
              {stage.tall ? null : consoleCopy.split.button}
            </button>
          </div>
        </header>

        <div
          className="grid min-h-0 min-w-0"
          style={
            stage.tall
              ? {
                  // Portrait: the inbox is a strip over the thread, and the
                  // code drawer opens beneath it.
                  gridTemplateColumns: "minmax(0,1fr)",
                  gridTemplateRows: `auto minmax(0,1fr)${drawer ? " minmax(0,0.9fr)" : ""}`,
                }
              : {
                  gridTemplateColumns: `${drawer ? 360 : 440}px minmax(0,1fr)${drawer ? ` ${DRAWER_W}px` : ""}`,
                }
          }
        >
          <Inbox
            tickets={supportTickets}
            activeId={first.ticketId}
            statusOf={statusOf}
            onPick={pickTicket}
            failureArmed={failureArmed}
            onToggleFailure={() => setFailureArmed((current) => !current)}
            qrSvg={qrSvg}
            layout={stage.tall ? (stage.width < 900 ? "strip-narrow" : "strip") : "sidebar"}
          />
          <Thread
            ticket={ticket}
            turns={turns}
            followUpStage={followUpStage}
            feedback={feedback}
            onVote={castVote}
            tall={stage.tall}
          />
          {drawer ? <UnderTheHood snippet={snippet} compact={stage.tall} /> : null}
        </div>

        <PresenterHud
          onToggleDepth={() => setDepth((current) => !current)}
          startedAt={startedAt}
          phase={latest.run.phase}
          simulated={latest.run.simulated}
          depth={depth}
          outage={
            stage.tall
              ? { on: failureArmed, onToggle: () => setFailureArmed((current) => !current) }
              : undefined
          }
        />

        {showSplit ? (
          <SplitTestPopover
            split={split}
            onStart={runSplit}
            onClose={() => setShowSplit(false)}
            // Beside the drawer, not over it: the drawer is showing this
            // popover's code.
            rightOffset={drawer && !stage.tall ? DRAWER_W + 32 : 32}
            maxWidth={stage.width - 64}
          />
        ) : null}
        {showKeys ? <KeyHintsOverlay onClose={() => setShowKeys(false)} /> : null}
      </div>
    </main>
  );
}

function toTurn(run: AgentRun): TurnView {
  return {
    run,
    views: buildStepViews(run.timeline, run.model),
    // Only a live run with a known Inngest run id has a trace worth opening.
    // A replay has nothing behind it, so it shows no link at all.
    traceUrl: !run.simulated && run.runId ? run.traceUrl : null,
  };
}

type Stage = { width: number; height: number; scale: number; tall: boolean };

/**
 * The canvas to draw on and the scale that fits it to the window. A
 * landscape window gets the 1920×1080 stage, letterboxed. A portrait one
 * (half of a split screen, a phone) gets a narrower canvas as tall as the
 * window, so the console fills it instead of shrinking to a strip.
 */
function useStage(): Stage {
  const size = React.useSyncExternalStore(
    subscribeToResize,
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => `${STAGE_W}x${STAGE_H}`,
  );

  return React.useMemo(() => {
    const [innerW, innerH] = size.split("x").map(Number) as [number, number];

    if (innerW / innerH >= TALL_BELOW_ASPECT) {
      return {
        width: STAGE_W,
        height: STAGE_H,
        scale: Math.min(innerW / STAGE_W, innerH / STAGE_H),
        tall: false,
      };
    }

    // Drawn wider than the window on a phone so the type stays legible
    // without the layout running out of room.
    const width = Math.round(Math.min(1080, Math.max(800, innerW * 1.5)));
    const scale = innerW / width;
    return { width, height: Math.round(innerH / scale), scale, tall: true };
  }, [size]);
}

function subscribeToResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}
