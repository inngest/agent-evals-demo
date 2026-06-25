"use client";

import * as React from "react";
import {
  Activity,
  ArrowRight,
  Check,
  Clock3,
  Code2,
  ExternalLink,
  FlaskConical,
  Gauge,
  MessageSquare,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  TriangleAlert,
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
} from "@/components/ui/sheet";
import {
  defaultIncidentId,
  getIncident,
  incidents,
  type Incident,
} from "@/content/incidents";
import type { CodeSnippetId } from "@/content/code-snippets";
import { seededExperiment, seededScores, seededSessions } from "@/content/seed-data";
import { wait, type DemoFlags } from "@/lib/demo-flags";
import { getDeepLink } from "@/lib/inngest-dashboard";
import type { HighlightedCodeSnippet } from "@/lib/highlight";
import type { ScoreHistory } from "@/lib/scoring";
import type {
  RunPhase,
  RunStatusResponse,
  ScoreActionResponse,
  TriggerResponse,
} from "@/components/demo/types";

type BoothStoryProps = {
  initialHistory: ScoreHistory;
  snippets: HighlightedCodeSnippet[];
};

type ProofLink = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
};

const storyFlags: DemoFlags = {
  llmOffline: true,
  failureCount: 1,
  latencyMs: 0,
};

const realRunId = /^01[A-Z0-9]{24}$/;

const codeTabs: Array<{ id: CodeSnippetId; label: string }> = [
  { id: "act1", label: "Act 1" },
  { id: "act2", label: "Act 2" },
  { id: "act3", label: "Act 3" },
];

