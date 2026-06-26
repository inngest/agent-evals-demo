# Agent Evals Booth Demo

This demo follows `PRD.md`: a Next.js App Router app with a real Inngest v4 workflow and mocked LLM, query, and scoring surfaces.

For dry-run and booth ops, use `docs/booth-runbook.md`. For the Lauren/Riley
stakeholder walkthrough and booth driver script, use `docs/demo-talk-track.md`.
For the experimental split-screen booth-control pivot, use
`docs/split-screen-control-panel-prd.md`.
For the printable booth driver card, use `docs/driver-card.md`.
For display sign-off and fallback capture, use
`docs/booth-qa-checklist.md` and `docs/contingency-recording.md`. For the
strict requirement-by-requirement status, use `docs/demo-readiness-audit.md`.
For the production Cloud handoff, use `docs/cloud-auth-request.md` and
`docs/cloud-handoff.md`. For the publish/review handoff, use
`docs/review-handoff.md`.

## Design System Source

The reusable design layer is sourced from `~/inngest/swag-store`, not `~/inngest/swag-store-demo`:

- `components.json`
- `src/components/ui/`
- `src/app/brand.css`
- Next/Tailwind/PostCSS/ESLint/TypeScript config shape

The app-specific layout mirrors the simplified Insights surface described in the PRD.

## Local Development

Run the Next app and the local Inngest dev server in separate terminals:

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

For the booth split-screen, keep the demo app on one side and open the Inngest
dev server at `http://localhost:8288` on the other. The app's **Seed 14 runs**
button sends real `write-query` and score-signal events so the Runs list has
history to show.

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

Real primitives require `inngest@pr-1521` (`npm i inngest@pr-1521`, resolves to
`4.4.1-pr-1521.15`). The default `^4.5.0` pin has none of these primitives. Installing
the pin is a separate step (it is not run as part of this docs pass).

### Running cloud mode

1. Set `DEMO_TARGET=cloud`, `INNGEST_EVENT_KEY`, and `INNGEST_SIGNING_KEY`. Leave
   `INNGEST_DEV` unset/false.
2. Deploy to Vercel (see "Production Inngest" below) and sync the `/api/inngest`
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

For Vercel production, set these environment variables on the project and leave
`INNGEST_DEV` unset. To emit the real eval primitives, also set `DEMO_TARGET=cloud`
(omit it or set `local` to keep the faked path):

```txt
DEMO_TARGET=cloud
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
INNGEST_ENCRYPTION_KEY=
INNGEST_ENV=
INNGEST_API_KEY=
INNGEST_API_BASE_URL=https://api.inngest.com
INNGEST_INSIGHTS_SCORE_QUERY=
DEMO_SEED_TOKEN=
NEXT_PUBLIC_INNGEST_DASHBOARD_URL=https://app.inngest.com/env/production
NEXT_PUBLIC_INNGEST_RUNS_URL=
NEXT_PUBLIC_INNGEST_INSIGHTS_URL=
```

The original POC URL, `https://agent-evals-demo.vercel.app`, is live but is not
the current demo build until it is redeployed from this worktree. As of June 12,
2026, `demo:preflight` fails against that URL because the new status/seed APIs
are absent and the Inngest serve endpoint is missing production env.

After deploy, sync/register the Inngest app in Cloud with:

```txt
https://<vercel-domain>/api/inngest
```

Preflight the deployed app with:

```bash
DEMO_BASE_URL=https://<vercel-domain> npm run demo:preflight
```

Smoke-test the foreground golden path with:

```bash
DEMO_BASE_URL=https://<vercel-domain> npm run demo:smoke
```

Check booth split-screen pane sizes with:

```bash
DEMO_BASE_URL=https://<vercel-domain> npm run demo:viewport
```

For non-secret deployment diagnostics, inspect:

```txt
https://<vercel-domain>/api/demo/status
```

To see the current production handoff blockers and the exact Vercel env
commands to run next, use:

```bash
npm run demo:cloud-handoff
```

Seed the deployed app with:

```bash
DEMO_BASE_URL=https://<vercel-domain> DEMO_SEED_TOKEN=<token> npm run demo:seed
```

To smoke-test Cloud auth from localhost, export the same Cloud keys locally and
run:

```bash
npm run dev:cloud
```
