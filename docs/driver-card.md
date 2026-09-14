# Booth Driver Card

Print or keep this visible beside the demo laptop. This is the one-page
version of `docs/demo-talk-track.md`. Event: [EVENT NAME], [DATES], booth
[BOOTH #].

## Before A Shift

- Loop demo app (`/`) is on the left.
- Inngest Runs is on the right, filtered to the demo app/environment.
- One trace tab and one Experiments tab are ready in Inngest.
- Research history is seeded before the first walkthrough.
- Fallback recording link is available.
- Browser notifications are off.

## Opener

Ask:

> How are you keeping your agents reliable today, while the models and
> prompts keep changing underneath them?

Then route the story:

- Reliability pain: stay in Run. Failure toggle, retry/replay, sandbox.
- Observability focus: get to Observe. Trace plus Insights.
- Evals-savvy: get to Evaluate. Scores, defer, bakeoff.
- Exec or walk-by: 90-second loop, end on the tagline.

## 90-Second Loop

1. "Teams want to ship agents fast. Keeping async code reliable while
   models and prompts keep changing is the heavy lift."
2. Run stage: click `Run research agent` (both toggles on).
3. "Steps in code are marked by primitives. Generated code runs in an
   isolated sandbox, not our process."
4. Point right: the API failed once, Inngest retried that boundary, earlier
   steps replayed.
5. Observe stage: `Open trace`. "Observability is not added code. The
   durability generated this data."
6. Evaluate stage: click `Good`, then point at Scores.
7. Close: "Unbreakable agents, invisible infra."
8. If they are interested: "Want me to get you on Patrick's calendar while
   you are here?" Use [EVENT PAGE URL].

## 2-3 Minute Path

1. Run stage: frame the research agent scenario, both toggles armed, run.
2. Narrate the 503: retried boundary, memoized replay, customer unaffected.
3. Show the sandbox result card: isolated, destroyed after the step, beta.
4. Right pane: trace with inputs/outputs, the retry, the sandbox steps.
5. Observe stage: trace link, then `Open Insights`. "No pipeline to wire."
6. Point at the code pane: "This is the whole function."
7. Evaluate stage: `Good` then `Scores`; `Run model bakeoff` then Experiment.
8. Close the loop: "Run, observe, evaluate. The loop makes the next run
   better."
9. If qualified or comparing stacks, hand off to Patrick. Use
   [EVENT PAGE URL].

## Safe Claims

- "The durable execution, traces, scores, and experiments are real Inngest
  primitives."
- "The LLM, research data, and score values are synthetic for the booth."
- "Sandboxes are in beta. Cloud runs the real beta; local shows a simulated
  beat, labeled as such."
- "defer() can score a run days or weeks later from the same run history."
- "Patrick can go deeper on how this maps to your agents."

Avoid:

- "Sandboxes are GA."
- "The local sandbox is live." (It is simulated; the UI says so.)
- "This is customer data."
- "The seeded trend is production Insights data."

## Recovery

- Wrong local port: run `npm run demo:doctor`.
- No Inngest runs: check `/api/demo/status`, event keys, signing key, and
  Cloud app sync.
- Cloud sandbox 403 or capacity error: skip the sandbox beat, narrate the
  beta caveat, show the trace. Do not debug live.
- Seed failed: rerun `npm run demo:seed-research-load`.
- Wi-Fi or auth is unstable: use the fallback recording.

## Driver Sign-Off

Each approved driver should complete:

- One 90-second loop without notes.
- One 2-3 minute path while using both panes.
- One retry recovery run.
- One sandbox beat with honest beta framing.
- One Patrick handoff line.
- One fallback handoff.

Record driver names and dates in `docs/booth-qa-checklist.md` or the
relevant Linear issue before booth staffing is finalized.
