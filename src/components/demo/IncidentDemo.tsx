"use client";

import * as React from "react";
import {
  ArrowRight,
  BrainCircuit,
  Braces,
  Check,
  ExternalLink,
  FileCode,
  GitPullRequest,
  History,
  MessageSquare,
  Play,
  RotateCcw,
  SearchCode,
  ShieldCheck,
  Sparkles,
  Ticket,
} from "lucide-react";
import { ActStepper } from "@/components/demo/ActStepper";
import { CodeView } from "@/components/demo/CodeView";
import { DashboardLink } from "@/components/demo/DashboardLink";
import { DemoControls } from "@/components/demo/DemoControls";
import { ExperimentPanel } from "@/components/demo/ExperimentPanel";
import { ResultsTable } from "@/components/demo/ResultsTable";
import { ScoresPanel } from "@/components/demo/ScoresPanel";
import { SubstrateCallout } from "@/components/demo/SubstrateCallout";
import { TracePanel } from "@/components/demo/TracePanel";
import { VisionPanel } from "@/components/demo/VisionPanel";
import { Button } from "@/components/ui/button";
import { defaultIncidentId, getIncident, incidents, type Incident } from "@/content/incidents";
import { seededExperiment, seededSessions } from "@/content/seed-data";
import {
  modelStepDetail,
  modelStepLabel,
  modelStepName,
  toolStepDetail,
  toolStepLabel,
  toolStepName,
} from "@/lib/agent-step-names";
import { defaultDemoFlags, wait, type DemoFlags } from "@/lib/demo-flags";
import { getDeepLink } from "@/lib/inngest-dashboard";
import type { ScoreHistory } from "@/lib/scoring";
import type {
  ActId,
  DemoTab,
  IncidentDemoProps,
  RunPhase,
  RunStatusResponse,
  ScoreActionResponse,
  TraceStep,
  TriggerResponse,
} from "@/components/demo/types";

const tabs: Array<{ id: DemoTab; label: string }> = [
  { id: "rca", label: "Analysis" },
  { id: "trace", label: "Trace" },
  { id: "flow", label: "Map" },
  { id: "code", label: "Code" },
];

type ActTwoTab = "scores" | "session" | "code";
type ActThreeTab = "experiment" | "results" | "code";
type ActFourTab = "overview" | "scorer" | "insights" | "code";

const actTwoTabs: Array<{ id: ActTwoTab; label: string }> = [
  { id: "scores", label: "Scores" },
  { id: "session", label: "Session" },
  { id: "code", label: "Code" },
];

const actThreeTabs: Array<{ id: ActThreeTab; label: string }> = [
  { id: "experiment", label: "Experiment" },
  { id: "results", label: "Results" },
  { id: "code", label: "Code" },
];

const actFourTabs: Array<{ id: ActFourTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "scorer", label: "Scorer" },
  { id: "insights", label: "Insights" },
  { id: "code", label: "Code" },
];

