# Booth Demo Runbook

- Driver script: `docs/demo-talk-track.md`.
- One-page presenter card: `docs/driver-card.md`.
- Display and driver sign-off: `docs/booth-qa-checklist.md`.
- Fallback video: `docs/contingency-recording.md`.

## Event Context

- Event: [EVENT NAME], [DATES].
- Booth: [BOOTH #].
- Story: Unbreakable agents, invisible infra. A customer-support agent at `/`
  survives an order-API outage (durable execution), shows every step it took
  (observability), and is measured and split-tested (A/B testing).

## What Runs

| Piece | Where |
| --- | --- |
| Booth UI (five screens, 1920×1080 stage) | `src/components/booth/` |
| Scenario: tickets, steps, canned outputs | `src/content/support-demo.ts` |
| Screen copy (business and technical lines) | `src/content/booth-copy.ts` |
| Agent function, `support-agent` | `src/inngest/functions/support-agent.ts` |
| Metrics scorer, `support-agent-score-run` | `src/inngest/functions/support-score-run.ts` |
| Model split test, `support-agent-model-split-test` | `src/inngest/functions/support-experiment.ts` |
| API routes | `/api/support/{trigger,status,signal,experiment,experiment/status}` |

Events: `support/ticket.received`, `support/run.completed`,
`support/feedback.recorded`, `support/experiment.requested`.

## Timing Budget and Fallbacks

The booth never waits on a slow run. Budgets live in
`src/components/booth/useAgentRun.ts` and `useAbTest.ts`.

| Situation | Behaviour |
| --- | --- |
| Live run | About 8s: six canned-latency steps plus a 3s `RetryAfterError` on `lookup-order`. |
| Trigger fails or Inngest rejects the event | Immediate labelled replay. |
| No steps captured within 5s | Labelled replay. |
| Live run makes no progress for 25s | Labelled replay. |
| Split test | 8 runs at 50/50. If nothing is captured in 5s, or not all 8 land in 15s, it switches to the labelled simulation. |
| Vote | Optimistic on screen, then a receipt once the scorer's `attach-human-feedback-score` step is observed. If Inngest is unreachable it shows "Recorded on screen only". |

A replay (`src/lib/replay-timeline.ts`) has the same step names, timings,
503 and memoized replays as a live run, and always carries
`simulated: true`. The UI shows it as a coral **Replay** chip.

## Preflight

```bash
npm run lint
npm run typecheck
npm run demo:preflight
npm run demo:smoke-loop
```

**`demo:smoke-loop` is the gate that tests the demo you are actually giving.**
It triggers a real ticket and fails unless all of the following hold:

- Inngest executed the run.
- All six steps were recorded.
- `lookup-order` failed and recovered.
- Finished steps were replayed rather than re-run.
- The drafted reply parses.
- The vote reached Inngest.
- All 8 split-test runs landed within 15s.

It warns if the run took longer than the 20s booth budget.

`demo:preflight` checks configuration: the app is up, the serve endpoint
lists the three functions, and the mode and keys are right. It does not run
the demo.

For a JSON view of readiness:

```bash
curl http://localhost:3000/api/demo/status
```

## Local Dry Run

```bash
npm run dev
npm run inngest:dev        # APP_URL=http://localhost:<port> if Next picked another port
```

Open `http://localhost:3000` full screen. The local Inngest dashboard is at
`http://localhost:8288`, and `D` in the demo opens it on the current run.

To rehearse the fallback, stop `inngest:dev` and pick a ticket. The run
should replay within 5s with the Replay chip showing.

## Cloud Setup

Set these production environment variables:

```txt
DEMO_TARGET=cloud
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
INNGEST_ENCRYPTION_KEY        # optional
INNGEST_ENV                   # optional, defaults to production
INNGEST_API_KEY
NEXT_PUBLIC_INNGEST_DASHBOARD_URL
NEXT_PUBLIC_BOOTH_CTA_URL     # where the recap QR code points; default https://www.inngest.com/docs
NEXT_PUBLIC_DEMO_MODEL_CURRENT     # split test "current" model; default claude-opus-4.8
NEXT_PUBLIC_DEMO_MODEL_CHALLENGER  # split test "challenger" model; default gpt-5.5
OPENROUTER_API_KEY            # optional: a real model writes the reply
```

Notes:

- Leave `INNGEST_DEV` unset in production.
- `DEMO_TARGET=cloud` switches on the real `step.score` attach and
  `step.metadata`. `group.experiment` runs in both modes.
- `NEXT_PUBLIC_DEMO_MODEL_*` sets the two split-test models. The current
  model also labels the main run. They are labels only: quality and price
  are scripted by role, so the challenger always wins with better quality
  and lower cost. Two identical names fall back to a distinct default. These
  are inlined at build time, so redeploy after changing them, and check the
  pair with `demo:preflight`.
- With `OPENROUTER_API_KEY` set, only the "Draft reply" step calls the
  model. Check that it still fits the 20s budget with `demo:smoke-loop`.
- The Inngest app id is still `aie-research-agent-booth-demo`, kept so Cloud
  run history carries over. The function ids are new (`support-agent`,
  `support-agent-score-run`, `support-agent-model-split-test`), so re-sync
  the app after deploying.

Check the deployed app:

```bash
DEMO_BASE_URL=https://<domain> INNGEST_CLOUD_APP_ID=<cloud-app-id> npm run demo:cloud-ready
DEMO_BASE_URL=https://<domain> npm run demo:smoke-loop
```

Sync the serve endpoint manually if needed:

```bash
npx inngest-cli@latest api --prod sync-app \
  --app-id <cloud-app-id> \
  --url https://<domain>/api/inngest
```

## Sandboxes

The Sandboxes beat is not part of the support-agent story. The flag
(`NEXT_PUBLIC_DEMO_SANDBOX`), `src/lib/sandbox.ts`, and the
`/api/demo/status` entitlement probe remain, but no function calls
`step.sandbox` today.

## Booth QA

Complete `docs/booth-qa-checklist.md` on the actual booth TV before the
first shift.

## Fallback Recording

Record the 3-minute and 5-minute paths from `docs/contingency-recording.md`
and add the links here:

```txt
3-minute path:
5-minute path (Under the hood):
```

## Recovery

- **App works but no new Inngest runs.** Check the env vars and re-sync
  `/api/inngest`. The demo keeps working on Replay in the meantime.
- **Run consistently replays in cloud.** Check the event key (trigger
  `sent: false`), then whether the serve endpoint is synced (run never
  starts).
- **Wi-Fi unreliable.** Use the contingency recording.
