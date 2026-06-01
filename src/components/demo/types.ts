import type { HighlightedCodeSnippet } from "@/lib/highlight";
import type { MockUser } from "@/content/seed-data";

export type DemoTab = "result" | "trace" | "code" | "scores";

export type RunPhase =
  | "idle"
  | "sending"
  | "generating"
  | "retrying"
  | "querying"
  | "complete"
  | "error";

export type TraceStep = {
  id: string;
  label: string;
  detail: string;
  status: "queued" | "running" | "failed" | "complete";
  duration?: string;
};

export type TriggerResponse = {
  ok: boolean;
  sent: boolean;
  clientRunId: string;
  eventId: string;
  dashboardUrl: string;
  traceUrl: string;
  error?: string;
};

export type QueryConsoleProps = {
  snippets: HighlightedCodeSnippet[];
};

export type RunQueryResponse = {
  rows: MockUser[];
};