export function BoothStory({ initialHistory, snippets }: BoothStoryProps) {
  const [incidentId, setIncidentId] = React.useState(defaultIncidentId);
  const [phase, setPhase] = React.useState<RunPhase>("idle");
  const [trigger, setTrigger] = React.useState<TriggerResponse | null>(null);
  const [result, setResult] = React.useState<RunStatusResponse["result"]>(null);
  const [history, setHistory] = React.useState(initialHistory);
  const [liveSignal, setLiveSignal] = React.useState<"up" | "down" | null>(null);
  const [outcomeScore, setOutcomeScore] = React.useState<number | null>(null);
  const [codeOpen, setCodeOpen] = React.useState(false);
  const [activeCodeId, setActiveCodeId] = React.useState<CodeSnippetId>("act1");
  const [toast, setToast] = React.useState("");

  const incident = getIncident(incidentId) ?? incidents[0];
  const session =
    seededSessions.find((item) => item.incidentId === incident.id) ??
    seededSessions[0];
  const seededScore =
    seededScores.find((item) => item.incidentId === incident.id) ??
    seededScores[0];
  const traceUrl =
    trigger?.traceUrl ??
    getDeepLink("runTrace", { runId: seededScore?.runId ?? incident.runId });
  const scoresUrl = getDeepLink("scoresOnTrace", {
    runId: trigger?.runId ?? trigger?.clientRunId ?? seededScore?.runId,
  });
  const sessionUrl = getDeepLink("session", {
    sessionId: session?.sessionId ?? `sess-${incident.id}`,
  });
  const experimentUrl = getDeepLink("experiment", {
    experimentId: seededExperiment.experimentId,
  });
  const insightsUrl = getDeepLink("insights");
  const dashboardUrl = trigger?.dashboardUrl ?? getDeepLink("envDashboard");
  const isRunning =
    phase === "sending" || phase === "investigating" || phase === "retrying";
  const statusLabel = getStatusLabel(phase);
  const finalScore = outcomeScore ?? result?.localizationScore ?? seededScore?.outcomeScore ?? 0;
  const winner = getExperimentWinner();
  const proofLinks: ProofLink[] = [
    { href: traceUrl, icon: Activity, label: "Run trace", value: "retry + replay" },
    { href: scoresUrl, icon: Gauge, label: "Scores", value: "quality signal" },
    { href: sessionUrl, icon: MessageSquare, label: "Session", value: "history" },
    { href: experimentUrl, icon: FlaskConical, label: "Experiment", value: "variants" },
    { href: insightsUrl, icon: Sparkles, label: "Insights", value: "traffic data" },
  ];

  async function runConversation() {
    setPhase("sending");
    setTrigger(null);
    setResult(null);
    setLiveSignal(null);
    setOutcomeScore(null);
    setToast("");

    try {
      const triggerResponse = await postJson<TriggerResponse>("/api/trigger", {
        incidentId: incident.id,
        flags: storyFlags,
      });
      setTrigger(triggerResponse);

      if (!triggerResponse.sent) {
        showToast("Foreground fallback running");
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

      for (let i = 0; i < 18 && !completed; i += 1) {
        await wait(650);
        const status = await fetchRunStatus(triggerResponse, incident.id);
        linkResolved = applyResolvedLink(status) || linkResolved;

        if (status.status === "completed" && status.result) {
          setResult(status.result);
          setOutcomeScore(status.result.localizationScore);
          setPhase("complete");
          showToast("Conversation recovered");
          completed = true;
          break;
        }

        if (status.status === "failed") {
          setPhase("error");
          showToast(status.error ?? "Agent run failed");
          return;
        }

        setPhase(status.hadRetry ? "retrying" : "investigating");
      }

      if (!completed) {
        setPhase("error");
        showToast("Run status timed out");
        return;
      }

      for (let j = 0; j < 16 && !linkResolved; j += 1) {
        await wait(1500);
        const status = await fetchRunStatus(triggerResponse, incident.id);
        linkResolved = applyResolvedLink(status);
      }
    } catch (error) {
      setPhase("error");
      showToast(error instanceof Error ? error.message : "Agent run failed");
    }
  }

  async function sendSignal(signal: "up" | "saved") {
    try {
      const response = await postJson<
        ScoreActionResponse & { history: ScoreHistory }
      >("/api/score", {
        incidentId: incident.id,
        clientRunId: trigger?.clientRunId ?? crypto.randomUUID(),
        signal,
      });

      if (signal === "up") {
        setLiveSignal("up");
        showToast("Customer signal captured");
      } else {
        setOutcomeScore(response.outcomeScore);
        showToast("Outcome score saved");
      }

      setHistory(response.history);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Signal failed");
    }
  }

  function resetStory() {
    setPhase("idle");
    setTrigger(null);
    setResult(null);
    setLiveSignal(null);
    setOutcomeScore(null);
    setToast("");
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--ink)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1500px] grid-cols-1 border-x border-[var(--ink)] bg-white xl:h-screen xl:min-h-0 xl:grid-cols-[minmax(420px,0.86fr)_minmax(440px,1.14fr)] xl:overflow-hidden">
        <section className="grid h-screen min-h-[680px] min-w-0 grid-rows-[auto_minmax(0,1fr)] border-b border-[var(--ink)] xl:h-auto xl:min-h-0 xl:border-b-0 xl:border-r">
          <ProductHeader
            dashboardUrl={dashboardUrl}
            incident={incident}
            incidentId={incidentId}
            isRunning={isRunning}
            onIncidentChange={setIncidentId}
            onOpenCode={() => setCodeOpen(true)}
            onReset={resetStory}
            statusLabel={statusLabel}
          />
          <ProductChat
            finalScore={finalScore}
            incident={incident}
            isRunning={isRunning}
            liveSignal={liveSignal}
            outcomeScore={outcomeScore}
            phase={phase}
            result={result}
            onRun={runConversation}
            onSignal={sendSignal}
          />
        </section>

        <section className="grid min-h-[560px] min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--bone)] xl:min-h-0">
          <InngestProof
            experimentUrl={experimentUrl}
            finalScore={finalScore}
            historyCount={history.count}
            proofLinks={proofLinks}
            runId={trigger?.runId ?? trigger?.clientRunId ?? "waiting"}
            statusLabel={statusLabel}
            traceUrl={traceUrl}
            winnerModel={winner.model}
          />
        </section>
      </div>

      <CodeDrawer
        activeCodeId={activeCodeId}
        codeOpen={codeOpen}
        onActiveCodeChange={setActiveCodeId}
        onOpenChange={setCodeOpen}
        snippets={snippets}
      />

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

function ProductHeader({
  dashboardUrl,
  incident,
  incidentId,
  isRunning,
  onIncidentChange,
  onOpenCode,
  onReset,
  statusLabel,
}: {
  dashboardUrl: string;
  incident: Incident;
  incidentId: string;
  isRunning: boolean;
  onIncidentChange: (id: string) => void;
  onOpenCode: () => void;
  onReset: () => void;
  statusLabel: string;
}) {
  return (
    <header className="grid min-w-0 gap-3 border-b border-[var(--ink)] bg-white p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
            production app
          </div>
          <h1 className="display mt-1 text-2xl font-semibold">
            Acme Support Concierge
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-copy)]">
            A customer-facing agent that keeps the conversation intact while
            the work behind it runs durably.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="mono hidden h-8 items-center border border-[var(--ink)] px-2 text-[10px] uppercase sm:inline-flex">
            {statusLabel}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            className="border-[var(--ink)] bg-white"
            onClick={onOpenCode}
            aria-label="Open code drawer"
            title="Open code drawer"
          >
            <Code2 className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="border-[var(--ink)] bg-white"
            onClick={onReset}
            disabled={isRunning}
            aria-label="Reset conversation"
            title="Reset conversation"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid min-w-0 gap-1">
          <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
            customer issue
          </span>
          <select
            value={incidentId}
            disabled={isRunning}
            onChange={(event) => onIncidentChange(event.target.value)}
            className="h-9 min-w-0 truncate border border-[var(--ink)] bg-white px-2 text-xs outline-none focus:border-[var(--coral)]"
          >
            {incidents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} | {item.title}
              </option>
            ))}
          </select>
        </label>
        <DashboardLink
          href={dashboardUrl}
          className="demo-segment-button mono inline-flex h-9 items-center justify-center gap-1.5 self-end px-3 text-[10px] uppercase"
        >
          <ExternalLink className="size-3.5" />
          Open Inngest
        </DashboardLink>
      </div>

      <div className="grid gap-2 border border-[var(--rule-soft)] bg-[var(--bone)] p-3 text-xs leading-5 text-[var(--muted-copy)]">
        <div className="mono text-[10px] uppercase text-[var(--ink)]">
          visible customer problem
        </div>
        <p className="max-h-[84px] overflow-hidden sm:max-h-none">
          {incident.body}
        </p>
      </div>
    </header>
  );
}