export function IncidentDemo({ snippets }: IncidentDemoProps) {
  const [activeAct, setActiveAct] = React.useState<ActId>(1);
  const [activeTab, setActiveTab] = React.useState<DemoTab>("rca");
  const [actTwoTab, setActTwoTab] = React.useState<ActTwoTab>("scores");
  const [actThreeTab, setActThreeTab] =
    React.useState<ActThreeTab>("experiment");
  const [actFourTab, setActFourTab] = React.useState<ActFourTab>("overview");
  const [incidentId, setIncidentId] = React.useState(defaultIncidentId);
  const [flags, setFlags] = React.useState<DemoFlags>(defaultDemoFlags);
  const [phase, setPhase] = React.useState<RunPhase>("idle");
  const [trigger, setTrigger] = React.useState<TriggerResponse | null>(null);
  const [result, setResult] = React.useState<RunStatusResponse["result"]>(null);
  const [history, setHistory] = React.useState<ScoreHistory | null>(null);
  const [liveSignal, setLiveSignal] = React.useState<"up" | "down" | null>(null);
  const [outcomeScore, setOutcomeScore] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState("");
  const [seeding, setSeeding] = React.useState(false);
  const activeIncident = getIncident(incidentId) ?? incidents[0];
  const isRunning =
    phase === "sending" || phase === "investigating" || phase === "retrying";
  const trace = React.useMemo(
    () => buildTraceSteps(activeIncident, phase, Boolean(result)),
    [activeIncident, phase, result]
  );
  const dashboardUrl = trigger?.dashboardUrl ?? getDeepLink("envDashboard");

  const loadScoreHistory = React.useCallback(async () => {
    const response = await fetch("/api/score", { cache: "no-store" }).catch(
      () => null
    );

    if (!response?.ok) return;

    const body = (await response.json()) as { history: ScoreHistory };
    setHistory(body.history);
  }, []);

  async function runInvestigation() {
    setPhase("sending");
    setResult(null);
    setTrigger(null);
    setLiveSignal(null);
    setOutcomeScore(null);
    setToast("");
    setActiveAct(1);
    setActiveTab("trace");

    const triggerResponse = await postJson<TriggerResponse>("/api/trigger", {
      incidentId: activeIncident.id,
      flags,
    });

    setTrigger(triggerResponse);

    if (!triggerResponse.sent) {
      setToast("Local Inngest is not reachable. Foreground demo will still complete.");
    }

    // Thread a resolved real Inngest run id (cloud mode) into the link state so
    // "Open trace" opens this exact run. Returns true once it's a real run id.
    const realRunId = /^01[A-Z0-9]{24}$/;
    const applyResolvedLink = (status: RunStatusResponse): boolean => {
      if (!status.runId || !status.traceUrl) return false;
      const resolvedRunId = status.runId;
      const resolvedTraceUrl = status.traceUrl;
      setTrigger((prev) =>
        prev
          ? { ...prev, runId: resolvedRunId, traceUrl: resolvedTraceUrl }
          : prev
      );
      return realRunId.test(resolvedRunId);
    };

    let linkResolved = false;
    let completed = false;

    for (let i = 0; i < 18 && !completed; i += 1) {
      await wait(650);
      const status = await fetchRunStatus(triggerResponse, activeIncident.id);
      linkResolved = applyResolvedLink(status) || linkResolved;

      if (status.status === "completed" && status.result) {
        setResult(status.result);
        setOutcomeScore(status.result.localizationScore);
        setPhase("complete");
        setActiveTab("rca");
        completed = true;
        break;
      }

      if (status.status === "failed") {
        setPhase("error");
        setToast(status.error ?? "Run failed");
        return;
      }

      setPhase(status.hadRetry ? "retrying" : "investigating");
    }

    if (!completed) {
      setPhase("error");
      setToast("Run status timed out");
      return;
    }

    // The faked UI completes in ~5s, but the real cloud run id can take a few
    // more seconds to be queryable. Keep resolving in the background (no UI
    // impact) so "Open trace" lands on the exact run. No-op in local mode.
    for (let j = 0; j < 16 && !linkResolved; j += 1) {
      await wait(1500);
      const status = await fetchRunStatus(triggerResponse, activeIncident.id);
      linkResolved = applyResolvedLink(status);
    }
  }

  async function score(signal: "up" | "down" | "saved" | "discarded") {
    const clientRunId = trigger?.clientRunId ?? crypto.randomUUID();
    const response = await postJson<ScoreActionResponse & { history: ScoreHistory }>(
      "/api/score",
      {
        incidentId: activeIncident.id,
        clientRunId,
        signal,
      }
    );

    if (signal === "up" || signal === "down") {
      setLiveSignal(signal);
      setToast(signal === "up" ? "Fast score: up" : "Fast score: down");
    } else {
      setOutcomeScore(response.outcomeScore);
      setToast(signal === "saved" ? "Deferred score recorded" : "Discard recorded");
    }

    setHistory(response.history);
    setActiveAct(2);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function seedHistory() {
    setSeeding(true);
    setToast("");
    try {
      const response = await postJson<{ runs: number; eventsSent: number }>(
        "/api/demo/seed",
        { count: 12 }
      );
      await loadScoreHistory();
      setToast(`${response.runs} seeded runs, ${response.eventsSent} events`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Seed failed");
    } finally {
      setSeeding(false);
      window.setTimeout(() => setToast(""), 2600);
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
    setActiveAct(1);
    setActiveTab("rca");
    setToast("");
    await loadScoreHistory();
  }

  return (
    <main className="min-h-screen bg-[var(--background)] p-3 text-[var(--ink)] md:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-40px)] max-w-[1500px] grid-rows-[auto_auto_1fr] border border-[var(--ink)] bg-white shadow-[8px_8px_0_#1a161c]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ink)] bg-[var(--bone)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center bg-[var(--ink)] text-white">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="display truncate text-xl font-semibold">
                Durable Agent Booth
              </div>
              <div className="mono mt-0.5 flex flex-wrap items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
                <span>real local Inngest</span>
                <span>mock LLM</span>
                <span>mock tools</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill phase={phase} sent={trigger?.sent} />
            <DashboardLink
              href={dashboardUrl}
              className="demo-segment-button mono inline-flex h-8 items-center justify-center gap-1.5 px-3 text-[11px] uppercase"
            >
              <ExternalLink className="size-3.5" />
              Open Inngest
            </DashboardLink>
            <DemoControls
              flags={flags}
              onFlagsChange={setFlags}
              onReset={resetDemo}
            />
          </div>
        </header>

        <div className="border-b border-[var(--ink)] p-3">
          <ActStepper activeAct={activeAct} onActChange={setActiveAct} />
        </div>

        <div className="grid min-h-0 overflow-hidden">
          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
            <IncidentHeader
              incident={activeIncident}
              incidentId={incidentId}
              isRunning={isRunning}
              onIncidentChange={setIncidentId}
              onRun={runInvestigation}
              onSeed={seedHistory}
              onReset={resetDemo}
              seeding={seeding}
              traceUrl={trigger?.traceUrl}
            />

            {activeAct === 1 ? (
              <ActOne
                activeTab={activeTab}
                incident={activeIncident}
                isRunning={isRunning}
                onTabChange={setActiveTab}
                result={result}
                snippets={snippets}
                trace={trace}
                trigger={trigger}
              />
            ) : null}
            {activeAct === 2 ? (
              <ActTwo
                activeTab={actTwoTab}
                incident={activeIncident}
                clientRunId={trigger?.clientRunId}
                history={history}
                liveSignal={liveSignal}
                outcomeScore={outcomeScore}
                onTabChange={setActTwoTab}
                onSignal={score}
                snippets={snippets}
              />
            ) : null}
            {activeAct === 3 ? (
              <ActThree
                activeTab={actThreeTab}
                onTabChange={setActThreeTab}
                snippets={snippets}
              />
            ) : null}
            {activeAct === 4 ? (
              <ActFour
                activeTab={actFourTab}
                onTabChange={setActFourTab}
                snippets={snippets}
              />
            ) : null}
          </section>
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 border border-[var(--ink)] bg-white px-4 py-3 shadow-[4px_4px_0_#1a161c]">
          <Check className="size-4 text-[var(--teal)]" />
          <span className="mono text-xs uppercase">{toast}</span>
        </div>
      ) : null}
    </main>
  );
}

function IncidentHeader({
  incident,
  incidentId,
  isRunning,
  onIncidentChange,
  onRun,
  onSeed,
  onReset,
  seeding,
  traceUrl,
}: {
  incident: Incident;
  incidentId: string;
  isRunning: boolean;
  onIncidentChange: (id: string) => void;
  onRun: () => void;
  onSeed: () => void;
  onReset: () => void;
  seeding: boolean;
  traceUrl?: string;
}) {
  return (
    <div className="grid gap-3 border-b border-[var(--ink)] bg-white p-4 lg:grid-cols-[minmax(200px,300px)_minmax(0,1fr)_auto]">
      <label className="grid min-w-0 content-start gap-1">
        <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
          bug report
        </span>
        <select
          value={incidentId}
          onChange={(event) => onIncidentChange(event.target.value)}
          className="h-8 min-w-0 truncate border border-[var(--ink)] bg-white px-2 text-xs outline-none focus:border-[var(--coral)]"
          disabled={isRunning}
        >
          {incidents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} | {item.title}
            </option>
          ))}
        </select>
      </label>
      <div className="min-w-0">
        <div className="display text-lg font-medium">{incident.title}</div>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted-copy)]">
          {incident.body}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Button
          className="h-10 bg-[var(--ink)] px-4 text-white hover:bg-[var(--coral)] hover:text-[var(--ink)]"
          onClick={onRun}
          disabled={isRunning}
        >
          <Play className="size-4" />
          Investigate
        </Button>
        <Button
          variant="outline"
          className="h-10 border-[var(--ink)]"
          onClick={onSeed}
          disabled={seeding || isRunning}
        >
          <History className="size-4" />
          {seeding ? "Seeding" : "Seed"}
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          className="border-[var(--ink)]"
          onClick={onReset}
          disabled={isRunning}
          aria-label="Reset demo"
          title="Reset demo"
        >
          <RotateCcw className="size-4" />
        </Button>
        {traceUrl ? (
          <DashboardLink
            href={traceUrl}
            className="demo-segment-button grid size-10 place-items-center"
            aria-label="Open trace in Inngest"
            title="Open trace in Inngest"
          >
            <ExternalLink className="size-4" />
          </DashboardLink>
        ) : null}
      </div>
    </div>
  );
}

