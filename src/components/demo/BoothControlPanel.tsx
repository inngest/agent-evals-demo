"use client";

import * as React from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  ExternalLink,
  FlaskConical,
  Gauge,
  History,
  Play,
  RotateCcw,
  Save,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { CodeView } from "@/components/demo/CodeView";
import { DashboardLink } from "@/components/demo/DashboardLink";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  defaultIncidentId,
  getIncident,
  incidents,
  type Incident,
} from "@/content/incidents";
import {
  seededExperiment,
  seededScores,
  seededSessions,
} from "@/content/seed-data";
import { defaultDemoFlags, wait, type DemoFlags } from "@/lib/demo-flags";
import { buildTriageResult } from "@/lib/demo-result";
import { getDeepLink } from "@/lib/inngest-dashboard";
import type { ScoreHistory, ScoreHistoryPoint } from "@/lib/scoring";
import type {
  IncidentDemoProps,
  RunPhase,
  RunStatusResponse,
  ScoreActionResponse,
  TriggerResponse,
} from "@/components/demo/types";
import type { CodeSnippetId } from "@/content/code-snippets";

type BoothControlPanelProps = IncidentDemoProps & {
  initialHistory: ScoreHistory;
};

type FlowControlBurstResponse = {
  ok: boolean;
  sent: boolean;
  eventsSent: number;
  batchId: string;
  accountId: string;
  eventIds?: string[];
  error?: string;
};

type BoothSection = "durable" | "scores" | "experiment";
type ScoreSignal = "up" | "down" | "saved" | "discarded";

const sections: Array<{
  id: BoothSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "durable", label: "Durable", icon: Play },
  { id: "scores", label: "Scores", icon: Gauge },
  { id: "experiment", label: "Experiment", icon: FlaskConical },
];

const agentSteps = [
  "receive bug report",
  "plan next action",
  "search repo",
  "read file",
  "retry/recover",
  "create/update ticket",
  "notify team",
  "suggest fix",
  "return analysis",
];

const codeTabs: Array<{ id: CodeSnippetId; label: string }> = [
  { id: "act1", label: "Act 1" },
  { id: "act2", label: "Act 2" },
  { id: "act3", label: "Act 3" },
];

const realRunId = /^01[A-Z0-9]{24}$/;

