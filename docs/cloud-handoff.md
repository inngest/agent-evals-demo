# Cloud Handoff

Use this when the demo is ready to move from local proof to the live
conference environment.

For the short human-facing credential ask, use `docs/cloud-auth-request.md`.

## Real eval primitives: the `DEMO_TARGET` switch

Cloud mode is gated by one env flag, `DEMO_TARGET`:

- `local` (default/unset): faked/seeded scores, sessions, experiments. Offline-safe.
- `cloud`: emits the **real** Inngest eval primitives (run-level `step.score`, the
  `createScorer`/`defer` deferred outcome scorer, and `group.experiment`) so scores and
  experiments land in the Cloud dashboard. Requires `DEMO_TARGET=cloud` in Vercel
  production env (alongside the keys below) and `INNGEST_DEV` unset. The client derives
  `isDev: !isCloud`, so do not set `INNGEST_DEV` in cloud mode.

Real primitives require the SDK pin `inngest@pr-1521` (`4.4.1-pr-1521.15`); the default
`^4.5.0` has none of them. **Sessions stay faked in both modes** — BLOCKED on the unified
scoring + sessions SDK tag (pr-1547 / base 4.6.1, owner Jakob). See `README.md`
"Cloud mode" and `INTEGRATION-PLAN.md` for the call sites.

After deploy + sync, seed the Cloud corpus of real runs, scores, and experiments with
`DEMO_TARGET=cloud npm run demo:seed-cloud` (idempotent; supports `--dry-run`).

## What Codex Can Do

Once the secrets and IDs exist, Codex can run the Vercel CLI, Inngest CLI,
seeding, preflight, smoke tests, viewport QA, and Linear updates.

## What Requires Human/Auth Input

Codex cannot create or recover these values without access:

- `INNGEST_API_KEY`: needed in the local shell for `inngest api --prod`.
- `INNGEST_EVENT_KEY`: Vercel production env for sending events.
- `INNGEST_SIGNING_KEY`: Vercel production env for serving `/api/inngest`.
- `DEMO_SEED_TOKEN`: Vercel production env for protected seeding and reset.
- `INNGEST_INSIGHTS_SCORE_QUERY`: Vercel production env after the Cloud query is
  generated and validated.
- `NEXT_PUBLIC_INNGEST_DASHBOARD_URL`: Vercel production env, usually
  `https://app.inngest.com`.
- `NEXT_PUBLIC_INNGEST_RUNS_URL`: optional Vercel production env for a
  pre-filtered Runs view. When set, the app's Inngest links open this URL
  instead of the generic dashboard.
- `INNGEST_CLOUD_APP_ID`: local shell value for `sync-app`.

Optional:

- `INNGEST_ENCRYPTION_KEY`
- `INNGEST_ENV`
- `INNGEST_API_BASE_URL`

## Current Blocker Evidence

As of June 14, 2026:

- `npm run demo:cloud-handoff` can read the linked Vercel project, but reports
  missing production env vars for `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`,
  `INNGEST_API_KEY`, `DEMO_SEED_TOKEN`, and
  `NEXT_PUBLIC_INNGEST_DASHBOARD_URL`.
- `npx inngest-cli@latest api --prod get-account` returns 401 without
  `INNGEST_API_KEY`.
- `npx vercel ls agent-evals-demo` shows an 11-day-old ready production
  deployment at `https://agent-evals-demo.vercel.app`, but it is not the current
  demo build.
- `DEMO_BASE_URL=https://agent-evals-demo.vercel.app npm run demo:preflight`
  fails because `/api/demo/status` and `/api/demo/seed` are missing from that
  deployment, `/api/inngest` returns HTTP 500, and `/api/score` does not expose
  the current GET history API.
- `DEMO_BASE_URL=https://agent-evals-demo.vercel.app npm run demo:smoke` fails
  because the deployment has no usable Inngest event key and no status endpoint.

## Handoff Check

Run:

```bash
npm run demo:cloud-handoff
```

Expected before secrets are added: failures for missing local Inngest API auth
and missing Vercel production env vars. Deployed preflight also verifies that
unauthenticated production seed and reset requests are locked.

Expected before initial deploy: no failures, only warnings for values that must
come after deployment or Cloud data, such as `DEMO_BASE_URL`,
`INNGEST_CLOUD_APP_ID`, and `INNGEST_INSIGHTS_SCORE_QUERY`.

For the final booth gate, run:

```bash
DEMO_BASE_URL=https://<vercel-domain> \
INNGEST_CLOUD_APP_ID=<cloud-app-id> \
npm run demo:cloud-ready
```

In final mode, `DEMO_BASE_URL`, `INNGEST_CLOUD_APP_ID`, and
`INNGEST_INSIGHTS_SCORE_QUERY` are required. `DEMO_BASE_URL` must be the HTTPS
deployed URL, not `localhost`.