function ActOne({
  activeTab,
  incident,
  isRunning,
  onTabChange,
  result,
  snippets,
  trace,
  trigger,
}: {
  activeTab: DemoTab;
  incident: Incident;
  isRunning: boolean;
  onTabChange: (tab: DemoTab) => void;
  result: RunStatusResponse["result"];
  snippets: IncidentDemoProps["snippets"];
  trace: TraceStep[];
  trigger: TriggerResponse | null;
}) {
  return (
    <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
      <div className="grid gap-3 border-b border-[var(--rule-soft)] bg-[var(--bone)] p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
            Act 1
          </div>
          <div className="display mt-1 text-2xl font-medium">
            Durable Agent with a real retry beat
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-copy)]">
            The agent reads the bug report, searches the repo, opens source
            files, hits one simulated 503, then continues into mocked Linear,
            Slack, code suggestion, and PR steps.
          </p>
        </div>
        <SubstrateCallout />
      </div>
      <div className="grid h-[52px] grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-[var(--ink)] bg-[var(--cloud)] px-4">
        <div
          className="grid w-fit gap-3"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(112px, 1fr))` }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              data-active={activeTab === tab.id ? "true" : undefined}
              className="demo-main-tab-button mono px-4 text-center text-[11px] uppercase"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="mono self-center text-[11px] uppercase text-[var(--muted-copy)]">
          {result ? `${result.iterations} loops` : isRunning ? "running" : "ready"}
        </div>
      </div>
      {activeTab === "rca" ? (
        <ResultsTable
          result={result}
          groundTruthFixFiles={incident.groundTruthFixFiles}
          isRunning={isRunning}
        />
      ) : null}
      {activeTab === "trace" ? (
        <TracePanel trace={trace} trigger={trigger} runId={trigger?.runId} />
      ) : null}
      {activeTab === "flow" ? (
        <DurableAgentMap trace={trace} result={result} />
      ) : null}
      {activeTab === "code" ? <CodeView snippets={snippets} activeId="act1" /> : null}
    </div>
  );
}

type FlowItem = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  action: string;
  durable: string;
  pseudo: string;
  tool?: string;
  final?: boolean;
};

const durableAgentFlow: FlowItem[] = [
  {
    id: "issue",
    icon: BrainCircuit,
    label: "Bug report",
    action: "The agent starts from the customer report, repo, owner hints, and impact.",
    durable: "Stored as the run input.",
    pseudo: "receive bug_report",
    tool: "read_issue_context",
  },
  {
    id: "plan",
    icon: Braces,
    label: "Plan next step",
    action: "The mocked model chooses one next action instead of doing everything at once.",
    durable: "Every model turn is a step.",
    pseudo: "ask model: what should happen next?",
  },
  {
    id: "search",
    icon: SearchCode,
    label: "Search repo",
    action: "The agent searches the codebase for symbols, errors, and likely fix sites.",
    durable: "Search output is memoized.",
    pseudo: "search_code(query)",
    tool: "search_code",
  },
  {
    id: "read",
    icon: FileCode,
    label: "Read files",
    action: "The agent opens source files and gathers evidence from the actual code.",
    durable: "A 503 here retries this step.",
    pseudo: "read_repo_file(path)",
    tool: "read_repo_file",
  },
  {
    id: "recover",
    icon: ShieldCheck,
    label: "Recover",
    action: "When the repo read fails once, Inngest replays prior steps from memory.",
    durable: "Only the failed step runs again.",
    pseudo: "if repo_read fails: retry from failed step",
  },
  {
    id: "ticket",
    icon: Ticket,
    label: "Track work",
    action: "The agent creates or updates the Linear ticket with evidence and owners.",
    durable: "Side effect has a stable key.",
    pseudo: "create_linear_ticket(evidence)",
    tool: "create_linear_ticket",
  },
  {
    id: "slack",
    icon: MessageSquare,
    label: "Update team",
    action: "The agent posts the impact, suspected files, and next action to Slack.",
    durable: "The Slack thread is idempotent.",
    pseudo: "send_slack_message(summary)",
    tool: "send_slack_message",
  },
  {
    id: "pr",
    icon: GitPullRequest,
    label: "Suggest fix",
    action: "The agent drafts the code-change plan and opens a PR when confidence is high.",
    durable: "PR creation is isolated.",
    pseudo: "suggest_code_change(); open_pull_request()",
    tool: "open_pull_request",
  },
  {
    id: "analysis",
    icon: Check,
    label: "Return analysis",
    action: "The booth gets cited files, the summary, and the localization score.",
    durable: "The result becomes scoreable.",
    pseudo: "return analysis + cited_files",
    final: true,
  },
];

function DurableAgentMap({
  result,
  trace,
}: {
  result: RunStatusResponse["result"];
  trace: TraceStep[];
}) {
  const statusFor = React.useCallback(
    (item: FlowItem): TraceStep["status"] | "waiting" => {
      if (item.final) return result ? "complete" : "waiting";
      if (!item.tool) return trace.length ? "complete" : "waiting";
      const match = trace.find((step) => step.tool === item.tool);
      return match?.status ?? "waiting";
    },
    [result, trace]
  );

  return (
    <div className="grid h-full min-h-0 overflow-auto bg-white p-5">
      <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="grid content-start gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
                durable agent map
              </div>
              <div className="display mt-1 text-2xl font-medium">
                What the agent does, step by step
              </div>
            </div>
            <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
              {result ? `${result.iterations} durable loops` : "ready to run"}
            </div>
          </div>

          <div className="grid gap-3">
            {durableAgentFlow.map((item, index) => {
              const Icon = item.icon;
              const status = statusFor(item);
              return (
                <div
                  key={item.id}
                  className="grid gap-2 md:grid-cols-[48px_minmax(0,1fr)_32px] md:items-stretch"
                >
                  <div className="grid size-12 place-items-center border border-[var(--ink)] bg-[var(--bone)]">
                    <Icon className="size-5" />
                  </div>
                  <div className="grid gap-2 border border-[var(--ink)] bg-white p-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mono text-[10px] uppercase text-[var(--muted-copy)]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="display text-lg font-medium">
                          {item.label}
                        </span>
                        <FlowStatus status={status} />
                      </div>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted-copy)]">
                        {item.action}
                      </p>
                    </div>
                    <div className="grid content-center gap-2 bg-[var(--cloud)] p-3">
                      <code className="mono break-words text-sm leading-6">
                        {item.pseudo}
                      </code>
                      <div className="mono text-[10px] uppercase text-[var(--muted-copy)]">
                        {item.durable}
                      </div>
                    </div>
                  </div>
                  <div className="hidden items-center justify-center md:flex">
                    {index < durableAgentFlow.length - 1 ? (
                      <ArrowRight className="size-4 text-[var(--muted-copy)]" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="grid content-start gap-4 border border-[var(--ink)] bg-[var(--bone)] p-5">
          <div>
            <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
              pseudo code
            </div>
            <div className="display mt-1 text-xl font-medium">
              Same story, fewer implementation details
            </div>
          </div>
          <pre className="mono whitespace-pre-wrap border border-[var(--ink)] bg-[#17131a] p-4 text-[13px] leading-7 text-[#f2eee8]">{`when a bug report arrives:
  remember the report as the run input
  repeat until the agent has enough evidence:
    choose the next useful action
    run that action as a durable step
    keep the result for replay

  if a repo read gets rate limited:
    retry only the failed read
    reuse every earlier result

  create the Linear ticket
  send the Slack update
  draft the code change
  open a PR when confidence is high
  return analysis, cited files, and score`}</pre>
          <div className="grid gap-3 text-sm leading-6 text-[var(--muted-copy)]">
            <p>
              The technical view is still the Code tab. This map is the same
              control flow without imports, types, or SDK details.
            </p>
            <p>
              The point is the durability boundary: model decisions, repo reads,
              ticketing, team updates, and PR creation are separate remembered
              steps.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FlowStatus({
  status,
}: {
  status: TraceStep["status"] | "waiting";
}) {
  const cls =
    status === "complete"
      ? "border-[var(--matcha)] bg-[var(--matcha)] text-white"
      : status === "failed"
        ? "border-[var(--coral)] bg-[var(--coral)] text-white"
        : status === "running"
          ? "border-[var(--ink)] bg-[var(--cloud)] text-[var(--ink)]"
          : "border-[var(--rule-soft)] bg-white text-[var(--muted-copy)]";

  return (
    <span
      className={`mono inline-flex h-5 items-center border px-1.5 text-[10px] uppercase ${cls}`}
    >
      {status}
    </span>
  );
}

function ActTwo({
  activeTab,
  clientRunId,
  history,
  incident,
  liveSignal,
  onSignal,
  onTabChange,
  outcomeScore,
  snippets,
}: {
  activeTab: ActTwoTab;
  clientRunId?: string;
  history: ScoreHistory | null;
  incident: Incident;
  liveSignal: "up" | "down" | null;
  onSignal: (signal: "up" | "down" | "saved" | "discarded") => void;
  onTabChange: (tab: ActTwoTab) => void;
  outcomeScore: number | null;
  snippets: IncidentDemoProps["snippets"];
}) {
  const scoreLabel =
    outcomeScore === null ? "waiting" : `${outcomeScore.toFixed(2)} score`;

  return (
    <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
      <ActIntro
        kicker="Act 2"
        title="Scoring and session on the same code issue"
        body="Fast feedback lands immediately, the localization score resolves after save, and the session thread keeps repeated investigations tied to the same bug report."
        callout={<SubstrateCallout variant="reinforce" />}
      />
      <WorkbenchTabs
        tabs={actTwoTabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        status={scoreLabel}
      />
      {activeTab === "scores" ? (
        <ScoresPanel
          incident={incident}
          clientRunId={clientRunId}
          liveSignal={liveSignal}
          outcomeScore={outcomeScore}
          history={history}
          onSignal={onSignal}
        />
      ) : null}
      {activeTab === "session" ? <SessionThreadPanel incident={incident} /> : null}
      {activeTab === "code" ? <CodeView snippets={snippets} activeId="act2" /> : null}
    </div>
  );
}

function ActThree({
  activeTab,
  onTabChange,
  snippets,
}: {
  activeTab: ActThreeTab;
  onTabChange: (tab: ActThreeTab) => void;
  snippets: IncidentDemoProps["snippets"];
}) {
  return (
    <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
      <ActIntro
        kicker="Act 3"
        title="Experiment over the same bug corpus"
        body="The bakeoff wraps Acts 1 and 2: run the same resolved code bugs through two models, grade them with the same scorer, and compare accuracy, latency, and cost."
        callout={<SubstrateCallout variant="reinforce" />}
      />
      <WorkbenchTabs
        tabs={actThreeTabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        status={seededExperiment.groupExperimentName}
      />
      {activeTab === "experiment" ? <ExperimentPanel /> : null}
      {activeTab === "results" ? <ExperimentResultsPanel /> : null}
      {activeTab === "code" ? <CodeView snippets={snippets} activeId="act3" /> : null}
    </div>
  );
}

function ActFour({
  activeTab,
  onTabChange,
  snippets,
}: {
  activeTab: ActFourTab;
  onTabChange: (tab: ActFourTab) => void;
  snippets: IncidentDemoProps["snippets"];
}) {
  return (
    <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
      <ActIntro
        kicker="Act 4"
        title="The eval layer is just code plus queryable runs"
        body="The scorer stays small, while Inngest keeps the durable record of model turns, tool calls, scores, sessions, experiments, and Insights."
      />
      <WorkbenchTabs
        tabs={actFourTabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        status="insights ready"
      />
      {activeTab === "overview" ? <VisionPanel /> : null}
      {activeTab === "scorer" ? <ScorerPanel /> : null}
      {activeTab === "insights" ? <InsightsPanel /> : null}
      {activeTab === "code" ? <CodeView snippets={snippets} activeId="act4" /> : null}
    </div>
  );
}

function ActIntro({
  body,
  callout,
  kicker,
  title,
}: {
  body: string;
  callout?: React.ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <div className="grid gap-3 border-b border-[var(--rule-soft)] bg-[var(--bone)] p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
          {kicker}
        </div>
        <div className="display mt-1 text-2xl font-medium">{title}</div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-copy)]">
          {body}
        </p>
      </div>
      {callout ?? null}
    </div>
  );
}

function WorkbenchTabs<T extends string>({
  activeTab,
  onTabChange,
  status,
  tabs,
}: {
  activeTab: T;
  onTabChange: (tab: T) => void;
  status: string;
  tabs: Array<{ id: T; label: string }>;
}) {
  return (
    <div className="grid h-[52px] grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-[var(--ink)] bg-[var(--cloud)] px-4">
      <div
        className="grid w-fit gap-3"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(132px, 1fr))` }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            data-active={activeTab === tab.id ? "true" : undefined}
            className="demo-main-tab-button mono px-4 text-center text-[11px] uppercase"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mono self-center text-[11px] uppercase text-[var(--muted-copy)]">
        {status}
      </div>
    </div>
  );
}

