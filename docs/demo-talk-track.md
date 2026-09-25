# Booth Demo Talk Track

The demo is a sandwich:

1. Start in **Acme Support**, a helpdesk everyone recognises, so the visitor knows what the agent does.
2. Click over to the **real Inngest dashboard** as soon as possible. The demo mostly lives there.
3. Come back to the app only to trigger the next thing: a vote, then a split test.

The app is context. Inngest is the product.

- Driver one-pager: `docs/driver-card.md`.
- Setup and fallbacks: `docs/booth-runbook.md`.

## Before The Visitor Arrives

- **App (TV, full screen):** `/`. It shows the inbox and "Pick a ticket from the inbox".
- **Inngest dashboard (second window or tab):**
  - Local: `http://localhost:8288`.
  - Cloud: your env's Runs page.
- **Bookmark these in the dashboard:**
  - **Runs**, filtered to `support-agent`.
  - **Scores / Insights**, for `first_contact_resolution`, `policy_compliance`, `csat` and `cost_per_ticket`.
  - **Experiments**, for `support-agent-model-split-test` (Cloud only; the local dev server has no experiments page).
- **Outage switch:** "Simulate Order API outage" at the bottom of the inbox is **on**.

## Opener (10s)

> How are you keeping your agents reliable while the models, prompts and APIs under them keep changing?

## 1. The product (30s, in the app)

> This is Acme's support desk. Their AI agent answers tickets, and it's
> built on Inngest. Pick one.

Start with a ticket under **Goes well**: the visitor picks one, or you press `1` or `2`. Narrate the activity as it appears:

> It reads the ticket, looks up the customer, looks up the order… and the order API just went down. That's a 503.
> Inngest retries that one step in 3 seconds. The two steps before it are
> cached, not re-run: no second model call, no repeat spend.
> Recovered. It drafts the reply, runs it through a policy guardrail, and sends it.

## 2. The trace (60–90s, in Inngest)

Click **View trace in Inngest**, or press `D`. It's there from the moment the run starts.

> Here's that exact run. Every step in the app is a step here, named the way the code names it.

Point at these, in order:

- The failed `lookup-order` attempt with its 503, and the retry that succeeded.
- The steps that were memoized rather than re-executed.
- Step inputs and outputs, plus the model call's tokens and duration (OTel `gen_ai` span).

> Nobody wrote logging for this. When a customer asks "what happened to my
> ticket?", this is the answer, and it took one click to get here.

## 3. Good vs bad interactions, scored in Inngest (60–90s, app, then Inngest)

The app shows none of the scores; those live in Inngest.

1. In the app, the visitor clicks 👍 (`G`) on the good reply.
2. Run a ticket under **Goes badly**:
   - **`3`, Refund a damaged item.** The draft offers a $649 refund, and the policy check flags it because anything over $200 needs a human. (With Sandboxes on, the refund is computed by a script the agent runs in a sandbox, not by the model's arithmetic: point at the sandbox steps in the trace.) The reply is **blocked**, not sent, and the ticket is escalated to Tier 2.
   - **`4`, Cancel my subscription.** The agent misreads it as a billing question. Sam writes back "That's not what I asked", and the agent runs again and gets it right.
3. The visitor can 👎 (`B`) either one.
4. Switch to the Inngest dashboard and open the **Scores** view. Compare the good run with the bad ones:
   - `first_contact_resolution`: 1 for the good run, 0 for the escalation and for the reply the customer followed up on.
   - `policy_compliance`: 0 on the blocked refund.
   - `escalated_to_human`.
   - `cost_per_ticket`.
   - `csat`: from the vote.

> Every run is scored in the terms your support lead uses. First-contact
> resolution is Inngest waiting, durably, to see whether the customer comes
> back (`support-agent-resolution`: 15s here, days in production). The
> scores that come later are deferred functions of the run they judge. A
> thumbs-down is the most honest eval you have, and the other two failures
> needed no one to click anything.

For a business audience:

> This ties adoption and satisfaction to specific agent behaviour, not just to token spend.

## 4. Split test a model (45s, app, then Inngest)

Click **Split-test a model** (`S`), then **Start split test** (`S` again).

> Would a different model do better? Eight live tickets, including the
> ones that go badly today, are routed 50/50 and scored on the same
> business metrics.

When it reaches 8 of 8, click **Compare in Inngest** (Cloud) and walk through the experiment view:

- the variants side by side;
- first-contact resolution, policy compliance and cost per ticket;
- which to promote.

This is where the ROI conversation happens, in the product.

> A variant is just a function: a model, a prompt, a retriever, a vendor.

## 5. Close (15s)

Point at the QR code in the inbox ("Try Inngest free"). Hand over the free-month card.

> Focus on your agent. Inngest makes it durable, shows you every step, and tells you whether it's any good.

Press `R` before the next visitor.

## For Engineers

Press `U` at any point. The code drawer follows what's on screen:

- `step.run` for the agent's steps;
- `step.score` plus `step.waitForEvent` once a run completes;
- `group.experiment` while the split test is open.

Walk the code, then show the same names in the trace.

## Adapting

- **"Only care about evals":** run one good and one bad ticket, vote, split-test, and spend the time in the Scores and Experiments pages.
- **"Only care about reliability":** run two tickets, one with the outage off (the switch, or `F`), and compare the traces.
- **Three minutes, tops:** steps 1 and 2 are the demo. Everything else is optional.

## Safe Claims

- The durable steps, retries, traces, scores and traffic splitting are real Inngest primitives on a real run.
- The tickets, customer data, model outputs, quality scores and prices are booth props. The split test's winner is scripted by role.
- **Offline replay** in the thread header means Inngest wasn't reachable. Say so; there's no trace link on a replay.

## Questions To Note

Jot recurring questions in the booth-notes Slack thread after each good conversation. They shape the follow-up.
