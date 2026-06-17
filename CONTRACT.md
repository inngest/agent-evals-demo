# CONTRACT.md — Four-Act Incident-Triage Booth Demo

**Branch:** `feature/four-act-demo` · **Repo:** `~/inngest/evals-demo`

This is the binding interface contract for four parallel builders. Follow it literally.
Every type, event name, function signature, and file path below is locked. If you
need to change a shared shape, that is a cross-builder change — flag it, don't silently
drift.

---

## 0. What we're building (read once, then forget the SQL app)

A Next.js booth app that demos a **durable incident-triage agent** ("Gester's small
sibling") in **4 acts**. An Inngest-flavored incident arrives, the agent runs a
think/tool loop (`get_run`, `get_run_steps`, `search_code`, `read_repo_file`,
`get_recent_commits`), and posts a root-cause analysis (RCA). The RCA's cited files
are graded against the ground-truth fix files.

**What is real vs mocked:**
- **REAL:** the local Inngest dev server (`localhost:8288`) — runs, steps, retries, traces, memoization. The agent function genuinely executes through it.
- **MOCKED:** the LLM (canned deterministic RCA per incident) and the tools (staged per-incident responses). No Anthropic key, no cloud keys.
- **SEEDED/FAKED (local mode):** scores, sessions, experiments. Deep-links are config constants pointing at placeholder `localhost:8288` paths.
- **REAL in cloud mode (`DEMO_TARGET=cloud`):** scores and experiments are emitted as real Inngest eval primitives and land in the Inngest Cloud dashboard — run-level `step.score` (triage run), a `createScorer`/`defer` deferred outcome score (RCA saved), and a real `group.experiment` with per-variant `inngest.score`. **Sessions stay FAKED in both modes** (BLOCKED: the sessions primitive is not in the pinned `inngest@pr-1521` tag; it ships in pr-1547 / base 4.6.1. Owner: Jakob). See `INTEGRATION-PLAN.md` for the call sites and `README.md` "Cloud mode" for the operator flow.

**Cloud swap point:** the local/cloud decision is a single env flag, `DEMO_TARGET`, read only in `src/lib/demo-target.ts` (exports `DEMO_TARGET`, `isCloud`). Every real-primitive call site is wrapped `if (isCloud) { ...real... } else { ...faked... }`; the faked branch is byte-for-byte the local build. The client derives `isDev: !isCloud` so cloud/dev cannot drift — do not set `INNGEST_DEV` in cloud mode.

**The durability beat (Act 1):** on the first attempt, one tool call (`read_repo_file`
on the incident's designated crash file) throws a simulated 503. Inngest retries the
function; all prior `step.run` results return memoized; the failed tool re-executes and
succeeds; the agent finishes. This must be visible in the real trace.

**Positioning to keep visible (Lauren — the SHARED SUBSTRATE):** the score and
experiment data exist *because Inngest runs the agent*. A two-system setup
(Temporal+Braintrust, BullMQ+homegrown evals) can't cheaply capture it. Plant this in
Act 1 copy, reinforce in Act 3.

**Reuse rule:** we reskin the existing Insights-SQL app's component architecture and
Inngest v4 syntax. We do NOT invent Inngest primitives. Mirror
`src/inngest/client.ts` and `src/inngest/functions/write-query.ts` exactly:
`eventType(name, { schema: staticSchema<T>() })`, `inngest.createFunction({ id,
retries, triggers: [evt] }, handler)`, `evt.create(data, { id })`, `step.run(...)`,
`step.sendEvent(...)`.

---

## 1. Events + TypeScript data shapes (BACKEND owns `src/inngest/client.ts`)

All events declared in `src/inngest/client.ts` using the existing pattern. Replace the
three `app/query.*` events with the four below. Keep `DemoFlags` import. Keep the
`encryptionMiddleware` block and the `new Inngest({ id, middleware })` shape — change
the `id` to `"incident-triage-booth-demo"`.

```ts
// src/inngest/client.ts (BACKEND owns)
import { eventType, staticSchema, Inngest } from "inngest";
import type { DemoFlags } from "@/lib/demo-flags";

// ── 1. incident arrives → triggers the agent ──────────────────────────────
export type IncidentReceivedData = {
  incidentId: string;        // e.g. "EXE-1737" — must match an entry in incidents.ts
  title: string;
  body: string;
  flags: DemoFlags;
  clientRunId: string;       // UUID minted client-side, correlates UI ↔ run
  requestedAt: string;       // ISO
  source: "booth-demo";
};

// ── 2. agent emits its localization score (deferred outcome score) ─────────
export type RcaScoredData = {
  incidentId: string;
  clientRunId: string;
  citedFiles: string[];      // files the RCA cited
  groundTruthFixFiles: string[];
  score: number;             // 0..1 localization score
  scoredAt: string;          // ISO
  source: "booth-demo";
};

// ── 3. human up/down on the RCA (fast live score) ──────────────────────────
export type RcaFeedbackData = {
  incidentId: string;
  clientRunId: string;
  signal: "up" | "down";
  feedbackAt: string;        // ISO
  source: "booth-demo";
};

// ── 4. saved/discarded session signal (drives deferred scoring fn) ─────────
export type IncidentSavedData = {
  incidentId: string;
  clientRunId: string;
  signal: "saved" | "discarded";
  savedAt: string;           // ISO
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
```

### Agent function return shape (the triage function's resolved value)

```ts
// returned by the triage function; FRONTEND reads this via the run-status API
export type TriageResult = {
  incidentId: string;
  clientRunId: string;
  rca: string;               // the full markdown RCA text (mock-llm output)
  citedFiles: string[];      // parsed from the RCA / returned by mock-llm
  iterations: number;        // tool-loop count (target ~5–7 → ~12 trace steps)
  toolCalls: string[];       // tool names in call order, for trace display
  localizationScore: number; // 0..1 — same value emitted in rcaScored
};
```

---

## 2. Agent tool set + mock tool signatures (BACKEND)

Five tools. Mirror the ported agent's `TOOLS` array shape (Anthropic tool schema is the
reference, but since the LLM is mocked, BACKEND defines a **local tool type** — do NOT
import `@anthropic-ai/sdk`). Tool definitions and the mock executor live in
**`src/lib/mock-tools.ts`** (NEW, BACKEND owns).

```ts
// src/lib/mock-tools.ts (BACKEND owns) — NEW FILE
export type ToolName =
  | "get_run"
  | "get_run_steps"
  | "search_code"
  | "read_repo_file"
  | "get_recent_commits";

export type ToolDef = {
  name: ToolName;
  description: string;
  // JSON-schema-ish, for trace/code display only (LLM is mocked)
  inputSchema: Record<string, unknown>;
};

export const TOOLS: ToolDef[] = [ /* 5 defs, see below */ ];

// Per-incident staged responses live in the corpus (see §3, incidents.ts).
// The executor looks up the staged response for (incidentId, toolName, input).
// It throws a simulated 503 the FIRST time read_repo_file hits the incident's
// crashFile (module-scoped flag, reset on attempt 0 — mirror ported tools.ts).
export function executeTool(
  incidentId: string,
  name: ToolName,
  input: Record<string, unknown>,
  ctx: { attempt: number }
): string;            // returns the staged response string (tool_result content)

export function resetCrashState(): void;  // called when attempt === 0
```

**The 5 tools (descriptions are prescriptive; keep them Inngest-flavored):**

| Tool | Required input | Purpose |
|------|----------------|---------|
| `get_run` | `runId: string` | Fetch the failing run's metadata/status. First investigative step. |
| `get_run_steps` | `runId: string` | List the run's steps + which step errored. |
| `search_code` | `query: string`, `repos: string[]`, `fileGlob?: string` | Grep across local repo clones; returns file:line hits. |
| `read_repo_file` | `repo: string`, `path: string`, `lineStart?: number`, `lineEnd?: number` | Read a file range. **This is the crash tool** (503 on first read of the incident's `crashFile`). |
| `get_recent_commits` | `repo: string`, `path?: string`, `limit?: number` | Recent commits touching a path; surfaces the regression commit. |

**Crash semantics (locked):** identical to ported `lib/tools.ts`. Module-scoped
`hasCrashed` flag; `resetCrashState()` on `attempt === 0`; first `read_repo_file` whose
`path` includes the incident's `crashFile` throws
`new Error("...503 rate limited...")`; on retry the flag is set so it returns the
staged response. The flag must survive `step.run` retries within the worker process.

**Mock LLM (BACKEND owns `src/lib/mock-llm.ts`):** replace SQL generation with a
deterministic agent driver. Given `(incidentId, messages, attempt, flags)` it returns
the next assistant turn: either a list of `tool_use` blocks (following the incident's
`toolPlan` — an ordered list of `{ tool, input }`) or, once the plan is exhausted, a
final text RCA block. The RCA text and `citedFiles` come from the incident's `rca` and
`citedFiles` fields. Keep a `RetryAfterError` path gated by `flags.llmOffline` for an
optional LLM-failure variant, but the **default** durability beat is the tool 503.

```ts
// src/lib/mock-llm.ts (BACKEND owns)
import type { ToolName } from "@/lib/mock-tools";
export type LlmTurn =
  | { type: "tool_use"; calls: Array<{ id: string; name: ToolName; input: Record<string, unknown> }> }
  | { type: "final"; rca: string; citedFiles: string[] };
export function nextTurn(args: {
  incidentId: string;
  iteration: number;     // 1-based loop index
  attempt: number;
  flags: DemoFlags;
}): Promise<LlmTurn>;
```

---

## 3. Incident corpus schema + count (DATA owns `src/content/incidents.ts` — NEW)

**Target: 12 incidents.** All Inngest-flavored (EXE-#### style: retry/scheduling,
checkpoint, queue, flow-control, concurrency, idempotency, batching, throttle, debounce,
realtime, sleepUntil, step memoization). Port the EXE-1737 RetryAfterError/checkpoint
scenario from `~/inngest/inngest-agents/demo/lib/stubs.ts` as incident #1 (use its
stub strings verbatim as that incident's staged responses).

```ts
// src/content/incidents.ts (DATA owns) — NEW FILE
import type { ToolName } from "@/lib/mock-tools";

export type StagedToolResponse = {
  tool: ToolName;
  // match predicate: a substring that must appear in JSON.stringify(input).
  // executor picks the first staged response whose `match` matches, else a
  // generic "no results" string.
  match: string;
  response: string;     // the canned tool_result content
};

export type ToolPlanStep = {
  tool: ToolName;
  input: Record<string, unknown>;
};

export type Incident = {
  id: string;                    // "EXE-1737"
  title: string;                 // short headline
  body: string;                  // the report shown to the agent
  repo: string;                  // "inngest"
  runId: string;                 // synthetic failing-run id used by get_run/get_run_steps
  crashFile: string;             // path whose first read_repo_file 503s
  groundTruthFixFiles: string[]; // files the eventual fix touched (grading target)
  citedFiles: string[];          // files the mock RCA cites (graded vs ground truth)
  rca: string;                   // canned markdown RCA (mock-llm final output)
  toolPlan: ToolPlanStep[];      // ordered tool calls → ~5–7 → ~12 trace steps
  stagedToolResponses: StagedToolResponse[];
};

export const incidents: Incident[];           // length 12
export const defaultIncidentId = "EXE-1737";
export function getIncident(id: string): Incident | undefined;
```

**Localization score (BACKEND `src/lib/scoring.ts`):** Jaccard/overlap of `citedFiles`
vs `groundTruthFixFiles`:
`score = |cited ∩ truth| / |cited ∪ truth|`, clamped 0..1. Incident #1 is tuned to
score high (~0.8+, exact crash file cited); seed 1–2 incidents with deliberately partial
citations (~0.4) so the corpus shows a spread.

---

## 4. Seed-data schema (DATA owns `src/content/seed-data.ts`)

Replace SQL seed data. Keep file path. Provide three seeded datasets:

```ts
// src/content/seed-data.ts (DATA owns)

// ── scores: per-run, seeded for the "fast score" + outcome score history ──
export type SeededScore = {
  runId: string;
  incidentId: string;
  liveSignal: "up" | "down" | null;   // human fast score
  liveScore: number;                  // 1 | 0 | null→derived
  outcomeScore: number;               // 0..1 deferred localization score
  scoredAt: string;                   // ISO
};
export const seededScores: SeededScore[];

// ── sessions: one incident thread = multiple runs ─────────────────────────
export type SeededRun = {
  runId: string;
  attempt: number;
  status: "completed" | "failed" | "retried";
  iterations: number;
  outcomeScore: number;
  startedAt: string;
  durationMs: number;
};
export type SeededSession = {
  sessionId: string;          // e.g. "sess-EXE-1737"
  incidentId: string;
  title: string;
  runs: SeededRun[];          // 2–4 runs per session (retries / re-investigations)
  latestOutcomeScore: number;
};
export const seededSessions: SeededSession[];

// ── experiments: GPT-5.5 vs Claude on a resolved-incident corpus ──────────
export type ExperimentModel = "gpt-5.5" | "claude-opus-4.8";
export type ExperimentCell = {        // one model × one incident
  incidentId: string;
  model: ExperimentModel;
  outcomeScore: number;               // 0..1 localization score
  latencyMs: number;
  costUsd: number;
};
export type ExperimentAggregate = {
  model: ExperimentModel;
  accuracy: number;                   // mean outcomeScore across corpus
  avgLatencyMs: number;
  avgCostUsd: number;
};
export type SeededExperiment = {
  experimentId: string;               // "exp-localization-bakeoff"
  name: string;
  groupExperimentName: string;        // "group.experiment" label for trace deep-link
  corpusIncidentIds: string[];        // resolved incidents graded
  cells: ExperimentCell[];            // model × incident grid (2 models × N)
  aggregates: ExperimentAggregate[];  // one per model
};
export const seededExperiment: SeededExperiment;
```

**Slider behavior (FRONTEND, data from DATA):** Act 3 sliders weight
accuracy/latency/cost. Winner = `argmax(wAcc*accuracy − wLat*norm(latency) −
wCost*norm(cost))`. Seed the two models so the winner **flips** as sliders move (e.g.
Claude higher accuracy + higher cost/latency; GPT-5.5 cheaper/faster + lower accuracy).
FRONTEND computes the weighting; DATA supplies the cells/aggregates.

---

## 5. Deep-link config (CODEVIEW owns `src/lib/inngest-dashboard.ts`)

Replace current file with a typed per-act map. Placeholder `localhost:8288` values.
Single clearly-marked swap point for cloud.

```ts
// src/lib/inngest-dashboard.ts (CODEVIEW owns)

// ⬇⬇⬇ SWAP TO CLOUD URLS HERE ⬇⬇⬇
// For the booth on local: leave as-is. For a cloud recording, set
// NEXT_PUBLIC_INNGEST_DASHBOARD_BASE to https://app.inngest.com/env/<env>
// and the paths below resolve against it.
const DASHBOARD_BASE =
  process.env.NEXT_PUBLIC_INNGEST_DASHBOARD_BASE?.trim() || "http://localhost:8288";
// ⬆⬆⬆ SWAP TO CLOUD URLS HERE ⬆⬆⬆

export type DeepLinkKey =
  | "runTrace"        // Act 1: the rich agent trace
  | "scoresOnTrace"   // Act 2: scores attached to the trace
  | "session"         // Act 2: the incident thread (multi-run) view
  | "experiment"      // Act 3: group.experiment results page
  | "envDashboard"    // Act 4: env-level dashboard
  | "insights";       // Act 4: Insights query view

// Each entry is a function of optional ids so deep-links can target a specific
// run/session/experiment. Return absolute URLs.
export const deepLinks: Record<DeepLinkKey, (ids?: {
  runId?: string;
  sessionId?: string;
  experimentId?: string;
}) => string> = {
  runTrace:      (ids) => `${DASHBOARD_BASE}/runs/${ids?.runId ?? "demo-run"}`,
  scoresOnTrace: (ids) => `${DASHBOARD_BASE}/runs/${ids?.runId ?? "demo-run"}?tab=scores`,
  session:       (ids) => `${DASHBOARD_BASE}/sessions/${ids?.sessionId ?? "demo-session"}`,
  experiment:    (ids) => `${DASHBOARD_BASE}/experiments/${ids?.experimentId ?? "demo-experiment"}`,
  envDashboard:  () => `${DASHBOARD_BASE}/functions`,
  insights:      () => `${DASHBOARD_BASE}/insights`,
};

export function getDeepLink(key: DeepLinkKey, ids?: Parameters<typeof deepLinks[DeepLinkKey]>[0]) {
  return deepLinks[key](ids);
}
```

**Note for FRONTEND:** import `getDeepLink` for all "open in Inngest" buttons. Do not
hardcode URLs in components.

---

## 6. Component inventory mapped to the 4 acts (FRONTEND owns)

**Act navigation:** a top-level **segmented control / stepper** with 4 segments
(`Act 1 · Durable Agent`, `Act 2 · Scoring + Session`, `Act 3 · Experiment`,
`Act 4 · Vision`). State lives in a new `IncidentDemo` shell. Build as new component
`src/components/demo/ActStepper.tsx`. The shell (`src/app/page.tsx` → renders
`IncidentDemo`) owns current-act state and the active incident.

| Component | Action | Maps to Act | Notes |
|-----------|--------|-------------|-------|
| `QueryConsole.tsx` → rename concept to **`IncidentConsole.tsx`** | **RESKIN** (heavy) | shell + Act 1 | Replace prompt box with incident picker + "Investigate" trigger. Reuse layout, tab plumbing, run-state machine. Keep file name `QueryConsole.tsx` to avoid churn OR add `IncidentConsole.tsx` and delete `QueryConsole.tsx` — FRONTEND's call, but pick one. |
| `TracePanel.tsx` | **RESKIN** | Act 1 + 2 | Render ~12 agent steps (think-N + tool-N), show the retry/recover beat, attach score chips in Act 2. |
| `ResultsTable.tsx` | **RESKIN** → RCA + cited-files view | Act 1/2 | Was SQL rows; becomes the rendered RCA markdown + cited files list with ground-truth match badges. |
| `ScoresPanel.tsx` | **RESKIN** | Act 2 | Fast up/down control + deferred outcome score + score history; add **session view** (incident thread → multiple runs). |
| `CodeView.tsx` | **RESKIN** | all acts | Renders highlighted snippets per act from code-snippets.ts. |
| `DemoControls.tsx` | **RESKIN** | global | Flags: llmOffline toggle, failureCount, latency, reset. |
| `ActStepper.tsx` | **NEW** | global | 4-segment act navigation. |
| `ExperimentPanel.tsx` | **NEW** | Act 3 | Model × incident grid, accuracy/latency/cost sliders, winner flip, deep-link to experiment. |
| `VisionPanel.tsx` | **NEW** | Act 4 | Env dashboards mock, Insights query ("all powered by Insights"), "the scorer is just your fn returning 0–1" — light/fuzzy. |
| `SubstrateCallout.tsx` | **NEW** | Act 1 + 3 | The Lauren shared-substrate message component (reused in Act 1 and Act 3). |
| `src/components/ui/*` | **REUSE as-is** | all | badge, button, card, separator, sheet. Add new ui primitives here only if needed (e.g. `slider.tsx`, `tabs.tsx`) — FRONTEND owns. |

**Run-state machine (FRONTEND):** reuse the existing trigger → poll pattern. POST to
`/api/trigger` (incident), poll `/api/run-status` for the `TriageResult`, drive
`RunPhase`. Update `src/components/demo/types.ts` to the incident shapes (see below).

---

## 7. FILE-OWNERSHIP MAP (disjoint + exhaustive)

Every file assigned to exactly one builder. Builders only write files in their list.
NEW files are marked. Files not listed (lockfiles, `.gitignore`, `tsconfig.json`,
`package.json`, `next.config`, `brand.css`, `favicon.ico`, `globals.css`, `layout.tsx`,
`src/lib/utils.ts`, `src/lib/highlight.ts`, `src/lib/demo-ops-auth.ts`,
`src/lib/mock-query.ts`) are **frozen** — do not edit. If `package.json` needs a dep,
flag it to ARCHITECT; do not edit in parallel. `layout.tsx` and `globals.css` are FRONTEND-only IF a global style change is required — coordinate first.

### BACKEND
- `src/inngest/client.ts` (rewrite events + client id)
- `src/inngest/functions/triage-agent.ts` (NEW — the durable agent fn; **delete** `src/inngest/functions/write-query.ts`)
- `src/inngest/functions/score-incident.ts` (NEW — deferred outcome-scoring fn, triggered by `incidentSaved`, emits `rcaScored`)
- `src/inngest/functions/index.ts` (NEW — exports `functions = [triageAgent, scoreIncident]`) *(or keep the export array in `triage-agent.ts`; pick one and tell FRONTEND/route owner)*
- `src/lib/mock-llm.ts` (rewrite → agent driver)
- `src/lib/mock-tools.ts` (NEW — TOOLS + executeTool + crash state)
- `src/lib/scoring.ts` (rewrite → localization scorer + history)
- `src/lib/demo-flags.ts` (keep/extend DemoFlags if needed)

### DATA
- `src/content/seed-data.ts` (rewrite → scores/sessions/experiment seeds)
- `src/content/incidents.ts` (NEW — 12-incident corpus)
- `scripts/seed-demo.mjs` (rewrite → seed scores/sessions/experiment into the score-history store + any seed endpoints)

### FRONTEND
- `src/app/page.tsx` (render `IncidentDemo` shell)
- `src/app/api/trigger/route.ts` (rewrite → send `incidentReceived`)
- `src/app/api/run-status/route.ts` (NEW — poll a run, return `TriageResult`; **delete/repurpose** `src/app/api/run-query/route.ts`)
- `src/app/api/score/route.ts` (rewrite → send `rcaFeedback` and/or `incidentSaved`)
- `src/app/api/inngest/route.ts` (update import of `functions`)
- `src/app/api/demo/seed/route.ts`, `src/app/api/demo/reset/route.ts`, `src/app/api/demo/status/route.ts` (update to incident/score seeds)
- `src/components/demo/QueryConsole.tsx` (reskin → IncidentConsole)
- `src/components/demo/TracePanel.tsx`
- `src/components/demo/ResultsTable.tsx`
- `src/components/demo/ScoresPanel.tsx`
- `src/components/demo/CodeView.tsx`
- `src/components/demo/DemoControls.tsx`
- `src/components/demo/types.ts`
- `src/components/demo/ActStepper.tsx` (NEW)
- `src/components/demo/ExperimentPanel.tsx` (NEW)
- `src/components/demo/VisionPanel.tsx` (NEW)
- `src/components/demo/SubstrateCallout.tsx` (NEW)
- `src/components/demo/IncidentDemo.tsx` (NEW — shell)
- `src/components/ui/*` (add `slider.tsx` etc. here if needed)

### CODEVIEW
- `src/content/code-snippets.ts` (rewrite → 4 act snippets: durable agent, scoring/defer, experiment/group.experiment, vision/Insights — mirror real v4 syntax from `triage-agent.ts`)
- `src/lib/inngest-dashboard.ts` (rewrite → typed deep-link map, §5)

### Cross-builder coordination points (the only shared seams)
1. **`functions` export location** — BACKEND decides (`index.ts` vs `triage-agent.ts`); FRONTEND's `api/inngest/route.ts` imports it. BACKEND must tell FRONTEND the import path.
2. **`TriageResult` shape (§1)** — BACKEND produces it (fn return), FRONTEND consumes it (`run-status` route + panels). Locked here; don't change unilaterally.
3. **`Incident` / seed shapes (§3, §4)** — DATA produces, BACKEND + FRONTEND consume. Locked here.
4. **Event `.create()` payloads (§1)** — FRONTEND routes build them, BACKEND functions consume. Locked here.
5. **`DemoFlags`** — BACKEND owns the type; FRONTEND `DemoControls` writes it. If FRONTEND needs a new flag, BACKEND adds it.

---

## 8. Scope for today ("testable")
- App runs (`npm run dev` + `npx inngest-cli@latest dev`).
- Agent executes through the **real local** Inngest dev server; trace shows ~12 steps + the retry/recover beat.
- All 4 acts navigate via the stepper.
- Scores + experiments are seeded/faked.
- Deep-links are config constants (placeholder localhost OK).
- No cloud keys, no Anthropic key.
