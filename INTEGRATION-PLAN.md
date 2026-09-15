# INTEGRATION-PLAN.md — Real Inngest Eval Primitives (Cloud) + Faked Path (Local)

> **Historical.** Written when the third loop stage was called *Evaluate*;
> it is now **A/B Test**. Inngest SDK names in this file (createScorer,
> step.score, group.experiment, defer) are unchanged and still correct.

**Repo:** `~/inngest/evals-demo` · **Branch:** `feature/four-act-demo`
**Goal:** Emit the REAL Inngest eval primitives (run-level `step.score` / `inngest.score`, `createScorer`/`createDefer` deferred outcome scorer, `group.experiment`) so scores + experiments show up in the Inngest CLOUD dashboard — WITHOUT breaking the existing faked/seeded/offline booth path.

**Ground truth verified from prerelease type defs** at `/tmp/inngest-probe/inngest-4.4.1-pr-1521.15/package` (npm `inngest@4.4.1-pr-1521.15`, install target `inngest@pr-1521`). The app currently pins `inngest@^4.5.0` which has NONE of these primitives.

Verified signatures (verbatim from the `.d.ts` files):

```ts
// components/InngestScore.d.ts
type ScoreValue = number | boolean;
type ScoreOptions = { runId?: string; stepId?: string; name: string; value: ScoreValue };
type ScoreStepTool = (memoizationId: string, options: ScoreOptions) => Promise<void>;
declare const scoreMiddleware: () => /* middleware class; enables step.score */;

// components/Inngest.d.ts  → client method
score(options: ScoreOptions): Promise<void>;          // inngest.score(...) live write

// InngestStepTools.d.ts    → step extension (only present when scoreMiddleware registered)
ctx.step.score: ScoreStepTool;                        // step.score(memoizationId, options) → Promise<void>

// components/ScoreFunction.d.ts
declare function createScorer<TClient, TSchema, TFnMiddleware>(
  client, options: CreateDeferInput, handler: (ctx: DeferContext) => ScorerResult | Promise<ScorerResult>
): DeferredFunction<TSchema>;
type ScorerResult = (Omit<ScoreOptions,"runId"> & { runId?: string }) | null | undefined; // { name, value, stepId? , runId? } | nullish no-op

// components/DeferredFunction.d.ts
declare function createDefer<TClient, TSchema, TFnMiddleware, THandler>(client, options, handler): DeferredFunction<TSchema>;
// handler ctx: { event, events, parents:[{fnSlug,runId}], step, runId, attempt, group, ... }
// trigger from a parent fn: defer("deterministic-id", { function: theScorer, data })  (defer is a context arg)

// components/ExperimentStrategies.d.ts  (top-level export `experiment`)
experiment.weighted({ a: 80, b: 20 })   // run-id seeded, deterministic
experiment.bucket(value, { weights? })  // consistent hashing
experiment.fixed("control")
experiment.custom(async () => "...")

// components/InngestGroupTools.d.ts  (group is a context arg)
group.experiment(idOrOptions, { variants: {name: () => unknown}, select })          // → result
group.experiment(idOrOptions, { variants, select, withVariant: true })              // → { result, variant }

// experimental.d.ts (the import surface for the deferred scorer)
export { createScorer, createDefer, scoreMiddleware, DeferredFunction, ... } from "inngest/experimental";
// Note: `experiment`, `group`, `step` are exported from the package root "inngest".
```

