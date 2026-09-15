# Booth Demo Runbook

For the driver script and stakeholder dry-run criteria, use
`docs/demo-talk-track.md`.

For the one-page presenter version, print or pin `docs/driver-card.md`.

For display sign-off, use `docs/booth-qa-checklist.md`. For fallback video
capture, use `docs/contingency-recording.md`.

For the strict requirement-by-requirement status, use
`docs/booth-qa-checklist.md`.


## Event Context

- Event: [EVENT NAME], [DATES].
- Booth: [BOOTH #].
- Core booth story: Unbreakable agents, invisible infra. One loop demo
  (Run / Observe / A/B Test) at `/` covering durability, observability,
  A/B testing, and Sandboxes (beta).
- Booth surfaces: `/` is the loop demo. Legacy demos remain at `/research`

## Sandbox Beta Notes

- Sandboxes require `inngest >= 4.20.0` (pinned in `package.json`) and are
  cloud-only, access-gated.
- The demo probes entitlement at `/api/demo/status` under `sandbox.mode`:
  - `sandbox`: cloud mode with the beta enabled for the environment. Real
    durable sandbox steps run (`create-analysis-sandbox`,
    `run-generated-analysis`, `destroy-analysis-sandbox`).
  - `simulated`: local dev server or beta unavailable. The beat runs as a
    labeled simulated step so the trace story stays intact.
- If cloud returns 403 `access_denied`, ask the Inngest team to enable the
  beta for the demo environment before the event.
- The agent's `onFailure` handler destroys leaked sandboxes by name.

## Preflight

Run these before a dry run or booth shift:

```bash
npm run lint
npm run build
npm run demo:preflight
npm run demo:smoke-loop
npm run demo:cloud-ready
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
```

Check the local app surface:

```bash
DEMO_BASE_URL=http://localhost:3001 npm run demo:local-ready
```

`demo:local-ready` runs lint, build, preflight, smoke, loop smoke, a small
seeded smoke pass, and viewport QA. Use the individual scripts only when
debugging a failed step.

**`demo:smoke-loop` is the gate that tests the demo you are actually giving.**
It fails if the run fell back to the simulated timeline, if no memoized replay
happened, or if the synthesis step's output does not parse - that last check is
what catches the research output card silently disappearing.

`demo:preflight` is the configuration check: app up, Inngest serve endpoint
answering, keys and mode correct. It deliberately does not run the demo.

For a quick JSON view of the same non-secret readiness state:

```bash
curl http://localhost:3001/api/demo/status
```

## Cloud Setup

Use `npm run demo:cloud-ready` to confirm the deployed serve endpoint is
synced, then `npm run demo:preflight` against the deployed URL.

Set these Vercel production environment variables before deploying:

```txt
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
INNGEST_ENCRYPTION_KEY
INNGEST_ENV
INNGEST_API_KEY
NEXT_PUBLIC_INNGEST_DASHBOARD_URL
NEXT_PUBLIC_INNGEST_RUNS_URL
```

Notes:

- Leave `INNGEST_DEV` unset in production.
- `INNGEST_ENV` is optional when using the default production environment.
- `INNGEST_INSIGHTS_SCORE_QUERY` should return rows with `runId`, `signal`,
- Add `INNGEST_INSIGHTS_SCORE_QUERY` after Cloud score events exist and the
  query has been generated and validated.
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
deployed `/api/inngest` endpoint.

`demo:smoke-loop` runs a real agent against the deployed URL and asserts on the
captured timeline, so it is the check that proves the demo works rather than
merely that the app booted.

To sync the deployed serve endpoint manually before a seed-only dry run:

```bash
npx inngest-cli@latest api --prod sync-app \
  --app-id <cloud-app-id> \
  --url https://<vercel-domain>/api/inngest
```

## Research Score Heartbeat

The deployed `research-agent-score-heartbeat` cron runs every five minutes and
uses `step.invoke` to run the research agent and await the child result. Keep
this as an invoke, not fire-and-forget `step.sendEvent`, because the score path
needs the invoked agent run ID.

## Seed Research Agent Load

Use this when the Inngest dashboard needs a large history of the research
agent demo (this is the loop demo's agent):

```bash
```

The command loads `.env.local`, sends directly to the Inngest Cloud Event API,
and emits:

- `research/run.requested` events for Act 1 durable agent traces.
- seeded feedback instructions that the agent turns into
  `research/feedback.recorded` events after it knows the real Cloud run ID, so
  Act 2 positive/negative scores attach to the durable run.
- `research/experiment.requested` events for Act 3 model A/B test data. Each
  experiment event carries a `corpusRuns` window with the Act 2 feedback signal
  and score from the same seeded batch, so the experiment output can point back
  to scored research-agent runs.

Preview the exact pattern without sending anything:

```bash
```

Useful knobs:

```bash
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

1. Seed research history locally or with the Cloud command above.
2. Open Inngest Runs on the right side.
3. In the loop demo at `/`, stay on the Run stage with both toggles armed.
4. Click `Run research agent`.
5. Narrate the 503 retry, then the sandbox result card.
6. Open the corresponding Inngest run/trace on the right; show the retried
   boundary and the sandbox steps.
7. Observe stage: open the trace link, then `Open Insights`.
8. A/B Test stage: click `Good`, open `Scores`; run the model A/B test and
   open the Experiment view.

Start each live conversation with:

> How are you keeping your agents reliable today, while the models and
> prompts keep changing underneath them?

Use the answer to route the demo: reliability pain stays in Run;
observability questions get the trace and Insights; evaluation-savvy visitors go
straight to A/B Test.

If the visitor is qualified or explicitly comparing evaluation/observability
options, end with the Patrick handoff from `docs/demo-talk-track.md` instead
of adding more screens. Use the event page calendar for the handoff:
[EVENT PAGE URL]. The goal is a useful follow-up, not a longer booth
monologue.

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
- If the cloud sandbox beat fails (403 `access_denied`, capacity), check
  `/api/demo/status` `sandbox.mode`. The demo falls back to the labeled
  simulated beat; narrate the beta caveat and keep the walkthrough moving.
- If production reset returns 401/403 from a browser interaction, that is
  expected. Use the local controls to reset the presenter state; server-side
  demo history reset is intentionally protected in production.
- If score history is empty after refresh, verify `INNGEST_INSIGHTS_SCORE_QUERY`.
  If it cannot be fixed before showtime, switch to the approved emergency
  fallback framing or recording.
- If Wi-Fi is unreliable, use the contingency recording. Keep the local
  dev-server path for internal rehearsal only unless a booth lead explicitly
  approves it as an emergency fallback.
