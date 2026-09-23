import "@inngest/otel/node";
import { encryptionMiddleware } from "@inngest/middleware-encryption";
import { Inngest, eventType, staticSchema } from "inngest";
import {
  metadataMiddleware,
  scoreMiddleware,
  extendedTracesMiddleware,
  sandboxMiddleware,
} from "inngest/experimental";
import { isCloud } from "@/lib/demo-target";
import { stepTrackerMiddleware } from "@/inngest/middlewares/step-tracker";
import type { DemoFlags } from "@/lib/demo-flags";
import type {
  SupportModel,
  SupportStepId,
  SupportTicketId,
} from "@/content/support-demo";

// ── 1. incident arrives → triggers the agent ──────────────────────────────
export type IncidentReceivedData = {
  incidentId: string; // e.g. "EXE-1737"; must match an entry in incidents.ts
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

// ── 5. Act 3 experiment bake-off request (drives group.experiment) ─────────
export type ExperimentRequestedData = {
  incidentId: string; // corpus incident the bake-off runs over
  clientRunId?: string; // optional UI correlation id
  source: "booth-demo";
};

export const experimentRequested = eventType("agent/experiment.requested", {
  schema: staticSchema<ExperimentRequestedData>(),
});

// ── 6. support ticket arrives → triggers the booth support agent ──────────
export type SupportTicketReceivedData = {
  supportRunId: string;
  ticketId: SupportTicketId;
  model: SupportModel;
  failureStep?: SupportStepId | "none";
  requestedAt: string;
  source: "booth-demo";
};

// ── 7. support agent finished → scorer attaches run-level metrics ─────────
export type SupportRunCompletedData = {
  supportRunId: string;
  parentRunId?: string;
  sessionId: string;
  ticketId: SupportTicketId;
  // Narrative model in mock mode, real OpenRouter model id when configured
  model: string;
  qualityScore: number;
  tokenCount: number;
  costUsd: number;
  completedAt: string;
  source: "booth-demo";
};

// ── 8. visitor's thumbs up/down → same scorer records human feedback ──────
export type SupportFeedbackSignal = "good" | "bad";

export type SupportFeedbackRecordedData = {
  supportRunId: string;
  parentRunId?: string;
  sessionId: string;
  signal: SupportFeedbackSignal;
  feedbackAt: string;
  source: "booth-demo";
};

// ── 9. model split test → group.experiment over the preset tickets ────────
export type SupportExperimentRequestedData = {
  experimentRunId: string;
  ticketId: SupportTicketId;
  /** Groups the runs of one split-test click so results can be aggregated. */
  batchId: string;
  requestedAt: string;
  source: "booth-demo";
};

export const supportTicketReceived = eventType("support/ticket.received", {
  schema: staticSchema<SupportTicketReceivedData>(),
});
export const supportRunCompleted = eventType("support/run.completed", {
  schema: staticSchema<SupportRunCompletedData>(),
});
export const supportFeedbackRecorded = eventType("support/feedback.recorded", {
  schema: staticSchema<SupportFeedbackRecordedData>(),
});
export const supportExperimentRequested = eventType(
  "support/experiment.requested",
  {
    schema: staticSchema<SupportExperimentRequestedData>(),
  },
);

// ── 10. flow-control website capture demo ─────────────────────────────────
export type FlowControlDemoRequestedData = {
  requestId: string;
  requestNumber?: number;
  batchId: string;
  accountId: string;
  accountName?: string;
  workMs?: number;
  failureMode?: "none" | "retry" | "fail";
  requestedAt: string;
  source: "booth-demo";
};

export const flowControlDemoRequested = eventType(
  "demo/flow-control.requested",
  {
    schema: staticSchema<FlowControlDemoRequestedData>(),
  },
);

// scoreMiddleware() is REQUIRED for ctx.step.score to exist. metadataMiddleware()
// enables ctx.step.metadata for Cloud run metadata that Insights can group by.
// Both are safe to register in BOTH modes: the local (faked) path simply never
// calls the Cloud-only score/metadata branches. Registering them
// unconditionally keeps the client shape identical across modes and avoids type
// drift.
//
// TYPING NOTE: ctx.step.score only surfaces when the client's `middleware`
// TYPE is a tuple whose FIRST element is the literal `scoreMiddleware()` return
// type — the SDK's ApplyAllMiddlewareCtxExtensions<TMw> only fires for
// `[Middleware.Class, ...Middleware.Class[]]`, never for a widened
// `Middleware.Class[]`. The `Inngest<const TClientOpts ...>` constructor
// captures the options object's literal types, so the array must be written as
// an INLINE literal whose first element is statically `scoreMiddleware()`.
//   - A ternary (`key ? [score, enc] : [score]`) widens to a union of tuples
//     and the extension is LOST.
//   - A conditional SPREAD *after* a fixed first element keeps the head literal:
//     the variadic tail degrades to `Middleware.Class[]`, which still satisfies
//     the `[Middleware.Class, ...Middleware.Class[]]` shape. That's the form
//     used below.
const encryptionKey = process.env.INNGEST_ENCRYPTION_KEY;

export const inngest = new Inngest({
  // Wire key for the app in Inngest Cloud. Predates the support-agent scenario;
  // renaming it would register a new app and orphan the run history.
  id: "aie-research-agent-booth-demo",
  // cloud ⇒ isDev:false ⇒ the SDK reads INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY
  // from env and talks to Inngest Cloud. local ⇒ isDev:true ⇒ dev server.
  // Derived from the single DEMO_TARGET flag so cloud/dev can't drift. Do NOT
  // also set INNGEST_DEV in cloud mode — let isDev drive it.
  isDev: !isCloud,
  middleware: [
    extendedTracesMiddleware({ behaviour: "extendProvider" }),
    scoreMiddleware(),
    metadataMiddleware(),
    // Enables the durable step.sandbox surface (Sandboxes beta). Safe in
    // both modes: the local (faked) path never calls the Cloud-only
    // sandbox branches.
    sandboxMiddleware(),
    // Records real step executions for the demo's live step timeline.
    // Purely observational; see src/inngest/middlewares/step-tracker.ts.
    stepTrackerMiddleware(),
    ...(encryptionKey ? [encryptionMiddleware({ key: encryptionKey })] : []),
  ],
});