function SessionThreadPanel({ incident }: { incident: Incident }) {
  const session =
    seededSessions.find((item) => item.incidentId === incident.id) ??
    seededSessions[0];
  const sessionUrl = getDeepLink("session", {
    sessionId: session?.sessionId ?? `sess-${incident.id}`,
  });

  return (
    <div className="grid min-h-0 gap-5 overflow-auto bg-white p-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="border border-[var(--ink)] bg-[var(--bone)] p-5">
        <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
          session thread
        </div>
        <div className="display mt-2 text-3xl font-medium">
          {session?.sessionId ?? `sess-${incident.id}`}
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-copy)]">
          One bug report, multiple investigations. The same run ids carry the
          fast feedback, deferred scores, retries, and final outcome.
        </p>
        <DashboardLink
          href={sessionUrl}
          className="demo-segment-button mono mt-4 inline-flex h-9 items-center gap-2 px-3 text-[11px] uppercase"
        >
          <ExternalLink className="size-3.5" />
          Open session
        </DashboardLink>
      </section>
      <section className="grid content-start gap-3">
        {(session?.runs ?? []).map((run) => (
          <div
            key={run.runId}
            className="grid gap-3 border border-[var(--ink)] bg-white p-4 md:grid-cols-[160px_repeat(4,minmax(0,1fr))]"
          >
            <div>
              <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
                {run.status}
              </div>
              <div className="mono mt-1 text-xs">{run.runId}</div>
            </div>
            <SessionMetric label="attempt" value={String(run.attempt)} />
            <SessionMetric label="loops" value={String(run.iterations)} />
            <SessionMetric
              label="duration"
              value={`${Math.round(run.durationMs / 100) / 10}s`}
            />
            <SessionMetric label="score" value={run.outcomeScore.toFixed(2)} />
          </div>
        ))}
      </section>
    </div>
  );
}

function SessionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
        {label}
      </div>
      <div className="display mt-1 text-2xl font-medium tabnum">{value}</div>
    </div>
  );
}

function ExperimentResultsPanel() {
  const experimentUrl = getDeepLink("experiment", {
    experimentId: seededExperiment.experimentId,
  });

  return (
    <div className="grid min-h-0 gap-5 overflow-auto bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border border-[var(--ink)] bg-[var(--bone)] p-5">
        <div>
          <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
            experiment results
          </div>
          <div className="display mt-1 text-2xl font-medium">
            {seededExperiment.name}
          </div>
        </div>
        <DashboardLink
          href={experimentUrl}
          className="demo-segment-button mono inline-flex h-9 items-center gap-2 px-3 text-[11px] uppercase"
        >
          <ExternalLink className="size-3.5" />
          Open experiment
        </DashboardLink>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {seededExperiment.aggregates.map((aggregate) => (
          <div key={aggregate.model} className="border border-[var(--ink)] p-4">
            <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
              {aggregate.model}
            </div>
            <dl className="mt-4 grid gap-3 mono text-[11px] uppercase">
              <ResultMetric label="accuracy" value={aggregate.accuracy.toFixed(2)} />
              <ResultMetric
                label="latency"
                value={`${Math.round(aggregate.avgLatencyMs)}ms`}
              />
              <ResultMetric
                label="cost"
                value={`$${aggregate.avgCostUsd.toFixed(3)}`}
              />
            </dl>
          </div>
        ))}
      </div>
      <div className="min-h-0 overflow-auto border border-[var(--ink)]">
        <div className="grid min-w-[620px] grid-cols-[1fr_150px_120px_120px_120px] bg-[var(--ink)] px-3 py-2 mono text-[11px] uppercase text-white">
          <span>bug</span>
          <span>model</span>
          <span>score</span>
          <span>latency</span>
          <span>cost</span>
        </div>
        {seededExperiment.cells.map((cell) => (
          <div
            key={`${cell.incidentId}-${cell.model}`}
            className="grid min-w-[620px] grid-cols-[1fr_150px_120px_120px_120px] border-t border-[var(--rule-soft)] px-3 py-2 mono text-[11px]"
          >
            <span>{cell.incidentId}</span>
            <span>{cell.model}</span>
            <span className="tabnum">{cell.outcomeScore.toFixed(2)}</span>
            <span className="tabnum">{cell.latencyMs}ms</span>
            <span className="tabnum">${cell.costUsd.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--rule-soft)] pb-2">
      <dt>{label}</dt>
      <dd className="tabnum text-[var(--muted-copy)]">{value}</dd>
    </div>
  );
}

function ScorerPanel() {
  return (
    <div className="grid min-h-0 gap-5 overflow-auto bg-white p-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="border border-[var(--ink)] bg-[var(--bone)] p-5">
        <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
          scorer
        </div>
        <div className="display mt-2 text-3xl font-medium">return 0 to 1</div>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-copy)]">
          A scorer can be a diff check, an LLM judge, a regex, or this boring
          Jaccard function. The important bit is that it attaches to a run.
        </p>
      </section>
      <section className="min-h-0 overflow-auto bg-[#17131a] p-5 text-[#f2eee8]">
        <pre className="mono text-sm leading-7">{`export function localizationScore(cited: string[], truth: string[]) {
  const truthSet = new Set(truth);
  const intersection = cited.filter((file) => truthSet.has(file)).length;
  const union = new Set([...cited, ...truth]).size;

  return union === 0 ? 0 : Math.min(1, intersection / union);
}`}</pre>
      </section>
    </div>
  );
}

