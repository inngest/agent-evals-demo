"use client";

import * as React from "react";
import {
  Bot,
  Check,
  Database,
  PanelRight,
  Play,
  Save,
  Sparkles,
} from "lucide-react";
import { canonicalPrompt, canonicalSql, seededScoreTrend } from "@/content/seed-data";
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

const tabs: Array<{ id: DemoTab; label: string }> = [
  { id: "result", label: "Result" },
  { id: "trace", label: "Trace" },
  { id: "code", label: "Code" },
  { id: "scores", label: "Scores" },
];

export function QueryConsole({ snippets }: QueryConsoleProps) {
  const [prompt, setPrompt] = React.useState(canonicalPrompt);
  const [sql, setSql] = React.useState("");
  const [rows, setRows] = React.useState<MockUser[]>([]);
  const [activeTab, setActiveTab] = React.useState<DemoTab>("result");
  const [flags, setFlags] = React.useState<DemoFlags>(defaultDemoFlags);
  const [phase, setPhase] = React.useState<RunPhase>("idle");
  const [trace, setTrace] = React.useState<TraceStep[]>(initialTrace);
  const [trigger, setTrigger] = React.useState<TriggerResponse | null>(null);
  const [toast, setToast] = React.useState("");
  const [trend, setTrend] = React.useState(seededScoreTrend);
  const [saved, setSaved] = React.useState(false);

  const isRunning = ["sending", "generating", "retrying", "querying"].includes(
    phase
  );

  async function runAgent() {
    setRows([]);
    setSql("");
    setSaved(false);
    setToast("");
    setActiveTab("result");
    setPhase("sending");
    setTrace([
      {
        id: "event",
        label: "app/query.requested",
        detail: "Event accepted by the demo trigger route.",
        status: "running",
      },
      {
        id: "generate",
        label: "generate-sql",
        detail: "Waiting on the mocked model.",
        status: "queued",
      },
      {
        id: "run",
        label: "run-query",
        detail: "Static rows are ready once SQL exists.",
        status: "queued",
      },
    ]);

    const triggerResponse = await postJson<TriggerResponse>("/api/trigger", {
      prompt,
      flags,
    });
    setTrigger(triggerResponse);
    setTrace((current) =>
      current.map((step) =>
        step.id === "event"
          ? {
              ...step,
              detail: triggerResponse.sent
                ? "Event sent to Inngest. The dashboard has the real run."
                : "Foreground demo continues. Inngest dev server is not connected.",
              status: "complete",
              duration: "0.04s",
            }
          : step
      )
    );

    setPhase("generating");
    setTrace((current) =>
      current.map((step) =>
        step.id === "generate"
          ? { ...step, detail: "Mock LLM is generating SQL.", status: "running" }
          : step
      )
    );

    await wait(600 + flags.latencyMs);

    if (flags.llmOffline && flags.failureCount > 0) {
      for (let attempt = 0; attempt < flags.failureCount; attempt += 1) {
        setPhase("retrying");
        setTrace((current) =>
          current.map((step) =>
            step.id === "generate"
              ? {
                  ...step,
                  detail: `Opus unavailable: 503. Retry ${attempt + 1} of ${
                    flags.failureCount
                  } is visible in Inngest.`,
                  status: "failed",
                  duration: `${((attempt + 1) * 0.75).toFixed(2)}s`,
                }
              : step
          )
        );
        await wait(750);
        setTrace((current) =>
          current.map((step) =>
            step.id === "generate"
              ? {
                  ...step,
                  detail: "Retry scheduled. The function resumes from the same event.",
                  status: "running",
                }
              : step
          )
        );
      }
    }

    setSql(canonicalSql);
    setTrace((current) =>
      current.map((step) =>
        step.id === "generate"
          ? {
              ...step,
              detail: "Canonical SQL returned by the mock LLM.",
              status: "complete",
              duration: `${((700 + flags.latencyMs) / 1000).toFixed(2)}s`,
            }
          : step
      )
    );

    setPhase("querying");
    setTrace((current) =>
      current.map((step) =>
        step.id === "run"
          ? {
              ...step,
              detail: "Mock endpoint is returning deterministic SaaS users.",
              status: "running",
            }
          : step
      )
    );

    const queryResponse = await postJson<RunQueryResponse>("/api/run-query", {
      sql: canonicalSql,
    });
    setRows(queryResponse.rows);
    setTrace((current) =>
      current.map((step) =>
        step.id === "run"
          ? {
              ...step,
              detail: `${queryResponse.rows.length} users returned.`,
              status: "complete",
              duration: "0.10s",
            }
          : step
      )
    );
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
    const response = await postJson<{
      score: { trend: number[]; score: number; label: string };
    }>("/api/score", {
      runId,
      signal: "saved",
    });
    setTrend(response.score.trend);
    setSaved(true);
    setToast(`scored ${response.score.score.toFixed(2)} ✓`);
    setActiveTab("scores");
    window.setTimeout(() => setToast(""), 2200);
  }

  async function resetDemo() {
    await fetch("/api/demo/reset", { method: "POST" }).catch(() => undefined);
    setPrompt(canonicalPrompt);
    setSql("");
    setRows([]);
    setActiveTab("result");
    setPhase("idle");
    setTrace(initialTrace);
    setTrigger(null);
    setToast("");
    setTrend(seededScoreTrend);
    setSaved(false);
    setFlags(defaultDemoFlags);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] p-3 text-[var(--ink)] md:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-40px)] max-w-[1560px] grid-rows-[auto_1fr] border border-[var(--ink)] bg-white shadow-[8px_8px_0_#1a161c]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ink)] bg-[var(--bone)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center bg-[var(--ink)] text-white">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="display text-xl font-semibold">
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
            <DemoControls
              flags={flags}
              onFlagsChange={setFlags}
              onReset={resetDemo}
            />
          </div>
        </header>

        <div className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-1">
          <section className="grid min-h-0 grid-rows-[auto_188px_minmax(0,1fr)]">
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
              {activeTab === "code" ? <CodeView snippets={snippets} /> : null}
              {activeTab === "scores" ? (
                <ScoresPanel trend={trend} saved={saved} />
              ) : null}
            </div>
          </section>

          <aside className="grid border-t border-[var(--ink)] bg-[var(--bone)] xl:border-l xl:border-t-0">
            <div className="grid grid-rows-[auto_1fr_auto]">
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

              <div className="grid content-start gap-4 p-4">
                <div className="border border-[var(--ink)] bg-white p-3">
                  <div className="mono mb-2 text-[11px] uppercase text-[var(--muted-copy)]">
                    Ask
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    className="min-h-32 w-full resize-none border border-[var(--rule-soft)] bg-[var(--background)] p-3 text-sm leading-6 outline-none focus:border-[var(--coral)]"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="demo-action-button"
                      onClick={runAgent}
                      disabled={isRunning}
                    >
                      <Sparkles className="demo-action-icon size-4" />
                      Ask agent
                    </button>
                    <button
                      type="button"
                      className="demo-action-button"
                      onClick={() => setPrompt(canonicalPrompt)}
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
                    ["score-on-save", saved ? "scored" : "waiting"],
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
              </div>

              <div className="border-t border-[var(--ink)] bg-white p-4">
                <div className="mono flex items-center gap-2 text-[11px] uppercase text-[var(--muted-copy)]">
                  <span className="live-dot" />
                  Booth path
                </div>
                <p className="mt-2 text-sm leading-6">
                  Durable run, visible trace, save signal, score panel.
                </p>
              </div>
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

const initialTrace: TraceStep[] = [
  {
    id: "event",
    label: "app/query.requested",
    detail: "No event sent yet.",
    status: "queued",
  },
  {
    id: "generate",
    label: "generate-sql",
    detail: "Mock LLM returns one canonical SQL query.",
    status: "queued",
  },
  {
    id: "run",
    label: "run-query",
    detail: "Mock endpoint returns static users.",
    status: "queued",
  },
];

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
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
