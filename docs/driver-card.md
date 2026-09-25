# Booth Driver Card

This is the one-page version of `docs/demo-talk-track.md`. Keep it beside the keyboard.

Event: [EVENT NAME], [DATES], booth [BOOTH #].

## Before A Shift

- The TV shows `/` full screen. You should see the Acme Support inbox and "Pick a ticket from the inbox".
  - Split screen with the dashboard works too: a portrait window switches to a stacked layout, with the inbox on top and the code drawer below.
- The "Simulate Order API outage" switch (bottom of the inbox) is **on**.
- The Inngest dashboard is open in a second window. Runs, Scores and Experiments are bookmarked.
- `npm run demo:smoke-loop` passed against the booth URL today.

## Keys

| Key | Action |
| --- | --- |
| `1` `2` `3` | Open a ticket that goes well (3: refund computed in a sandbox) |
| `4` | Open the ticket that goes badly (a missed reply; only its score shows it) |
| `G` / `B` | Vote helpful / not helpful |
| `S` | Open the split test; press again to start it |
| `D` | Open the trace (or the experiment) in Inngest |
| `U` | Toggle Under the hood (code) |
| `F` | Toggle the outage |
| `R` | Reset |
| `Esc` | Close |
| `?` | Show the keys |

Everything is also clickable with the mouse.

## The Path (about 3 minutes)

1. **App.** "This is Acme's support desk; the agent is built on Inngest. Pick a ticket."
   Narrate the rows: the order API 503, "Retrying in 3s", "Cached", recovered, sent.
2. **Inngest.** Click **View trace in Inngest**.
   Show the failed attempt, the retry, the memoized steps, and the step I/O and tokens.
   "One click from the product to the answer."
3. **App.** The visitor votes 👍 on the good reply.
4. **App.** Press `3`: the agent computes the $49 refund in a sandbox (the **Sandboxed** row) and replies. Press `4`: the reply misses the point, and the screen doesn't say so.
   **Inngest:** open Scores. Ticket 4's `support_reply_quality` is low. First-contact resolution is a durable wait for the customer.
5. **App, then Inngest.** **Split-test a model**, then **Start**, then at 8/8 **Compare in Inngest**. Talk ROI in the experiment view.
6. **Close.** Point at the QR code, hand over the free-month card, and press `R`.

Engineer? Press `U`. The drawer shows the code for whatever is on screen.

Score names: `first_contact_resolution`, `policy_compliance`, `escalated_to_human`, `cost_per_ticket`, `support_reply_quality`, `csat`.

## Safe Claims

- Real: the durable steps, retries, traces, scores and traffic split.
- Props: the tickets, the replies, which tickets go badly, the split-test results and the prices. The winner is scripted.
- The follow-up window is 15s at the booth. In production it would be days.
- Don't say "GPT beats Claude" or "this is what it costs".
- Never call an **Offline replay** run live.

## Recovery

- **"Offline replay" pill, no trace button.** Keep going, say it's a replay, and check `/api/demo/status` after the visitor leaves.
- **Odd state.** Press `R` and open a ticket again.
- **Wi-Fi gone.** Use the fallback recording.
