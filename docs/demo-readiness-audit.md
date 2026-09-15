# Demo Readiness Audit

Last updated: September 11, 2026 (loop demo rewrite)

This audit maps the [EVENT NAME] booth demo goal to current evidence. It is
intentionally stricter than the talk track: a requirement is only marked
ready when there is current evidence that proves it.

## Source Scope

- Booth positioning (Sept 2026): primary tagline "Unbreakable agents,
  invisible infra."; secondary pillars Durability / Observability /
  A/B Testing / Sandboxes (beta). Story is a loop: Run -> Observe -> A/B Test.
- The loop demo at `/` uses the research agent scenario with a real Inngest
  function, optional real sandbox steps (cloud, beta-gated), and a labeled
  simulated sandbox beat locally.
- Legacy surfaces are preserved at `/research`, `/booth-story`, and
  `/booth-control` for rehearsal and comparison; they are not booth
  surfaces.
- SDK upgraded to `inngest@4.20.0` (sandbox requirement). Experimental scoring
  primitives (createScorer, group.experiment, scoreMiddleware) verified
  compiling and building against 4.20.0.
- Event facts ([EVENT NAME], [DATES], [BOOTH #], [EVENT PAGE URL]) are
  placeholders pending marketing confirmation.

## Current Readiness Summary

The loop demo is locally walkable and verified. Cloud backing (deploy, seed,
sandbox beta entitlement, Insights) is pending credentials and the event
environment.

## Requirement Matrix

| Requirement | Evidence | Status |
| --- | --- | --- |
| Loop demo shell | `/` renders tagline, pillars, stage nav (Run/Observe/A-B-Test), code pane synced per stage | Locally ready |
| Real Inngest durable workflow | `research-agent` runs real steps with retry injection; local dev server traces verified | Locally ready |
| Retry/recovery story | `Fail competitor API once` toggle; 503 -> RetryAfterError -> retry + memoized replay in trace | Locally ready, Cloud pending |
| Sandbox beat (cloud, real) | `src/lib/sandbox.ts` runs `step.sandbox` create/run/destroy behind `isCloud`; entitlement probe at `/api/demo/status` | Blocked on beta access for demo env |
| Sandbox beat (local, simulated) | Labeled simulated step keeps trace story; UI badge says "simulated locally" | Locally ready |
| Sandbox cleanup | `onFailure` handler destroys leaked sandboxes by name; cloud-only | Locally ready, Cloud pending |
| Observe stage | Trace + Insights deep links, captured-by-default list, run facts card | Locally ready |
| A/B Test stage | Feedback -> `/api/research/signal`; bakeoff -> `/api/research/experiment`; Scores/Experiment deep links | Locally ready, Cloud pending |
| Loop code snippets | `src/content/loop-snippets.ts` (run/observe/abtest) with highlight markers; legacy snippets untouched | Locally ready |
| Historic run list | `npm run demo:seed-research-load` seeds research runs, feedback, experiments | Ready, Cloud seed pending |
| SDK pin | `inngest@^4.20.0` installed; lint/build/tsc pass | Ready |
| Split-screen ergonomics | Loop demo layout mirrors the proven ResearchDemo shell; per-stage viewport QA not yet scripted | Pending viewport pass |
| Talk track | `docs/demo-talk-track.md` rewritten for Run/Observe/A-B-Test with event placeholders | Draft ready, stakeholder review pending |
| Booth driver card | `docs/driver-card.md` rewritten with sandbox-beta safe claims | Draft ready, driver sign-off pending |
| Booth runbook | `docs/booth-runbook.md` updated: event placeholders, sandbox beta notes, loop walkthrough | Draft ready |
| Cloud auth / deploy / Insights | Unchanged flows from previous event; see `docs/cloud-handoff.md` | Pending credentials |
| Physical booth QA | `docs/booth-qa-checklist.md` exists | Pending hardware sign-off |
| Fallback recording | `docs/contingency-recording.md` exists | Pending final Cloud path |

## Proven Local Commands

These have passed against the local app:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

(The full `demo:doctor` / `demo:local-ready` / viewport pass should be rerun
against the loop demo at `/` before dry runs; the existing scripts target the
legacy surfaces and the root route change should be re-verified.)

## Unproven Or Blocked

- Event facts are placeholders; marketing must confirm event name, dates,
  booth number, and the handoff calendar URL.
- Sandbox beta is not enabled for any demo environment yet. Request access
  early; verify with `curl -s <url>/api/demo/status | jq .sandbox`.
- The cloud sandbox beat has never executed end to end (needs beta-enabled
  env plus deployed demo).
- Viewport QA scripts have not been updated for the loop demo's stage nav.
- Cloud deploy, seed, Insights query, and fallback recording are all still
  pending for this event cycle.
- Drivers have not been assigned or signed off.

## Go/No-Go Rule

The demo is booth-ready only when all of these are true:

- Final deployed URL passes `demo:preflight` and `demo:smoke`.
- Inngest Cloud Runs shows `research-agent` runs with retry recovery and
  seeded history.
- `/api/demo/status` reports `sandbox.mode: "sandbox"` on the deployed demo,
  OR the team explicitly approves the simulated labeling for this event.
- Lauren/Riley/DevRel have completed a dry run using the loop talk track.
- 2-3 booth drivers have completed the driver sign-off from
  `docs/driver-card.md`, including the honest sandbox-beta framing.
- Physical display QA is signed off.
- Fallback recordings are linked in the runbook and Linear.
