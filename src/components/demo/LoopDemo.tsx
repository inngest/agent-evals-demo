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
import { PrimitivesReference } from "@/components/demo/PrimitivesReference";
import { StepTimeline } from "@/components/demo/StepTimeline";
import { Button } from "@/components/ui/button";
import {
  BRIEF_STEP_ID,
  defaultResearchTopic,
  type ResearchStepId,
  type ResearchRunSummary,
} from "@/content/research-demo";
import {
  LOOP_TAGLINE,
  getLoopStage,
  loopPillars,
  loopStages,
  type LoopStageId,
} from "@/content/loop-messaging";
import type { SandboxRunSummary } from "@/inngest/functions/research-agent";
import type { RunTimeline } from "@/inngest/middlewares/step-tracker";
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

type RunPhase = "idle" | "sending" | "running" | "retrying" | "complete" | "error";

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

type SandboxAccess = {
  mode: "sandbox" | "simulated";
  reason: string;
};

const stageIcons: Record<LoopStageId, React.ComponentType<{ className?: string }>> = {
  run: Play,
  observe: Eye,
  evaluate: FlaskConical,
};

export function LoopDemo({ snippets, primitives }: LoopDemoProps) {
  const [activeStage, setActiveStage] = React.useState<LoopStageId>("run");
  const [paneTab, setPaneTab] = React.useState<"code" | "primitives">("code");
  const [phase, setPhase] = React.useState<RunPhase>("idle");
  const [trigger, setTrigger] = React.useState<TriggerResponse | null>(null);
  const [result, setResult] = React.useState<LoopRunResult | null>(null);
  const [timeline, setTimeline] = React.useState<RunTimeline | null>(null);
  const [failureArmed, setFailureArmed] = React.useState(true);
  const [sandboxArmed, setSandboxArmed] = React.useState(true);
  const [sandboxAccess, setSandboxAccess] = React.useState<SandboxAccess | null>(null);
  const [lastFeedback, setLastFeedback] = React.useState<FeedbackState | null>(null);
  const [toast, setToast] = React.useState("");
  const [topPaneHeight, setTopPaneHeight] = React.useState(360);
  const [experiment, setExperiment] = React.useState<{
    sent: boolean;
    experimentRunId: string;
    experimentUrl: string;
  } | null>(null);

  const isRunning =
    phase === "sending" || phase === "running" || phase === "retrying";
  const activeSnippetId: LoopSnippetId =
    activeStage === "run" ? "run" : activeStage === "observe" ? "observe" : "evaluate";
  const dashboardUrl = trigger?.dashboardUrl ?? getDeepLink("envDashboard");
  const traceUrl = trigger?.traceUrl ?? getDeepLink("runTrace");
  const scoresUrl = getDeepLink("scoresOnTrace", { runId: trigger?.runId });
  const insightsUrl = getDeepLink("insights");
  const brief = extractBriefOutput(timeline);
  const experimentUrl =
    experiment?.experimentUrl ??
    getDeepLink("experiment", {
      experimentId: "research-agent-model-bakeoff",
    });

  React.useEffect(() => {
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

  async function runResearch() {
    setActiveStage("run");
    setPhase("sending");
    setTrigger(null);
    setResult(null);
    setTimeline(null);
    setLastFeedback(null);
    setToast("");

    try {
      const response = await postJson<TriggerResponse>("/api/research/trigger", {
        topic: defaultResearchTopic,
        failureStep: failureArmed ? "fetch-competitor-changelog" : "none",
        useSandbox: sandboxArmed,
        model: "gpt-5.5",
      });

      setTrigger(response);

      if (!response.sent) {
        showToast("Foreground mode; Inngest is not reachable");
      }

      let completed = false;
      let lastStatusError = "";

      // Cloud runs (real model calls + retry backoff + memoized replays) can
      // take a minute or more. Poll to a terminal state or a generous
      // deadline; never fabricate a result on timeout.
      const pollDeadline = Date.now() + 180_000;

      while (Date.now() < pollDeadline && !completed) {
        await wait(800);
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
          showToast(status.error ?? "Research run failed");
          return;
        }
      }

      if (!completed) {
        setPhase("idle");
        showToast(
          lastStatusError
            ? "Status unavailable; the run is still executing in Inngest"
            : "Still executing in Inngest; open the trace to watch it finish",
        );
      }
    } catch (error) {
      setPhase("error");
      showToast(error instanceof Error ? error.message : "Research run failed");
    }
  }

  async function sendSignal(signal: ResearchFeedbackSignal) {
    setActiveStage("evaluate");
    setLastFeedback({
      signal,
      score: signal === "missed-context" ? 0 : 1,
      feedbackAt: new Date().toISOString(),
    });

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
  }

  async function runExperiment() {
    setActiveStage("evaluate");
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
    const response = await postJson<{
      ok: boolean;
      sent: boolean;
      experimentRunId: string;
      experimentUrl: string;
    }>("/api/research/experiment", {
      topic: defaultResearchTopic,
      corpusRuns,
    });

    setExperiment(response);
    showToast(response.sent ? "Experiment event sent" : "Experiment queued locally");
  }

  function resetDemo() {
    setActiveStage("run");
    setPhase("idle");
    setTrigger(null);
    setResult(null);
    setTimeline(null);
    setLastFeedback(null);
    setExperiment(null);
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
    window.setTimeout(() => setToast(""), 2600);
  }

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
              title="Evaluation feeds the next run: the loop closes"
            >
              <Repeat className="size-3.5" />
            </span>
          </nav>

          <div className="min-h-0 overflow-auto p-3 xl:p-4">
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
                onRun={runResearch}
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
            {activeStage === "evaluate" ? (
              <EvaluateControls
                brief={brief}
                experimentUrl={experimentUrl}
                scoresUrl={scoresUrl}
                selectedSignal={lastFeedback?.signal ?? null}
                onRunExperiment={runExperiment}
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

      <div className="fixed bottom-3 left-3 z-50 flex max-w-[calc(100vw-24px)] gap-2">
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

function EvaluateControls({
  brief,
  experimentUrl,
  scoresUrl,
  selectedSignal,
  onRunExperiment,
  onSignal,
}: {
  brief: BriefOutput | null;
  experimentUrl: string;
  scoresUrl: string;
  selectedSignal: ResearchFeedbackSignal | null;
  onRunExperiment: () => void;
  onSignal: (signal: "useful" | "missed-context" | "saved") => void;
}) {
  const stage = getLoopStage("evaluate");
  const actionButtonClass =
    "demo-segment-button inline-flex h-8 w-full min-w-0 items-center justify-center gap-1 rounded-none px-1.5 text-[11px] disabled:pointer-events-none disabled:opacity-55";
  const isOtherSignal = (signal: ResearchFeedbackSignal) =>
    selectedSignal !== null && selectedSignal !== signal;

  return (
    <div className="grid gap-3">
      <PanelTitle
        eyebrow={`Stage ${stage.index} / ${stage.label}`}
        title={stage.title}
        detail={stage.detail}
      />
      <div className="border border-[var(--ink)] bg-white">
        <div className="px-3 py-2">
          <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
            research brief
          </div>
          {brief ? (
            <p className="mt-1 max-h-40 overflow-y-auto text-[13px] font-medium leading-5 whitespace-pre-wrap">
              {brief.text}
            </p>
          ) : (
            <p className="mt-1 text-[13px] font-medium leading-5">
              Score this run now with product signals, or weeks later when the
              outcome lands. Same scorers, same run history.
            </p>
          )}
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
            href={scoresUrl}
            className={`${actionButtonClass} mono text-[10px] uppercase`}
          >
            <Gauge className="size-3.5" />
            <span className="truncate">Scores</span>
          </DashboardLink>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Button
          variant="outline"
          className="demo-segment-button h-10 w-full min-w-0 rounded-none text-sm"
          onClick={onRunExperiment}
        >
          <FlaskConical className="size-4" />
          <span className="truncate">Run model bakeoff</span>
        </Button>
        <DashboardLink
          href={experimentUrl}
          className="demo-segment-button mono inline-flex h-10 items-center gap-1.5 px-3 text-[10px] uppercase"
        >
          <ExternalLink className="size-3.5" />
          <span className="truncate">Experiment</span>
        </DashboardLink>
      </div>
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
