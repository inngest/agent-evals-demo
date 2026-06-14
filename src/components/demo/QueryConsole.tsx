"use client";

import * as React from "react";
import {
  Bot,
  Check,
  Database,
  ExternalLink,
  History,
  PanelRight,
  Play,
  Save,
  Sparkles,
} from "lucide-react";
import { canonicalPrompt, canonicalSql } from "@/content/seed-data";
import { Button } from "@/components/ui/button";
import { DemoControls } from "@/components/demo/DemoControls";
import { ResultsTable } from "@/components/demo/ResultsTable";
import { CodeView } from "@/components/demo/CodeView";
import { ScoresPanel } from "@/components/demo/ScoresPanel";
import { TracePanel } from "@/components/demo/TracePanel";
import {
  type DemoTab,
  type QueryConsoleProps,
  type RunPhase,
  type RunQueryResponse,
  type TraceStep,
  type TriggerResponse,
} from "@/components/demo/types";
import { defaultDemoFlags, wait, type DemoFlags } from "@/lib/demo-flags";
import type { MockUser } from "@/content/seed-data";
import type { ScoreHistory } from "@/lib/scoring";

const tabs: Array<{ id: DemoTab; label: string }> = [
  { id: "result", label: "Result" },
  { id: "trace", label: "Trace" },
  { id: "scores", label: "Scores" },
  { id: "code", label: "Code" },
];
const canSeedFromBrowser = process.env.NODE_ENV !== "production";
const defaultDashboardUrl =
  process.env.NEXT_PUBLIC_INNGEST_RUNS_URL ??
  process.env.NEXT_PUBLIC_INNGEST_DASHBOARD_URL ??
  "http://localhost:8288";

type SeedHistoryResponse = {
  ok: boolean;
  runs: number;
  scoreSignals: number;
  durableScoreEvents: number;
  retryDemoRuns: number;
  happyPathRuns: number;
  savedScoreSignals: number;
  discardedScoreSignals: number;
  eventsSent: number;
  dashboardUrl: string;
  appUrl: string;
  registered: boolean;
  devServerUrls: string[];
};

type ScoreResponse = {
  score: { trend: number[]; score: number; label: string };
  history: ScoreHistory;
};

type ScoreHistoryResponse = {
  history: ScoreHistory;
};