function InsightsPanel() {
  const insightsUrl = getDeepLink("insights");
  const envUrl = getDeepLink("envDashboard");

  return (
    <div className="grid min-h-0 gap-5 overflow-auto bg-white p-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="grid content-start gap-3">
        <DashboardLink
          href={envUrl}
          className="demo-segment-button mono inline-flex h-10 items-center justify-center gap-2 px-3 text-[11px] uppercase"
        >
          <ExternalLink className="size-3.5" />
          Env dashboard
        </DashboardLink>
        <DashboardLink
          href={insightsUrl}
          className="demo-segment-button mono inline-flex h-10 items-center justify-center gap-2 px-3 text-[11px] uppercase"
        >
          <ExternalLink className="size-3.5" />
          Open Insights
        </DashboardLink>
        <div className="border border-[var(--ink)] bg-[var(--bone)] p-4">
          <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
            query layer
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-copy)]">
            Runs, attempts, sessions, scores, and experiment rows all come from
            the same execution substrate.
          </p>
        </div>
      </section>
      <section className="min-h-0 overflow-auto border border-[var(--ink)] bg-[var(--bone)] p-5">
        <div className="mono mb-3 text-[11px] uppercase text-[var(--muted-copy)]">
          Insights query
        </div>
        <pre className="mono whitespace-pre-wrap text-sm leading-7">{`SELECT model, AVG(outcome_score) AS accuracy, AVG(latency_ms) AS latency
FROM scores
WHERE experiment_id = 'exp-localization-bakeoff'
GROUP BY model
ORDER BY accuracy DESC;`}</pre>
      </section>
    </div>
  );
}

