# Cloud Auth Request

Use this when handing the final Cloud setup to someone with Inngest Cloud and
Vercel production access. This file should never contain actual secret values.

## Why This Is Needed

The local demo is verified, but the final conference path needs authenticated
Cloud operations:

- Add production env vars to the linked Vercel project.
- Deploy the current branch.
- Sync `/api/inngest` with Inngest Cloud.
- Seed Cloud run history.
- Generate and validate the Inngest Insights score query.
- Run `npm run demo:cloud-ready` against the final deployed URL.

Codex can run those commands once credentials exist in the shell or in Vercel,
but it cannot create, recover, or infer account secrets without an authenticated
human session.

## Minimum Human Input

Provide these values in the local shell used for the handoff:

```bash
export INNGEST_API_KEY='<redacted>'
export INNGEST_EVENT_KEY='<redacted>'
export INNGEST_SIGNING_KEY='<redacted>'
export DEMO_SEED_TOKEN='<generated-random-token>'
export NEXT_PUBLIC_INNGEST_DASHBOARD_URL='https://app.inngest.com'
```

After the first fresh deploy and Inngest app registration, also provide:

```bash
export DEMO_BASE_URL='https://<vercel-domain>'
export INNGEST_CLOUD_APP_ID='<cloud-app-id>'
```

After Cloud score events exist, provide or let Codex generate and validate:

```bash
export INNGEST_INSIGHTS_SCORE_QUERY='<validated-sql>'
```

Optional:

```bash
export INNGEST_ENCRYPTION_KEY='<redacted>'
export INNGEST_ENV='<environment-name>'
export INNGEST_API_BASE_URL='https://api.inngest.com'
export NEXT_PUBLIC_INNGEST_RUNS_URL='<filtered Inngest Runs URL>'
```

Do not set `INNGEST_DEV` in Vercel production.

## What Codex Can Run After Auth

For the current status and resumable command checklist, run:

```bash
npm run demo:cloud-handoff
```

That check is non-secret: it reports which local exports and Vercel production
environment variables are still missing, then prints the next commands to run.

```bash
npm run demo:cloud-handoff

printf '%s' "$INNGEST_EVENT_KEY" | npx vercel env add INNGEST_EVENT_KEY production
printf '%s' "$INNGEST_SIGNING_KEY" | npx vercel env add INNGEST_SIGNING_KEY production
printf '%s' "$INNGEST_API_KEY" | npx vercel env add INNGEST_API_KEY production
printf '%s' "$DEMO_SEED_TOKEN" | npx vercel env add DEMO_SEED_TOKEN production
printf '%s' "$NEXT_PUBLIC_INNGEST_DASHBOARD_URL" | npx vercel env add NEXT_PUBLIC_INNGEST_DASHBOARD_URL production
# Optional, but recommended for the booth once the filtered Runs URL is known:
printf '%s' "$NEXT_PUBLIC_INNGEST_RUNS_URL" | npx vercel env add NEXT_PUBLIC_INNGEST_RUNS_URL production

npx vercel --prod

npx inngest-cli@latest api --prod sync-app \
  --app-id "$INNGEST_CLOUD_APP_ID" \
  --url "$DEMO_BASE_URL/api/inngest"

DEMO_BASE_URL="$DEMO_BASE_URL" \
DEMO_SEED_TOKEN="$DEMO_SEED_TOKEN" \
npm run demo:seed
```

Then generate and validate the Insights query using
`docs/insights-score-query.md`, add it to Vercel, redeploy, and run:

```bash
DEMO_BASE_URL="$DEMO_BASE_URL" \
INNGEST_CLOUD_APP_ID="$INNGEST_CLOUD_APP_ID" \
npm run demo:cloud-ready
```

For a final gate that also refreshes history, add `DEMO_CLOUD_READY_SEED=1`.
The command syncs Cloud before seeding and retries the Insights check while
durable score events land.

## If Using Browser Automation

Playwright or the in-app browser can help navigate Inngest Cloud and Vercel,
but they still require a human-authenticated session. If SSO, 2FA, or key
creation prompts appear, a human must complete those steps or provide the
resulting values in the shell.

## Current Expected Failure Without Auth

Before the values above are present, this is expected:

```bash
npm run demo:cloud-handoff
```

Expected failures:

- Missing local `INNGEST_API_KEY`.
- Missing Vercel production `INNGEST_EVENT_KEY`.
- Missing Vercel production `INNGEST_SIGNING_KEY`.
- Missing Vercel production `INNGEST_API_KEY`.
- Missing Vercel production `DEMO_SEED_TOKEN`.
- Missing Vercel production `NEXT_PUBLIC_INNGEST_DASHBOARD_URL`.

`INNGEST_INSIGHTS_SCORE_QUERY`, `DEMO_BASE_URL`, `INNGEST_API_KEY`, and
`INNGEST_CLOUD_APP_ID` become hard requirements for the final
`demo:cloud-ready` gate.
