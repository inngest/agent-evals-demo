# AIEWF Booth Demo Runbook

For the driver script and stakeholder dry-run criteria, use
`docs/demo-talk-track.md`.

For the one-page presenter version, print or pin `docs/driver-card.md`.

For display sign-off, use `docs/booth-qa-checklist.md`. For fallback video
capture, use `docs/contingency-recording.md`.

For the strict requirement-by-requirement status, use
`docs/demo-readiness-audit.md`.

For the production Cloud handoff, use `docs/cloud-auth-request.md` first, then
`docs/cloud-handoff.md`.

## Event Context

- Event: AI Engineer World's Fair 2026.
- Booth: `U-G26`.
- Booth opens: Monday, June 29, 2026 at 4 PM.
- June 29 is also the evals soft-launch booth day in Slack planning, so the
  demo should be ready before that first shift rather than during the week.
- Core booth story: one encompassing Insights-agent demo covering durability,
  observability, and optimization.

## Preflight

Run these before a dry run or booth shift:

```bash
npm run demo:doctor
npm run lint
npm run build
npm run demo:preflight
npm run demo:smoke
npm run demo:viewport
npm run demo:cloud-handoff
```

Open the demo app and Inngest dashboard side by side. The left side is the
demo app; the right side is the Inngest Runs view filtered to the conference
demo app/environment.

Before booth staffing is finalized, pick 2-3 approved drivers and run each of
them through the driver sign-off in `docs/driver-card.md`.

## Local Dry Run

Use this path when rehearsing without Cloud keys:

```bash
npm run dev
APP_URL=http://localhost:3001 npm run inngest:dev
```

If Next uses a different port, pass that port in `APP_URL`. The local dashboard
runs at `http://localhost:8288`.

If a browser tab is on the wrong port, let the repo find the live app:

```bash
npm run demo:doctor
```

Check the local app surface:

```bash
DEMO_BASE_URL=http://localhost:3001 npm run demo:local-ready
```

`demo:local-ready` runs lint, build, preflight, smoke, a small seeded smoke
pass, and viewport QA. The smoke checks verify the foreground golden path and,
on localhost, confirm the reset endpoint clears local score state for
back-to-back rehearsals. Use the individual scripts only when debugging a
failed step.

For a quick JSON view of the same non-secret readiness state:

```bash
curl http://localhost:3001/api/demo/status
```

## Cloud Setup

Use `docs/cloud-auth-request.md` for the human credential ask, then
`docs/cloud-handoff.md` for the detailed env/deploy/sync flow and the
`npm run demo:cloud-handoff` checker.

Set these Vercel production environment variables before deploying:

```txt
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
INNGEST_ENCRYPTION_KEY
INNGEST_ENV
INNGEST_API_KEY
INNGEST_INSIGHTS_SCORE_QUERY
DEMO_SEED_TOKEN
NEXT_PUBLIC_INNGEST_DASHBOARD_URL
NEXT_PUBLIC_INNGEST_RUNS_URL
```

Notes:

- Leave `INNGEST_DEV` unset in production.
- `INNGEST_ENV` is optional when using the default production environment.
- `INNGEST_INSIGHTS_SCORE_QUERY` should return rows with `runId`, `signal`,
  `score`, and `scoredAt`. See `docs/insights-score-query.md`.
- Add `INNGEST_INSIGHTS_SCORE_QUERY` after Cloud score events exist and the
  query has been generated and validated.
- `DEMO_SEED_TOKEN` protects the production seed and reset endpoints. Do not
  commit it. Local dev ignores the token so copied Cloud env vars do not break
  the in-app seed/reset controls during rehearsal.
- `NEXT_PUBLIC_INNGEST_RUNS_URL` is optional but recommended. Set it to the
  filtered Inngest Runs URL for the conference app/environment so the app's
  `Inngest`, `Open Inngest`, and `View trace` links go directly to the right
  product view during the split-screen walkthrough.

Deploy with:

```bash
npx vercel --prod
```

Check the deployed app surface:

```bash
DEMO_BASE_URL=https://<vercel-domain> \
INNGEST_CLOUD_APP_ID=<cloud-app-id> \
npm run demo:cloud-ready
```

`demo:cloud-ready` first runs deploy-phase handoff checks, then syncs the
deployed `/api/inngest` endpoint. It optionally seeds Cloud history when
`DEMO_CLOUD_READY_SEED=1`, validates the Insights score query, then runs the
final Cloud handoff, preflight, smoke, and viewport QA. It fails if score
history is still using seeded/local fallback data instead of
`INNGEST_INSIGHTS_SCORE_QUERY`. Use `docs/insights-score-query.md` to generate
and validate that query.

The smoke command checks the foreground golden path: trigger agent, run query,
save query, score, and local reset. It only seeds history when
`DEMO_SMOKE_SEED=1` is set.
The viewport command captures browser screenshots and checks for missing core
controls or page-level horizontal overflow across booth-style split panes.

To sync the deployed serve endpoint manually before a seed-only dry run:

```bash
npx inngest-cli@latest api --prod sync-app \
  --app-id <cloud-app-id> \
  --url https://<vercel-domain>/api/inngest
```

## Seed Cloud History

Seed the deployed app before dry runs and booth shifts:

```bash
DEMO_BASE_URL=https://<vercel-domain> \
DEMO_SEED_TOKEN=<token> \
npm run demo:seed
```

