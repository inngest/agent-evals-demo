"use client";

import * as React from "react";
import {
  Activity,
  Check,
  ExternalLink,
  FlaskConical,
  Gauge,
  Play,
  RotateCcw,
  Save,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { CodeView } from "@/components/demo/CodeView";
import { DashboardLink } from "@/components/demo/DashboardLink";
import { Button } from "@/components/ui/button";
import {
  defaultResearchTopic,
  type ResearchRunSummary,
} from "@/content/research-demo";
import { getDeepLink } from "@/lib/inngest-dashboard";
import type { CodeSnippetId } from "@/content/code-snippets";
import type { HighlightedCodeSnippet } from "@/lib/highlight";
import type { ResearchFeedbackSignal } from "@/inngest/client";

type ResearchDemoProps = {
  snippets: HighlightedCodeSnippet[];
};

type ActId = 1 | 2 | 3;
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

type StatusResponse = {
  ok: boolean;
  status: "queued" | "running" | "completed" | "failed";
  hadRetry: boolean;
  completedSteps: number;
  totalSteps: number;
  runId?: string;
  traceUrl: string;
  result: ResearchRunSummary | null;
  error?: string;
};

type FeedbackState = {
  signal: ResearchFeedbackSignal;
  score: number;
  feedbackAt: string;
};

const acts: Array<{
  id: ActId;
  label: string;
  codeId: CodeSnippetId;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 1, label: "Durable", codeId: "act1", icon: Activity },
  { id: 2, label: "Scores", codeId: "act2", icon: Gauge },
  { id: 3, label: "Experiment", codeId: "act3", icon: FlaskConical },
];