export function QueryConsole({ snippets }: QueryConsoleProps) {
  const [prompt, setPrompt] = React.useState(canonicalPrompt);
  const [sql, setSql] = React.useState("");
  const [rows, setRows] = React.useState<MockUser[]>([]);
  const [activeTab, setActiveTab] = React.useState<DemoTab>("result");
  const [flags, setFlags] = React.useState<DemoFlags>(defaultDemoFlags);
  const [phase, setPhase] = React.useState<RunPhase>("idle");
  const [trigger, setTrigger] = React.useState<TriggerResponse | null>(null);
  const [toast, setToast] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);
  const [seededRuns, setSeededRuns] = React.useState(0);
  const [scoreHistory, setScoreHistory] = React.useState<ScoreHistory | null>(
    null
  );
  const [historyMessage, setHistoryMessage] = React.useState(
    canSeedFromBrowser
      ? "Creates real Inngest runs for the dashboard list."
      : "Cloud history uses the protected seed command."
  );

  const isRunning = ["sending", "generating", "retrying", "querying"].includes(
    phase
  );
  const dashboardUrl = trigger?.dashboardUrl ?? defaultDashboardUrl;
  const trace = React.useMemo(
    () => buildTraceSteps(phase, flags, sql.length > 0, rows.length > 0, saved),
    [flags, phase, rows.length, saved, sql.length]
  );

  const loadScoreHistory = React.useCallback(async () => {
    const response = await fetch("/api/score", { cache: "no-store" }).catch(
      () => null
    );

    if (!response?.ok) {
      return null;
    }

    const body = (await response.json()) as ScoreHistoryResponse;
    return body.history;
  }, []);

  const refreshScoreHistory = React.useCallback(async () => {
    const history = await loadScoreHistory();

    if (history) {
      setScoreHistory(history);
    }
  }, [loadScoreHistory]);

  React.useEffect(() => {
    let ignore = false;

    void loadScoreHistory().then((history) => {
      if (!ignore && history) {
        setScoreHistory(history);
      }
    });

    return () => {
      ignore = true;
    };
  }, [loadScoreHistory]);

  async function runAgent() {
    setRows([]);
    setSql("");
    setSaved(false);
    setToast("");
    setActiveTab("result");
    setPhase("sending");

    const triggerResponse = await postJson<TriggerResponse>("/api/trigger", {
      prompt,
      flags,
    });
    setTrigger(triggerResponse);

    setPhase("generating");

    await wait(600 + flags.latencyMs);

    if (flags.llmOffline && flags.failureCount > 0) {
      for (let attempt = 0; attempt < flags.failureCount; attempt += 1) {
        setPhase("retrying");
        await wait(750);
      }
    }

    setSql(canonicalSql);

    setPhase("querying");

    const queryResponse = await postJson<RunQueryResponse>("/api/run-query", {
      sql: canonicalSql,
    });
    setRows(queryResponse.rows);
    setPhase("complete");
  }

  async function runQueryOnly() {
    if (!sql) {
      setSql(canonicalSql);
    }
    setPhase("querying");
    const queryResponse = await postJson<RunQueryResponse>("/api/run-query", {
      sql: sql || canonicalSql,
    });
    setRows(queryResponse.rows);
    setPhase("complete");
  }

  async function saveQuery() {
    const runId = trigger?.clientRunId ?? crypto.randomUUID();
    const response = await postJson<ScoreResponse>("/api/score", {
      runId,
      signal: "saved",
    });
    setSaved(true);
    setScoreHistory(response.history);
    setActiveTab("scores");
    setToast(`scored ${response.score.score.toFixed(2)} ✓`);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function seedHistory() {
    setSeeding(true);
    setToast("");
    try {
      const response = await postJson<SeedHistoryResponse>("/api/demo/seed", {
        count: 14,
      });
      await refreshScoreHistory();
      setSeededRuns((current) => current + response.runs);
      if (response.registered) {
        setHistoryMessage(
          `${response.runs} runs: ${response.happyPathRuns} happy path, ${response.retryDemoRuns} retry demos, ${response.savedScoreSignals} saved, ${response.discardedScoreSignals} discarded.`
        );
        setToast(
          `${response.eventsSent + response.durableScoreEvents} dashboard events queued`
        );
      } else {
        const registeredPorts = response.devServerUrls
          .map((url) => new URL(url).port)
          .filter(Boolean)
          .join(", ");
        setHistoryMessage(
          `Events sent, but this dev server is polling ${
            registeredPorts || "another app"
          }. Start Inngest with ${response.appUrl}.`
        );
        setToast("events sent, dashboard app mismatch");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (
        message.includes("DEMO_SEED_TOKEN") ||
        message.includes("x-demo-seed-token")
      ) {
        setHistoryMessage(
          "Production seeding is locked. Use the runbook seed command with DEMO_SEED_TOKEN."
        );
        setToast("seed locked: runbook command");
      } else {
        setHistoryMessage(
          "Start the Inngest dev server with this app endpoint."
        );
        setToast("seed failed: start Inngest dev server");
      }
    } finally {
      setSeeding(false);
      window.setTimeout(() => setToast(""), 2600);
    }
  }

  async function resetDemo() {
    await fetch("/api/demo/reset", { method: "POST" }).catch(() => undefined);
    setPrompt(canonicalPrompt);
    setSql("");
    setRows([]);
    setActiveTab("result");
    setPhase("idle");
    setTrigger(null);
    setToast("");
    setSaved(false);
    setFlags(defaultDemoFlags);
    await refreshScoreHistory();
    setHistoryMessage(
      canSeedFromBrowser
        ? "Creates real Inngest runs for the dashboard list."
        : "Cloud history uses the protected seed command."
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] p-3 text-[var(--ink)] md:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-40px)] max-w-[1480px] grid-rows-[auto_1fr] border border-[var(--ink)] bg-white shadow-[8px_8px_0_#1a161c]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ink)] bg-[var(--bone)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center bg-[var(--ink)] text-white">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="display truncate text-xl font-semibold">
                Agent Evals Booth Demo
              </div>
              <div className="mono mt-0.5 flex flex-wrap items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
                <span>Insights AI</span>
                <span>Real Inngest function</span>
                <span>Mock LLM</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill phase={phase} sent={trigger?.sent} />
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="demo-segment-button mono inline-flex h-8 items-center justify-center gap-1.5 border border-[var(--ink)] bg-white px-3 text-[11px] uppercase"
            >
              <ExternalLink className="size-3.5" />
              Inngest
            </a>
            <DemoControls
              flags={flags}
              onFlagsChange={setFlags}
              onReset={resetDemo}
            />
          </div>
        </header>

        <div className="grid min-h-0 overflow-hidden xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="grid min-h-0 grid-rows-[auto_176px_auto_minmax(0,1fr)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-soft)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-[var(--coral)]" />
                <div>
                  <div className="display text-lg font-medium">
                    SQL query editor
                  </div>
                  <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
                    users + events
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[var(--ink)]"
                  onClick={runQueryOnly}
                  disabled={isRunning}
                >
                  <Play className="size-4" />
                  Run query
                </Button>
                <Button
                  size="sm"
                  className="bg-[var(--ink)] text-white hover:bg-[var(--coral)] hover:text-[var(--ink)]"
                  onClick={saveQuery}
                  disabled={!sql || isRunning}
                >
                  <Save className="size-4" />
                  Save
                </Button>
              </div>
            </div>

            <div className="relative min-h-0 overflow-auto bg-[#17131a] p-4">
              {sql ? (
                <pre className="mono min-h-full whitespace-pre-wrap text-[13px] leading-7 text-[#f2eee8]">
                  {sql}
                </pre>
              ) : (
                <div className="grid h-full min-h-0 place-items-center text-center text-[#f2eee8]">
                  <div>
                    <PanelRight className="mx-auto mb-3 size-8 text-[var(--coral-soft)]" />
                    <div className="display text-2xl font-medium">
                      Ask Insights AI for the query.
                    </div>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#b8b0ba]">
                      The editor fills with the canonical SQL once the agent
                      finishes.
                    </p>
                  </div>
                </div>
              )}
              {isRunning ? (
                <div className="absolute inset-x-0 bottom-0 h-1 load-bar bg-[#2b2430]" />
              ) : null}
            </div>

            <div className="border-t border-[var(--ink)] bg-[var(--bone)] p-3 xl:hidden">
              <AgentCard
                compact
                dashboardUrl={dashboardUrl}
                isRunning={isRunning}
                onPromptChange={setPrompt}
                onRunAgent={runAgent}
                onSeedHistory={seedHistory}
                phase={phase}
                prompt={prompt}
                saved={saved}
                historyMessage={historyMessage}
                canSeedFromBrowser={canSeedFromBrowser}
                seededRuns={seededRuns}
                seeding={seeding}
              />
            </div>

            <div className="grid min-h-0 grid-rows-[52px_minmax(0,1fr)] overflow-hidden border-t border-[var(--ink)]">
              <div className="grid h-[52px] grid-cols-[minmax(0,1fr)_auto] items-end gap-3 bg-[var(--cloud)] px-4">
                <div className="grid w-fit grid-cols-4 gap-3">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      data-active={activeTab === tab.id}
                      className="demo-main-tab-button mono px-4 text-center text-[11px] uppercase"
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="mono self-center text-[11px] uppercase text-[var(--muted-copy)]">
                  {rows.length > 0 ? `${rows.length} rows` : "ready"}
                </div>
              </div>

              {activeTab === "result" ? (
                <ResultsTable rows={rows} isRunning={isRunning} />
              ) : null}
              {activeTab === "trace" ? (
                <TracePanel trace={trace} trigger={trigger} />
              ) : null}
              {activeTab === "scores" ? (
                <ScoresPanel history={scoreHistory} saved={saved} />
              ) : null}
              {activeTab === "code" ? <CodeView snippets={snippets} /> : null}
            </div>
          </section>

          <aside className="hidden min-h-0 border-l border-[var(--ink)] bg-[var(--bone)] xl:grid xl:grid-rows-[auto_1fr_auto]">
            <div className="border-b border-[var(--ink)] p-4">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-[var(--coral)]" />
                <div>
                  <div className="display text-xl font-semibold">
                    Insights AI
                  </div>
                  <div className="mono text-[11px] uppercase text-[var(--muted-copy)]">
                    agent surface
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 overflow-auto p-4">
              <AgentCard
                dashboardUrl={dashboardUrl}
                isRunning={isRunning}
                onPromptChange={setPrompt}
                onRunAgent={runAgent}
                onSeedHistory={seedHistory}
                phase={phase}
                prompt={prompt}
                saved={saved}
                historyMessage={historyMessage}
                canSeedFromBrowser={canSeedFromBrowser}
                seededRuns={seededRuns}
                seeding={seeding}
              />
            </div>

            <div className="border-t border-[var(--ink)] bg-white p-4">
              <div className="mono flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
                <span className="live-dot" />
                Split-screen path
              </div>
              <p className="mt-2 text-sm leading-6">
                Keep this app on the left and the real Inngest dashboard on the
                right. Use seeded history before the walk-through when the runs
                list needs a crowd.
              </p>
            </div>
          </aside>
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

function AgentCard({
  compact,
  dashboardUrl,
  isRunning,
  onPromptChange,
  onRunAgent,
  onSeedHistory,
  phase,
  prompt,
  saved,
  historyMessage,
  canSeedFromBrowser,
  seededRuns,
  seeding,
}: {
  compact?: boolean;
  dashboardUrl: string;
  isRunning: boolean;
  onPromptChange: (prompt: string) => void;
  onRunAgent: () => void;
  onSeedHistory: () => void;
  phase: RunPhase;
  prompt: string;
  saved: boolean;
  historyMessage: string;
  canSeedFromBrowser: boolean;
  seededRuns: number;
  seeding: boolean;
}) {
  return (
    <div className="grid gap-4">
      <div className="border border-[var(--ink)] bg-white p-3">
        <div className="mono mb-2 text-[11px] uppercase text-[var(--muted-copy)]">
          Ask
        </div>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          className={`w-full resize-none border border-[var(--rule-soft)] bg-[var(--background)] p-3 text-sm leading-6 outline-none focus:border-[var(--coral)] ${
            compact ? "min-h-20" : "min-h-32"
          }`}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="demo-action-button"
            onClick={onRunAgent}
            disabled={isRunning}
          >
            <Sparkles className="demo-action-icon size-4" />
            {phase === "complete" ? "Run again" : "Ask agent"}
          </button>
          <button
            type="button"
            className="demo-action-button"
            onClick={() => onPromptChange(canonicalPrompt)}
            disabled={isRunning}
          >
            Use sample query
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        {[
          ["generate-sql", phaseLabel(phase, "generate")],
          ["run-query", phaseLabel(phase, "query")],
          ["score-on-save", saved ? "sent" : "waiting"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="mono flex items-center justify-between border-b border-[var(--rule-soft)] py-2 text-[11px] uppercase"
          >
            <span>{label}</span>
            <span className="text-[var(--muted-copy)]">{value}</span>
          </div>
        ))}
      </div>

      <div className="border border-[var(--ink)] bg-white p-3">
        <div className="mono mb-3 flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
          <History className="size-3.5" />
          Dashboard history
        </div>
        <div className="flex flex-wrap gap-2">
          {canSeedFromBrowser ? (
            <button
              type="button"
              className="demo-action-button"
              onClick={onSeedHistory}
              disabled={seeding || isRunning}
            >
              <History className="demo-action-icon size-4" />
              {seeding ? "Seeding" : "Seed 14 runs"}
            </button>
          ) : null}
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="demo-action-button"
          >
            <ExternalLink className="demo-action-icon size-4" />
            Open Inngest
          </a>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-copy)]">
          {historyMessage}
          {seededRuns > 0 ? ` ${seededRuns} demo runs sent this session.` : ""}
        </p>
      </div>
    </div>
  );
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: unknown;
    };
    const message =
      typeof body.error === "string"
        ? body.error
        : `Request failed: ${response.status}`;

    throw new Error(message);
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
          : "running";
  return (
    <div className="mono inline-flex h-8 items-center gap-2 border border-[var(--ink)] bg-white px-3 text-[11px] uppercase">
      <span className={phase === "idle" ? "" : "live-dot"} />
      <span>{label}</span>
      <span className="text-[var(--muted-copy)]">
        {sent === undefined ? "" : sent ? "inngest" : "mock foreground"}
      </span>
    </div>
  );
}

