# Demo Talk Track

Use this as the driver script for Lauren/Riley/DevRel dry runs and booth
handoffs. It assumes the app is on the left side of the screen and Inngest is
on the right.

## Source Signals

- `PRD.md`: the story is durable -> observable -> optimize, with a real
  Inngest workflow and mocked app data. The booth interaction should make a
  qualified visitor want to book a follow-up demo with Patrick.
- Notion outline, June 2026: the booth needs one linear story that can run
  live, loop on TVs, and adapt to the visitor's evals/observability context.
- Slack, June 5, 2026: Dan's feedback was that the trace and scoring chart
  should be viewed in the Inngest dashboard as the Inngest product demo side.
- Slack, June 11, 2026: Jack asked for a team walkthrough so everyone can see
  which parts of the loop need focus before AI Engineer World's Fair.
- Slack, June 12, 2026 in `#event-ai-eng-world-fair-sf`: Lauren asked about
  booth training, Sterling said he would show the demo to the engineering team
  on Monday, June 15, 2026, and suggested booth training no earlier than mid
  next week.
- Slack, June 5 and June 12, 2026 in `#event-ai-eng-world-fair-sf`: the booth
  is `U-G26`, opens Monday, June 29, 2026 at 4 PM, and the public conference
  page can be used in pre-event outbound.
- Slack, May 29, 2026 in `#event-ai-eng-world-fair-sf`: Lauren and Tony aligned
  on one encompassing Insights-agent demo that covers durability,
  observability, and optimization in a production-style use case.
- Slack, May 27-28, 2026 in `#event-ai-eng-world-fair-sf`: evals soft launch
  is planned for June 29, and booth solution tags are Durability,
  Observability, and Optimization.
- Slack, June 4, 2026: Scores dashboard/API work was still being designed, so
  the live claim should be about emitted score/eval signals and Insights-backed
  history once the Cloud query is configured.
- GitHub, June 12, 2026: the public repo has no open PRs or issues; the current
  demo updates are local working-tree changes until they are published.

## Marketing-Safe Status

The demo shell is working locally. The app can run the Insights-style agent,
send real Inngest events, show durable workflow activity, seed realistic local
run history, and emit score/eval signals from saved behavior.

Do not claim that the final public Scores dashboard/API is complete. The safer
phrasing is:

> We are showing how production behavior becomes an eval signal, and how that
> signal can be inspected historically in Inngest.

The demo is not conference-safe until the Cloud deploy, Cloud app sync, Cloud
seed history, real Insights score query, hardware QA, and fallback recording are
complete.

## Booth Layout

- Booth location: `U-G26`.
- First live booth shift: Monday, June 29, 2026 at 4 PM.
- Left: `agent-evals-booth-demo`.
- Right: Inngest Runs view filtered to the conference demo app/environment.
- Keep a run details page or trace ready in a second Inngest tab when doing the
  2-3 minute live walkthrough.
- On a 32-inch display, keep both windows full height and roughly 50/50 width.
- On 16-inch and 14-inch laptops, bias the app slightly wider until the SQL,
  buttons, tabs, and Scores panel remain readable.

## Audience Routing

Open with:

> What are you using today to know if your agents are actually working in
> production?

Use the answer to decide what to emphasize:

- Evals-savvy: spend less time on SQL and get to `Save`, `Scores`, and
  Insights-backed score history.
- Durability-naive: show `Opus offline`, retry recovery, and the Inngest run
  trace before going deep on scores.
- Observability-focused: keep Inngest Runs visible and narrate step inputs,
  outputs, timing, replay, and history.
- Exec or walk-by: use the 90-second loop and the payoff line.

Payoff line:

> Durable, observable, optimized - all this close to your code, without
> deciding upfront everything you need to measure.

If the visitor shows buying intent, hand off with:

> Patrick is talking with teams at the event about exactly this. Want me to get
> you on his calendar while you are here?

Use the event page calendar for the handoff:
`https://www.inngest.com/events/ai-engineer-worlds-fair-2026`.

## Preflight

Local rehearsal:

```bash
npm run demo:doctor
npm run lint
npm run build
DEMO_BASE_URL=http://localhost:3001 npm run demo:preflight
DEMO_BASE_URL=http://localhost:3001 npm run demo:smoke
DEMO_BASE_URL=http://localhost:3001 DEMO_SMOKE_SEED=1 npm run demo:smoke
DEMO_BASE_URL=http://localhost:3001 npm run demo:viewport
```

Cloud rehearsal:

```bash
DEMO_BASE_URL=https://<vercel-domain> npm run demo:preflight
DEMO_BASE_URL=https://<vercel-domain> npm run demo:smoke
DEMO_BASE_URL=https://<vercel-domain> DEMO_SEED_TOKEN=<token> npm run demo:seed
```

The Cloud preflight is not green for the booth until:

- `canSendCloudEvents=true`
- `canServeCloudInngest=true`
- `seedEndpointProtected=true`
- `demoOpsTokenConfigured=true`
- score history source is `inngest-insights`

