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
import type { ResearchModel, ResearchStepId } from "@/content/research-demo";

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

// ── 6. research agent arrives → triggers the booth research workflow ───────
export type ResearchRunRequestedData = {
  researchRunId: string;
  topic: string;
  cadence:
    | "manual"
    | "score-heartbeat-cron"
    | "six-day-cron"
    | "six-month-cron"
    | "seeded";
  model: ResearchModel;
  failureStep?: ResearchStepId | "none";
  useSandbox?: boolean;
  latencyMs?: number;
  seededQualityScore?: number;
  seededFeedbackSignal?: ResearchFeedbackSignal;
  seededFeedbackAt?: string;
  requestedAt: string;
  source: "booth-demo";
};

// ── 7. research agent finished → score/session function attaches metrics ──
export type ResearchRunCompletedData = {
  researchRunId: string;
  parentRunId?: string;
  sessionId: string;
  topic: string;
  // Narrative model in mock mode, real OpenRouter model id when configured
  model: string;
  qualityScore: number;
  tokenCount: number;
  costUsd: number;
  sources: string[];
  findings: string[];
  completedAt: string;
  source: "booth-demo";
};

// ── 8. human/product signal → same score/session function records feedback ─
export type ResearchFeedbackRecordedData = {
  researchRunId: string;
  parentRunId?: string;
  sessionId: string;
  signal: ResearchFeedbackSignal;
  feedbackAt: string;
  source: "booth-demo";
};

export type ResearchFeedbackSignal = "useful" | "missed-context" | "saved";

export type ResearchExperimentCorpusRun = {
  researchRunId: string;
  parentRunId?: string;
  sessionId?: string;
  feedbackSignal?: ResearchFeedbackSignal;
  feedbackScore?: number;
  scoredAt?: string;
};

// ── 8b. delayed real-world outcome → deferred scorer attaches it later ────
/**
 * The outcome of a research brief as observed well after the run finished:
 * did the recommendation actually ship, or turn out wrong? This is the event
 * behind the "score it weeks later" beat. `daysLater` is narrative - it is how
 * far in the future the demo claims the observation landed - while
 * `observedAt` is the timestamp rendered next to the score.
 */
export type ResearchOutcomeRecordedData = {
  researchRunId: string;
  parentRunId?: string;
  sessionId: string;
  outcome: ResearchOutcome;
  daysLater: number;
  observedAt: string;
  source: "booth-demo";
};

export type ResearchOutcome = "shipped" | "wrong";

// ── 9. Act 3 model bakeoff → group.experiment over historic research runs ─
export type ResearchExperimentRequestedData = {
  experimentRunId: string;
  topic: string;
  corpusRunIds: string[];
  corpusRuns?: ResearchExperimentCorpusRun[];
  /** Groups the runs of one bakeoff click so results can be aggregated. */
  batchId?: string;
  requestedAt: string;
  source: "booth-demo";
};

export const researchRunRequested = eventType("research/run.requested", {
  schema: staticSchema<ResearchRunRequestedData>(),
});
export const researchRunCompleted = eventType("research/run.completed", {
  schema: staticSchema<ResearchRunCompletedData>(),
});
export const researchFeedbackRecorded = eventType(
  "research/feedback.recorded",
  {
    schema: staticSchema<ResearchFeedbackRecordedData>(),
  },
);
export const researchOutcomeRecorded = eventType(
  "research/outcome.recorded",
  {
    schema: staticSchema<ResearchOutcomeRecordedData>(),
  },
);
export const researchExperimentRequested = eventType(
  "research/experiment.requested",
  {
    schema: staticSchema<ResearchExperimentRequestedData>(),
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
