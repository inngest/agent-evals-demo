# Review Handoff

Use this for DEV-428 when publishing the local demo-readiness work for review
and deploy.

## Current GitHub State

As of June 14, 2026:

- Repository: `SterlingChin/agent-evals-demo`
- Current branch: `main`
- Remote branch: `origin/main`
- GitHub PRs surfaced by `gh pr list --state all --limit 20`: none
- GitHub issues surfaced by `gh issue list --state all --limit 20`: none
- The demo-readiness implementation is still local-only until a branch/PR is
  created.
- `npm run demo:cloud-handoff` can read the linked Vercel project, but final
  Cloud handoff is still blocked by missing local `INNGEST_API_KEY` plus
  missing production env vars for `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`,
  `INNGEST_API_KEY`, `DEMO_SEED_TOKEN`, and
  `NEXT_PUBLIC_INNGEST_DASHBOARD_URL`.

## Suggested Publish Path

Do not include generated Playwright artifacts from `output/`; that directory is
ignored by git.

```bash
git switch -c codex/aiewf-agent-evals-demo-readiness
git status --short
npm run demo:local-ready
git add .
git commit -m "Prepare AIEWF agent evals demo"
git push -u origin codex/aiewf-agent-evals-demo-readiness
```

Then open a draft PR.

## Suggested PR Title

```txt
Prepare AIEWF agent evals demo
```

## Suggested PR Body

```md
## Summary

- Adds the split-screen Insights AI booth flow with Result, Trace, Scores, and Code
  views.
- Wires real Inngest functions for query generation and score-signal handling.
- Adds local and Cloud demo readiness commands, protected seed/reset demo ops,
  Cloud handoff checks, seeded history, and viewport QA.
- Tightens Code tab responsiveness so the Act 1/2/3 progressive code controls
  are usable in compact split-screen panes.
- Adds local reset verification and a dev-only persisted mock score fallback so
  local score state is consistent across route contexts during rehearsals.
- Adds booth runbook, talk track, QA checklist, contingency recording plan,
  Cloud handoff, Insights query handoff, and readiness audit docs.

## Verification

- `DEMO_BASE_URL=http://localhost:3001 npm run demo:local-ready`
- `npm run demo:cloud-handoff` currently fails as expected and prints the exact
  missing local auth plus Vercel production env commands.
- `DEMO_BASE_URL=https://agent-evals-demo.vercel.app npm run demo:cloud-ready`
  currently fails as expected in the deploy precheck before Cloud mutation. It
  reports the stale public POC deployment, missing local `INNGEST_API_KEY`, and
  missing required production env vars.

## Known Remaining Work

- Add production Vercel env vars.
- Provide local `INNGEST_API_KEY` for Inngest Cloud API commands.
- Fresh deploy from this branch.
- Set `INNGEST_CLOUD_APP_ID` and let `demo:cloud-ready` sync `/api/inngest`.
- Seed Cloud history.
- Generate and validate `INNGEST_INSIGHTS_SCORE_QUERY`.
- Run physical booth QA and stakeholder dry runs.
- Record fallback video.
```

## Reviewer Focus

- Confirm the split-screen UI supports the Slack feedback: app on one side,
  Inngest dashboard on the other for run history, traces, and score/eval
  context.
- Check the claim boundaries in `docs/demo-talk-track.md`; avoid implying a
  fully shipped Scores dashboard/API before product confirms wording.
- Review `scripts/cloud-handoff.mjs`, `scripts/cloud-ready.mjs`, and
  `scripts/insights-score-check.mjs` as the final deploy gates. Deployed
  preflight hard-fails if `INNGEST_DEV` leaks into production, event/signing
  keys are absent, or score history is not backed by Inngest Insights.
- Review `docs/insights-score-query.md` for the exact `app/query.scored` event
  contract expected by the final Insights query.

## Not Done Until

This PR is not enough by itself for booth readiness. The demo is booth-ready
only after `npm run demo:cloud-ready` passes against the final deployed URL and
the physical display/fallback recording checks are complete.
