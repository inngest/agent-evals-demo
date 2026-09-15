# Contingency Recording Plan

Use this for MAR-166. The fallback video should be boringly reliable: the exact
same split-screen story, captured once the Cloud path is ready.

## Goal

Create two recordings:

- Captioned 90-second loop for booth display or walk-by recovery.
- 2-3 minute driven demo for a presenter fallback.

Both recordings should show the app on the left and Inngest on the right.
The TV loop should pair with the booth banner line `Expected the ~~un~~expected`
when that banner is in use.

## Do Not Record Until

- Final demo URL passes `npm run demo:preflight`.
- Final demo URL passes `npm run demo:smoke`.
- Cloud history is seeded for the real demo app/environment.
- Inngest dashboard filters are set and ready.
- The talk track in `docs/demo-talk-track.md` is approved.
- Scores history is backed by `inngest-insights` for the primary recording. If
  the recording uses seeded fallback, label it as the emergency fallback take in
  the narration and file name.

## Capture Setup

- Browser zoom: 100% unless booth QA says otherwise.
- Layout: app left, Inngest right.
- Aspect ratio: capture the same shape expected on the booth screen.
- Audio: record one clean narrated version and one silent loop if time allows.
- Captions: required for the 90-second booth loop because it may run silently.
- Cursor: leave visible for the driven demo, hide or minimize movement for the
  loop.
- Notifications: off.
- Tabs: only the demo app, Inngest Runs, and one Inngest trace/details tab.

## 90-Second Loop Shot List

1. Start on seeded split-screen view.
2. Click `Ask agent`.
3. Show generated SQL and result rows.
4. Show Inngest Runs/history on the right.
5. Open a run/trace and point at durable steps.
6. Click `Save`.
7. Open `Scores`.
8. End on Inngest score-signal/history view.

For the silent loop, keep captions short and product-facing:

- Durable agent run
- Trace every step
- Retry recovered
- Saved behavior signal
- Score history
- Optimize from production behavior

Narration:

> This is the loop: run the agent durably, observe every step, and turn real
> user behavior into conversion signals.

## 2-3 Minute Driven Shot List

1. Start from the canonical prompt.
2. Run the happy path.
3. Show Inngest `write-query` run and step trace.
4. Turn on `Opus offline`.
5. Run again and show retry recovery.
6. Open Code and point at `step.run`.
7. Save the query.
8. Show Scores in the app.
9. Show score-signal or Insights-backed history in Inngest.
10. End with the buyer bridge from `docs/demo-talk-track.md`.

## File Naming

```txt
aiewf-agent-evals-loop-90s-YYYY-MM-DD.mp4
aiewf-agent-evals-driven-3m-YYYY-MM-DD.mp4
```

## Review Checklist

- Video shows the actual final demo URL.
- Inngest side is legible.
- No local-only dev server URL appears unless this is explicitly the fallback
  version.
- No secrets, tokens, browser notifications, internal docs, or unrelated tabs
  appear.
- Narration does not claim final Scores dashboard/API readiness unless product
  has confirmed it.
- The fallback can be played without the presenter needing to explain missing
  setup.

## Storage Handoff

After recording, add the final video links to:

- MAR-166.
- `docs/booth-runbook.md`.
- The Linear project status update for final booth readiness.