export function ResearchDemo({ snippets }: ResearchDemoProps) {
  const [activeAct, setActiveAct] = React.useState<ActId>(1);
  const [phase, setPhase] = React.useState<RunPhase>("idle");
  const [trigger, setTrigger] = React.useState<TriggerResponse | null>(null);
  const [, setCompletedSteps] = React.useState(0);
  const [result, setResult] = React.useState<ResearchRunSummary | null>(null);
  const [failureArmed, setFailureArmed] = React.useState(true);
  const [lastFeedback, setLastFeedback] = React.useState<FeedbackState | null>(
    null
  );
  const [toast, setToast] = React.useState("");
  const [topPaneHeight, setTopPaneHeight] = React.useState(340);
  const [experiment, setExperiment] = React.useState<{
    sent: boolean;
    experimentRunId: string;
    experimentUrl: string;
  } | null>(null);

  const isRunning =
    phase === "sending" || phase === "running" || phase === "retrying";
  const activeCodeId = acts.find((act) => act.id === activeAct)?.codeId ?? "act1";
  const dashboardUrl = trigger?.dashboardUrl ?? getDeepLink("envDashboard");
  const traceUrl = trigger?.traceUrl ?? getDeepLink("runTrace");
  const scoresUrl = getDeepLink("scoresOnTrace", { runId: trigger?.runId });
  const experimentUrl =
    experiment?.experimentUrl ??
    getDeepLink("experiment", {
      experimentId: "research-agent-model-bakeoff",
    });

  function resizeFrom(startY: number, startHeight: number) {
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "row-resize";

    const handleMove = (clientY: number) => {
      const nextHeight = startHeight + clientY - startY;
      const maxHeight = Math.max(220, window.innerHeight - 260);
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
    setActiveAct(1);
    setPhase("sending");
    setTrigger(null);
    setResult(null);
    setLastFeedback(null);
    setCompletedSteps(0);
    setToast("");

    try {
      const response = await postJson<TriggerResponse>("/api/research/trigger", {
        topic: defaultResearchTopic,
        failureStep: failureArmed ? "fetch-competitor-changelog" : "none",
        model: "gpt-5.5",
      });

      setTrigger(response);

      if (!response.sent) {
        showToast("Foreground mode; Inngest is not reachable");
      }

      let completed = false;

      for (let i = 0; i < 18 && !completed; i += 1) {
        await wait(650);
        const status = await fetchStatus(response);
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
        setPhase("error");
        showToast("Run status timed out");
      }
    } catch (error) {
      setPhase("error");
      showToast(error instanceof Error ? error.message : "Research run failed");
    }
  }

  async function sendSignal(signal: ResearchFeedbackSignal) {
    setActiveAct(2);
    setLastFeedback({
      signal,
      score: signal === "missed-context" ? 0 : 1,
      feedbackAt: new Date().toISOString(),
    });

    const response = await postJson<{
      ok: boolean;
      score: number;
      feedbackAt: string;
    }>(
      "/api/research/signal",
      {
        researchRunId: trigger?.researchRunId,
        parentRunId: trigger?.runId,
        signal,
      }
    );
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
          : "Score captured"
    );
  }

  async function runExperiment() {
    setActiveAct(3);
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
    setActiveAct(1);
    setPhase("idle");
    setTrigger(null);
    setCompletedSteps(0);
    setResult(null);
    setLastFeedback(null);
    setExperiment(null);
    setToast("");
  }

  function applyStatus(status: StatusResponse) {
    setCompletedSteps(status.completedSteps);
    setTrigger((current) =>
      current
        ? {
            ...current,
            runId: status.runId ?? current.runId,
            traceUrl: status.traceUrl,
          }
        : current
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
        <section className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-[var(--bone)] xl:border-r xl:border-[var(--ink)]">
          <header className="flex min-w-0 items-center justify-between gap-3 border-b border-[var(--rule-soft)] px-3 py-2 xl:px-4 xl:py-3">
            <div className="min-w-0">
              <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
                research agent booth
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

          <nav className="grid grid-cols-3 border-b border-[var(--ink)] bg-white">
            {acts.map((act) => {
              const Icon = act.icon;
              return (
                <button
                  key={act.id}
                  type="button"
                  data-active={activeAct === act.id ? "true" : undefined}
                  className="demo-segment-button mono flex h-10 min-w-0 items-center justify-center gap-1.5 border-0 border-r border-[var(--ink)] px-1 text-[10px] uppercase last:border-r-0 data-[active=true]:bg-[var(--ink)] data-[active=true]:text-white"
                  onClick={() => setActiveAct(act.id)}
                >
                  <Icon className="size-3.5" />
                  <span className="truncate">{act.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 overflow-auto p-3 xl:p-4">
            {activeAct === 1 ? (
              <ActOneControls
                failureArmed={failureArmed}
                isRunning={isRunning}
                traceUrl={traceUrl}
                onFailureArmedChange={setFailureArmed}
                onRun={runResearch}
              />
            ) : null}
            {activeAct === 2 ? (
              <ActTwoControls
                scoresUrl={scoresUrl}
                selectedSignal={lastFeedback?.signal ?? null}
                onSignal={sendSignal}
              />
            ) : null}
            {activeAct === 3 ? (
              <ActThreeControls
                experimentUrl={experimentUrl}
                onRunExperiment={runExperiment}
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

        <section className="min-h-0 min-w-0 xl:col-start-2 xl:row-start-1">
          <CodeView snippets={snippets} activeId={activeCodeId} variant="minimal" />
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

function ActOneControls({
  failureArmed,
  isRunning,
  traceUrl,
  onFailureArmedChange,
  onRun,
}: {
  failureArmed: boolean;
  isRunning: boolean;
  traceUrl: string;
  onFailureArmedChange: (armed: boolean) => void;
  onRun: () => void;
}) {
  return (
    <div className="grid gap-3 overflow-hidden">
      <PanelTitle
        eyebrow="Act 1"
        title="Durable autonomous research"
        detail="Manual trigger for the booth, cron trigger in code. One source fails once so Inngest shows retry and replay."
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Button
          variant="outline"
          className="demo-segment-button h-10 w-full min-w-0 rounded-none text-sm disabled:pointer-events-none disabled:opacity-55"
          onClick={onRun}
          disabled={isRunning}
        >
          <Play className="size-4" />
          <span className="truncate">Run research</span>
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
    </div>
  );
}

function ActTwoControls({
  scoresUrl,
  selectedSignal,
  onSignal,
}: {
  scoresUrl: string;
  selectedSignal: ResearchFeedbackSignal | null;
  onSignal: (signal: "useful" | "missed-context" | "saved") => void;
}) {
  const actionButtonClass =
    "demo-segment-button inline-flex h-8 w-full min-w-0 items-center justify-center gap-1 rounded-none px-1.5 text-[11px] disabled:pointer-events-none disabled:opacity-55";
  const isOtherSignal = (signal: ResearchFeedbackSignal) =>
    selectedSignal !== null && selectedSignal !== signal;

  return (
    <div className="grid gap-3">
      <PanelTitle
        eyebrow="Act 2"
        title="Add scores and sessions"
        detail="The same agent defers scorers. createScorer attaches quality, outcome, and human feedback to the run."
      />
      <div className="border border-[var(--ink)] bg-white">
        <div className="px-3 py-2">
          <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
            research brief
          </div>
          <p className="mt-1 text-[13px] font-medium leading-5">
            Here&apos;s the competitive research: Acme Inc., CarberVac, and The
            Chair Company split workflows, traces, and eval feedback.
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
            href={scoresUrl}
            className={`${actionButtonClass} mono text-[10px] uppercase`}
          >
            <ExternalLink className="size-3.5" />
            <span className="truncate">Scores</span>
          </DashboardLink>
        </div>
      </div>
    </div>
  );
}

function ActThreeControls({
  experimentUrl,
  onRunExperiment,
}: {
  experimentUrl: string;
  onRunExperiment: () => void;
}) {
  return (
    <div className="grid gap-3">
      <PanelTitle
        eyebrow="Act 3"
        title="Add experimentation"
        detail="Compare models on research quality, token consumption, cost, and latency using the same scorer."
      />
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

function StatusPill({ phase }: { phase: RunPhase }) {
  return (
    <span className="mono inline-flex h-7 items-center border border-[var(--ink)] bg-white px-2 text-[10px] uppercase">
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

async function fetchStatus(trigger: TriggerResponse): Promise<StatusResponse> {
  const params = new URLSearchParams({
    researchRunId: trigger.researchRunId,
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