function phaseLabel(phase: RunPhase, step: "generate" | "query") {
  if (step === "generate") {
    if (["generating", "retrying"].includes(phase)) return "running";
    if (["querying", "complete"].includes(phase)) return "done";
    return "waiting";
  }

  if (phase === "querying") return "running";
  if (phase === "complete") return "done";
  return "waiting";
}

function buildTraceSteps(
  phase: RunPhase,
  flags: DemoFlags,
  hasSql: boolean,
  hasRows: boolean,
  saved: boolean
): TraceStep[] {
  const steps: TraceStep[] = [
    {
      id: "generate-sql",
      label: "generate-sql",
      detail: "Mock LLM call wrapped in step.run so failures are retried by Inngest.",
      status: traceStatus({
        queued: ["idle", "sending"],
        running: ["generating", "retrying"],
        complete: hasSql,
        phase,
      }),
      duration: hasSql ? "600ms" : undefined,
    },
  ];

  if (flags.llmOffline && flags.failureCount > 0) {
    steps.push({
      id: "retry-recovery",
      label: "retry recovery",
      detail: `${flags.failureCount} Opus unavailable attempt${
        flags.failureCount === 1 ? "" : "s"
      } before the durable run recovers.`,
      status:
        phase === "retrying" ? "failed" : hasSql || hasRows ? "complete" : "queued",
      duration: hasSql || hasRows ? "retried" : undefined,
    });
  }

  steps.push(
    {
      id: "run-query",
      label: "run-query",
      detail: "Static SaaS data lookup runs as a second durable step.",
      status: traceStatus({
        queued: ["idle", "sending", "generating", "retrying"],
        running: ["querying"],
        complete: hasRows,
        phase,
      }),
      duration: hasRows ? "100ms" : undefined,
    },
    {
      id: "score-query-signal",
      label: "score-query-signal",
      detail: "Saving the answer emits product behavior that becomes a score event.",
      status: saved ? "complete" : "queued",
      duration: saved ? "0.92" : undefined,
    }
  );

  return steps;
}

function traceStatus({
  queued,
  running,
  complete,
  phase,
}: {
  queued: RunPhase[];
  running: RunPhase[];
  complete: boolean;
  phase: RunPhase;
}): TraceStep["status"] {
  if (complete) {
    return "complete";
  }

  if (running.includes(phase)) {
    return "running";
  }

  if (queued.includes(phase)) {
    return "queued";
  }

  return "queued";
}