**Hard constraints from the prerelease:**
- `step.score()` ONLY exists when `scoreMiddleware()` is registered on the client. Without it the ctx extension is absent and the call won't type-check.
- **Run-level preferred:** omit `stepId` so the score attaches to the RUN. Step-level (`stepId` set) has a dev-server bug this week — do not use it.
- **Sessions are NOT in pr-1521** (they're in pr-1547, base 4.6.1). Sessions stay FAKED this pass. See §4.
- The demo doc's `scores.record(...)` is NOT a real API. Never use it.

---

## §1. The `DEMO_TARGET` flag (single read site)

One env flag, two values:

| Value | Meaning |
|-------|---------|
| `local` (default) | Current faked/seeded path. Offline-safe, deterministic, dev-server only. Scores written to the local history store. Experiment/sessions read from `seed-data.ts`. **Behaviorally unchanged from today.** |
| `cloud` | Emit REAL primitives (`step.score` run-level, `createScorer`/`createDefer` deferred scorer, `group.experiment`) AND register against Inngest Cloud (event + signing keys from env, `isDev=false`). |

**Read it in exactly one place.** Create `src/lib/demo-target.ts` (BACKEND owns it):

```ts
// src/lib/demo-target.ts
export type DemoTarget = "local" | "cloud";

/** The ONLY place DEMO_TARGET is read. Everything else imports DEMO_TARGET / isCloud. */
export const DEMO_TARGET: DemoTarget =
  process.env.DEMO_TARGET === "cloud" ? "cloud" : "local";

export const isCloud = DEMO_TARGET === "cloud";
```

Rules:
- No other file may read `process.env.DEMO_TARGET`. Import `isCloud` / `DEMO_TARGET` instead.
- The faked path is always the fallback. In `cloud` mode, every real-primitive call site is wrapped `if (isCloud) { …real… } else { …existing faked… }`. The faked branch is byte-for-byte the current code.
- `DEMO_TARGET` is orthogonal to `INNGEST_DEV`. `local` ⇒ dev server (`INNGEST_DEV=1`). `cloud` ⇒ `INNGEST_DEV=false` + keys. §3 wires the client to derive `isDev` from `isCloud` so they can't drift.

---

## §2. Exact real call sites

### 2a. Run-level score in `triage-agent.ts` (Act 1→2 bridge)

The agent already computes `localizationScore(citedFiles, groundTruthFixFiles)` at line 105. In cloud mode, additionally write it as a **run-level durable score** before returning. Omit `stepId` ⇒ attaches to the run.

Use `step.score(memoizationId, options)` (durable, memoized — survives the Act 1 retry, won't double-write on replay). The crash beat retries the function; a durable `step.score` is the correct primitive because it memoizes like any step.

Insert after line 105 (`const score = localizationScore(...)`), before the `return`:

```ts
import { isCloud } from "@/lib/demo-target";
// ...
const score = localizationScore(citedFiles, groundTruthFixFiles);

// CLOUD: write the localization score at the RUN level (omit stepId).
// Durable + memoized so the Act 1 retry doesn't double-write it.
if (isCloud) {
  await step.score("rca-localization-score", {
    name: "rca_localization",
    value: score,          // number 0..1 → ScoreValue
  });
}
```

Requires `scoreMiddleware()` on the client (see §3) — without it `step.score` does not exist on `ctx.step`.

**Optional live-score variant (do NOT ship unless asked):** `inngest.score({ name, value })` is the *live* write for inside a plain `step.run`. We prefer the durable `step.score` here. Keep `inngest.score` in mind only if a future beat needs a non-memoized live write from inside a `step.run` body.

### 2b. Deferred outcome scorer — `createScorer` + `defer()` (Act 2 hero)

This replaces the `recordOutcomeScore()` seam (the `TODO(launch)` at `src/lib/scoring.ts:114` and `score-incident.ts:18`). The deferred scorer is its own served function; the parent triggers it with `defer(id, { function, data })`.

**New file `src/inngest/scorers/localization-scorer.ts`** (BACKEND):

```ts
import { createScorer } from "inngest/experimental";
import { staticSchema } from "inngest";
import { inngest } from "@/inngest/client";
import { localizationScore } from "@/lib/scoring";

type LocalizationScorerData = {
  parentRunId: string;        // the triage run to attach the score to
  citedFiles: string[];
  groundTruthFixFiles: string[];
};

// createScorer wraps createDefer: the returned ScorerResult is forwarded to
// client.score(...) inside a durable step.run("score", ...). runId defaults to
// the parent run id; we pass it explicitly to be unambiguous in cloud.
export const localizationScorer = createScorer(
  inngest,
  {
    id: "localization-scorer",
    schema: staticSchema<LocalizationScorerData>(),
  },
  async ({ event }) => {
    const { parentRunId, citedFiles, groundTruthFixFiles } = event.data;
    return {
      name: "rca_localization_outcome",
      value: localizationScore(citedFiles, groundTruthFixFiles), // number 0..1
      runId: parentRunId,
    }; // ScorerResult → client.score(...) under the hood
  }
);
```

**Serve it** — add to `src/inngest/functions/index.ts` `functions` array (it's a real `InngestFunction` at runtime):

```ts
import { localizationScorer } from "@/inngest/scorers/localization-scorer";
export const functions = [triageAgent, scoreIncident, localizationScorer];
```

**Trigger it** from inside `score-incident.ts` via the `defer` context arg. Wrap in `isCloud`; the existing `recordOutcomeScore` + `step.sendEvent("emit-rca-scored", …)` stay as the faked/local branch.

```ts
import { isCloud } from "@/lib/demo-target";
import { localizationScorer } from "@/inngest/scorers/localization-scorer";

export const scoreIncident = inngest.createFunction(
  { id: "score-incident", retries: 2, triggers: [incidentSaved] },
  async ({ event, step, defer }) => {            // ← add `defer` to the ctx args
    const { incidentId, clientRunId, signal, savedAt } = event.data;
    const incident = getIncident(incidentId);
    const groundTruthFixFiles = incident?.groundTruthFixFiles ?? [];
    const citedFiles = signal === "saved" ? incident?.citedFiles ?? [] : [];

    if (isCloud) {
      // Deterministic defer id so a retry doesn't fire the scorer twice.
      await defer(`localization:${clientRunId}`, {
        function: localizationScorer,
        data: { parentRunId: clientRunId, citedFiles, groundTruthFixFiles },
      });
      // (Optionally still emit rcaScored for the UI; keep it for parity.)
      return { incidentId, clientRunId, deferred: true };
    }

    // ── LOCAL (faked) path — unchanged from today ──────────────────────────
    const scored = await step.run("score-incident", async () =>
      recordOutcomeScore(incidentId, clientRunId, citedFiles, groundTruthFixFiles, {
        scoredAt: savedAt, source: "live",
      })
    );
    await step.sendEvent("emit-rca-scored", rcaScored.create({ /* …unchanged… */ }));
    return scored;
  }
);
```

**`clientRunId` caveat (BACKEND must verify at integration):** `parentRunId` must be the *Inngest run id* the dashboard knows, not necessarily the client-minted `clientRunId`. The app uses `clientRunId` as the event `id` (`incident:${clientRunId}`), which is the idempotency key, NOT the run id. BACKEND: confirm whether `runId` passed to `client.score` must be Inngest's internal run id (likely yes). If so, capture `ctx.runId` inside `triage-agent` and thread it through (event payload or a lookup), and feed THAT to the scorer's `parentRunId`. The `createScorer` default (parent run id from `event.data.parent.runId` via the defer chain) is the safe fallback — prefer letting it default by triggering `defer()` from *inside the triage run itself* if the score-incident indirection makes the run id ambiguous. Flag this as the one open integration question.

### 2c. `group.experiment` (Act 3)

Today Act 3 is pure seed data (`seededExperiment` in `seed-data.ts`: GPT-5.5 vs claude-opus-4.8, model × incident grid). In cloud mode, run a real `group.experiment` so the experiment + per-variant scores land in the dashboard.

**New file `src/inngest/functions/experiment-bakeoff.ts`** (BACKEND), triggered by a new `agent/experiment.requested` event (BACKEND adds the `eventType` to `client.ts`). Score INSIDE each variant so the score auto-associates to the experiment:

```ts
import { experiment } from "inngest";
import { inngest, experimentRequested } from "@/inngest/client";
import { localizationScore } from "@/lib/scoring";
import { getIncident } from "@/content/incidents";

export const experimentBakeoff = inngest.createFunction(
  { id: "experiment-bakeoff", retries: 2, triggers: [experimentRequested] },
  async ({ event, step, group }) => {            // ← `group` ctx arg
    const { incidentId } = event.data;
    const incident = getIncident(incidentId);
    const truth = incident?.groundTruthFixFiles ?? [];

    const { result, variant } = await group.experiment(
      "localization-bakeoff",                    // StepOptionsOrId
      {
        variants: {
          "gpt-5.5": () => step.run("gpt-5.5", async () => {
            const cited = incident?.citedFiles ?? [];
            const value = localizationScore(cited, truth);
            await inngest.score({ name: "rca_localization", value }); // live, inside variant → auto-associates
            return value;
          }),
          "claude-opus-4.8": () => step.run("claude-opus-4.8", async () => {
            const cited = incident?.citedFiles ?? [];
            const value = localizationScore(cited, truth);
            await inngest.score({ name: "rca_localization", value });
            return value;
          }),
        },
        // weighted: run-id seeded + deterministic. bucket(incidentId) is the
        // alternative if you want the SAME incident to always hit the same model.
        select: experiment.weighted({ "gpt-5.5": 50, "claude-opus-4.8": 50 }),
        withVariant: true,
      }
    );

    return { incidentId, variant, score: result };
  }
);
```

Notes:
- Inside a variant, the live `inngest.score({ name, value })` (no ids) targets the current step, so it auto-associates with the experiment+variant. This is the documented pattern in `ExperimentStrategies.d.ts`.
- Use `experiment.weighted({...})` for the demo (deterministic per run-id). `experiment.bucket(incidentId)` is the swap if Sterling wants per-incident consistency across the corpus. Both are one-liner swaps on the `select:` field.
- Serve `experimentBakeoff` (add to the `functions` array). The Act 3 panel in cloud mode fires `agent/experiment.requested` per corpus incident (SEED owns the corpus emit; see §5) instead of reading `seededExperiment`.

---

## §3. Client / config changes for cloud mode

**`src/inngest/client.ts`** — register `scoreMiddleware` (required for `step.score`) and derive `isDev` from `isCloud`:

```ts
import { scoreMiddleware } from "inngest/experimental";
import { isCloud } from "@/lib/demo-target";

const middleware = [
  scoreMiddleware(),                              // REQUIRED: enables ctx.step.score
  ...(process.env.INNGEST_ENCRYPTION_KEY
    ? [encryptionMiddleware({ key: process.env.INNGEST_ENCRYPTION_KEY })]
    : []),
];

export const inngest = new Inngest({
  id: "incident-triage-booth-demo",
  isDev: !isCloud,            // cloud ⇒ isDev:false ⇒ talks to Inngest Cloud
  middleware,
});
```

- `scoreMiddleware()` is safe to register in BOTH modes (it just adds the `step.score` extension; the local path simply never calls it). Registering it unconditionally keeps the client shape identical and avoids type drift.
- `isDev: !isCloud` makes the cloud/dev decision derive from the single flag. When `isCloud`, the SDK reads `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` from env to authenticate to Cloud (event key for `inngest.send`, signing key for the serve endpoint). When local, `isDev:true` keeps the current dev-server behavior. **Do not also set `INNGEST_DEV` in cloud mode** — let `isDev` drive it.
- The serve route (`src/app/api/inngest/route.ts`) needs no change: `serve({ client, functions })` picks up `isDev`/keys from the client + env. (The `dev:cloud` npm script already exists for a localhost cloud smoke; cloud mode will additionally want `DEMO_TARGET=cloud`.)

**Env (`.env.local.example` already has the cloud block):** cloud mode requires `DEMO_TARGET=cloud`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, and `INNGEST_DEV` unset/false. DOCS adds `DEMO_TARGET` to the example file.

**`package.json`:** bump `inngest` from `^4.5.0` to the pin `pr-1521` (`npm i inngest@pr-1521`, resolves to `4.4.1-pr-1521.15`). BACKEND owns this. Keep `@inngest/middleware-encryption` as-is; verify it's compatible with 4.4.1 at install (it imports types from `inngest` — if it breaks, gate encryption middleware behind a version check and note it).

---

## §4. Sessions: explicitly OUT this pass

Sessions are **not in pr-1521** (they ship in pr-1547, a different base 4.6.1). Do NOT wire a sessions primitive.

- The faked seam stays: `seededSessions` in `src/content/seed-data.ts` and the session view in `ScoresPanel.tsx` keep reading seed data in BOTH modes. There is no `if (isCloud)` branch for sessions.
- Add this comment at the top of the session block in `seed-data.ts` and at the `session` deep-link in `inngest-dashboard.ts`:

```ts
// SESSIONS: FAKED in both local and cloud modes this pass.
// BLOCKED: needs the unified scoring+sessions SDK tag (pr-1547 / base 4.6.1).
// Owner: Jakob. Do NOT wire a real sessions primitive against pr-1521 — it
// does not exist there. Revisit when the unified tag lands.
```

- The `session` deep-link in `inngest-dashboard.ts` stays a placeholder URL in both modes.

---

## §5. FILE-OWNERSHIP MAP (disjoint, three builders)

Each file has exactly ONE owner. No file appears under two builders.

### BACKEND — Inngest client + functions + scoring lib + flag plumbing
Owns the real primitives and the flag.
- `src/lib/demo-target.ts` — **NEW.** The single `DEMO_TARGET` read site (`DEMO_TARGET`, `isCloud`). §1.
- `src/inngest/client.ts` — register `scoreMiddleware()`, `isDev: !isCloud`, add `experimentRequested` eventType. §2c, §3.
- `src/inngest/functions/triage-agent.ts` — run-level `step.score` under `isCloud`. §2a. (BACKEND also resolves the run-id question in §2b.)
- `src/inngest/functions/score-incident.ts` — `defer()` the scorer under `isCloud`; faked branch unchanged. §2b.
- `src/inngest/scorers/localization-scorer.ts` — **NEW.** `createScorer`. §2b.
- `src/inngest/functions/experiment-bakeoff.ts` — **NEW.** `group.experiment` + per-variant `inngest.score`. §2c.
- `src/inngest/functions/index.ts` — add `localizationScorer` + `experimentBakeoff` to `functions`.
- `src/lib/scoring.ts` — keep pure `localizationScore` + the local history store. Update the `TODO(launch)` comment to point at the now-real `localization-scorer.ts`. Do NOT delete `recordOutcomeScore` (it's the local-path implementation).
- `package.json` — bump `inngest` to `pr-1521`.

### SEED — cloud corpus seeder
Owns emitting a corpus of real runs + scores + experiments into a Cloud account via the real primitives.
- `scripts/seed-cloud.mjs` — **NEW.** Reads `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` (and `DEMO_BASE_URL`) from env. Emits the corpus by POSTing to the running app's trigger/score/experiment endpoints (so it goes through the real served functions) OR via the Inngest event API with the event key. For each corpus incident: send `agent/incident.received` → wait → send `agent/incident.saved` (drives the deferred scorer) → send `agent/experiment.requested` (drives `group.experiment`). **Idempotent:** deterministic event ids (`cloud-seed:incident:<incidentId>`, `cloud-seed:saved:<incidentId>`, `cloud-seed:exp:<incidentId>`) so re-runs dedupe. **Dry-run:** `--dry-run` (or `DRY_RUN=1`) prints the planned events + ids and sends nothing. Refuses to run unless `DEMO_TARGET=cloud` and keys are present (mirror the guard style in `seed-demo.mjs`).
- `package.json` script entry `demo:seed-cloud` — SEED adds the one line `"demo:seed-cloud": "node scripts/seed-cloud.mjs"`. (Coordinate the single `package.json` edit with BACKEND's version bump — SEED edits only the `scripts` block, BACKEND only `dependencies`; non-overlapping keys.)
- Act 3 cloud emit helper: the corpus `agent/experiment.requested` emit lives in `seed-cloud.mjs`. SEED does NOT touch `seed-data.ts` (that's the local faked path, untouched).

> `scripts/seed-demo.mjs` stays BACKEND-adjacent but is **unchanged** (local path). Nobody edits it this pass. `src/content/seed-data.ts` is **unchanged** (local faked sessions/experiment). Nobody edits it except the one BLOCKED comment in §4 — assign that single comment to BACKEND to keep SEED fully out of `seed-data.ts`.

### DOCS — repo-level docs only (NO Notion)
- `README.md` — add a "Cloud mode" section: `DEMO_TARGET=local|cloud`, required env (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`), how cloud emits real primitives, `npm run demo:seed-cloud`.
- `.env.local.example` — add `DEMO_TARGET=local` with a comment documenting `cloud`.
- `CONTRACT.md` — update the "SEEDED/FAKED" note (line ~23) and the cloud swap-point note: scores + experiments are REAL in cloud mode; sessions remain faked (BLOCKED, pr-1547/Jakob).
- `docs/` — if a cloud-handoff doc exists, note `DEMO_TARGET=cloud` as the switch.
- DOCS does NOT touch any `src/`, `scripts/`, or Notion.

**Disjointness check:** `package.json` is the only shared file; split by key block (BACKEND=`dependencies`, SEED=`scripts`). Every other file has a single owner. `seed-data.ts` and `seed-demo.mjs` are untouched (BACKEND owns the lone BLOCKED comment in `seed-data.ts`).

---

## Acceptance (per mode)
- `DEMO_TARGET=local` (or unset): identical to today. Dev server, faked scores/sessions/experiments, offline-safe, deterministic. No real-primitive call fires.
- `DEMO_TARGET=cloud` + keys: triage run writes a run-level score; saving an RCA defers the `localizationScorer` (real outcome score on the run); Act 3 runs a real `group.experiment` with per-variant `inngest.score`. All visible in the Inngest Cloud dashboard. Sessions still faked.
