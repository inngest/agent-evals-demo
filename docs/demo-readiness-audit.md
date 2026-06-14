# Demo Readiness Audit

Last updated: June 14, 2026

This audit maps the AI Engineer World's Fair demo goal to current evidence.
It is intentionally stricter than the talk track: a requirement is only marked
ready when there is current evidence that proves it.

## Source Scope

- `PRD.md`: durable -> observable -> optimize; real Inngest workflow; mocked
  LLM/query data; score/eval seam; 3-minute booth interaction should create a
  Patrick follow-up opportunity for qualified visitors.
- Slack feedback: trace and scoring should be shown on the Inngest dashboard
  side of the split-screen demo.
- Slack launch planning: Scores dashboard/API work is still evolving, so avoid
  overclaiming final product readiness.
- Slack event planning: one encompassing Insights-agent demo should carry the
  durable -> observable -> optimize story; Sterling planned an engineering
  walkthrough for Monday, June 15, 2026, with booth training no earlier than
  mid next week.
- Slack event logistics: booth `U-G26` opens Monday, June 29, 2026 at 4 PM;
  June 29 is also the evals soft-launch booth day in planning, so demo sign-off
  must land before that first shift.
- Notion outline: the demo should support a live booth path, a captioned TV
  loop, audience-adaptive routing, 2-3 approved drivers, and a one-page booth
  runbook.
- GitHub: `SterlingChin/agent-evals-demo` currently has no open PRs or issues.
- Vercel: `https://agent-evals-demo.vercel.app` exists from the original POC,
  but current preflight/smoke checks fail against it because it does not include
  the new status/seed APIs and is missing production Inngest env configuration.
- Current Vercel handoff check: the project is linked and readable, but
  production env vars are still missing for `INNGEST_EVENT_KEY`,
  `INNGEST_SIGNING_KEY`, `INNGEST_API_KEY`, `DEMO_SEED_TOKEN`, and
  `NEXT_PUBLIC_INNGEST_DASHBOARD_URL`.
- Linear: AIEWF Agent Evals Conference Demo project tracks Cloud deploy, Cloud
  seed history, Insights scores, split-screen QA, story dry runs, and fallback
  recording.
- Local verification: lint, build, preflight, smoke, seeded smoke, and
  Playwright viewport QA passed against `http://localhost:3001` on
  June 13, 2026.

## Current Readiness Summary

The demo is internally walkable and locally well verified. It is not yet ready
to run live at the booth as the final Cloud-backed demo.

## Requirement Matrix

| Requirement | Evidence | Status |
| --- | --- | --- |
| Insights-style app shell | App renders SQL editor, agent card, Result, Trace, Scores, Code, Demo Controls | Locally ready |
| Real Inngest durable workflow | `/api/inngest` exposes `write-query` and `score-query-signal`; local preflight passes | Locally ready |
| Retry/recovery story | Demo Controls include `Opus offline` and retry count; Inngest run can show retry recovery locally | Locally ready, Cloud pending |
| Split-screen ergonomics | `npm run demo:viewport` passes at 1280, 920, 760, and 640px panes, including Result, Trace, Scores, Code, Act 1/2/3 code controls, and Demo Controls | Locally ready, physical QA pending |
| Historic run list | `/api/demo/seed` and seeded smoke create local happy-path runs, retry-demo runs, saved score signals, and discarded score signals; seed/reset ops are token-protected in production | Locally ready, Cloud pending |
| Score/eval signal | Save emits `app/query.saved`; durable function emits downstream `app/query.scored` | Locally ready, Cloud pending |
| Inngest dashboard product side | Local dev server can show runs/functions; Cloud dashboard not configured yet | Pending |
| Real Insights-backed score history | Event contract, query handoff, and `npm run demo:insights-check` validator exist | Pending Cloud API auth/query validation |
| Operator port/env discovery | `npm run demo:doctor` detects the running app URL, checks local Inngest, and reports missing Cloud inputs without exposing secrets | Locally ready |
| Local reset reliability | `demo:smoke` verifies `/api/demo/reset` clears local score state; mock score history persists through a dev-only temp-file fallback to keep route contexts consistent | Locally ready |
| Talk track | `docs/demo-talk-track.md` exists and is mirrored into Linear | Ready for stakeholder review |
| Booth runbook | `docs/booth-runbook.md` covers preflight, deploy, seed, walkthrough, recovery | Draft ready, final URLs pending |
| Booth driver card | `docs/driver-card.md` covers the PRD-locked opener, audience routing, live paths, safe claims, Patrick handoff, recovery, and driver sign-off | Draft ready, driver sign-off pending |
| Cloud auth request | `docs/cloud-auth-request.md` lists the exact human-provided secrets/IDs; `npm run demo:cloud-handoff` prints the resumable command checklist after auth/env gaps are detected | Ready, credentials pending |
| Physical booth QA | `docs/booth-qa-checklist.md` exists; automated viewport QA passed | Pending actual hardware sign-off |
| Fallback recording | `docs/contingency-recording.md` exists and now calls for a captioned TV loop | Pending final Cloud path and recording |
| Deployment handoff | Repo has local changes; GitHub has no PR/issues; `docs/review-handoff.md` has PR title/body/checklist | Missing tracker item added |
| Cloud deploy handoff | `npm run demo:cloud-ready` runs deploy prechecks, syncs the Cloud app, optionally seeds Cloud history, retries Insights validation after a seed, then runs final handoff, preflight, smoke, and viewport QA for the deployed URL | Handoff ready, secrets/fresh deploy pending |