export function BoothControlPanel({
  initialHistory,
  snippets,
}: BoothControlPanelProps) {
  const [activeSection, setActiveSection] =
    React.useState<BoothSection>("durable");
  const [incidentId, setIncidentId] = React.useState(defaultIncidentId);
  const [flags, setFlags] = React.useState<DemoFlags>(defaultDemoFlags);
  const [phase, setPhase] = React.useState<RunPhase>("idle");
  const [trigger, setTrigger] = React.useState<TriggerResponse | null>(null);
  const [result, setResult] = React.useState<RunStatusResponse["result"]>(null);
  const [history, setHistory] = React.useState<ScoreHistory | null>(
    initialHistory
  );
  const [liveSignal, setLiveSignal] = React.useState<"up" | "down" | null>(
    null
  );
  const [outcomeScore, setOutcomeScore] = React.useState<number | null>(null);
  const [experimentVisible, setExperimentVisible] = React.useState(false);
  const [codeOpen, setCodeOpen] = React.useState(false);
  const [activeCodeId, setActiveCodeId] = React.useState<CodeSnippetId>("act1");
  const [flowBurstPending, setFlowBurstPending] = React.useState(false);
  const [toast, setToast] = React.useState("");

  const activeIncident = getIncident(incidentId) ?? incidents[0];
  const isRunning =
    phase === "sending" || phase === "investigating" || phase === "retrying";
  const statusLabel = getStatusLabel(phase);
  const session =
    seededSessions.find((item) => item.incidentId === activeIncident.id) ??
    seededSessions[0];
  const seededScore =
    seededScores.find((item) => item.incidentId === activeIncident.id) ??
    seededScores[0];
  const latestScorePoint = getLatestScorePoint(
    history,
    trigger?.clientRunId,
    activeIncident.id
  );
  const traceUrl =
    trigger?.traceUrl ??
    getDeepLink("runTrace", { runId: seededScore?.runId ?? activeIncident.runId });
  const scoresUrl = getDeepLink("scoresOnTrace", {
    runId: trigger?.runId ?? trigger?.clientRunId ?? seededScore?.runId,
  });
  const sessionUrl = getDeepLink("session", {
    sessionId: session?.sessionId ?? `sess-${activeIncident.id}`,
  });
  const experimentUrl = getDeepLink("experiment", {
    experimentId: seededExperiment.experimentId,
  });
  const insightsUrl = getDeepLink("insights");
  const dashboardUrl = trigger?.dashboardUrl ?? getDeepLink("envDashboard");
  const winner = getExperimentWinner();

  const loadScoreHistory = React.useCallback(async () => {
    const response = await fetch("/api/score", { cache: "no-store" }).catch(
      () => null
    );

    if (!response?.ok) return;

    const body = (await response.json()) as { history: ScoreHistory };
    setHistory(body.history);
  }, []);

  async function runInvestigation() {
    setActiveSection("durable");
    setPhase("sending");
    setResult(null);
    setTrigger(null);
    setLiveSignal(null);
    setOutcomeScore(null);
    setToast("");

    try {
      const triggerResponse = await postJson<TriggerResponse>("/api/trigger", {
        incidentId: activeIncident.id,
        flags,
      });

      setTrigger(triggerResponse);

      if (!triggerResponse.sent) {
        showToast("Foreground demo running; Inngest is not reachable");
      }

      const applyResolvedLink = (status: RunStatusResponse): boolean => {
        if (!status.runId || !status.traceUrl) return false;
        setTrigger((current) =>
          current
            ? { ...current, runId: status.runId, traceUrl: status.traceUrl }
            : current
        );
        return realRunId.test(status.runId);
      };

      let linkResolved = false;
      let completed = false;
      let lastStatusError = "";

      for (let i = 0; i < 18 && !completed; i += 1) {
        await wait(650);
        const status = await fetchRunStatus(
          triggerResponse,
          activeIncident.id
        ).catch((error: unknown) => {
          lastStatusError =
            error instanceof Error ? error.message : "Run status unavailable";
          return null;
        });

        if (!status) {
          setPhase("investigating");
          continue;
        }

        lastStatusError = "";
        linkResolved = applyResolvedLink(status) || linkResolved;

        if (status.status === "completed" && status.result) {
          setResult(status.result);
          setOutcomeScore(status.result.localizationScore);
          setPhase("complete");
          showToast("Agent run complete");
          completed = true;
          break;
        }

        if (status.status === "failed") {
          setPhase("error");
          showToast(status.error ?? "Run failed");
          return;
        }

        setPhase(status.hadRetry ? "retrying" : "investigating");
      }

      if (!completed) {
        const fallbackResult = buildTriageResult(
          activeIncident,
          triggerResponse.clientRunId
        );
        setResult(fallbackResult);
        setOutcomeScore(fallbackResult.localizationScore);
        setPhase("complete");
        showToast(
          lastStatusError
            ? "Trace still syncing; foreground result is ready"
            : "Run is still syncing; foreground result is ready"
        );
        completed = true;
      }

      for (let j = 0; j < 16 && !linkResolved; j += 1) {
        await wait(1500);
        const status = await fetchRunStatus(
          triggerResponse,
          activeIncident.id
        ).catch(() => null);
        if (!status) continue;
        linkResolved = applyResolvedLink(status);
      }
    } catch (error) {
      setPhase("error");
      showToast(error instanceof Error ? error.message : "Run failed");
    }
  }

  async function score(signal: ScoreSignal) {
    setActiveSection("scores");
    setToast("");

    try {
      const response = await postJson<
        ScoreActionResponse & { history: ScoreHistory }
      >("/api/score", {
        incidentId: activeIncident.id,
        clientRunId: trigger?.clientRunId ?? crypto.randomUUID(),
        signal,
      });

      if (signal === "up" || signal === "down") {
        setLiveSignal(signal);
        showToast(signal === "up" ? "Fast score sent" : "Downvote sent");
      } else {
        setOutcomeScore(response.outcomeScore);
        showToast(signal === "saved" ? "Analysis saved" : "Discard sent");
      }

      setHistory(response.history);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Score signal failed");
    }
  }

  async function resetDemo() {
    await fetch("/api/demo/reset", { method: "POST" }).catch(() => undefined);
    setIncidentId(defaultIncidentId);
    setFlags(defaultDemoFlags);
    setPhase("idle");
    setTrigger(null);
    setResult(null);
    setLiveSignal(null);
    setOutcomeScore(null);
    setExperimentVisible(false);
    setActiveSection("durable");
    setToast("");
    await loadScoreHistory();
  }

  async function triggerFlowControlBurst() {
    setFlowBurstPending(true);
    setToast("");

    try {
      const response = await postJson<FlowControlBurstResponse>(
        "/api/flow-control/trigger",
        {
          count: 8,
          workMs: 7500,
        }
      );

      showToast(
        `Queued ${response.eventsSent} enrichment events: ${response.batchId}`
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Flow-control burst failed"
      );
    } finally {
      setFlowBurstPending(false);
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function setFailureCount(nextCount: number) {
    setFlags({
      ...flags,
      failureCount: Math.max(0, Math.min(4, nextCount)),
    });
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--ink)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1180px] grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)]">
        <section className="grid min-h-screen min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] border-x border-[var(--ink)] bg-white lg:border-r">
          <header className="grid grid-cols-[minmax(0,1fr)] gap-3 border-b border-[var(--ink)] bg-[var(--bone)] p-3">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="display truncate text-xl font-semibold">
                  Booth Control
                </h1>
                <div className="mono mt-1 flex flex-wrap items-center gap-1.5 text-[10px] uppercase text-[var(--muted-copy)]">
                  <StatusPill phase={phase} sent={trigger?.sent} />
                  <span>left pane</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <CodeDrawer
                  activeCodeId={activeCodeId}
                  codeOpen={codeOpen}
                  onActiveCodeChange={setActiveCodeId}
                  onOpenChange={setCodeOpen}
                  snippets={snippets}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 border-[var(--ink)] bg-white px-2 text-xs"
                  onClick={triggerFlowControlBurst}
                  disabled={flowBurstPending}
                  title="Queue customer enrichment burst"
                >
                  <Play className="size-3.5" />
                  <span>Burst</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="border-[var(--ink)] bg-white"
                  onClick={resetDemo}
                  disabled={isRunning}
                  aria-label="Reset booth control"
                  title="Reset booth control"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <DashboardLink
                href={dashboardUrl}
                className="demo-segment-button mono inline-flex h-8 min-w-0 items-center justify-center gap-1.5 px-2 text-[10px] uppercase"
              >
                <ExternalLink className="size-3.5" />
                <span className="truncate">Open Inngest</span>
              </DashboardLink>
              <span className="mono inline-flex h-8 min-w-20 items-center justify-center gap-1.5 border border-[var(--ink)] bg-white px-2 text-[10px] uppercase tabnum">
                <span className="status-dot" data-state={phase} />
                <span>{statusLabel}</span>
              </span>
            </div>
          </header>

          <nav
            className="grid grid-cols-3 border-b border-[var(--ink)] bg-[var(--cloud)]"
            aria-label="Booth control sections"
          >
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  data-active={activeSection === section.id ? "true" : undefined}
                  className="demo-segment-button mono flex h-11 min-w-0 items-center justify-center gap-1 border-0 border-r border-[var(--ink)] px-1 text-[10px] uppercase last:border-r-0 data-[active=true]:bg-[var(--ink)] data-[active=true]:text-white"
                  onClick={() => setActiveSection(section.id)}
                >
                  <Icon className="size-3.5" />
                  <span className="truncate">{section.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 overflow-auto">
            {activeSection === "durable" ? (
              <DurableAgentControl
                flags={flags}
                incident={activeIncident}
                incidentId={incidentId}
                isRunning={isRunning}
                phase={phase}
                result={result}
                traceUrl={traceUrl}
                trigger={trigger}
                onFailureCountChange={setFailureCount}
                onFlagsChange={setFlags}
                onIncidentChange={setIncidentId}
                onRun={runInvestigation}
              />
            ) : null}
            {activeSection === "scores" ? (
              <ScoreSessionControl
                history={history}
                incident={activeIncident}
                isRunning={isRunning}
                latestPoint={latestScorePoint}
                liveSignal={liveSignal}
                outcomeScore={outcomeScore}
                scoresUrl={scoresUrl}
                seededOutcomeScore={seededScore?.outcomeScore ?? 0}
                sessionId={session?.sessionId ?? `sess-${activeIncident.id}`}
                sessionUrl={sessionUrl}
                onSignal={score}
              />
            ) : null}
            {activeSection === "experiment" ? (
              <ExperimentControl
                experimentUrl={experimentUrl}
                insightsUrl={insightsUrl}
                visible={experimentVisible}
                winnerModel={winner.model}
                winnerScore={winner.accuracy}
                onShow={() => {
                  setExperimentVisible(true);
                  showToast("Experiment ready");
                }}
              />
            ) : null}
          </div>
        </section>

        <RightPaneGuide
          dashboardUrl={dashboardUrl}
          experimentUrl={experimentUrl}
          insightsUrl={insightsUrl}
          scoresUrl={scoresUrl}
          sessionUrl={sessionUrl}
          traceUrl={traceUrl}
        />
      </div>

      {toast ? (
        <div className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 border border-[var(--ink)] bg-white px-3 py-2 shadow-[4px_4px_0_#1a161c]">
          <Check className="size-4 text-[var(--teal)]" />
          <span className="mono min-w-0 truncate text-[11px] uppercase">
            {toast}
          </span>
        </div>
      ) : null}
    </main>
  );
}

