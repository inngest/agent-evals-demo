# Booth QA Checklist

Use this checklist for DEV-425 sign-off. The goal is to prove the split-screen
demo works on the actual presentation setups, not only in a local browser.

## Event Constraint

The live booth is `U-G26` and opens Monday, June 29, 2026 at 4 PM. Complete
Cloud readiness, hardware display QA, and driver sign-off before that first
booth shift.

## A/B Test Stage Sign-off

Run once per display before the shift. Each line has an observable result.

- [ ] `Good` adds a `research_human_feedback` row showing the run id, then a
      `step attach-research-human-feedback-score` receipt within ~10s.
- [ ] `Recommendation shipped` adds a `research_deferred_outcome` row with a
      `+21d` badge and **the same run id as the first row**. If the ids differ,
      stop: the deferred-scoring beat is the one claim that must be exact.
- [ ] `Run model A/B test` reaches `8 of 8 complete`, lists both variants with
      non-zero runs, and badges a winner.
- [ ] Quality bars are distinguishable from ~2m away.
- [ ] `Run again with <winner>` returns to the Run stage and starts a new run.
- [ ] The code pane follows each click: `Good` shows step.score, `shipped`
      shows defer(), `bakeoff` shows group.experiment.
- [ ] No `SIMULATED` banner anywhere while Inngest is reachable.

## Required Setups

| Setup | Target viewport | Window layout | Status |
| --- | --- | --- | --- |
| 32-inch monitor | Booth display resolution | App left, Inngest right, 50/50 | Not verified |
| 16-inch laptop | Native display, browser zoom 100% | App left, Inngest right, app can be 55/45 | Not verified |
| 14-inch laptop | Native display, browser zoom 100% | App left, Inngest right, app can be 60/40 | Not verified |
| Projector or mirrored display | Event AV resolution | App left, Inngest right, browser zoom adjusted once | Not verified |

Record the exact device, resolution, browser, and date when each row is
verified.

## Automated Local Baseline

As of June 13, 2026,
`DEMO_BASE_URL=http://localhost:3001 npm run demo:local-ready` passes against
the local app and local Inngest dev server. That run includes viewport QA for
1280, 920, 760, and 640px split-pane widths, including Result, Trace, Scores,
Code, code zoom, Act 1/2/3 controls, the Act 3 optimize view, and Demo
Controls.

This is supporting evidence only. It does not replace the physical device rows
above, because the booth sign-off still needs the real browser chrome, display
scaling, mirrored/projector behavior, and right-side Inngest Cloud dashboard.

## Preflight For Each Setup

1. Start with a clean demo state.
2. Confirm the app URL and Inngest dashboard URL are the final booth URLs.
3. Run:

   ```bash
   DEMO_BASE_URL=<demo-url> npm run demo:local-ready
   ```

   For the final deployed Cloud URL, run:

   ```bash
   DEMO_BASE_URL=<demo-url> INNGEST_CLOUD_APP_ID=<cloud-app-id> npm run demo:cloud-ready
   ```

   Run from a shell that also has `INNGEST_API_KEY` and
   `INNGEST_INSIGHTS_SCORE_QUERY` exported.

   Run the individual checks only while debugging:

   ```bash
   DEMO_BASE_URL=<demo-url> npm run demo:preflight
   DEMO_BASE_URL=<demo-url> npm run demo:smoke
   DEMO_BASE_URL=<demo-url> npm run demo:viewport
   ```

   The viewport QA script captures screenshots and a JSON report under
   `output/playwright/demo-viewport-qa/`. Those artifacts are ignored by git.

4. Seed history:

   ```bash
   DEMO_BASE_URL=<demo-url> DEMO_SEED_TOKEN=<token> npm run demo:seed
   ```

5. Open Inngest Runs filtered to the demo app/environment.
6. Keep an Inngest run detail or trace open in a second tab.

## App-Side Checks

Pass means there is no awkward clipping, overlap, hidden primary action, or
horizontal page scroll.

- Header shows `Inngest Booth Demo`, status, `Inngest`, and
  `Demo Controls`.
- `Ask agent`, `Run again`, and `Use sample query` fit in the agent card.
- `Run query` and `Save` remain visible above the SQL editor.
- Generated SQL is readable without covering buttons or tabs.
- Result, Trace, Scores, and Code tabs fit in one row.
- Results table remains readable with 10 rows.
- Scores panel shows current score, trend, source label, and behavior signals.
- Code tab is readable enough to point at `step.run`.
- Code tab zoom controls and Act 1/2/3 controls remain visible and usable.
- Act 3 code view can be opened to show the optimize/scoring seam.
- `Demo Controls` drawer fits on the screen and can be closed without
  obscuring the demo.
- Toasts do not cover the main action being narrated.

## Inngest-Side Checks

- Runs list shows seeded `write-query` history.
- Runs list shows `score-query-signal` activity after Save.
- Filters are set to the correct app/environment.
- Opening a run shows step-level detail for `generate-sql` and `run-query`.
- Retry demo shows the failure and recovery clearly enough to narrate.
- Metric event or Insights view is ready before the live walkthrough.

## Walkthrough Checks

Run both scripts from `docs/demo-talk-track.md`:

- 90-second loop completes without improvising missing screens.
- 2-3 minute walkthrough completes without resetting or changing windows.
- `Opus offline` retry path is visible and recovers.
- Save produces a metric signal.
- Reset clears local demo score state during rehearsal.
- The right-side Inngest view is used for trace/history/scoring context.

## Driver Checks

Before a driver is cleared for booth duty:

- Driver starts with "What are you using today to know if your agents are
  actually working in production?"
- Driver can route an evaluation-savvy visitor to Scores/Insights quickly.
- Driver can route a durability question to the retry recovery path.
- Driver can route an observability question to Inngest Runs and Trace.
- Driver can explain local seeded fallback versus Insights-backed history.
- Driver can offer the Patrick follow-up handoff without overextending the
  walkthrough.
- Driver knows when to switch to the fallback recording.

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
Driver sign-off:

Preflight:
Smoke:
Seed:

App-side result:
Inngest-side result:
Walkthrough result:
Patrick handoff result:
Calendar booking link ready:

Issues found:
Fixes required before booth:
Approved for booth:
```

## Known Non-Sign-Off States

- App works locally but Cloud preflight fails.
- Final live path score history source is `seeded` or `memory`.
- Inngest dashboard cannot show the actual demo app/environment.
- Split-screen only works after repeated resizing or browser zoom fiddling.
- There is no fallback recording.