function ProductChat({
  finalScore,
  incident,
  isRunning,
  liveSignal,
  outcomeScore,
  phase,
  result,
  onRun,
  onSignal,
}: {
  finalScore: number;
  incident: Incident;
  isRunning: boolean;
  liveSignal: "up" | "down" | null;
  outcomeScore: number | null;
  phase: RunPhase;
  result: RunStatusResponse["result"];
  onRun: () => void;
  onSignal: (signal: "up" | "saved") => void;
}) {
  const recovered = phase === "retrying" || phase === "complete";
  const transcriptRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;

    const frame = window.requestAnimationFrame(() => {
      transcript.scrollTo({
        top: phase === "idle" ? 0 : transcript.scrollHeight,
        behavior: isRunning && phase !== "idle" ? "smooth" : "auto",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [incident.id, isRunning, phase, result]);

  return (
    <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
      <div
        ref={transcriptRef}
        className="grid min-h-0 content-start gap-4 overflow-auto p-4"
      >
        <MessageBubble
          align="left"
          eyebrow="Customer"
          text={`We're seeing ${incident.title.toLowerCase()}. Can you find the cause without dropping this chat?`}
        />
        {phase === "idle" ? (
          <MessageBubble
            align="right"
            eyebrow="Support agent"
            text="I can investigate, read the code path, and keep this chat alive through a failed model or tool call."
          />
        ) : null}
        {phase !== "idle" ? (
          <MessageBubble
            align="right"
            eyebrow="Support agent"
            text="I’m checking the report, searching the repo, and preparing the fix handoff."
            loading={isRunning}
          />
        ) : null}
        {phase === "retrying" ? (
          <SystemEvent
            icon={TriangleAlert}
            label="Model/tool call failed"
            text="The customer stays in the same conversation while Inngest retries the failed durable step."
          />
        ) : null}
        {recovered ? (
          <SystemEvent
            icon={ShieldCheck}
            label="Conversation resumed"
            text="Earlier model turns and tool results replay from step state; only the failed boundary runs again."
          />
        ) : null}
        {result ? (
          <MessageBubble
            align="right"
            eyebrow="Support agent"
            text={`I found the likely fix path, kept the case alive, and opened the engineering handoff with ${result.citedFiles.slice(0, 2).join(", ")} cited.`}
          />
        ) : null}
        {phase === "error" ? (
          <SystemEvent
            icon={TriangleAlert}
            label="Needs attention"
            text="The agent run did not finish. Open the Inngest trace to see the failing boundary."
          />
        ) : null}
      </div>

      <div className="grid gap-2 border-t border-[var(--ink)] bg-[var(--bone)] p-3 sm:gap-3 sm:p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <div className="flex min-w-0 items-center gap-2 border border-[var(--ink)] bg-white px-3 py-2">
            <MessageSquare className="size-4 shrink-0 text-[var(--muted-copy)]" />
            <span className="min-w-0 truncate text-sm text-[var(--muted-copy)]">
              Investigate and recover this chat.
            </span>
          </div>
          <Button
            className="h-10 bg-[var(--ink)] text-white hover:bg-[var(--coral)] hover:text-[var(--ink)]"
            onClick={onRun}
            disabled={isRunning}
          >
            <Send className="size-4" />
            Ask agent
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <OutcomeMetric
            icon={ShieldCheck}
            label="Recovery"
            value={recovered ? "resumed" : "ready"}
          />
          <OutcomeMetric
            icon={Gauge}
            label="Outcome"
            value={result ? finalScore.toFixed(2) : "waiting"}
          />
          <OutcomeMetric
            icon={Clock3}
            label="Retries"
            value={recovered ? "1 boundary" : "armed"}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-9 border-[var(--ink)] bg-white"
            onClick={() => onSignal("up")}
            disabled={!result}
          >
            <ThumbsUp className="size-4" />
            Helpful answer
          </Button>
          <Button
            variant="outline"
            className="h-9 border-[var(--ink)] bg-white"
            onClick={() => onSignal("saved")}
            disabled={!result}
          >
            <Check className="size-4" />
            Resolve case
          </Button>
        </div>

        <div className="mono flex min-w-0 flex-wrap items-center gap-2 text-[10px] uppercase text-[var(--muted-copy)]">
          <span>feedback: {liveSignal === "up" ? "helpful" : "waiting"}</span>
          <span>outcome: {outcomeScore === null ? "waiting" : outcomeScore.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function InngestProof({
  experimentUrl,
  finalScore,
  historyCount,
  proofLinks,
  runId,
  statusLabel,
  traceUrl,
  winnerModel,
}: {
  experimentUrl: string;
  finalScore: number;
  historyCount: number;
  proofLinks: ProofLink[];
  runId: string;
  statusLabel: string;
  traceUrl: string;
  winnerModel: string;
}) {
  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <header className="border-b border-[var(--ink)] p-4">
        <div className="mono flex items-center gap-2 text-[10px] uppercase text-[var(--muted-copy)]">
          <Activity className="size-3.5" />
          what happens in Inngest
        </div>
        <h2 className="display mt-1 text-2xl font-semibold">Execution data, already there</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-copy)]">
          Open the real dashboard beside this page. The run, retries, scores,
          and experiment data all come from executing the agent.
        </p>
      </header>

      <div className="grid content-start gap-4 overflow-auto p-4">
        <DashboardLink
          href={traceUrl}
          className="demo-segment-button inline-flex min-h-12 items-center justify-between gap-3 px-3 py-2"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">Open the run trace</span>
            <span className="mono block truncate text-[10px] uppercase text-[var(--muted-copy)]">
              failed step, retry, recovered output
            </span>
          </span>
          <ExternalLink className="size-4 shrink-0" />
        </DashboardLink>

        <div className="grid gap-2">
          <StatusRow label="status" value={statusLabel} />
          <StatusRow label="run" value={runId} />
          <StatusRow label="score" value={finalScore.toFixed(2)} />
          <StatusRow label="score runs" value={`${historyCount}`} />
          <StatusRow label="variant winner" value={winnerModel} />
        </div>

        <div className="grid gap-2">
          {proofLinks.map((link) => {
            const Icon = link.icon;
            return (
              <DashboardLink
                key={link.label}
                href={link.href}
                className="flex min-h-11 items-center gap-3 border border-[var(--rule-soft)] bg-white px-3 py-2 hover:border-[var(--coral)]"
              >
                <Icon className="size-4 shrink-0 text-[var(--coral)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{link.label}</span>
                  <span className="mono block truncate text-[10px] uppercase text-[var(--muted-copy)]">
                    {link.value}
                  </span>
                </span>
                <ArrowRight className="size-3.5 shrink-0" />
              </DashboardLink>
            );
          })}
        </div>

        <div className="border border-[var(--ink)] bg-white p-4">
          <div className="mono flex items-center gap-2 text-[10px] uppercase text-[var(--muted-copy)]">
            <FlaskConical className="size-3.5" />
            production traffic bakeoff
          </div>
          <div className="display mt-2 text-3xl font-medium">{winnerModel}</div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-copy)]">
            Quality is only one dimension. Inngest already has latency, retries,
            failures, cost, and outcome scores from the durable execution path.
          </p>
          <DashboardLink
            href={experimentUrl}
            className="demo-segment-button mono mt-4 inline-flex h-8 items-center gap-2 px-3 text-[10px] uppercase"
          >
            <ExternalLink className="size-3.5" />
            Open experiment
          </DashboardLink>
        </div>
      </div>
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
  snippets: HighlightedCodeSnippet[];
}) {
  return (
    <Sheet open={codeOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-[calc(100vw-18px)] !max-w-[760px] gap-0 border-[var(--ink)] bg-white p-0"
      >
        <SheetHeader className="border-b border-[var(--rule-soft)] p-3">
          <SheetTitle className="display text-lg">APIs in your code</SheetTitle>
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

function MessageBubble({
  align,
  eyebrow,
  loading,
  text,
}: {
  align: "left" | "right";
  eyebrow: string;
  loading?: boolean;
  text: string;
}) {
  return (
    <div className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[86%] border border-[var(--ink)] p-3 ${
          align === "right" ? "bg-[var(--ink)] text-white" : "bg-white"
        }`}
      >
        <div
          className={`mono text-[10px] uppercase ${
            align === "right" ? "text-white/62" : "text-[var(--muted-copy)]"
          }`}
        >
          {eyebrow}
        </div>
        <p className="mt-1 break-words text-sm leading-6">{text}</p>
        {loading ? <div className="load-bar mt-3 h-1 bg-white/20" /> : null}
      </div>
    </div>
  );
}

function SystemEvent({
  icon: Icon,
  label,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 border-l-4 border-[var(--coral)] bg-[var(--bone)] p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-[var(--coral)]" />
      <div className="min-w-0">
        <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
          {label}
        </div>
        <p className="mt-1 text-sm leading-6">{text}</p>
      </div>
    </div>
  );
}

function OutcomeMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-14 min-w-0 items-center gap-2 border border-[var(--rule-soft)] bg-white px-2 py-2 sm:gap-3 sm:px-3">
      <Icon className="size-3.5 shrink-0 text-[var(--coral)] sm:size-4" />
      <div className="min-w-0">
        <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
          {label}
        </div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-9 min-w-0 grid-cols-[92px_minmax(0,1fr)] items-center gap-2 border border-[var(--rule-soft)] bg-white px-3 py-2">
      <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
        {label}
      </span>
      <span className="mono min-w-0 truncate text-right text-[10px] tabnum">
        {value}
      </span>
    </div>
  );
}

function getExperimentWinner() {
  return seededExperiment.aggregates.reduce((winner, item) =>
    item.accuracy > winner.accuracy ? item : winner
  );
}

function getStatusLabel(phase: RunPhase) {
  if (phase === "idle") return "ready";
  if (phase === "complete") return "recovered";
  if (phase === "error") return "needs attention";
  if (phase === "retrying") return "retrying";
  return "running";
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