function DurableAgentControl({
  flags,
  incident,
  incidentId,
  isRunning,
  phase,
  result,
  traceUrl,
  trigger,
  onFailureCountChange,
  onFlagsChange,
  onIncidentChange,
  onRun,
}: {
  flags: DemoFlags;
  incident: Incident;
  incidentId: string;
  isRunning: boolean;
  phase: RunPhase;
  result: RunStatusResponse["result"];
  traceUrl: string;
  trigger: TriggerResponse | null;
  onFailureCountChange: (count: number) => void;
  onFlagsChange: (flags: DemoFlags) => void;
  onIncidentChange: (id: string) => void;
  onRun: () => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-3">
      <SectionHeader
        eyebrow="Act 1"
        title="Durable Agents"
        detail="Trigger the real code-triage run, then move the right pane to the trace."
      />

      <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
        <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
          bug report
        </span>
        <select
          value={incidentId}
          onChange={(event) => onIncidentChange(event.target.value)}
          disabled={isRunning}
          className="h-9 min-w-0 truncate border border-[var(--ink)] bg-white px-2 text-xs outline-none focus:border-[var(--coral)]"
        >
          {incidents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} | {item.title}
            </option>
          ))}
        </select>
      </label>

      <div className="min-w-0 border-y border-[var(--rule-soft)] py-3">
        <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
          current bug
        </div>
        <h2 className="display mt-1 text-lg font-medium leading-6">
          {incident.id}: {incident.title}
        </h2>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted-copy)]">
          {incident.body}
        </p>
      </div>

      <Button
        className="h-10 w-full bg-[var(--ink)] text-white hover:bg-[var(--coral)] hover:text-[var(--ink)]"
        onClick={onRun}
        disabled={isRunning}
      >
        <Play className="size-4" />
        Investigate
      </Button>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <label className="flex min-h-9 items-center justify-between gap-3 border border-[var(--rule-soft)] px-2.5 py-2">
          <span className="min-w-0">
            <span className="block text-xs font-medium">Fail repo read once</span>
            <span className="mono block truncate text-[10px] uppercase text-[var(--muted-copy)]">
              retry boundary
            </span>
          </span>
          <input
            type="checkbox"
            checked={flags.failureCount > 0}
            onChange={(event) =>
              onFailureCountChange(event.target.checked ? 1 : 0)
            }
            className="size-4 accent-[var(--coral)]"
          />
        </label>

        <div className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-2">
          <div>
            <div className="text-xs font-medium">Retry count</div>
            <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
              next run
            </div>
          </div>
          <div className="grid grid-cols-[28px_1fr_28px] border border-[var(--ink)]">
            <button
              type="button"
              className="grid h-8 place-items-center border-r border-[var(--ink)]"
              onClick={() => onFailureCountChange(flags.failureCount - 1)}
              aria-label="Decrease retry count"
            >
              <ChevronDown className="size-3.5" />
            </button>
            <div className="mono grid h-8 place-items-center text-[11px] tabnum">
              {flags.failureCount}
            </div>
            <button
              type="button"
              className="grid h-8 place-items-center border-l border-[var(--ink)]"
              onClick={() => onFailureCountChange(flags.failureCount + 1)}
              aria-label="Increase retry count"
            >
              <ChevronUp className="size-3.5" />
            </button>
          </div>
        </div>

        <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
          <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
            slow mode
          </span>
          <input
            type="range"
            min={0}
            max={1800}
            step={300}
            value={flags.latencyMs}
            onChange={(event) =>
              onFlagsChange({ ...flags, latencyMs: Number(event.target.value) })
            }
            className="accent-[var(--coral)]"
          />
        </label>
      </div>

      <DriverCue>
        On the Inngest side, show the run trace, failed step, retry, and
        recovered output.
      </DriverCue>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <div className="grid grid-cols-2 gap-2">
          <DashboardLink
            href={traceUrl}
            className="demo-segment-button mono inline-flex h-8 min-w-0 items-center justify-center gap-1.5 px-2 text-[10px] uppercase"
          >
            <ExternalLink className="size-3.5" />
            <span className="truncate">Open run</span>
          </DashboardLink>
          <StatusBlock label="status" value={getStatusLabel(phase)} />
        </div>
        <StatusBlock label="event" value={trigger?.eventId ?? "not sent"} />
        <StatusBlock
          label="run"
          value={trigger?.runId ?? trigger?.clientRunId ?? "not sent"}
        />
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
          current steps
        </div>
        <ol className="grid gap-1.5">
          {agentSteps.map((step, index) => (
            <li
              key={step}
              className="grid grid-cols-[18px_minmax(0,1fr)_62px] items-center gap-2 text-xs"
            >
              <span
                className={`size-2.5 rounded-full ${
                  getStepState(index, phase, Boolean(result)) === "active"
                    ? "bg-[var(--coral)]"
                    : getStepState(index, phase, Boolean(result)) === "done"
                      ? "bg-[var(--teal)]"
                      : "bg-[var(--cloud)]"
                }`}
              />
              <span className="min-w-0 truncate">{step}</span>
              <span className="mono text-right text-[9px] uppercase text-[var(--muted-copy)]">
                {getStepState(index, phase, Boolean(result))}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <TalkTrack>
        This is a real agent run. Every model turn and tool call is a durable
        Inngest step. When a tool fails, Inngest retries the failed boundary.
      </TalkTrack>
    </div>
  );
}

function ScoreSessionControl({
  history,
  incident,
  isRunning,
  latestPoint,
  liveSignal,
  outcomeScore,
  scoresUrl,
  seededOutcomeScore,
  sessionId,
  sessionUrl,
  onSignal,
}: {
  history: ScoreHistory | null;
  incident: Incident;
  isRunning: boolean;
  latestPoint: ScoreHistoryPoint | null;
  liveSignal: "up" | "down" | null;
  outcomeScore: number | null;
  scoresUrl: string;
  seededOutcomeScore: number;
  sessionId: string;
  sessionUrl: string;
  onSignal: (signal: ScoreSignal) => void;
}) {
  const scoreValue = outcomeScore ?? latestPoint?.score ?? seededOutcomeScore;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-3">
      <SectionHeader
        eyebrow="Act 2"
        title="Scores + Sessions"
        detail="Send tiny product signals and point the right pane at the run history."
      />

      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <Button
          variant="outline"
          className="h-9 w-full min-w-0 border-[var(--ink)] bg-white text-xs"
          onClick={() => onSignal("up")}
          disabled={isRunning}
        >
          <ThumbsUp className="size-4" />
          <span className="truncate">Up</span>
        </Button>
        <Button
          variant="outline"
          className="h-9 w-full min-w-0 border-[var(--ink)] bg-white text-xs"
          onClick={() => onSignal("down")}
          disabled={isRunning}
        >
          <ThumbsDown className="size-4" />
          <span className="truncate">Down</span>
        </Button>
        <Button
          className="h-9 w-full min-w-0 bg-[var(--ink)] text-xs text-white hover:bg-[var(--coral)] hover:text-[var(--ink)]"
          onClick={() => onSignal("saved")}
          disabled={isRunning}
        >
          <Save className="size-4" />
          <span className="truncate">Save analysis</span>
        </Button>
        <Button
          variant="outline"
          className="h-9 w-full min-w-0 border-[var(--ink)] bg-white text-xs"
          onClick={() => onSignal("discarded")}
          disabled={isRunning}
        >
          <Trash2 className="size-4" />
          <span className="truncate">Discard</span>
        </Button>
      </div>

      <DriverCue>
        On the Inngest side, show the score attached to the run, then show the
        session/history view.
      </DriverCue>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          <SignalMetric
            label="fast score"
            value={
              liveSignal === "up"
                ? "1.00"
                : liveSignal === "down"
                  ? "0.00"
                  : "waiting"
            }
          />
          <SignalMetric label="outcome" value={scoreValue.toFixed(2)} />
        </div>
        <StatusBlock label="session" value={sessionId} />
        <StatusBlock
          label="last scored"
          value={latestPoint ? formatTime(latestPoint.scoredAt) : "seeded"}
        />
        <StatusBlock
          label="history"
          value={`${history?.count ?? seededScores.length} scored runs`}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <DashboardLink
          href={scoresUrl}
          className="demo-segment-button mono inline-flex h-8 min-w-0 items-center justify-center gap-1.5 px-2 text-[10px] uppercase"
        >
          <ExternalLink className="size-3.5" />
          <span className="truncate">Open scores</span>
        </DashboardLink>
        <DashboardLink
          href={sessionUrl}
          className="demo-segment-button mono inline-flex h-8 min-w-0 items-center justify-center gap-1.5 px-2 text-[10px] uppercase"
        >
          <History className="size-3.5" />
          <span className="truncate">Open session</span>
        </DashboardLink>
      </div>

      <TalkTrack>
        Once the agent produces useful work, product behavior can become an eval
        signal. The score and session belong to the same run history.
      </TalkTrack>

      <div className="border-t border-[var(--rule-soft)] pt-3">
        <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
          current bug
        </div>
        <div className="mt-1 truncate text-xs">
          {incident.id}: {incident.title}
        </div>
      </div>
    </div>
  );
}

