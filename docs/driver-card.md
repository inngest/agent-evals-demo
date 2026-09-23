# Booth Driver Card

Print it or keep it beside the keyboard. This is the one-page version of
`docs/demo-talk-track.md`. Event: [EVENT NAME], [DATES], booth [BOOTH #].

## Before A Shift

- The TV shows `/` full screen, and the start screen has three ticket cards.
- The HUD (bottom left) says `OUTAGE ON` and `IDLE`.
- `npm run demo:smoke-loop` passed against the booth URL today.
- The fallback recording link is ready, and browser notifications are off.

## Keys

`1 2 3` pick ticket / vote · `Space` primary · `→ ←` next/back ·
`U` under the hood · `F` outage on/off · `D` open in Inngest · `R` reset ·
`?` keys. There's also an **Under the hood** button in the bottom bar, and
**View trace in Inngest** buttons top right on every screen after Start.

## Opener

> How are you keeping your agents reliable today, while the models and
> prompts keep changing underneath them?

Engineer → press `U` first. Everyone else → the business path.

## The Path (3 min, or 5 with `U`)

1. **Start.** "This is an AI support agent. Pick a customer." The visitor
   taps a card or says a number.
2. **Durable.** "Watch the order lookup… the order system just went down.
   Inngest retries only that step. The first two weren't re-run: no repeat
   model spend, and the customer still gets an answer."
   - `U`: point at the highlighted `step.run("lookup-order")`.
3. **Observe** (`→`). "Nobody wrote logging for this. Every step, the retry,
   tokens and cost, captured by default."
   - `U`: inputs and outputs per step. `D` opens the real trace.
4. **A/B test** (`→`).
   - Visitor presses `1` / `2`: "Your vote is now a metric on that exact run."
   - `Space`, `Space`: "Would another model do better? Real tickets split
     between two models, every answer scored, the data picks the winner."
5. **Recap** (`→`). "Durable, observable, measured." Point at the monthly
   figure, then the QR code.
6. **Close.** "Unbreakable agents, invisible infra." If they're interested:
   "Want me to get you on Patrick's calendar?" ([EVENT PAGE URL])
7. `R` before the next visitor.

## Safe Claims

- "The durable steps, retries, traces, metrics and traffic splitting are
  real Inngest primitives."
- "The tickets, the reply, the model scores and the prices are booth props."
- "A variant is just a function: model, prompt, retriever, vendor."

Avoid:

- "GPT beats Claude." The winner is scripted.
- "This is what it costs." The $ figures are illustrative.
- Calling a **Replay**-tagged run live.

## Recovery

- **Replay chip.** Keep going and say it's a replay. Check `/api/demo/status`
  after the visitor leaves.
- **Stuck or odd state.** `R`, then pick a ticket again.
- **Wi-Fi or auth gone.** Use the fallback recording.

## Driver Sign-Off

Each approved driver should complete:

- one 3-minute path without notes (≤ 3:30 on the HUD timer);
- one 5-minute path with `U` on (≤ 5:00);
- one run with the outage off (`F`), narrated correctly;
- one Replay narrated honestly (stop the Inngest dev server to rehearse);
- one Patrick handoff line.

Record names and dates in `docs/booth-qa-checklist.md`.