For deployed URLs, `demo:seed` fails before sending anything unless the URL is
HTTPS and `DEMO_SEED_TOKEN` is present.

Optional:

```bash
DEMO_SEED_COUNT=24 npm run demo:seed
```

Before seeding manually, make sure the deployed `/api/inngest` endpoint has
been synced in Cloud; `demo:cloud-ready` does this automatically before its
optional seed step.

The seed route sends `app/query.requested` events plus `app/query.saved`
signals. The durable `score-query-signal` function emits the downstream
`app/query.scored` events that power the Scores/Insights story. The local UI
button is intentionally convenient for dev-server rehearsals; production
seeding should use the tokenized command.

`npm run demo:seed` should print the number of demo runs, happy-path runs,
retry-demo runs, saved score signals, discarded score signals, total events
sent, dashboard URL, serve endpoint, and the exact preflight/smoke commands to
run next. Treat malformed output, zero score signals, missing retry-demo runs,
or missing saved/discarded signal variety as a failed seed, not as a partial
success.

After a fresh Cloud seed, allow the durable score runs a few seconds to emit
`app/query.scored`. `DEMO_CLOUD_READY_SEED=1 npm run demo:cloud-ready` retries
the Insights check automatically.

## Research Score Heartbeat

The deployed `research-agent-score-heartbeat` cron runs every minute and invokes
four research-agent child runs at 15-second slots. It must use `step.invoke` to
run the research agent and await the child result, not a fire-and-forget
`step.sendEvent`, because the score path needs the invoked agent run ID.

## Seed Research Agent Load

Use this when the Inngest dashboard needs a large history of the current
research-agent demo across all acts:

```bash
npm run demo:seed-research-load -- --count 250 --experiments 200
```

The command loads `.env.local`, sends directly to the Inngest Cloud Event API,
and emits:

- `research/run.requested` events for Act 1 durable agent traces.
- seeded feedback instructions that the agent turns into
  `research/feedback.recorded` events after it knows the real Cloud run ID, so
  Act 2 positive/negative scores attach to the durable run.
- `research/experiment.requested` events for Act 3 model bakeoff data. Each
  experiment event carries a `corpusRuns` window with the Act 2 feedback signal
  and score from the same seeded batch, so the experiment output can point back
  to scored research-agent runs.

Preview the exact pattern without sending anything:

```bash
npm run demo:seed-research-load -- --dry-run --count 40 --experiments 20
```

Useful knobs:

```bash
npm run demo:seed-research-load -- \
  --count 500 \
  --experiments 500 \
  --failure-rate 0.12 \
  --batch-size 50
```

The default feedback pattern intentionally starts with 2-5 positive signals,
then a 10-run negative streak, then recovery positives, with randomized
repeats. Keep `--failure-rate` modest for large loads; each retry demo adds a
durable retry attempt and a short retry delay.

## Walkthrough

1. Click `Seed 14 runs` locally, or run the Cloud seed command above.
2. Open Inngest Runs on the right side.
3. In the demo app, click `Ask agent`.
4. Point at the generated SQL and result rows.
5. Open the corresponding Inngest run/trace on the right.
6. Click `Save`.
7. Open `Scores` in the demo app and show the saved behavior signal.
8. In Inngest, show the seeded run history and score-signal events.

Start each live conversation with:

> What are you using today to know if your agents are actually working in
> production?

Use the answer to route the demo: eval-savvy visitors see Scores and Insights
history sooner; durability questions get the `Opus offline` retry path;
observability questions spend more time in Inngest Runs and Trace.

If the visitor is qualified or explicitly comparing eval/observability options,
end with the Patrick handoff from `docs/demo-talk-track.md` instead of adding
more screens. Use the event page calendar for the handoff:
`https://www.inngest.com/events/ai-engineer-worlds-fair-2026`. The goal is a
useful follow-up, not a longer booth monologue.

## Booth QA

Before the final dry run, complete the matrix in
`docs/booth-qa-checklist.md` across the 32-inch, 16-inch, and 14-inch setups.
The demo is not signed off while Cloud preflight fails, the Inngest dashboard
cannot show the demo app/environment, or the split-screen layout requires
repeated resizing to stay readable.

## Fallback Recording

After Cloud deploy, seed history, Insights score query, and stakeholder talk
track are approved, record the 90-second loop and 2-3 minute driven fallback
from `docs/contingency-recording.md`. Add the final video links here and to
MAR-166.

```txt
90-second loop:
2-3 minute driven fallback:
```

## Recovery

- If the app works but Inngest has no new runs, check the deployment env vars
  and re-sync `/api/inngest`.
- If production seeding returns 401/403, confirm `DEMO_SEED_TOKEN` is set in
  Vercel and in the local shell running `npm run demo:seed`.
- If production reset returns 401/403 from a browser interaction, that is
  expected. Use the local controls to reset the presenter state; server-side
  demo history reset is intentionally protected in production.
- If score history is empty after refresh, verify `INNGEST_INSIGHTS_SCORE_QUERY`.
  If it cannot be fixed before showtime, switch to the approved emergency
  fallback framing or recording.
- If Wi-Fi is unreliable, use the contingency recording. Keep the local
  dev-server path for internal rehearsal only unless a booth lead explicitly
  approves it as an emergency fallback.
