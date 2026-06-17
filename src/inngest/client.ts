import { encryptionMiddleware } from "@inngest/middleware-encryption";
import { Inngest, eventType, staticSchema } from "inngest";
import type { DemoFlags } from "@/lib/demo-flags";

// ── 1. incident arrives → triggers the agent ──────────────────────────────
export type IncidentReceivedData = {
  incidentId: string; // e.g. "EXE-1737" — must match an entry in incidents.ts
  title: string;
  body: string;
  flags: DemoFlags;
  clientRunId: string; // UUID minted client-side, correlates UI ↔ run
  requestedAt: string; // ISO
  source: "booth-demo";
};

// ── 2. agent emits its localization score (deferred outcome score) ─────────
export type RcaScoredData = {
  incidentId: string;
  clientRunId: string;
  citedFiles: string[]; // files the RCA cited
  groundTruthFixFiles: string[];
  score: number; // 0..1 localization score
  scoredAt: string; // ISO
  source: "booth-demo";
};

// ── 3. human up/down on the RCA (fast live score) ──────────────────────────
export type RcaFeedbackData = {
  incidentId: string;
  clientRunId: string;
  signal: "up" | "down";
  feedbackAt: string; // ISO
  source: "booth-demo";
};

// ── 4. saved/discarded session signal (drives deferred scoring fn) ─────────
export type IncidentSavedData = {
  incidentId: string;
  clientRunId: string;
  signal: "saved" | "discarded";
  savedAt: string; // ISO
  source: "booth-demo";
};

export const incidentReceived = eventType("agent/incident.received", {
  schema: staticSchema<IncidentReceivedData>(),
});
export const rcaScored = eventType("agent/rca.scored", {
  schema: staticSchema<RcaScoredData>(),
});
export const rcaFeedback = eventType("agent/rca.feedback", {
  schema: staticSchema<RcaFeedbackData>(),
});
export const incidentSaved = eventType("agent/incident.saved", {
  schema: staticSchema<IncidentSavedData>(),
});

const middleware = process.env.INNGEST_ENCRYPTION_KEY
  ? [encryptionMiddleware({ key: process.env.INNGEST_ENCRYPTION_KEY })]
  : [];

export const inngest = new Inngest({
  id: "incident-triage-booth-demo",
  middleware,
});