## Proven Local Commands

These have passed against the local app on `http://localhost:3001`:

```bash
npm run lint
npm run build
npm run demo:doctor
DEMO_BASE_URL=http://localhost:3001 npm run demo:local-ready
DEMO_BASE_URL=http://localhost:3001 npm run demo:preflight
DEMO_BASE_URL=http://localhost:3001 npm run demo:smoke
DEMO_BASE_URL=http://localhost:3001 DEMO_SMOKE_SEED=1 DEMO_SMOKE_SEED_COUNT=2 npm run demo:smoke
DEMO_BASE_URL=http://localhost:3001 npm run demo:viewport
```

The smoke checks now include a localhost-only reset assertion. Deployed reset
protection is still covered by preflight's unauthenticated seed/reset lock
checks.

`npm run demo:viewport` writes screenshots and a JSON report under:

```txt
output/playwright/demo-viewport-qa/
```

The directory is ignored by git.

The viewport QA now explicitly verifies the Code tab's zoom controls, Act 1,
Act 2, Act 3 controls, and the Act 3 optimize view so the PRD's progressive
code walkthrough is usable in compact split panes.

## Unproven Or Blocked

- Vercel production env vars are not configured for the linked project.
- Inngest Cloud API auth is missing in this shell.
- `docs/cloud-auth-request.md` now documents the exact credential handoff, but
  no credentials have been provided in this shell.
- Production seed/reset protection is implemented locally but not proven on a
  fresh deployment yet.
- Existing POC URL `https://agent-evals-demo.vercel.app` is not booth-ready:
  deployed preflight fails with HTTP 404 for `/api/demo/status`, HTTP 500 for
  `/api/inngest`, HTTP 405 for score history, and HTTP 404 for seed lock.
- `npm run demo:cloud-handoff` deploy phase fails until local
  `INNGEST_API_KEY` and required Vercel production env vars exist. It now
  prints the exact local exports, Vercel env add commands, deploy command, and
  final gate to run next.
- `npm run demo:cloud-ready` rejects missing/localhost/non-HTTPS URLs before
  Cloud work. Against the existing public POC URL, it now runs the deploy
  handoff precheck first and reports the stale deployment plus missing local
  `INNGEST_API_KEY` and required Vercel production env vars before any app sync
  or seed attempt.
- The deployed `/api/inngest` endpoint has not been synced/registered in Cloud.
  Final `demo:cloud-ready` will now run `sync-app` when Cloud auth and app ID
  are present.
- Cloud run history has not been seeded.
- `INNGEST_INSIGHTS_SCORE_QUERY` has not been generated and validated against
  Cloud event data. `npm run demo:insights-check` is now the reusable row-shape
  validator once Cloud auth and query SQL exist.
- The Cloud Scores panel has not proven `source=inngest-insights`; deployed
  preflight now fails this condition instead of treating it as a warning.
- Engineering walkthrough feedback from Monday, June 15, 2026 has not been
  collected yet, and booth training is not scheduled against a final Cloud path.
- Approved booth drivers have not been assigned or signed off.
- Actual 32-inch, 16-inch, 14-inch, and projector/mirrored display QA has not
  been signed off.
- The captioned TV loop and presenter fallback recordings do not exist yet.
- The local implementation has not been published to GitHub for review/deploy.

## Missing Item Added

Add a DevRel issue to publish the local demo implementation:

- Use `docs/review-handoff.md` for the suggested branch, PR title/body,
  reviewer focus, verification, and known remaining work.
- Stage the intended local changes.
- Create a branch.
- Commit the demo-readiness work.
- Push and open a draft PR.
- Use the PR or merged branch as the deploy source for DEV-424.

This is separate from Cloud secrets. Without a published branch or PR, the
work is still only present on this machine.

## Go/No-Go Rule

The demo is booth-ready only when all of these are true:

- Final deployed URL passes `demo:cloud-ready`.
- Inngest Cloud Runs shows the demo app, `write-query`, `score-query-signal`,
  retry recovery, and seeded history.
- Scores history is proven as `inngest-insights`; seeded fallback wording is
  only acceptable for contingency, not final booth readiness.
- Lauren/Riley/DevRel have completed a dry run using the talk track.
- 2-3 booth drivers have completed the driver sign-off from
  `docs/driver-card.md`.
- Drivers can execute the Patrick handoff for qualified visitors without
  overstating Scores/Insights readiness.
- Physical display QA is signed off.
- Fallback recordings are linked in the runbook and Linear.