async function fetchRunStatus(trigger: TriggerResponse, incidentId: string) {
  const url = new URL("/api/run-status", window.location.origin);
  url.searchParams.set("clientRunId", trigger.clientRunId);
  url.searchParams.set("incidentId", incidentId);
  if (trigger.inngestEventId) {
    // Carry the real event id so run-status can resolve the live run id even
    // if it lands on a different serverless instance (no shared store).
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

function StatusPill({
  phase,
  sent,
}: {
  phase: RunPhase;
  sent: boolean | undefined;
}) {
  const label =
    phase === "idle"
      ? "ready"
      : phase === "complete"
        ? "complete"
        : phase === "error"
          ? "error"
          : phase === "retrying"
            ? "retrying"
            : "running";

  return (
    <div className="mono inline-flex h-8 items-center gap-2 border border-[var(--ink)] bg-white px-3 text-[11px] uppercase">
      <span className={phase === "idle" ? "" : "live-dot"} />
      <span>{label}</span>
      <span className="text-[var(--muted-copy)]">
        {sent === undefined ? "" : sent ? "inngest" : "foreground"}
      </span>
    </div>
  );
}

function buildTraceSteps(
  incident: Incident,
  phase: RunPhase,
  hasResult: boolean
): TraceStep[] {
  if (phase === "idle") return [];

  const crashIndex = incident.toolPlan.findIndex((step) => {
    if (step.tool !== "read_repo_file") return false;
    return String(step.input.path ?? "").includes(incident.crashFile);
  });
  const steps: TraceStep[] = [];

  incident.toolPlan.forEach((planStep, index) => {
    const iteration = index + 1;
    const beforeCrash = crashIndex === -1 || index < crashIndex;
    const isCrash = index === crashIndex;
    const complete = hasResult || phase === "complete";
    const thinkingComplete =
      complete || phase === "retrying" || beforeCrash || index < 2;
    const toolStatus: TraceStep["status"] = complete
      ? "complete"
      : phase === "retrying" && isCrash
        ? "failed"
        : phase === "investigating" && index <= 1
          ? "complete"
          : phase === "sending"
            ? "queued"
            : beforeCrash
              ? "complete"
              : "queued";

    steps.push({
      id: modelStepName(planStep, iteration),
      label: modelStepLabel(planStep),
      detail: modelStepDetail(planStep),
      kind: "think",
      status: thinkingComplete ? "complete" : "queued",
      duration: thinkingComplete ? "450ms" : undefined,
    });
    steps.push({
      id: toolStepName(planStep, iteration),
      label: toolStepLabel(planStep),
      detail: toolStepDetail(planStep),
      kind: "tool",
      tool: planStep.tool,
      status: toolStatus,
      duration: toolStatus === "complete" ? "memoized" : undefined,
      retried: complete && isCrash,
    });
  });

  steps.push({
    id: modelStepName(undefined, incident.toolPlan.length + 1),
    label: modelStepLabel(undefined),
    detail: modelStepDetail(undefined),
    kind: "final",
    status: hasResult ? "complete" : "queued",
    duration: hasResult ? "done" : undefined,
  });

  return steps;
}
