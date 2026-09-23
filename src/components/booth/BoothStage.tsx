"use client";

import * as React from "react";
import { boothScreens, type BoothScreenId } from "@/content/booth-copy";
import type { BoothSnippetId } from "@/content/booth-snippets";
import { getSupportTicket, supportTickets } from "@/content/support-demo";
import type { HighlightedBoothSnippet } from "@/lib/highlight";
import { AbTestScreen } from "./AbTestScreen";
import { openDashboard } from "./DashboardLink";
import { DurableScreen } from "./DurableScreen";
import { ObserveScreen } from "./ObserveScreen";
import { KeyHintsOverlay, PresenterHud } from "./PresenterHud";
import { RecapScreen } from "./RecapScreen";
import { StartScreen } from "./StartScreen";
import { UnderTheHood } from "./UnderTheHood";
import { buildStepViews, replyText, runTotals } from "./run-view";
import { useFeedback, useSplitTest } from "./useAbTest";
import { useAgentRun } from "./useAgentRun";

/** The canvas every screen is designed on. Scaled as a whole to the display. */
const STAGE_W = 1920;
const STAGE_H = 1080;

const ORDER = boothScreens.map((screen) => screen.id);

/**
 * The booth demo: five screens on one fixed 16:9 stage, driven from the
 * keyboard (or by tapping), with one story and a depth toggle.
 *
 *   start → durable → observe → abtest → recap
 *
 * Picking a ticket starts a real run and moves to the durable screen. Every
 * later screen reads that same run, so the numbers on the recap are the ones
 * the audience watched being produced.
 */
