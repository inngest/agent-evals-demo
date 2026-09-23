# Inngest Booth Demo — Unbreakable agents, invisible infra.

This repo holds the booth demo for [EVENT NAME] ([DATES], booth [BOOTH #]).

`/` is a full-screen, keyboard-driven booth demo: an AI **customer-support
agent** that survives an order-API outage (**durable execution**), shows every
step it took (**observability**), and gets measured and split-tested across
two models (**A/B testing**). It fits in 3 minutes for a business visitor, or
5 with "Under the hood" (`U`) on for engineers. Both get the same five screens:

```
Start (pick a ticket) → Durable → Observe → A/B test → Recap (ROI + QR)
```

The screens render on a fixed 1920×1080 stage that scales to the display, so
the layout is identical on a TV, laptop, or projector.

**What's real:**

- the Inngest function (`support-agent`) and its six durable steps;
- the 503 retry and memoized replay;
- the captured step timeline;
- `group.experiment` traffic splitting;
- in cloud mode, `step.score` and run metadata.

**What's canned:** the tickets, the customer and order data, the reply
(unless OpenRouter is configured), the per-model quality scores, and the
model pricing.

**When a live run can't make the booth budget**, the UI switches to a
labelled replay and shows a "Replay" chip; it never passes a replay off as
live. See `docs/booth-runbook.md` for the timing budget.

- Driver script: `docs/demo-talk-track.md`.
- Printable card: `docs/driver-card.md`.
- Booth ops: `docs/booth-runbook.md`.

## Sandboxes (beta) are off by default

The support-agent story does not use Sandboxes. The flag
(`NEXT_PUBLIC_DEMO_SANDBOX`), `src/lib/sandbox.ts`, and the `/api/demo/status`
entitlement probe remain for a future beat, but no function calls
`step.sandbox` today.

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

Open `http://localhost:3000` full screen. Picking a ticket sends a real
`support/ticket.received` event; press `D` during the demo to open that run in
the Inngest dev server (`http://localhost:8288`).

## Cloud mode (`DEMO_TARGET`)

The demo has two modes, controlled by a single env flag, `DEMO_TARGET`. It is read
in exactly one place, `src/lib/demo-target.ts`, which exports `DEMO_TARGET` and
`isCloud`. Nothing else reads `process.env.DEMO_TARGET` directly.

| `DEMO_TARGET` | Behavior |
|---------------|----------|
| `local` (default, or unset) | Dev-server path. The agent, retries, timeline and `group.experiment` are real; `step.score` and `step.metadata` are replaced by same-named `step.run` steps so the timeline looks identical. |
| `cloud` | Emits the **real** Inngest scoring primitives so scores and experiments land in the Inngest Cloud dashboard. Registers against Cloud (`isDev=false`, keys from env). |

In `cloud` mode the app emits real primitives at these call sites:

- **Run-level metrics:** `src/inngest/functions/support-score-run.ts` attaches
  `support_reply_quality`, `support_cost_usd`, and the visitor's
  `support_human_feedback` vote to the agent run with `step.score(...)`. This
  requires `scoreMiddleware()` on the client, which is registered
  unconditionally in `src/inngest/client.ts`.
- **Run metadata:** `src/inngest/functions/support-agent.ts` writes
  `step.metadata(...)` for Insights to group by.
- **Split test:** `src/inngest/functions/support-experiment.ts` runs a
  `group.experiment(...)` (claude-opus-4.8 vs gpt-5.5, 50/50) and scores each
  variant with `inngest.score.experiment(...)`. This runs in both modes.

The faked branch is always the fallback. Every real-primitive call site is wrapped
`if (isCloud) { ...real... } else { ...existing faked... }`, and the faked branch is
unchanged from the local build.

`DEMO_TARGET` is orthogonal to `INNGEST_DEV`. `local` implies the dev server; `cloud`
sets `isDev=false`. The client derives `isDev` from `isCloud` (`isDev: !isCloud`), so
**do not also set `INNGEST_DEV` in cloud mode** — let the flag drive it.

### SDK pin for cloud mode

Real primitives (scores, experiments, sandboxes) require `inngest >= 4.20.0`
(pinned in `package.json`). The old `inngest@pr-1521` pin is obsolete;
4.20.0 ships the scoring primitives plus the sandbox middleware.

### Running cloud mode

1. Set `DEMO_TARGET=cloud`, `INNGEST_EVENT_KEY`, and `INNGEST_SIGNING_KEY`. Leave
   `INNGEST_DEV` unset/false.
2. Deploy to Render (see "Production Inngest" below) and sync the `/api/inngest`
   serve endpoint with Inngest Cloud.
3. Prove the deployed demo end to end (a real run, the vote metric, and the
   split test):

   ```bash
   DEMO_BASE_URL=https://<render-domain> npm run demo:smoke-loop
   ```

The Cloud dashboard then shows `support-agent` runs with attached
`support_*` scores, and the `support-agent-model-split-test` experiment with
per-variant scores.

## Production Inngest

The app is wired for Inngest Cloud the same way the swag-store apps are:

- `INNGEST_EVENT_KEY` sends events from API routes.
- `INNGEST_SIGNING_KEY` authenticates the `/api/inngest` serve endpoint.
- `OPENROUTER_API_KEY` is optional. When set, the support agent's
  `call-llm-draft-reply` step calls [OpenRouter](https://openrouter.ai) for
  real (real text, real token counts); unset, it stays mocked. `OPENROUTER_MODEL` overrides the default
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

## Deploy to Render

The repo ships a Render blueprint (`render.yaml` at the repo root) that
creates the Web Service with everything below preconfigured: Node runtime,
`npm ci && npm run build` build, `npm run start` start command, and
`/api/health` as the health check. The production env vars are split
between blueprint defaults (`DEMO_TARGET=cloud`, the Inngest API base, the
dashboard URL) and prompted secrets.

### Create the service (blueprint)

1. Push this repo to GitHub.
2. In the Render dashboard: **New → Blueprint**, select the repo. Render
   reads `render.yaml` and prompts for the secret values:
   - `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (required, from your Inngest
     Cloud environment's "Keys" page)
   - The rest are optional (`INNGEST_ENCRYPTION_KEY`, `INNGEST_ENV`,
     `INNGEST_API_KEY`,
     `NEXT_PUBLIC_INNGEST_RUNS_URL`, `NEXT_PUBLIC_INNGEST_INSIGHTS_URL`) —
     leave blank to skip.
3. Apply. First build takes a few minutes; the service goes live once
   `/api/health` passes the health check.

### Create the service (manual, without the blueprint)

**New → Web Service**, connect the repo, then:

- Runtime: Node
- Build command: `npm ci && npm run build`
- Start command: `npm run start`
- Health check path: `/api/health` (a static, zero-I/O liveness route). Do
  **not** point it at `/api/demo/status`: that endpoint calls the Inngest API,
  so a slow uplink would fail the check, restart the instance, and wipe the
  in-memory step timelines mid-demo.
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
DEMO_BASE_URL=https://<render-domain> npm run demo:smoke-loop
```

For non-secret deployment diagnostics, inspect:

```txt
https://<render-domain>/api/demo/status
```

To see the current production handoff blockers, use:

```bash
npm run demo:cloud-ready
```

To smoke-test Cloud auth from localhost, export the same Cloud keys locally
and run:

```bash
npm run dev:cloud
```

### Booth QR code

`NEXT_PUBLIC_BOOTH_CTA_URL` sets where the recap screen's QR code points
(default `https://www.inngest.com/docs`). It is read at build time, so
redeploy after changing it.