## 90-Second Loop

Use this when someone is walking by or the booth is loud.

1. Open with the problem: "Teams are shipping agents, but the hard part is
   knowing whether they are actually getting better in production."
2. Click `Ask agent`. The app generates SQL and returns mock SaaS user rows.
3. Point right to Inngest: "This is a real Inngest function, so every step is
   durable and inspectable."
4. Open or point at the Inngest run/trace. Show `generate-sql` and `run-query`.
5. Click `Save`. Open `Scores`.
6. Close with: "Saving the useful answer becomes an online eval signal. Inngest
   gives us the durable execution, the trace, and the history we need to
   improve it."
7. If the visitor is in a hurry, end with the payoff line from Audience
   Routing.

## 2-3 Minute Live Walkthrough

1. Start with the ask:
   "Show me everyone who signed up in the last two weeks but hasn't activated
   yet."
2. Click `Ask agent`.
   - App claim: an agent generated and ran the SQL.
   - Inngest claim: the work is represented as a durable run, not just a
     foreground request.
3. Click `Run query` if rows are not already visible.
   - App claim: the business task is simple and legible.
   - Keep the data world generic SaaS: `users` plus `events`.
4. Open `Trace`, then open Inngest on the right.
   - Show `write-query`.
   - Show steps for `generate-sql` and `run-query`.
   - If retry mode is on, show the failed step and recovery.
5. Open `Demo Controls`, turn on `Opus offline`, keep `Retry failures` at `1`,
   then click `Run again`.
   - Talk track: "The model/API can fail. The user does not have to rebuild the
     orchestration around that failure."
   - Show Inngest retrying and recovering on the right.
6. Open `Code`.
   - Point at `step.run`.
   - Keep this brief: "The code is thin because Inngest owns the durable step
     boundary."
7. Click `Save`, then open `Scores`.
   - App claim: saved/discarded behavior is treated as a product signal.
   - The demo app switches to Scores after Save so the score/eval beat is
     visible immediately.
   - Inngest claim: the durable `score-query-signal` function emits the
     downstream `app/query.scored` event.
8. Move back to the Inngest side.
   - Show seeded historical runs.
   - Show score-signal activity.
   - If Cloud Insights is configured, show the historic score query/chart.
9. Close with the buyer bridge:
   "This is the loop we want teams to leave with: run the agent durably, observe
   every step, and turn real user behavior into eval signals."
10. If the visitor is qualified or wants to compare against their current eval
    stack, offer the Patrick follow-up handoff instead of extending the demo.

## What To Show In Inngest

- Runs list with seeded history.
- `write-query` runs from `app/query.requested`.
- `score-query-signal` runs from `app/query.saved`.
- Step trace with inputs, outputs, timing, and retry recovery.
- `app/query.scored` events or Insights rows when Cloud query is configured.

## Driver Training

- Approve 2-3 primary drivers before booth staffing is finalized.
- Each driver should complete the 90-second loop, the 2-3 minute walkthrough,
  the `Opus offline` retry path, the Patrick follow-up handoff, and the
  fallback handoff.
- Use `docs/driver-card.md` as the printed or pinned booth reference.
- Record driver sign-off in `docs/booth-qa-checklist.md` or Linear.

## Claims To Avoid

- Do not say the final Scores dashboard/API is fully shipped unless product has
  confirmed that status.
- Do not imply the demo is using a real LLM or real customer data.
- Do not call the seeded local chart production Insights data.
- Do not rely on the local dev server for the live conference path unless Cloud
  is unavailable and the fallback path is explicitly chosen.

## Dry-Run Acceptance

The stakeholder dry run is ready when:

- Engineering walkthrough feedback from Monday, June 15, 2026 has been
  incorporated or explicitly deferred.
- Booth training is scheduled no earlier than mid-week once Cloud readiness is
  green; fallback approval is tracked separately for recording only.
- Lauren/Riley/DevRel agree on the 90-second and 2-3 minute script.
- Drivers know when to offer the Patrick follow-up handoff and when to keep the
  interaction short.
- The app and Inngest can be shown side by side on 32-inch, 16-inch, and
  14-inch layouts without awkward clipping.
- `npm run demo:preflight` and `npm run demo:smoke` pass against the final demo
  URL.
- Cloud Runs shows seeded history for the actual demo app.
- Scores history is confirmed as `inngest-insights` for the final live booth
  path.
- A 90-second loop and 2-3 minute contingency recording exist.

## If Something Breaks

- If Inngest has no runs, use `/api/demo/status` and check Cloud event/signing
  keys.
- If seeding fails, rerun the tokenized `npm run demo:seed` command.
- If score history is not Insights-backed, this is not the final live booth
  path. Keep any emergency walkthrough on emitted score events and seeded trend,
  then switch to the contingency framing.
- If network or Cloud auth is flaky, switch to the contingency recording.