export function BoothStage({
  snippets,
  qrSvg,
  ctaUrl,
}: {
  snippets: HighlightedBoothSnippet[];
  qrSvg: string;
  ctaUrl: string;
}) {
  const [screen, setScreen] = React.useState<BoothScreenId>("start");
  const [depth, setDepth] = React.useState(false);
  const [failureArmed, setFailureArmed] = React.useState(true);
  const [focusedTicket, setFocusedTicket] = React.useState(0);
  const [showKeys, setShowKeys] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [abFocus, setAbFocus] = React.useState<"feedback" | "split">("feedback");
  const scale = useStageScale();

  const { run, start: startRun, reset: resetRun } = useAgentRun();
  const { feedback, vote, reset: resetFeedback } = useFeedback();
  const { split, start: startSplit, reset: resetSplit } = useSplitTest();

  const ticket = getSupportTicket(run.ticketId ?? supportTickets[focusedTicket]?.id);
  const views = buildStepViews(run.timeline, run.model);
  const totals = runTotals(run.timeline, views);
  const replayReason = run.simulated ? run.replayReason : null;
  const hasRun = run.phase !== "idle";
  // Only a live run with a known Inngest run id has a trace worth opening. A
  // replay has nothing behind it, so its screens show no link at all.
  const traceUrl = !run.simulated && run.runId ? run.traceUrl : null;

  const pickTicket = React.useCallback(
    (index: number) => {
      const picked = supportTickets[index];
      if (!picked) return;

      setFocusedTicket(index);
      resetFeedback();
      resetSplit();
      setAbFocus("feedback");
      setStartedAt(Date.now());
      setScreen("durable");
      void startRun(picked.id, failureArmed);
    },
    [failureArmed, resetFeedback, resetSplit, startRun],
  );

  const reset = React.useCallback(() => {
    resetRun();
    resetFeedback();
    resetSplit();
    setAbFocus("feedback");
    setStartedAt(null);
    setShowKeys(false);
    setScreen("start");
  }, [resetFeedback, resetRun, resetSplit]);

  const castVote = React.useCallback(
    (signal: "good" | "bad") => {
      setAbFocus("feedback");
      void vote(signal, { supportRunId: run.supportRunId, runId: run.runId });
    },
    [run.runId, run.supportRunId, vote],
  );

  const runSplit = React.useCallback(() => {
    setAbFocus("split");
    if (split.status === "idle") void startSplit();
  }, [split.status, startSplit]);

  const go = React.useCallback(
    (delta: 1 | -1) => {
      // Forward from the start screen means "run the ticket in focus".
      if (screen === "start") {
        if (delta === 1) pickTicket(focusedTicket);
        return;
      }

      const index = ORDER.indexOf(screen);
      setScreen(ORDER[Math.max(0, Math.min(ORDER.length - 1, index + delta))]!);
    },
    [focusedTicket, pickTicket, screen],
  );

  /** Space: the screen's primary action, or next when it has none left. */
  const primary = React.useCallback(() => {
    if (screen === "start") return pickTicket(focusedTicket);
    if (screen === "abtest") {
      if (abFocus === "feedback") return setAbFocus("split");
      if (split.status === "idle") return runSplit();
      if (split.status === "running") return;
    }
    go(1);
  }, [abFocus, focusedTicket, go, pickTicket, runSplit, screen, split.status]);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();

      if (showKeys && (key === "escape" || key === "?")) {
        setShowKeys(false);
        return;
      }

      switch (key) {
        case " ":
        case "enter":
          event.preventDefault();
          primary();
          return;
        case "arrowright":
          event.preventDefault();
          if (screen === "start") {
            setFocusedTicket((index) => Math.min(supportTickets.length - 1, index + 1));
          } else {
            go(1);
          }
          return;
        case "arrowleft":
          event.preventDefault();
          if (screen === "start") {
            setFocusedTicket((index) => Math.max(0, index - 1));
          } else {
            go(-1);
          }
          return;
        case "1":
        case "2":
        case "3": {
          const index = Number(key) - 1;
          if (screen === "start") pickTicket(index);
          if (screen === "abtest" && index < 2) castVote(index === 0 ? "good" : "bad");
          return;
        }
        case "u":
          setDepth((current) => !current);
          return;
        case "f":
          setFailureArmed((current) => !current);
          return;
        case "d":
          openDashboard(screen === "abtest" && abFocus === "split" ? split.experimentUrl : run.traceUrl);
          return;
        case "r":
          reset();
          return;
        case "?":
          setShowKeys(true);
          return;
        case "escape":
          setShowKeys(false);
          return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abFocus, castVote, go, pickTicket, primary, reset, run.traceUrl, screen, showKeys, split.experimentUrl]);

  const snippetId: BoothSnippetId =
    screen === "abtest"
      ? abFocus === "split"
        ? "abtest-split"
        : "abtest-feedback"
      : screen === "observe"
        ? "observe"
        : screen === "recap"
          ? "recap"
          : "durable";
  const snippet = snippets.find((item) => item.id === snippetId) ?? snippets[0];

  return (
    <main className="booth-viewport fixed inset-0 overflow-hidden bg-[var(--ink)]">
      <div
        className="booth-stage absolute left-1/2 top-1/2 overflow-hidden bg-[var(--bone)] text-[var(--ink)]"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <div
          className="grid h-full"
          style={{ gridTemplateColumns: depth && snippet ? "minmax(0,1fr) 800px" : "minmax(0,1fr)" }}
        >
          <div className="relative min-h-0 min-w-0">
            {screen === "start" ? (
              <StartScreen
                focusedIndex={focusedTicket}
                onFocus={setFocusedTicket}
                onPick={pickTicket}
                failureArmed={failureArmed}
                depth={depth}
              />
            ) : null}
            {screen === "durable" ? (
              <DurableScreen
                ticket={ticket}
                views={views}
                phase={run.phase}
                replayReason={replayReason}
                traceUrl={traceUrl}
                depth={depth}
              />
            ) : null}
            {screen === "observe" ? (
              <ObserveScreen
                timeline={run.timeline}
                views={views}
                replayReason={replayReason}
                traceUrl={traceUrl}
                depth={depth}
              />
            ) : null}
            {screen === "abtest" ? (
              <AbTestScreen
                reply={replyText(views)}
                feedback={feedback}
                onVote={castVote}
                split={split}
                onRunSplit={runSplit}
                focus={abFocus}
                replayReason={replayReason}
                traceUrl={traceUrl}
                depth={depth}
              />
            ) : null}
            {screen === "recap" ? (
              <RecapScreen
                totals={totals}
                stepCount={views.length}
                feedback={feedback}
                split={split}
                qrSvg={qrSvg}
                ctaUrl={ctaUrl}
                replayReason={replayReason}
                traceUrl={traceUrl}
                depth={depth}
              />
            ) : null}
          </div>
          {depth && snippet ? <UnderTheHood snippet={snippet} /> : null}
        </div>
        {/* Spans the whole stage, not just the left pane: beside the code
            drawer the left pane is too narrow for the controls. */}
        <PresenterHud
          screen={screen}
          onJump={(target) => {
            if (target === "start") return reset();
            // Every later screen reads the run started by picking a
            // ticket. Without one, Durable would sit on its "gathering
            // data" spinner forever with no job behind it.
            if (!hasRun) return;
            setScreen(target);
          }}
          canJumpAhead={hasRun}
          onToggleDepth={() => setDepth((current) => !current)}
          startedAt={startedAt}
          phase={run.phase}
          simulated={run.simulated}
          failureArmed={failureArmed}
          depth={depth}
        />
        {showKeys ? <KeyHintsOverlay onClose={() => setShowKeys(false)} /> : null}
      </div>
    </main>
  );
}

/** Largest scale at which the 1920×1080 stage fits the window, letterboxed. */
function useStageScale(): number {
  return React.useSyncExternalStore(
    subscribeToResize,
    () => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H),
    () => 1,
  );
}

function subscribeToResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}