function ExperimentControl({
  experimentUrl,
  insightsUrl,
  visible,
  winnerModel,
  winnerScore,
  onShow,
}: {
  experimentUrl: string;
  insightsUrl: string;
  visible: boolean;
  winnerModel: string;
  winnerScore: number;
  onShow: () => void;
}) {
  const models = seededExperiment.aggregates.map((item) => item.model).join(" vs ");

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-3">
      <SectionHeader
        eyebrow="Act 3"
        title="Experimentation"
        detail="Reveal the seeded bakeoff and drive the right pane to experiments or Insights."
      />

      <Button
        className="h-10 w-full bg-[var(--ink)] text-white hover:bg-[var(--coral)] hover:text-[var(--ink)]"
        onClick={onShow}
      >
        <FlaskConical className="size-4" />
        Show experiment
      </Button>

      <DriverCue>
        On the Inngest side, show the experiment group and/or Insights query
        over scored runs.
      </DriverCue>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <StatusBlock
          label="experiment"
          value={visible ? seededExperiment.experimentId : "ready"}
        />
        <StatusBlock label="models" value={visible ? models : "hidden"} />
        <StatusBlock
          label="corpus"
          value={`${seededExperiment.corpusIncidentIds.length} resolved bugs`}
        />
        <StatusBlock
          label="winner"
          value={
            visible
              ? `${winnerModel} at ${winnerScore.toFixed(2)} accuracy`
              : "show to reveal"
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DashboardLink
          href={experimentUrl}
          className="demo-segment-button mono inline-flex h-8 min-w-0 items-center justify-center gap-1.5 px-2 text-[10px] uppercase"
        >
          <ExternalLink className="size-3.5" />
          <span className="truncate">Open experiment</span>
        </DashboardLink>
        <DashboardLink
          href={insightsUrl}
          className="demo-segment-button mono inline-flex h-8 min-w-0 items-center justify-center gap-1.5 px-2 text-[10px] uppercase"
        >
          <ArrowRight className="size-3.5" />
          <span className="truncate">Open Insights</span>
        </DashboardLink>
      </div>

      <TalkTrack>
        Now the same scorer can evaluate a corpus of resolved bugs across
        models. The durable run history gives us the data for experiments and
        Insights.
      </TalkTrack>
    </div>
  );
}

