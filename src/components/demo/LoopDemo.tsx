"use client";

import * as React from "react";
import {
  Check,
  ExternalLink,
  Eye,
  FlaskConical,
  Gauge,
  Play,
  Repeat,
  RotateCcw,
  Save,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import { CodeView } from "@/components/demo/CodeView";
import { DashboardLink } from "@/components/demo/DashboardLink";
import { AbTestScorecard, type MetricRow } from "@/components/demo/AbTestScorecard";
import { PrimitivesReference } from "@/components/demo/PrimitivesReference";
import { StepTimeline } from "@/components/demo/StepTimeline";
import { VariantComparison } from "@/components/demo/VariantComparison";
import { Button } from "@/components/ui/button";
import {
  BRIEF_STEP_ID,
  defaultResearchTopic,
  type ResearchRunSummary,
} from "@/content/research-demo";
import {
  LOOP_TAGLINE,
  abTestCopy,
  getLoopStage,
  loopPillars,
  loopStages,
  type LoopStageId,
} from "@/content/loop-messaging";
import type { ExperimentAggregate } from "@/lib/experiment-results";
import type { SandboxRunSummary } from "@/inngest/functions/research-agent";
import type { RunTimeline } from "@/inngest/middlewares/step-tracker";
import { SANDBOX_ENABLED } from "@/lib/feature-flags";
import { getDeepLink } from "@/lib/inngest-dashboard";
import type { LoopSnippetId } from "@/content/loop-snippets";
import type {
  HighlightedLoopSnippet,
  HighlightedPrimitiveCard,
} from "@/lib/highlight";
import type { ResearchFeedbackSignal } from "@/inngest/client";

type LoopDemoProps = {
  snippets: HighlightedLoopSnippet[];
  primitives: HighlightedPrimitiveCard[];
};

type RunPhase =
  | "idle"
  | "sending"
  | "running"
  | "retrying"
  | "complete"
  | "error"
  | "stalled";

/**
 * A message that stays on screen until the next action clears it. Toasts are
 * wrong for terminal states: a driver three minutes into a slow cloud run was
 * left looking at an "idle" pill with no explanation, because the only notice
 * had already timed out.
 */
type Notice = { tone: "warn" | "error"; message: string } | null;

type TriggerResponse = {
  ok: boolean;
  sent: boolean;
  researchRunId: string;
  eventId: string;
  dashboardUrl: string;
  traceUrl: string;
  runId?: string;
  inngestEventId?: string;
  error?: string;
};

type LoopRunResult = ResearchRunSummary & { sandbox?: SandboxRunSummary };

type StatusResponse = {
  ok: boolean;
  status: "queued" | "running" | "completed" | "failed";
  hadRetry: boolean;
  completedSteps: number;
  totalSteps: number;
  runId?: string;
  traceUrl: string;
  result: LoopRunResult | null;
  error?: string;
  timeline?: RunTimeline | null;
  /** True when no real run was observed and the timeline is a rehearsal. */
  simulated?: boolean;
};

type FeedbackState = {
  signal: ResearchFeedbackSignal;
  score: number;
  feedbackAt: string;
};

type OutcomeState = {
  outcome: "shipped" | "wrong";
  score: number;
  observedAt: string;
  daysLater: number;
};

type ExperimentState = {
  batchId: string;
  runCount: number;
  sent: boolean;
  experimentUrl: string;
};

type ExperimentResults = ExperimentAggregate & { simulated?: boolean };

/** A durable step observed on the scoring function's own run. */
type ScorerStep = { name: string; durationMs?: number };

type SandboxAccess = {
  mode: "sandbox" | "simulated";
  reason: string;
};

const stageIcons: Record<LoopStageId, React.ComponentType<{ className?: string }>> = {
  run: Play,
  observe: Eye,
  abtest: FlaskConical,
};

export function LoopDemo({ snippets, primitives }: LoopDemoProps) {
  const [activeStage, setActiveStage] = React.useState<LoopStageId>("run");
  const [paneTab, setPaneTab] = React.useState<"code" | "primitives">("code");
  const [phase, setPhase] = React.useState<RunPhase>("idle");
  const [trigger, setTrigger] = React.useState<TriggerResponse | null>(null);
  const [result, setResult] = React.useState<LoopRunResult | null>(null);
  const [timeline, setTimeline] = React.useState<RunTimeline | null>(null);
  const [failureArmed, setFailureArmed] = React.useState(true);
  const [sandboxArmed, setSandboxArmed] = React.useState(SANDBOX_ENABLED);
  const [sandboxAccess, setSandboxAccess] = React.useState<SandboxAccess | null>(null);
  const [lastFeedback, setLastFeedback] = React.useState<FeedbackState | null>(null);
  const [toast, setToast] = React.useState("");
  const [notice, setNotice] = React.useState<Notice>(null);
  const [signalPending, setSignalPending] = React.useState(false);
  const [experimentPending, setExperimentPending] = React.useState(false);
  const toastTimer = React.useRef<number | null>(null);
  const [topPaneHeight, setTopPaneHeight] = React.useState(360);
  const [experiment, setExperiment] = React.useState<ExperimentState | null>(
    null,
  );
  const [experimentResults, setExperimentResults] =
    React.useState<ExperimentResults | null>(null);
  const [lastOutcome, setLastOutcome] = React.useState<OutcomeState | null>(
    null,
  );
  const [outcomePending, setOutcomePending] = React.useState(false);
  const [scorerSteps, setScorerSteps] = React.useState<
    Record<string, ScorerStep>
  >({});
  const [runModel, setRunModel] = React.useState<string>("gpt-5.5");
  const [abTestFocus, setAbTestFocus] = React.useState<
    "measure" | "defer" | "variants"
  >("measure");

  const isRunning =
    phase === "sending" || phase === "running" || phase === "retrying";
  const activeSnippetId: LoopSnippetId =
    activeStage === "run"
      ? "run"
      : activeStage === "observe"
        ? "observe"
        : abTestFocus === "defer"
          ? "abtest-defer"
          : abTestFocus === "variants"
            ? "abtest-variants"
            : "abtest-measure";
  const dashboardUrl = trigger?.dashboardUrl ?? getDeepLink("envDashboard");
  const traceUrl = trigger?.traceUrl ?? getDeepLink("runTrace");
  const metricsUrl = getDeepLink("scoresOnTrace", { runId: trigger?.runId });
  const insightsUrl = getDeepLink("insights");
  const brief = extractBriefOutput(timeline);
  const experimentUrl =
    experiment?.experimentUrl ??
    getDeepLink("experiment", {
      experimentId: "research-agent-model-bakeoff",
    });
  const scorecardRunId = trigger?.runId ?? trigger?.researchRunId;
  const metricRows = buildMetricRows({
    feedback: lastFeedback,
    outcome: lastOutcome,
    runId: scorecardRunId,
    scorerSteps,
  });

  React.useEffect(() => {
    if (!SANDBOX_ENABLED) return;

    let cancelled = false;

    fetch("/api/demo/status")
      .then((response) => response.json())
      .then((body: { sandbox?: SandboxAccess }) => {
        if (!cancelled && body.sandbox) {
          setSandboxAccess(body.sandbox);
        }
      })
      .catch(() => {
        // Offline-safe: the toggle just stays labeled "simulated".
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function resizeFrom(startY: number, startHeight: number) {
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "row-resize";

    const handleMove = (clientY: number) => {
      const nextHeight = startHeight + clientY - startY;
      const maxHeight = Math.max(220, window.innerHeight - 300);
      setTopPaneHeight(Math.max(180, Math.min(maxHeight, nextHeight)));
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleMove(moveEvent.clientY);
    };

    const handleTouchMove = (moveEvent: TouchEvent) => {
      const touch = moveEvent.touches[0];
      if (!touch) return;
      moveEvent.preventDefault();
      handleMove(touch.clientY);
    };

    const stopResize = () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", stopResize);
      window.removeEventListener("touchcancel", stopResize);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", stopResize);
    window.addEventListener("touchcancel", stopResize);
  }

  function startMouseResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    resizeFrom(event.clientY, topPaneHeight);
  }

  function startTouchResize(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    resizeFrom(touch.clientY, topPaneHeight);
  }

  async function runResearch(model?: string) {
    // Guard the arg: this is also referenced from click handlers, where React
    // would otherwise pass the event object through as the model.
    const nextModel = typeof model === "string" && model.length > 0 ? model : runModel;

    setRunModel(nextModel);
    setActiveStage("run");
    setNotice(null);
    setPhase("sending");
    setTrigger(null);
    setResult(null);
    setTimeline(null);
    setLastFeedback(null);
    setLastOutcome(null);
    setScorerSteps({});
    setExperimentResults(null);
    setToast("");

    try {
      const response = await postJson<TriggerResponse>("/api/research/trigger", {
        topic: defaultResearchTopic,
        failureStep: failureArmed ? "fetch-competitor-changelog" : "none",
        useSandbox: sandboxArmed,
        model: nextModel,
      });

      setTrigger(response);

      if (!response.sent) {
        showToast("Foreground mode; Inngest is not reachable");
      }

      let completed = false;
      let lastStatusError = "";

      // Cloud runs (real model calls + retry backoff + memoized replays) can
      // take a minute or more. Poll to a terminal state or a generous
      // deadline; never fabricate a result on timeout. Counted in ticks rather
      // than wall-clock so this stays a pure render path.
      const pollIntervalMs = 800;
      const maxPolls = Math.ceil(180_000 / pollIntervalMs);
      let polls = 0;

      while (polls < maxPolls && !completed) {
        polls += 1;
        await wait(pollIntervalMs);
        const status = await fetchStatus(response, {
          useSandbox: sandboxArmed,
          failureStep: failureArmed ? "fetch-competitor-changelog" : "none",
        }).catch((error: unknown) => {
          lastStatusError =
            error instanceof Error ? error.message : "Run status unavailable";
          return null;
        });

        if (!status) {
          setPhase("running");
          continue;
        }

        lastStatusError = "";
        applyStatus(status);

        if (status.status === "completed" && status.result) {
          completed = true;
        }

        if (status.status === "failed") {
          setPhase("error");
          setNotice({
            tone: "error",
            message: status.error ?? "Research run failed",
          });
          return;
        }
      }

      if (!completed) {
        // Keep the last timeline on screen and say so persistently. The run is
        // still going in Inngest; the trace link is the way to follow it.
        setPhase("stalled");
        setNotice({
          tone: "warn",
          message: lastStatusError
            ? "Status unavailable. The run is still executing in Inngest; open the trace."
            : "Still executing in Inngest after 3 minutes. Open the trace to watch it finish.",
        });
      }
    } catch (error) {
      setPhase("error");
      setNotice({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Research run failed",
      });
    }
  }

  /**
   * Polls the SCORING function's own timeline for the step that attached the
   * score. This is the receipt: the demo claims a durable step ran, so it shows
   * the step. Gives up quietly - a missing receipt must not break the stage.
   */
  async function trackScorerStep(researchRunId: string, stepName: string) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await wait(800);

      const found = await fetchScorerStep(researchRunId, stepName);

      if (found) {
        setScorerSteps((current) => ({ ...current, [stepName]: found }));
        return;
      }
    }
  }

  async function sendSignal(signal: ResearchFeedbackSignal) {
    if (signalPending) return;

    setActiveStage("abtest");
    setAbTestFocus("measure");
    setNotice(null);
    setSignalPending(true);

    const optimistic = {
      signal,
      score: signal === "missed-context" ? 0 : 1,
      feedbackAt: new Date().toISOString(),
    };
    setLastFeedback(optimistic);

    try {
      const response = await postJson<{
        ok: boolean;
        score: number;
        feedbackAt: string;
      }>("/api/research/signal", {
        researchRunId: trigger?.researchRunId,
        parentRunId: trigger?.runId,
        signal,
      });
      setLastFeedback({
        signal,
        score: response.score,
        feedbackAt: response.feedbackAt,
      });

      showToast(
        signal === "missed-context"
          ? "Feedback score captured"
          : response.score === 1
            ? "Positive score captured"
            : "Score captured",
      );

      if (trigger?.researchRunId) {
        void trackScorerStep(
          trigger.researchRunId,
          "attach-research-human-feedback-score",
        );
      }
    } catch (error) {
      // The route already swallows Inngest errors and returns 200, so reaching
      // here means the transport itself failed: dev server down, or a
      // hot-reload mid-click. Roll the optimistic row back rather than leaving
      // a score on screen that was never recorded.
      setLastFeedback(null);
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? `Could not record feedback: ${error.message}`
            : "Could not record feedback; the app is not reachable",
      });
    } finally {
      setSignalPending(false);
    }
  }

  async function sendOutcome(outcome: "shipped" | "wrong") {
    if (outcomePending) return;

    setActiveStage("abtest");
    setAbTestFocus("defer");
    setNotice(null);
    setOutcomePending(true);

    try {
      const response = await postJson<{
        ok: boolean;
        outcome: "shipped" | "wrong";
        score: number;
        observedAt: string;
        daysLater: number;
      }>("/api/research/outcome", {
        researchRunId: trigger?.researchRunId,
        parentRunId: trigger?.runId,
        outcome,
      });

      setLastOutcome({
        outcome: response.outcome,
        score: response.score,
        observedAt: response.observedAt,
        daysLater: response.daysLater,
      });
      showToast(`Outcome recorded ${response.daysLater} days later`);

      if (trigger?.researchRunId) {
        void trackScorerStep(trigger.researchRunId, "score-research-outcome");
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? `Could not record the outcome: ${error.message}`
            : "Could not record the outcome; the app is not reachable",
      });
    } finally {
      setOutcomePending(false);
    }
  }

  async function runExperiment() {
    if (experimentPending) return;

    setActiveStage("abtest");
    setAbTestFocus("variants");
    setNotice(null);
    const corpusRunId = trigger?.researchRunId ?? result?.researchRunId;
    const corpusRuns = corpusRunId
      ? [
          {
            researchRunId: corpusRunId,
            parentRunId: trigger?.runId,
            sessionId: result?.sessionId,
            feedbackSignal: lastFeedback?.signal,
            feedbackScore: lastFeedback?.score,
            scoredAt: lastFeedback?.feedbackAt,
          },
        ]
      : undefined;
    setExperimentPending(true);
    setExperimentResults(null);

    const runCount = EXPERIMENT_RUN_COUNT;

    try {
      const response = await postJson<{
        ok: boolean;
        sent: boolean;
        batchId: string;
        runCount: number;
        experimentUrl: string;
      }>("/api/research/experiment", {
        topic: defaultResearchTopic,
        corpusRuns,
        count: runCount,
      });

      setExperiment({
        batchId: response.batchId,
        runCount: response.runCount ?? runCount,
        sent: response.sent,
        experimentUrl: response.experimentUrl,
      });
      showToast(
        response.sent
          ? `A/B test started across ${response.runCount ?? runCount} runs`
          : "A/B test queued locally",
      );

      // Poll the aggregate so the comparison fills in live rather than the
      // driver having to leave the demo to see whether anything happened.
      const deadline = 40;
      for (let attempt = 0; attempt < deadline; attempt += 1) {
        await wait(800);

        const results = await fetchExperimentResults(
          response.batchId,
          response.runCount ?? runCount,
        );

        if (!results) continue;

        setExperimentResults(results);

        if (results.completedRuns >= results.totalRuns) break;
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? `Could not start the experiment: ${error.message}`
            : "Could not start the experiment; the app is not reachable",
      });
    } finally {
      setExperimentPending(false);
    }
  }

  function runWithWinner() {
    const winner = experimentResults?.winner;

    if (!winner) return;

    void runResearch(winner);
  }

  function resetDemo() {
    setActiveStage("run");
    setPhase("idle");
    setTrigger(null);
    setResult(null);
    setTimeline(null);
    setLastFeedback(null);
    setExperiment(null);
    setExperimentResults(null);
    setLastOutcome(null);
    setScorerSteps({});
    setNotice(null);
    setToast("");
  }

  function applyStatus(status: StatusResponse) {
    setTimeline(status.timeline ?? null);
    setTrigger((current) =>
      current
        ? {
            ...current,
            runId: status.runId ?? current.runId,
            traceUrl: status.traceUrl,
          }
        : current,
    );

    if (status.status === "completed" && status.result) {
      setResult(status.result);
      setPhase("complete");
      showToast("Research brief complete");
      return;
    }

    setPhase(status.hadRetry ? "retrying" : "running");
  }

  function showToast(message: string) {
    setToast(message);

    // Without clearing, a second toast inherits the first's pending timer and
    // can disappear almost immediately.
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }

    toastTimer.current = window.setTimeout(() => {
      setToast("");
      toastTimer.current = null;
    }, 2600);
  }

  React.useEffect(() => {
    return () => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--ink)]">
      <div
        className="grid h-screen w-full max-w-[560px] min-w-0 grid-rows-[var(--top-pane-height)_10px_minmax(0,1fr)] border-x border-[var(--ink)] bg-white xl:max-w-none xl:grid-cols-[minmax(420px,560px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]"
        style={
          {
            "--top-pane-height": `${topPaneHeight}px`,
          } as React.CSSProperties
        }
      >
        <section className="grid min-h-0 min-w-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] overflow-hidden bg-[var(--bone)] xl:border-r xl:border-[var(--ink)]">
          <header className="flex min-w-0 items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-white px-3 py-2 xl:px-4 xl:py-3">
            <div className="min-w-0">
              <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
                inngest booth demo
              </div>
              <h1 className="display truncate text-xl font-semibold">
                Competitive Research
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <DashboardLink
                href={dashboardUrl}
                className="demo-segment-button grid size-7 place-items-center bg-white"
                aria-label="Open Inngest dashboard"
                title="Open Inngest dashboard"
              >
                <ExternalLink className="size-3.5" />
              </DashboardLink>
              <StatusPill phase={phase} />
              <Button
                variant="outline"
                size="icon-sm"
                className="border-[var(--ink)] bg-white"
                onClick={resetDemo}
                disabled={isRunning}
                aria-label="Reset demo"
                title="Reset demo"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
          </header>

          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--rule-soft)] bg-white px-3 py-1.5 xl:px-4">
            <span className="display truncate text-[13px] font-semibold">
              {LOOP_TAGLINE}
            </span>
            <span className="mono flex flex-wrap items-center gap-1.5 text-[9px] uppercase text-[var(--muted-copy)]">
              {loopPillars.map((pillar, index) => (
                <React.Fragment key={pillar.id}>
                  {index > 0 ? <span aria-hidden>/</span> : null}
                  <span className="whitespace-nowrap">
                    {pillar.label}
                    {pillar.beta ? (
                      <sup className="ml-0.5 text-[8px] text-[var(--coral)]">
                        beta
                      </sup>
                    ) : null}
                  </span>
                </React.Fragment>
              ))}
            </span>
          </div>

          <nav className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] border-b border-[var(--ink)] bg-white">
            {loopStages.map((stage) => {
              const Icon = stageIcons[stage.id];
              return (
                <button
                  key={stage.id}
                  type="button"
                  data-active={activeStage === stage.id ? "true" : undefined}
                  className="demo-segment-button mono flex h-10 min-w-0 items-center justify-center gap-1.5 border-0 border-r border-[var(--ink)] px-1 text-[10px] uppercase data-[active=true]:bg-[var(--ink)] data-[active=true]:text-white"
                  onClick={() => setActiveStage(stage.id)}
                >
                  <Icon className="size-3.5" />
                  <span className="truncate">
                    {stage.index}. {stage.label}
                  </span>
                </button>
              );
            })}
            <span
              className="grid w-9 place-items-center text-[var(--muted-copy)]"
              title="A/B testing feeds the next run: the loop closes"
            >
              <Repeat className="size-3.5" />
            </span>
          </nav>

          <div className="min-h-0 overflow-auto p-3 xl:p-4">
            {notice ? (
              <div
                className="mb-3 flex items-start gap-2 border border-[var(--ink)] px-2.5 py-2"
                style={{
                  background:
                    notice.tone === "error" ? "var(--coral)" : "var(--bone)",
                  color: notice.tone === "error" ? "#fff" : "inherit",
                }}
                role="status"
              >
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <div className="min-w-0 grid gap-1">
                  <span className="text-xs leading-5">{notice.message}</span>
                  {phase === "stalled" ? (
                    <DashboardLink
                      href={traceUrl}
                      className="mono w-fit border border-[var(--ink)] bg-white px-1.5 py-0.5 text-[10px] uppercase text-[var(--ink)]"
                    >
                      Open trace
                    </DashboardLink>
                  ) : null}
                </div>
              </div>
            ) : null}
            {activeStage === "run" ? (
              <RunControls
                brief={brief}
                failureArmed={failureArmed}
                isRunning={isRunning}
                phase={phase}
                result={result}
                sandboxAccess={sandboxAccess}
                sandboxArmed={sandboxArmed}
                timeline={timeline}
                traceUrl={traceUrl}
                onFailureArmedChange={setFailureArmed}
                onRun={() => runResearch()}
                onSandboxArmedChange={setSandboxArmed}
              />
            ) : null}
            {activeStage === "observe" ? (
              <ObserveControls
                insightsUrl={insightsUrl}
                result={result}
                traceUrl={traceUrl}
              />
            ) : null}
            {activeStage === "abtest" ? (
              <AbTestControls
                experimentPending={experimentPending}
                experimentResults={experimentResults}
                experimentUrl={experimentUrl}
                lastOutcome={lastOutcome}
                outcomePending={outcomePending}
                qualityScore={result?.qualityScore ?? null}
                runId={scorecardRunId}
                metricRows={metricRows}
                metricsUrl={metricsUrl}
                selectedSignal={lastFeedback?.signal ?? null}
                signalPending={signalPending}
                onRunExperiment={runExperiment}
                onRunWithWinner={runWithWinner}
                onOutcome={sendOutcome}
                onSignal={sendSignal}
              />
            ) : null}
          </div>
        </section>

        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize code panel"
          className="group relative cursor-row-resize border-y border-[var(--ink)] bg-white xl:hidden"
          onMouseDown={startMouseResize}
          onTouchStart={startTouchResize}
        >
          <div className="absolute left-1/2 top-1/2 h-1 w-12 -translate-x-1/2 -translate-y-1/2 bg-[var(--rule-soft)] transition group-hover:bg-[var(--muted-copy)]" />
        </div>

        <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[#17131a] xl:col-start-2 xl:row-start-1">
          <nav
            aria-label="Code pane"
            className="grid grid-cols-2 gap-1 border-b border-[var(--ink)] bg-[var(--bone)] p-1.5"
          >
            {(
              [
                { id: "code", label: "Code" },
                { id: "primitives", label: "Primitives" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-active={paneTab === tab.id ? "true" : undefined}
                className="mono demo-segment-button flex h-10 items-center justify-center border-[var(--ink)] bg-white text-[11px] uppercase tracking-wider data-[active=true]:bg-[var(--ink)] data-[active=true]:text-white"
                onClick={() => setPaneTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          {paneTab === "code" ? (
            <CodeView
              snippets={snippets}
              activeId={activeSnippetId}
              variant="minimal"
              defaultFontSize={15}
            />
          ) : (
            <PrimitivesReference primitives={primitives} />
          )}
        </section>
      </div>

      <div className="pointer-events-none fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-24px)] -translate-x-1/2 gap-2 xl:left-auto xl:right-3 xl:translate-x-0">
        {toast ? (
          <div className="flex h-8 min-w-0 items-center gap-2 border border-[var(--ink)] bg-white px-2 shadow-[3px_3px_0_#1a161c]">
            <Check className="size-3.5 text-[var(--teal)]" />
            <span className="mono truncate text-[10px] uppercase">{toast}</span>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function RunControls({
  brief,
  failureArmed,
  isRunning,
  phase,
  result,
  sandboxAccess,
  sandboxArmed,
  timeline,
  traceUrl,
  onFailureArmedChange,
  onRun,
  onSandboxArmedChange,
}: {
  brief: BriefOutput | null;
  failureArmed: boolean;
  isRunning: boolean;
  phase: RunPhase;
  result: LoopRunResult | null;
  sandboxAccess: SandboxAccess | null;
  sandboxArmed: boolean;
  timeline: RunTimeline | null;
  traceUrl: string;
  onFailureArmedChange: (armed: boolean) => void;
  onRun: () => void;
  onSandboxArmedChange: (armed: boolean) => void;
}) {
  const stage = getLoopStage("run");
  const sandboxMode = sandboxAccess?.mode ?? "simulated";
  const sandbox = result?.sandbox;
  const showFailureEvent = phase === "retrying";

  return (
    <div className="grid gap-3 overflow-hidden">
      <PanelTitle
        eyebrow={`Stage ${stage.index} / ${stage.label}`}
        title={stage.title}
        detail={stage.detail}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Button
          variant="outline"
          className="demo-segment-button h-10 w-full min-w-0 rounded-none text-sm disabled:pointer-events-none disabled:opacity-55"
          onClick={onRun}
          disabled={isRunning}
        >
          <Play className="size-4" />
          <span className="truncate">Run research agent</span>
        </Button>
        <DashboardLink
          href={traceUrl}
          className="demo-segment-button grid size-10 place-items-center"
          aria-label="Open run trace"
          title="Open run trace"
        >
          <ExternalLink className="size-4" />
        </DashboardLink>
      </div>
      {SANDBOX_ENABLED ? (
      <label
        className="flex items-center justify-between gap-3 border border-[var(--rule-soft)] bg-white px-2.5 py-2 text-xs"
        title={sandboxAccess?.reason}
      >
        <span>
          <span className="block font-medium">
            Run generated code in a Sandbox
          </span>
          <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
            isolated execution
            {sandboxMode === "sandbox" ? (
              <span className="ml-1 text-[var(--teal)]">beta</span>
            ) : (
              <span className="ml-1 text-[var(--coral)]">simulated locally</span>
            )}
          </span>
        </span>
        <input
          type="checkbox"
          className="size-4 accent-[var(--coral)]"
          checked={sandboxArmed}
          onChange={(event) => onSandboxArmedChange(event.target.checked)}
        />
      </label>
      ) : null}
      <label className="flex items-center justify-between gap-3 border border-[var(--rule-soft)] bg-white px-2.5 py-2 text-xs">
        <span>
          <span className="block font-medium">Fail competitor API once</span>
          <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
            retry boundary
          </span>
        </span>
        <input
          type="checkbox"
          className="size-4 accent-[var(--coral)]"
          checked={failureArmed}
          onChange={(event) => onFailureArmedChange(event.target.checked)}
        />
      </label>
      {showFailureEvent ? (
        <div className="flex items-start gap-2 border border-[var(--rule-soft)] bg-white px-2.5 py-2 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--coral)]" />
          <span>
            The API returned 503. Inngest retries the failed step while
            successful steps replay from memoized state.
          </span>
        </div>
      ) : null}
      <StepTimeline timeline={timeline} isRunning={isRunning} />
      {brief ? (
        <div className="border border-[var(--ink)] bg-white">
          <div className="flex items-center justify-between gap-2 px-2.5 py-2">
            <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
              research output
            </span>
            <span className="mono truncate text-[10px] uppercase">
              {brief.truncated ? (
                <span className="mr-1.5 text-[var(--coral)]">truncated</span>
              ) : null}
              {brief.source}
              {brief.tokens > 0 ? (
                <span className="ml-1.5 text-[var(--muted-copy)]">
                  {brief.tokens.toLocaleString()} tokens
                </span>
              ) : null}
            </span>
          </div>
          <div className="max-h-56 overflow-y-auto border-t border-[var(--rule-soft)] bg-[var(--bone)] px-2.5 py-2 text-[13px] leading-5 whitespace-pre-wrap">
            {brief.text}
          </div>
        </div>
      ) : null}
      {sandbox ? (
        <div className="border border-[var(--ink)] bg-white">
          <div className="flex items-center justify-between gap-2 px-2.5 py-2">
            <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
              sandbox result
            </span>
            <span className="mono text-[10px] uppercase">
              {sandbox.mode === "sandbox" ? "real sandbox" : "simulated"}
              <span className="ml-1.5 text-[var(--teal)]">exit {sandbox.exitCode}</span>
            </span>
          </div>
          <div className="border-t border-[var(--rule-soft)] bg-[var(--bone)] px-2.5 py-2 text-xs leading-5">
            {sandbox.totalLaunches} launches across {sandbox.competitorCount}{" "}
            competitors. Themes: {sandbox.topThemes.join(", ")}. Isolated
            environment destroyed after the step.
          </div>
        </div>
      ) : null}
    </div>
  );
}

const observedByDefault = [
  "every step: inputs, outputs, timing",
  "retries and replays, per boundary",
  "model turns: tokens and cost",
  "run metadata, groupable in Insights",
];

function ObserveControls({
  insightsUrl,
  result,
  traceUrl,
}: {
  insightsUrl: string;
  result: LoopRunResult | null;
  traceUrl: string;
}) {
  const stage = getLoopStage("observe");

  return (
    <div className="grid gap-3">
      <PanelTitle
        eyebrow={`Stage ${stage.index} / ${stage.label}`}
        title={stage.title}
        detail={stage.detail}
      />
      <div className="grid grid-cols-2 gap-2">
        <DashboardLink
          href={traceUrl}
          className="demo-segment-button mono inline-flex h-10 items-center justify-center gap-1.5 px-2 text-[10px] uppercase"
        >
          <Play className="size-3.5" />
          <span className="truncate">Open trace</span>
        </DashboardLink>
        <DashboardLink
          href={insightsUrl}
          className="demo-segment-button mono inline-flex h-10 items-center justify-center gap-1.5 px-2 text-[10px] uppercase"
        >
          <Sparkles className="size-3.5" />
          <span className="truncate">Open Insights</span>
        </DashboardLink>
      </div>
      <div className="border border-[var(--ink)] bg-white">
        <div className="px-2.5 py-2">
          <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
            captured by default
          </div>
          <ul className="mt-1.5 grid gap-1">
            {observedByDefault.map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-xs leading-5">
                <Check className="mt-1 size-3 shrink-0 text-[var(--teal)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        {result ? (
          <div className="grid grid-cols-3 gap-1.5 border-t border-[var(--rule-soft)] bg-[var(--bone)] p-1.5">
            <Fact label="model" value={result.model} />
            <Fact label="quality" value={result.qualityScore.toFixed(2)} />
            <Fact
              label="sandbox"
              value={result.sandbox ? result.sandbox.mode : "off"}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AbTestControls({
  experimentPending,
  experimentResults,
  experimentUrl,
  lastOutcome,
  outcomePending,
  qualityScore,
  runId,
  metricRows,
  metricsUrl,
  selectedSignal,
  signalPending,
  onRunExperiment,
  onRunWithWinner,
  onOutcome,
  onSignal,
}: {
  experimentPending: boolean;
  experimentResults: ExperimentResults | null;
  experimentUrl: string;
  lastOutcome: OutcomeState | null;
  outcomePending: boolean;
  qualityScore: number | null;
  runId?: string;
  metricRows: MetricRow[];
  metricsUrl: string;
  selectedSignal: ResearchFeedbackSignal | null;
  signalPending: boolean;
  onRunExperiment: () => void;
  onRunWithWinner: () => void;
  onOutcome: (outcome: "shipped" | "wrong") => void;
  onSignal: (signal: "useful" | "missed-context" | "saved") => void;
}) {
  const stage = getLoopStage("abtest");
  const copy = abTestCopy;
  const actionButtonClass =
    "demo-segment-button inline-flex h-8 w-full min-w-0 items-center justify-center gap-1 rounded-none px-1.5 text-[11px] disabled:pointer-events-none disabled:opacity-55";
  const isOtherSignal = (signal: ResearchFeedbackSignal) =>
    (selectedSignal !== null && selectedSignal !== signal) || signalPending;
  const humanScore =
    metricRows.find((row) => row.name === "research_human_feedback")?.value ??
    null;
  const winner = experimentResults?.winner ?? null;

  return (
    <div className="grid gap-3">
      <PanelTitle
        eyebrow={`Stage ${stage.index} / ${stage.label}`}
        title={stage.title}
        detail={stage.detail}
      />

      <AbTestScorecard
        quality={qualityScore}
        human={humanScore}
        outcome={lastOutcome?.score ?? null}
        winner={winner}
        runId={runId}
        rows={metricRows}
      />

      {/* Measure it now: a product signal becomes a durable metric on this run. */}
      <div className="border border-[var(--ink)] bg-white">
        <div className="px-2.5 py-2">
          <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
            {copy.measureNow.eyebrow}
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--muted-copy)]">
            {copy.measureNow.detail}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-1.5 border-t border-[var(--rule-soft)] bg-[var(--bone)] p-1.5">
          <Button
            variant="outline"
            className={actionButtonClass}
            onClick={() => onSignal("useful")}
            disabled={isOtherSignal("useful")}
            data-active={selectedSignal === "useful" ? "true" : undefined}
            aria-pressed={selectedSignal === "useful"}
          >
            <ThumbsUp className="size-4" />
            <span className="truncate">Good</span>
          </Button>
          <Button
            variant="outline"
            className={actionButtonClass}
            onClick={() => onSignal("missed-context")}
            disabled={isOtherSignal("missed-context")}
            data-active={
              selectedSignal === "missed-context" ? "true" : undefined
            }
            aria-pressed={selectedSignal === "missed-context"}
          >
            <ThumbsDown className="size-4" />
            <span className="truncate">Miss</span>
          </Button>
          <Button
            variant="outline"
            className={actionButtonClass}
            onClick={() => onSignal("saved")}
            disabled={isOtherSignal("saved")}
            data-active={selectedSignal === "saved" ? "true" : undefined}
            aria-pressed={selectedSignal === "saved"}
          >
            <Save className="size-4" />
            <span className="truncate">Save</span>
          </Button>
          <DashboardLink
            href={metricsUrl}
            className={`${actionButtonClass} mono text-[10px] uppercase`}
          >
            <Gauge className="size-3.5" />
            <span className="truncate">Metrics</span>
          </DashboardLink>
        </div>
      </div>

      {/* Measure it later: the same run, measured weeks after it finished. */}
      <div className="border border-[var(--ink)] bg-white">
        <div className="flex items-start justify-between gap-2 px-2.5 py-2">
          <div className="min-w-0">
            <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
              {copy.measureLater.eyebrow}
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-copy)]">
              {copy.measureLater.detail}
            </p>
          </div>
          {lastOutcome ? (
            <span className="mono shrink-0 text-[10px] uppercase text-[var(--teal)]">
              +{lastOutcome.daysLater}d
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-1.5 border-t border-[var(--rule-soft)] bg-[var(--bone)] p-1.5">
          <Button
            variant="outline"
            className={actionButtonClass}
            onClick={() => onOutcome("shipped")}
            disabled={outcomePending || lastOutcome?.outcome === "wrong"}
            data-active={lastOutcome?.outcome === "shipped" ? "true" : undefined}
          >
            <Check className="size-4" />
            <span className="truncate">{copy.measureLater.shipped}</span>
          </Button>
          <Button
            variant="outline"
            className={actionButtonClass}
            onClick={() => onOutcome("wrong")}
            disabled={outcomePending || lastOutcome?.outcome === "shipped"}
            data-active={lastOutcome?.outcome === "wrong" ? "true" : undefined}
          >
            <TriangleAlert className="size-4" />
            <span className="truncate">{copy.measureLater.wrong}</span>
          </Button>
        </div>
      </div>

      {/* A/B test models: a real traffic split, rendered here not deep-linked. */}
      {experimentResults ? (
        <VariantComparison
          aggregate={experimentResults}
          pending={experimentPending}
        />
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Button
          variant="outline"
          className="demo-segment-button h-10 w-full min-w-0 rounded-none text-sm disabled:pointer-events-none disabled:opacity-55"
          disabled={experimentPending}
          onClick={onRunExperiment}
        >
          <FlaskConical className="size-4" />
          <span className="truncate">
            {experimentPending ? copy.compare.running : copy.compare.run}
          </span>
        </Button>
        <DashboardLink
          href={experimentUrl}
          className="demo-segment-button mono inline-flex h-10 items-center gap-1.5 px-3 text-[10px] uppercase"
        >
          <ExternalLink className="size-3.5" />
          <span className="truncate">A/B test</span>
        </DashboardLink>
      </div>

      {winner ? (
        <Button
          variant="outline"
          className="demo-segment-button h-10 w-full min-w-0 rounded-none text-sm"
          onClick={onRunWithWinner}
        >
          <Repeat className="size-4" />
          <span className="truncate">{copy.loopBack.label(winner)}</span>
        </Button>
      ) : null}
    </div>
  );
}

function PanelTitle({
  detail,
  eyebrow,
  title,
}: {
  detail: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
        {eyebrow}
      </div>
      <h2 className="display mt-0.5 text-lg font-semibold leading-6">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--muted-copy)]">{detail}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--rule-soft)] bg-white px-1.5 py-1">
      <div className="mono text-[9px] uppercase text-[var(--muted-copy)]">
        {label}
      </div>
      <div className="mono truncate text-[11px]">{value}</div>
    </div>
  );
}

function StatusPill({ phase }: { phase: RunPhase }) {
  return (
    <span className="mono inline-flex h-7 items-center gap-1.5 border border-[var(--ink)] bg-white px-2 text-[10px] uppercase">
      <span className="status-dot" data-state={phase} />
      {phase}
    </span>
  );
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok && response.status !== 202) {
    throw new Error((json as { error?: string }).error ?? "Request failed");
  }

  return json as T;
}

/** One A/B test click. Enough runs that both variants appear ~99% of the time. */
const EXPERIMENT_RUN_COUNT = 8;

async function fetchExperimentResults(
  batchId: string,
  count: number,
): Promise<ExperimentResults | null> {
  try {
    const response = await fetch(
      `/api/research/experiment/status?batchId=${encodeURIComponent(batchId)}&count=${count}`,
      { cache: "no-store" },
    );

    if (!response.ok) return null;

    return (await response.json()) as ExperimentResults;
  } catch {
    return null;
  }
}

async function fetchScorerStep(
  researchRunId: string,
  stepName: string,
): Promise<ScorerStep | null> {
  try {
    const params = new URLSearchParams({
      researchRunId,
      functionName: "research-agent-score-run",
      // Names the step we are waiting for: several scoring runs share this
      // researchRunId, and only one of them holds this step.
      stepName,
    });
    const response = await fetch(`/api/research/status?${params}`, {
      cache: "no-store",
    });

    if (!response.ok) return null;

    const body = (await response.json()) as StatusResponse;
    const step = body.timeline?.steps.find(
      (step) => step.displayName === stepName && step.status === "completed",
    );

    if (!step) return null;

    return { name: step.displayName, durationMs: step.durationMs };
  } catch {
    return null;
  }
}

/**
 * Assembles the scorecard's metric rows. Both rows deliberately carry the same
 * run id: that repetition is the delayed-conversion argument made visually.
 */
function buildMetricRows({
  feedback,
  outcome,
  runId,
  scorerSteps,
}: {
  feedback: FeedbackState | null;
  outcome: OutcomeState | null;
  runId?: string;
  scorerSteps: Record<string, ScorerStep>;
}): MetricRow[] {
  const rows: MetricRow[] = [];

  if (feedback) {
    const step = scorerSteps["attach-research-human-feedback-score"];
    rows.push({
      name: "research_human_feedback",
      value: feedback.score,
      runId,
      at: feedback.feedbackAt,
      note: step
        ? `step ${step.name}${step.durationMs !== undefined ? ` ${Math.round(step.durationMs)}ms` : ""}`
        : abTestCopy.measureNow.pendingStep,
    });
  }

  if (outcome) {
    const step = scorerSteps["score-research-outcome"];
    rows.push({
      name: "research_deferred_outcome",
      value: outcome.score,
      runId,
      at: outcome.observedAt,
      note: `${outcome.daysLater} ${abTestCopy.measureLater.daysLaterSuffix} · ${
        step ? `step ${step.name}` : abTestCopy.measureLater.viaDefer
      }`,
    });
  }

  return rows;
}

async function fetchStatus(
  trigger: TriggerResponse,
  options: { useSandbox: boolean; failureStep: string },
): Promise<StatusResponse> {
  const params = new URLSearchParams({
    researchRunId: trigger.researchRunId,
    // Must mirror what the run was actually triggered with. Hardcoding this
    // made the status route report a sandbox beat even when the driver had
    // the toggle off.
    useSandbox: String(options.useSandbox),
    failureStep: options.failureStep,
  });

  if (trigger.inngestEventId) {
    params.set("inngestEventId", trigger.inngestEventId);
  }

  const response = await fetch(`/api/research/status?${params}`, {
    cache: "no-store",
  });

  return (await response.json()) as StatusResponse;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type BriefOutput = {
  text: string;
  source: string;
  tokens: number;
  truncated: boolean;
};

/**
 * Pulls the synthesized research brief out of the live timeline: the
 * `call-llm-synthesize-brief` step's captured output. In OpenRouter mode
 * this is the real model text; in mock mode the canned brief. Appears as
 * soon as the step completes, even before the run finishes.
 */
function extractBriefOutput(timeline: RunTimeline | null): BriefOutput | null {
  if (!timeline) return null;

  const step = timeline.steps.find(
    (step) => step.displayName === BRIEF_STEP_ID,
  );

  if (!step?.output) return null;

  try {
    const parsed = JSON.parse(step.output) as {
      output?: string;
      source?: string;
      tokens?: number;
      __truncated?: boolean;
    };

    if (!parsed.output) return null;

    return {
      text: parsed.output,
      source: parsed.source ?? "model",
      tokens: parsed.tokens ?? 0,
      truncated: parsed.__truncated === true,
    };
  } catch {
    return null;
  }
}
