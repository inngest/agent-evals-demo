# Agent Evals Booth Demo

This demo follows `PRD.md`: a Next.js App Router app with a real Inngest v4 workflow and mocked LLM, query, and scoring surfaces.

For dry-run and booth ops, use `docs/booth-runbook.md`. For the Lauren/Riley
stakeholder walkthrough and booth driver script, use `docs/demo-talk-track.md`.
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
- `INNGEST_API_KEY` + `INNGEST_INSIGHTS_SCORE_QUERY` are optional. When both
  are present, `/api/score` reads the Scores panel from Inngest Insights.
  Without them, the panel uses deterministic seeded demo signals. See
  `docs/insights-score-query.md` for the event contract and Cloud query setup.
- `DEMO_SEED_TOKEN` protects `/api/demo/seed` and `/api/demo/reset` in
  production. Local dev can use the in-app controls without a token; deployed
  seeding should use the runbook command. The token is ignored outside
  production so copied Cloud env vars do not break local rehearsals.

For Vercel production, set these environment variables on the project and leave
`INNGEST_DEV` unset:

```txt
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
INNGEST_ENCRYPTION_KEY=
INNGEST_ENV=
INNGEST_API_KEY=
INNGEST_API_BASE_URL=https://api.inngest.com
INNGEST_INSIGHTS_SCORE_QUERY=
DEMO_SEED_TOKEN=
NEXT_PUBLIC_INNGEST_DASHBOARD_URL=https://app.inngest.com
NEXT_PUBLIC_INNGEST_RUNS_URL=
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
