# Inngest Booth Demo — Unbreakable agents, invisible infra.

This repo holds the booth demo for [EVENT NAME] ([DATES], booth [BOOTH #]).
The story is a loop: **Run -> Observe -> Evaluate**, with Sandboxes (beta) as
a Run-stage beat.

- `/` is the loop demo: a real Inngest v4 research agent (durable steps,
  retry/replay, traces) with the new positioning, sandbox execution, and
  per-stage code snippets.
- `/research` is the legacy three-act research demo (Durable / Scores /
  Experiment), kept for rehearsal and comparison.
- `/booth-story` and `/booth-control` are older incident-triage surfaces,
  also kept for reference.

The LLM, research corpus, and score values are mocked. The only live pieces
are the real Inngest function, its traces, and (in cloud mode) the real
score, experiment, and sandbox primitives.

## Sandboxes (beta)

The Run stage can execute a model-generated analysis script inside a real
Inngest Sandbox. Sandboxes are cloud-only and access-gated, and require
`inngest >= 4.20.0` (pinned). The seam is `src/lib/sandbox.ts`:

- `DEMO_TARGET=cloud` plus a beta-enabled environment runs real durable
  sandbox steps (`create-analysis-sandbox`, `run-generated-analysis`,
  `destroy-analysis-sandbox`) inside `research-agent`.
- The local dev server runs a labeled simulated beat so the trace story is
  identical offline.
- `/api/demo/status` exposes the entitlement probe as `sandbox.mode`
  (`sandbox` or `simulated`) plus the reason.
- If Create returns 403 `access_denied`, ask the Inngest team to enable the
  beta for the demo environment.

For dry-run and booth ops, use `docs/booth-runbook.md`. For the driver
walkthrough and booth script, use `docs/demo-talk-track.md`. For the printable
booth driver card, use `docs/driver-card.md`.

## Design System Source

The reusable design layer is sourced from `~/inngest/swag-store`, not `~/inngest/swag-store-demo`:

- `components.json`
- `src/components/ui/`
- `src/app/brand.css`
- Next/Tailwind/PostCSS/ESLint/TypeScript config shape

The app-specific layout mirrors the simplified Insights surface described in the PRD.

## Local Development

The one-command booth path kills any stale demo processes, starts both
servers, waits for health, and prints the split-screen URLs:

```bash
npm run demo:booth
```

On macOS it also opens both panes in your browser (`--no-open` to skip).
`Ctrl+C` stops both servers.

To run the pieces manually in separate terminals instead:

```bash
npm run dev
npm run inngest:dev
```

`npm run dev` defaults to `INNGEST_DEV=1`, so the app talks to the local dev
server without needing Cloud keys.

If Next chooses another port because `3000` is busy, point the Inngest dev server
at that app URL:

```bash
APP_URL=http://localhost:3001 npm run inngest:dev
```

If you are unsure which port is the current demo app, run:

```bash
npm run demo:doctor
```

It scans the common local ports, reports the detected app URL, confirms the
local Inngest dev server, and shows the exact preflight/local-ready commands to
run next. It also prints the missing Cloud handoff exports so the production
setup can resume without hunting through the docs.

For the booth split-screen, keep the loop demo at `/` on one side and open
the Inngest dev server at `http://localhost:8288` on the other. The Run
stage's `Run research agent` button sends a real `research/run.requested`
event (with the sandbox flag armed) so the Runs list shows live history.
`npm run demo:seed-research-load` seeds a larger corpus for the dashboard.

## Cloud mode (`DEMO_TARGET`)

The demo has two modes, controlled by a single env flag, `DEMO_TARGET`. It is read
in exactly one place, `src/lib/demo-target.ts`, which exports `DEMO_TARGET` and
`isCloud`. Nothing else reads `process.env.DEMO_TARGET` directly.

| `DEMO_TARGET` | Behavior |
|---------------|----------|
| `local` (default, or unset) | Faked/seeded path. Scores, sessions, and experiments come from `src/content/seed-data.ts` and the local history store. Offline-safe, deterministic, dev-server only. Behaviorally identical to the booth build. No real eval primitive fires. |
| `cloud` | Emits the **real** Inngest eval primitives so scores and experiments land in the Inngest Cloud dashboard. Registers against Cloud (`isDev=false`, keys from env). |

In `cloud` mode the app emits real primitives at three call sites:

- **Run-level score (Act 1 → 2):** `src/inngest/functions/triage-agent.ts` writes the
  localization score with a durable, run-level `step.score(...)` (no `stepId`, so it
  attaches to the run). This requires `scoreMiddleware()` on the client, which is
  registered unconditionally in `src/inngest/client.ts`.
- **Deferred outcome scorer (Act 2 hero):** `src/inngest/scorers/localization-scorer.ts`
  defines a `createScorer(...)` deferred function. `src/inngest/functions/score-incident.ts`
  triggers it with `defer(id, { function, data })` when an RCA is saved. The scorer
  returns `{ name, value, runId }` and the SDK writes it via `client.score(...)`.
- **Experiment (Act 3):** `src/inngest/functions/experiment-bakeoff.ts` runs a real
  `group.experiment(...)` (GPT-5.5 vs claude-opus-4.8) and calls `inngest.score(...)`
  inside each variant so the score auto-associates with the experiment + variant.

The faked branch is always the fallback. Every real-primitive call site is wrapped
`if (isCloud) { ...real... } else { ...existing faked... }`, and the faked branch is
unchanged from the local build.

`DEMO_TARGET` is orthogonal to `INNGEST_DEV`. `local` implies the dev server; `cloud`
sets `isDev=false`. The client derives `isDev` from `isCloud` (`isDev: !isCloud`), so
**do not also set `INNGEST_DEV` in cloud mode** — let the flag drive it.

### Sessions are deferred (BLOCKED)

The **sessions** view stays faked in **both** modes this pass. The sessions primitive is
not in the pinned SDK tag (`inngest@pr-1521`, which resolves to `4.4.1-pr-1521.15`); it
ships in a different base (`pr-1547` / `4.6.1`). `seededSessions` in
`src/content/seed-data.ts` and the session deep-link in `src/lib/inngest-dashboard.ts`
keep reading seed data in both modes. There is no `if (isCloud)` branch for sessions.

> BLOCKED: needs the unified scoring + sessions SDK tag (pr-1547 / base 4.6.1).
> Owner: Jakob. Do not wire a real sessions primitive against pr-1521 — it does not
> exist there. Revisit when the unified tag lands.

### SDK pin for cloud mode

Real primitives (scores, experiments, sandboxes) require `inngest >= 4.20.0`
(pinned in `package.json`). The old `inngest@pr-1521` pin is obsolete;
4.20.0 ships the eval primitives plus the sandbox middleware.

### Running cloud mode

1. Set `DEMO_TARGET=cloud`, `INNGEST_EVENT_KEY`, and `INNGEST_SIGNING_KEY`. Leave
   `INNGEST_DEV` unset/false.
2. Deploy to Render (see "Production Inngest" below) and sync the `/api/inngest`
   serve endpoint with Inngest Cloud.
3. Seed the Cloud corpus of real runs, scores, and experiments:

   ```bash
   DEMO_TARGET=cloud npm run demo:seed-cloud
   ```

   The seeder is idempotent (deterministic event ids dedupe re-runs) and refuses to run
   unless `DEMO_TARGET=cloud` and the keys are present. Use `--dry-run` (or `DRY_RUN=1`)
   to print the planned events without sending anything.

After seeding, the Cloud dashboard shows: a triage run with a run-level localization
score, a deferred outcome score on the run when an RCA is saved, and a real
`group.experiment` with per-variant scores. Sessions remain faked.

## Production Inngest

The app is wired for Inngest Cloud the same way the swag-store apps are:

- `INNGEST_EVENT_KEY` sends events from API routes.
- `INNGEST_SIGNING_KEY` authenticates the `/api/inngest` serve endpoint.
- `OPENROUTER_API_KEY` is optional. When set, the research agent's two LLM
  steps (`call-llm-plan-research`, `call-llm-synthesize-brief`) call
  [OpenRouter](https://openrouter.ai) for real (real text, real token counts);
  unset, they stay mocked. `OPENROUTER_MODEL` overrides the default
  (`openai/gpt-5.5`), and `OPENROUTER_BASE_URL` retargets the API. The 503
  failure-injection beat and memoized replays behave identically either way.
- `INNGEST_ENCRYPTION_KEY` is optional. When present, the app enables
  `@inngest/middleware-encryption` for encrypted Inngest payload storage.
- `INNGEST_ENV` is optional for targeting a non-default Cloud environment.
- `NEXT_PUBLIC_INNGEST_DASHBOARD_URL` controls the "View trace" link base.
- `NEXT_PUBLIC_INNGEST_RUNS_URL` optionally overrides app links with a
  pre-filtered Runs view for the conference app/environment. Use it for the
  booth split-screen once Cloud is configured.
- `NEXT_PUBLIC_INNGEST_INSIGHTS_URL` optionally points every "Open Insights"
  button at a saved Cloud Insights query. If omitted, the app opens the generic
  Insights route for the configured dashboard environment.
- `INNGEST_API_KEY` + `INNGEST_INSIGHTS_SCORE_QUERY` are optional. When both
  are present, `/api/score` reads the Scores panel from Inngest Insights.
  Without them, the panel uses deterministic seeded demo signals. See
  `docs/insights-score-query.md` for the event contract and Cloud query setup.
- `DEMO_SEED_TOKEN` protects `/api/demo/seed` and `/api/demo/reset` in
  production. Local dev can use the in-app controls without a token; deployed
  seeding should use the runbook command. The token is ignored outside
  production so copied Cloud env vars do not break local rehearsals.

## Deploy to Render

The repo ships a Render blueprint (`render.yaml` at the repo root) that
creates the Web Service with everything below preconfigured: Node runtime,
`npm ci && npm run build` build, `npm run start` start command, and
`/api/demo/status` as the health check. The production env vars are split
between blueprint defaults (`DEMO_TARGET=cloud`, the Inngest API base, the
dashboard URL) and prompted secrets.

### Create the service (blueprint)

1. Push this repo to GitHub.
2. In the Render dashboard: **New → Blueprint**, select the repo. Render
   reads `render.yaml` and prompts for the secret values:
   - `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (required, from your Inngest
     Cloud environment's "Keys" page)
   - `DEMO_SEED_TOKEN` (required; pick any unguessable string)
   - The rest are optional (`INNGEST_ENCRYPTION_KEY`, `INNGEST_ENV`,
     `INNGEST_API_KEY`, `INNGEST_INSIGHTS_SCORE_QUERY`,
     `NEXT_PUBLIC_INNGEST_RUNS_URL`, `NEXT_PUBLIC_INNGEST_INSIGHTS_URL`) —
     leave blank to skip.
3. Apply. First build takes a few minutes; the service goes live once
   `/api/demo/status` passes the health check.

### Create the service (manual, without the blueprint)

**New → Web Service**, connect the repo, then:

- Runtime: Node
- Build command: `npm ci && npm run build`
- Start command: `npm run start`
- Health check path: `/api/demo/status`
- Instance type: Starter or higher. Avoid the free tier — it spins down
  between requests, and a cold start mid-booth ruins the timing.
- Environment: set the env vars from the blueprint or the list above
  (`NODE_VERSION=22`, `DEMO_TARGET=cloud`, and the keys).

### Register the app with Inngest Cloud

After the first deploy, add the serve endpoint in the Inngest dashboard
(**Apps → Add App** or the environment's Apps page) with your Render URL:

```txt
https://<render-domain>/api/inngest
```

Inngest syncs the functions, and the `/api/inngest` handler authenticates
with `INNGEST_SIGNING_KEY`. Leave `INNGEST_DEV` unset in Render —
`DEMO_TARGET=cloud` drives `isDev` (see "Cloud mode" above).

### Post-deploy checks

Preflight the deployed app:

```bash
DEMO_BASE_URL=https://<render-domain> npm run demo:preflight
```

Smoke-test the foreground golden path:

```bash
DEMO_BASE_URL=https://<render-domain> npm run demo:smoke
```

Seed the deployed app (idempotent):

```bash
DEMO_BASE_URL=https://<render-domain> DEMO_SEED_TOKEN=<token> npm run demo:seed
```

Check booth split-screen pane sizes:

```bash
DEMO_BASE_URL=https://<render-domain> npm run demo:viewport
```

For non-secret deployment diagnostics, inspect:

```txt
https://<render-domain>/api/demo/status
```

To see the current production handoff blockers, use:

```bash
npm run demo:cloud-handoff
```

To smoke-test Cloud auth from localhost, export the same Cloud keys locally
and run:

```bash
npm run dev:cloud
```

### Booth split-screen on Cloud

Point the right pane at a pre-filtered Runs view by setting
`NEXT_PUBLIC_INNGEST_RUNS_URL` on Render (for example, the Runs URL filtered
to the research agent's app/environment). Every "open in Inngest" link and
the dashboard pane then land on just the demo's runs. Locally this is
unnecessary — `npm run demo:booth` opens `http://localhost:8288/runs`, which
only ever shows this app's functions.
