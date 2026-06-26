# Inngest Insights Score Query

The durable `score-query-signal` function emits `app/query.scored` events
specifically so the Scores panel can load historic quality data from Inngest
Insights once the app is deployed to Cloud.

## Event Contract

Event name:

```txt
app/query.scored
```

Payload fields:

```ts
{
  runId: string;
  signal: "saved" | "discarded";
  score: number;
  scoredAt: string;
  source: "booth-demo";
}
```

The app's `/api/score` endpoint accepts Insights rows with any of these aliases:

| Required value | Accepted row fields |
| --- | --- |
| run ID | `runId`, `run_id`, `id` |
| score | `score` |
| scored timestamp | `scoredAt`, `scored_at`, `timestamp`, `ts` |
| behavior signal | `signal` |

## Generate The Cloud Query

Local Inngest OSS does not implement Insights, so this must run against Cloud
after `INNGEST_API_KEY` is available.

First inspect Cloud tables and event schemas:

```bash
npx inngest-cli@latest api --prod get-insights-tables
npx inngest-cli@latest api --prod get-insights-event-schemas --limit 100
```

Then ask Inngest to draft the query:

```bash
npx inngest-cli@latest api --prod query-insights-prompt \
  --prompt "For the app/query.scored event in the agent-evals-booth-demo app, return the most recent 60 score events for source booth-demo. The result must have columns runId, signal, score, and scoredAt. Order by scoredAt ascending."
```

Inspect the generated SQL before running it. It should filter to:

- event name `app/query.scored`
- source `booth-demo`
- the deployed demo app/environment
- a reasonable recent time window or limit

## Validate The Query

Run the generated SQL directly:

```bash
npx inngest-cli@latest api --prod query-insights \
  --query '<generated SQL>'
```

Or set it locally and run the reusable validator:

```bash
export INNGEST_INSIGHTS_SCORE_QUERY='<generated SQL>'
npm run demo:insights-check
```

The response rows must include:

```json
{
  "runId": "example-run-id",
  "signal": "saved",
  "score": 0.92,
  "scoredAt": "2026-06-12T20:00:00.000Z"
}
```

For final booth readiness, the reusable validator requires at least one
`saved` row and at least one `discarded` row so the live story can truthfully
show both positive and negative behavior signals.

When the query returns the right row shape, set it in Vercel:

```bash
vercel env add INNGEST_INSIGHTS_SCORE_QUERY production
```

If the query has also been saved in the Cloud Insights UI, set the saved-query
browser URL so the app's Insights buttons open it directly:

```bash
vercel env add NEXT_PUBLIC_INNGEST_INSIGHTS_URL production
```

Then redeploy and run:

```bash
DEMO_BASE_URL=https://<vercel-domain> npm run demo:preflight
```

The deployed preflight must report `source=inngest-insights` for score history.
If it reports `seeded` or `memory`, the app is still falling back to local/demo
data and the final booth gate should fail.