`demo:cloud-ready` first runs the deploy-phase handoff checks so missing Vercel
envs or stale deployments fail before app sync. It then syncs the deployed
`/api/inngest` endpoint with Inngest Cloud. If `DEMO_CLOUD_READY_SEED=1` is set,
it seeds Cloud history before running `npm run demo:insights-check`. When
seeding is enabled, the Insights check retries so the durable
`score-query-signal` runs have time to emit `app/query.scored` events. That
proves `INNGEST_INSIGHTS_SCORE_QUERY` returns valid score rows from Cloud
instead of only checking that the deployed app avoids falling back to seeded
data.

If `DEMO_BASE_URL` is set, the handoff check also probes
`/api/demo/status` and `/api/inngest`, validates that their response shapes
match the current demo, and in final mode verifies demo-ops token
configuration, score history backed by Inngest Insights, and `sync-app`
registration with Inngest Cloud. This catches stale deployments such as the
existing POC URL before the final booth gate.

## Add Vercel Production Env Vars

Set local shell variables without committing them. Then add them to Vercel:

```bash
printf '%s' "$INNGEST_EVENT_KEY" | npx vercel env add INNGEST_EVENT_KEY production
printf '%s' "$INNGEST_SIGNING_KEY" | npx vercel env add INNGEST_SIGNING_KEY production
printf '%s' "$INNGEST_API_KEY" | npx vercel env add INNGEST_API_KEY production
printf '%s' "$DEMO_SEED_TOKEN" | npx vercel env add DEMO_SEED_TOKEN production
printf '%s' "$NEXT_PUBLIC_INNGEST_DASHBOARD_URL" | npx vercel env add NEXT_PUBLIC_INNGEST_DASHBOARD_URL production
```

Do not add `INNGEST_INSIGHTS_SCORE_QUERY` until Cloud score events exist and the
query has been generated and validated.

Optional:

```bash
printf '%s' "$INNGEST_ENCRYPTION_KEY" | npx vercel env add INNGEST_ENCRYPTION_KEY production
printf '%s' "$INNGEST_ENV" | npx vercel env add INNGEST_ENV production
printf '%s' "$INNGEST_API_BASE_URL" | npx vercel env add INNGEST_API_BASE_URL production
printf '%s' "$NEXT_PUBLIC_INNGEST_RUNS_URL" | npx vercel env add NEXT_PUBLIC_INNGEST_RUNS_URL production
```

Do not add `INNGEST_DEV` in production.

## Deploy And Sync

Deploy:

```bash
npx vercel --prod
```

The existing `https://agent-evals-demo.vercel.app` URL can stay as the public
alias, but it must point to a fresh deployment of the current branch before it
is used for the live demo.

Set:

```bash
export DEMO_BASE_URL=https://<vercel-domain>
export INNGEST_CLOUD_APP_ID=<cloud-app-id>
```

Sync the serve endpoint:

```bash
npx inngest-cli@latest api --prod sync-app \
  --app-id "$INNGEST_CLOUD_APP_ID" \
  --url "$DEMO_BASE_URL/api/inngest"
```

## Validate Cloud Runtime

Run:

```bash
DEMO_BASE_URL="$DEMO_BASE_URL" npm run demo:cloud-ready
```

Seed history:

```bash
DEMO_BASE_URL="$DEMO_BASE_URL" DEMO_SEED_TOKEN="$DEMO_SEED_TOKEN" npm run demo:seed
```

`demo:cloud-ready` runs deploy-phase handoff checks before requiring Cloud app
sync inputs, so missing Vercel env vars, missing local `INNGEST_API_KEY`, or a
stale deployed URL produce the full handoff checklist first. It then syncs the
Cloud app before optional seeding, validates the Insights score query, and runs
the final handoff, preflight, smoke, and viewport QA.
Then validate Inngest Cloud Runs shows:

- `write-query`
- `score-query-signal`
- seeded historic runs
- retry recovery

To force a fresh seed immediately before the final gate, run:

```bash
DEMO_BASE_URL="$DEMO_BASE_URL" \
DEMO_SEED_TOKEN="$DEMO_SEED_TOKEN" \
DEMO_CLOUD_READY_SEED=1 \
npm run demo:cloud-ready
```

When `DEMO_CLOUD_READY_SEED=1` is set, the Insights check retries 6 times with
a 5s delay by default. Override with `DEMO_CLOUD_READY_INSIGHTS_ATTEMPTS` and
`DEMO_CLOUD_READY_INSIGHTS_DELAY_MS` if Cloud execution is slower.

## Generate The Insights Score Query

Follow `docs/insights-score-query.md` after Cloud events exist. Then add the
validated query to Vercel:

```bash
INNGEST_INSIGHTS_SCORE_QUERY="$INNGEST_INSIGHTS_SCORE_QUERY" npm run demo:insights-check
printf '%s' "$INNGEST_INSIGHTS_SCORE_QUERY" | npx vercel env add INNGEST_INSIGHTS_SCORE_QUERY production
npx vercel --prod
DEMO_BASE_URL="$DEMO_BASE_URL" npm run demo:preflight
```

Final score-history readiness requires preflight to report
`source=inngest-insights`.

Then run:

```bash
DEMO_BASE_URL="$DEMO_BASE_URL" npm run demo:cloud-ready
```
