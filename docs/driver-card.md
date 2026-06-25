# Booth Driver Card

Print or keep this visible beside the demo laptop. This is the one-page version
of `docs/demo-talk-track.md`.

## Before A Shift

- Demo app is on the left.
- Inngest Runs is on the right, filtered to the demo app/environment.
- One Inngest run detail or trace tab is ready.
- Seeded history is visible before the first walkthrough.
- Fallback recording link is available.
- Browser notifications are off.

## Opener

Ask:

> What are you using today to know if your agents are actually working in
> production?

Then route the story:

- Evals-savvy: get to `Save`, `Scores`, and Insights-backed history quickly.
- Durability-naive: turn on `Opus offline`, show retry recovery, then show the
  trace.
- Observability-focused: spend more time in Inngest Runs and step traces.
- Exec or walk-by: use the 90-second loop and the final payoff line.

## 90-Second Loop

1. "Teams are shipping agents. The hard part is knowing whether they are
   getting better in production."
2. Click `Ask agent`.
3. Show generated SQL and rows.
4. Point to Inngest Runs: "This is a real durable workflow."
5. Open `Trace` or the Inngest run detail.
6. Click `Save`.
7. Show `Scores`.
8. Close: "Run the agent durably, observe every step, and turn behavior into
   eval signals."
9. If they are interested: "Want me to get you on Patrick's calendar while you
   are here?"
   Use `https://www.inngest.com/events/ai-engineer-worlds-fair-2026`.

## 2-3 Minute Path

1. Run the canonical ask:
   "Show me everyone who signed up in the last two weeks but hasn't activated
   yet."
2. Show the SQL and result rows.
3. Show Inngest `write-query`, `generate-sql`, and `run-query`.
4. Turn on `Opus offline`, run again, and show retry recovery.
5. Open `Code` and point at `step.run`.
6. Click `Save`; the app switches to `Scores`.
7. Show `score-query-signal` and `app/query.scored` in Inngest.
8. If Cloud Insights is ready, show the historic score query/chart.
9. If the visitor is qualified or comparing eval stacks, hand off to Patrick
   instead of extending the walkthrough.
   Use the event page calendar:
   `https://www.inngest.com/events/ai-engineer-worlds-fair-2026`.

## Safe Claims

- "The orchestration and Inngest events are real."
- "The LLM, SaaS data, and score values are synthetic for the booth."
- "Saved and discarded behavior becomes an online eval signal."
- "Inngest gives the durable run, trace, retry recovery, and event history."
- "Patrick can go deeper on how this maps to your agents."

Avoid:

- "The final Scores product is shipped."
- "This is customer data."
- "The local seeded trend is production Insights data."

## Recovery

- Wrong local port: run `npm run demo:doctor`.
- No Inngest runs: check `/api/demo/status`, event keys, signing key, and
  Cloud app sync.
- Seed failed: rerun the tokenized `npm run demo:seed`.
- Score history is not Insights-backed: this is not the final live path. Use
  the emergency fallback framing and keep the story on emitted
  `app/query.scored` events.
- Wi-Fi or auth is unstable: use the fallback recording.

## Driver Sign-Off

Each approved driver should complete:

- One 90-second loop without notes.
- One 2-3 minute path while using both panes.
- One retry recovery run.
- One Patrick handoff line.
- One fallback handoff.

Record driver names and dates in `docs/booth-qa-checklist.md` or the relevant
Linear issue before booth staffing is finalized.
