import type { HighlightedCodeSnippet } from "@/lib/highlight";
import type { DemoFlags } from "@/lib/demo-flags";

// ── Act navigation ──────────────────────────────────────────────────────────
export type ActId = 1 | 2 | 3 | 4;

export type ActMeta = {
  id: ActId;
  kicker: string; // "Act 1"
  label: string; // "Durable Agent"
};

// ── Main console tabs (Act 1/2 work surface) ────────────────────────────────
export type DemoTab = "rca" | "trace" | "scores" | "code";

// ── Run-state machine ───────────────────────────────────────────────────────
export type RunPhase =
  | "idle"
  | "sending" // event dispatched, waiting for run to register
  | "investigating" // tool loop running
  | "retrying" // the 503 / retry-recover beat
  | "complete"
  | "error";

// Visual trace step rendered in TracePanel (mirrors the real Inngest steps).
export type TraceStep = {
  id: string;
  label: string; // e.g. "think-1", "tool: get_run"
  detail: string;
  kind: "think" | "tool" | "score" | "final";
  tool?: string; // tool name when kind === "tool"
  status: "queued" | "running" | "failed" | "complete";
  duration?: string;
  retried?: boolean; // marks the step that 503'd then recovered
};

// ── /api/trigger response ───────────────────────────────────────────────────
export type TriggerResponse = {
  ok: boolean;
  sent: boolean;
  incidentId: string;
  clientRunId: string;
  eventId: string;
  dashboardUrl: string;
  traceUrl: string;
  runId?: string;
  error?: string;
};

// ── Agent function resolved value (CONTRACT §1 — BACKEND produces) ──────────
export type TriageResult = {
  incidentId: string;
  clientRunId: string;
  rca: string; // full markdown RCA text
  citedFiles: string[];
  iterations: number;
  toolCalls: string[]; // tool names in call order
  localizationScore: number; // 0..1
};

// ── /api/run-status response ────────────────────────────────────────────────
export type RunStatusResponse = {
  ok: boolean;
  status: "queued" | "running" | "completed" | "failed";
  attempt: number;
  hadRetry: boolean;
  runId?: string;
  traceUrl: string;
  result: TriageResult | null;
  error?: string;
};

// ── /api/score response ─────────────────────────────────────────────────────
export type ScoreActionResponse = {
  ok: boolean;
  signal: "up" | "down" | "saved" | "discarded";
  liveScore: number | null; // 1 | 0 for up/down
  outcomeScore: number | null; // 0..1 localization score (deferred)
};

export type IncidentDemoProps = {
  snippets: HighlightedCodeSnippet[];
};

// Re-export for component prop convenience.
export type { DemoFlags };