function CodeDrawer({
  activeCodeId,
  codeOpen,
  onActiveCodeChange,
  onOpenChange,
  snippets,
}: {
  activeCodeId: CodeSnippetId;
  codeOpen: boolean;
  onActiveCodeChange: (id: CodeSnippetId) => void;
  onOpenChange: (open: boolean) => void;
  snippets: IncidentDemoProps["snippets"];
}) {
  return (
    <Sheet open={codeOpen} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-7 border-[var(--ink)] bg-white px-2 text-xs"
          />
        }
      >
        <Code2 className="size-3.5" />
        Code
      </SheetTrigger>
      <SheetContent
        side="right"
        className="!w-[calc(100vw-18px)] !max-w-[760px] gap-0 border-[var(--ink)] bg-white p-0"
      >
        <SheetHeader className="border-b border-[var(--rule-soft)] p-3">
          <SheetTitle className="display text-lg">Code</SheetTitle>
          <SheetDescription className="text-xs leading-5">
            Compact implementation view for the durable agent, score/session
            signal, and experiment wrapper.
          </SheetDescription>
        </SheetHeader>
        <div className="grid h-[calc(100vh-98px)] min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <div className="grid grid-cols-3 border-b border-[var(--ink)] bg-[var(--cloud)]">
            {codeTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-active={activeCodeId === tab.id ? "true" : undefined}
                className="demo-segment-button mono h-9 border-0 border-r border-[var(--ink)] text-[10px] uppercase last:border-r-0 data-[active=true]:bg-[var(--ink)] data-[active=true]:text-white"
                onClick={() => onActiveCodeChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <CodeView snippets={snippets} activeId={activeCodeId} variant="rail" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RightPaneGuide({
  dashboardUrl,
  experimentUrl,
  insightsUrl,
  scoresUrl,
  sessionUrl,
  traceUrl,
}: {
  dashboardUrl: string;
  experimentUrl: string;
  insightsUrl: string;
  scoresUrl: string;
  sessionUrl: string;
  traceUrl: string;
}) {
  return (
    <aside className="hidden min-h-screen border-r border-[var(--ink)] bg-[var(--bone)] lg:grid lg:grid-rows-[auto_minmax(0,1fr)]">
      <div className="border-b border-[var(--ink)] p-5">
        <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
          right-side browser pane
        </div>
        <h2 className="display mt-1 text-2xl font-medium">Inngest Dashboard</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-copy)]">
          Keep the real dashboard snapped beside this control panel. These links
          reuse one named browser window.
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-auto p-5">
        <GuideStep
          label="1. Agent run"
          body="Open the trace and show the failed repo-read step recovering."
          href={traceUrl}
          linkLabel="Open run trace"
        />
        <GuideStep
          label="2. Scores and session"
          body="Show score events attached to the same run history."
          href={scoresUrl}
          linkLabel="Open scores"
        />
        <GuideStep
          label="Session fallback"
          body="Sessions are seeded in this SDK pass, so the link falls back to Runs."
          href={sessionUrl}
          linkLabel="Open session"
        />
        <GuideStep
          label="3. Experiment"
          body="Show localization-bakeoff or move to Insights over scored runs."
          href={experimentUrl}
          linkLabel="Open experiment"
        />
        <GuideStep
          label="Insights"
          body="Use the score event query when Cloud Insights is configured."
          href={insightsUrl}
          linkLabel="Open Insights"
        />
        <DashboardLink
          href={dashboardUrl}
          className="demo-segment-button mono mt-2 inline-flex h-9 w-fit items-center gap-2 px-3 text-[11px] uppercase"
        >
          <ExternalLink className="size-3.5" />
          Open dashboard home
        </DashboardLink>
      </div>
    </aside>
  );
}

function GuideStep({
  body,
  href,
  label,
  linkLabel,
}: {
  body: string;
  href: string;
  label: string;
  linkLabel: string;
}) {
  return (
    <div className="border-b border-[var(--rule-soft)] pb-4">
      <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
        {label}
      </div>
      <p className="mt-1 max-w-xl text-sm leading-6">{body}</p>
      <DashboardLink
        href={href}
        className="mono mt-3 inline-flex h-8 items-center gap-1.5 border border-[var(--ink)] bg-white px-3 text-[10px] uppercase hover:border-[var(--coral)]"
      >
        {linkLabel}
        <ExternalLink className="size-3.5" />
      </DashboardLink>
    </div>
  );
}

function SectionHeader({
  detail,
  eyebrow,
  title,
}: {
  detail: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
        {eyebrow}
      </div>
      <h2 className="display mt-1 text-xl font-medium">{title}</h2>
      <p className="mt-1 max-w-full text-xs leading-5 text-[var(--muted-copy)]">
        {detail}
      </p>
    </div>
  );
}

function DriverCue({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-l-4 border-[var(--coral)] bg-[var(--bone)] p-3">
      <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
        next on Inngest
      </div>
      <p className="mt-1 text-xs leading-5">{children}</p>
    </div>
  );
}

function TalkTrack({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-t border-[var(--rule-soft)] pt-3">
      <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
        talk track
      </div>
      <p className="mt-1 text-xs leading-5 text-[var(--muted-copy)]">
        {children}
      </p>
    </div>
  );
}

function StatusBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-8 w-full min-w-0 grid-cols-[74px_minmax(0,1fr)] items-center gap-2 border border-[var(--rule-soft)] px-2 py-1.5">
      <span className="mono text-[9px] uppercase text-[var(--muted-copy)]">
        {label}
      </span>
      <span className="mono min-w-0 truncate text-right text-[10px] tabnum">
        {value}
      </span>
    </div>
  );
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--ink)] p-3">
      <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
        {label}
      </div>
      <div className="display mt-1 text-3xl font-medium tabnum">{value}</div>
    </div>
  );
}

