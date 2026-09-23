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

## Screen-by-Screen Checks

Run the checks on the business path first, then again with `U` on.

- [ ] **Start.** Three ticket cards are readable from 3m, the focused card
      has a coral border, and the HUD says `OUTAGE ON`.
- [ ] **Durable.**
  - [ ] "Look up order" turns coral, and the callout counts down
        "Inngest retries in 3s".
  - [ ] It turns ink with "Retried · ok".
  - [ ] Steps 1-2 show "Not re-run".
  - [ ] The reply bubble appears, then "Sent to …".
- [ ] **Durable, outage off (`F`).** Every step shows a duration, and the
      caption reads "Every step ran once".
- [ ] **Observe.**
  - [ ] The 503 segment and the dashed "Waiting to retry" gap are visible.
  - [ ] All six rows fit with no clipping.
  - [ ] Totals show time, tokens, and cost.
- [ ] **Observe with `U`.** Each row shows `out:` and `in:` lines, and
      "Open this run in Inngest" opens the trace in a separate window.
- [ ] **A/B test.**
  - [ ] `1` shows "Metric recorded on this run · support_human_feedback = 1"
        within ~10s.
  - [ ] `Space` `Space` fills both lanes run by run.
  - [ ] A winner is badged, and the delta line reads
        "+N pts quality, −N% cost".
- [ ] **A/B test with `U`.** The drawer shows `step.score`, then
      `group.experiment` after `Space`.
- [ ] **Recap.** The three pillars carry this run's numbers, and the monthly
      figure matches the split test.
- [ ] **QR code.** It scans on a phone and opens `NEXT_PUBLIC_BOOTH_CTA_URL`.
- [ ] **Honesty.** No Replay chip anywhere while Inngest is reachable.
- [ ] **Fallback.** Stop Inngest. Picking a ticket replays within 5s with
      the Replay chip, and the split test is tagged Replay.
- [ ] **Timing.** The business path is ≤ 3:30 and the `U` path is ≤ 5:00 on
      the HUD timer.
- [ ] **Reset.** `R` returns to Start with all state cleared.

## Driver Checks

Before a driver is cleared for booth duty:

- [ ] Opens with the talk-track question, and picks the path by audience.
- [ ] Uses the keyboard only; never needs the mouse.
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
Timing (business / U):
Fallback rehearsal:
QR scan:

Issues found:
Approved for booth:
```

## Known Non-Sign-Off States

- The app works locally but Cloud preflight or smoke fails.
- The live run regularly exceeds the 20s budget and falls back to Replay.
- There is no fallback recording.
