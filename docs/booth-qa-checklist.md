# Booth QA Checklist

Use this checklist for booth sign-off. The goal is to prove the demo works
on the actual booth display, not only in a local browser.

## Event Constraint

The live booth is `U-G26` and opens Monday, June 29, 2026 at 4 PM. Complete
Cloud readiness, display QA, and driver sign-off before the first shift.

## Automated Gate

Against the final booth URL:

```bash
DEMO_BASE_URL=<demo-url> npm run demo:preflight
DEMO_BASE_URL=<demo-url> npm run demo:smoke-loop
```

Both must pass. A smoke failure means the audience would be watching a
Replay.

## Display Sign-Off

The stage is a fixed 1920×1080 canvas scaled to the window, so layout does
not reflow. Check legibility and the chrome around it.

| Setup | Resolution | Status |
| --- | --- | --- |
| Booth TV (primary) | 1920×1080, browser full screen | Not verified |
| Backup laptop | Native, browser full screen | Not verified |
| Projector or mirrored display | Event AV resolution | Not verified |

Record the device, resolution, browser, and date when each row is verified.

## Console Checks

Run these checks once normally, then again with `U` on.

- [ ] **Empty state.** The inbox shows "Goes well" (3) and "Goes badly" (1), readable from 3m. The outage switch is on.
- [ ] **Run.**
  - [ ] Opening a ticket shows the customer message, then the activity rows one by one.
  - [ ] "Look up order" turns red with "Order API returned 503" and "Retrying in 3s".
  - [ ] It then turns green with "Recovered on retry".
  - [ ] "Read ticket" and "Look up customer" show "Cached".
- [ ] **Fits.** When the run completes, the whole thread (rows, reply, vote, "Reply sent") fits without scrolling at 1080p.
- [ ] **Outage off (`F`).** Every row goes straight to green, with no "Cached" badges.
- [ ] **Trace.** **View trace in Inngest** appears mid-run and opens this exact run, with the 503 attempt, in a separate window.
- [ ] **Vote.** 👍 shows "Recorded in Inngest". In the dashboard, `csat` = 1 is on that run.
- [ ] **Scores in Inngest.** About 15s after a good run, `first_contact_resolution` = 1. `policy_compliance`, `cost_per_ticket` and `escalated_to_human` are on the run. The console shows no scores.
- [ ] **Sandboxed refund (`3`).** A "Compute refund" row with a **Sandboxed** pill appears before Draft reply and shows "$49.00 refund" ("simulated locally" off Cloud). Policy passes and the reply is sent. In Cloud, the trace shows the create, `compute-refund` and destroy sandbox steps.
- [ ] **Missed reply (`4`).** The reply explains the charge instead of cancelling, with no warning on screen. In Inngest, `support_reply_quality` = 0.38.
- [ ] **Split test.**
  - [ ] `S` then `S` routes 8 tickets and reaches "8 of 8 tickets scored".
  - [ ] **Compare in Inngest** opens the experiment (Cloud).
- [ ] **With `U`.** The drawer shows `step.run` while the agent works, then the business scores (`step.score` + `waitForEvent`) once it completes, then `group.experiment` while the split test is open. The popover sits beside the drawer, not over it.
- [ ] **QR code.** It scans on a phone and opens `NEXT_PUBLIC_BOOTH_CTA_URL`.
- [ ] **Honesty.** There's no "Offline replay" pill while Inngest is reachable.
- [ ] **Fallback.** With Inngest stopped, opening a ticket replays within 5s, and ticket 4 replays both turns. The "Offline replay" pill shows, with no Inngest links.
- [ ] **Reset.** `R` clears the thread, the inbox badges and the split test.

## Driver Checks

Before a driver is cleared for booth duty:

- [ ] Opens with the talk-track question, and picks the path by audience.
- [ ] Moves from the app to the Inngest trace within the first minute.
- [ ] Narrates a Replay honestly.
- [ ] Offers the Patrick handoff without extending the demo.
- [ ] Knows when to switch to the fallback recording.

## Sign-Off Template

```txt
Setup:
Device:
Resolution:
Browser:
Demo URL:
Inngest environment:
Date:
Driver:

Preflight:
Smoke:
Screen checks:
Timing:
Fallback rehearsal:
QR scan:

Issues found:
Approved for booth:
```

## Known Non-Sign-Off States

- The app works locally but Cloud preflight or smoke fails.
- The live run regularly exceeds the 20s budget and falls back to Replay.
- There is no fallback recording.