function StatusPill({
  phase,
  sent,
}: {
  phase: RunPhase;
  sent: boolean | undefined;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        className="status-dot"
        data-state={phase}
      />
      <span>{getStatusLabel(phase)}</span>
      {sent === undefined ? null : (
        <span className="text-[var(--muted-copy)]">
          {sent ? "inngest" : "foreground"}
        </span>
      )}
    </span>
  );
}

function getStepState(index: number, phase: RunPhase, hasResult: boolean) {
  if (phase === "idle") return "queued";
  if (hasResult || phase === "complete") return "done";
  if (phase === "sending") return index === 0 ? "active" : "queued";
  if (phase === "investigating") {
    if (index < 3) return "done";
    return index === 3 ? "active" : "queued";
  }
  if (phase === "retrying") {
    if (index < 4) return "done";
    return index === 4 ? "active" : "queued";
  }
  if (phase === "error") return index <= 4 ? "active" : "queued";
  return "queued";
}

function getStatusLabel(phase: RunPhase) {
  if (phase === "idle") return "ready";
  if (phase === "complete") return "complete";
  if (phase === "error") return "error";
  if (phase === "retrying") return "retrying";
  return "running";
}

function getLatestScorePoint(
  history: ScoreHistory | null,
  clientRunId: string | undefined,
  incidentId: string
) {
  const points = history?.points ?? [];
  const exact = clientRunId
    ? [...points].reverse().find((point) => point.clientRunId === clientRunId)
    : undefined;

  return (
    exact ??
    [...points].reverse().find((point) => point.incidentId === incidentId) ??
    null
  );
}

function getExperimentWinner() {
  return seededExperiment.aggregates.reduce((winner, item) =>
    item.accuracy > winner.accuracy ? item : winner
  );
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

async function fetchRunStatus(trigger: TriggerResponse, incidentId: string) {
  const url = new URL("/api/run-status", window.location.origin);
  url.searchParams.set("clientRunId", trigger.clientRunId);
  url.searchParams.set("incidentId", incidentId);
  if (trigger.inngestEventId) {
    url.searchParams.set("inngestEventId", trigger.inngestEventId);
  }

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Run status failed: ${response.status}`);
  }

  return (await response.json()) as RunStatusResponse;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: unknown;
    };
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `Request failed: ${response.status}`
    );
  }

  return response.json() as Promise<T>;
}
