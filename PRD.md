# Booth Demo App — Codex-Ready PRD

**Date:** 2026-06-01
**For:** AI Engineer World's Fair booth (June 30 launch), reusable as YouTube + sales demo.
**Working doc:** `~/personal/marvin/content/agent-evals-launch/2026-06-01-booth-demo-storyboard.md`
**This file lives at:** `~/inngest/evals-demo/PRD.md` (the demo's build repo). Codex scaffolds the app here.
**Notion outline (team):** [Agent Evals — Conference Booth Demo (3-Act Outline)](https://www.notion.so/372b64753bbd813182e5cf5b100ca95d)
**Review loop:** Sterling → Lauren (sniff test) → Dan (technical).

> ⚠️ **MOCK EVERYTHING EXCEPT INNGEST.** No database, no real LLM, no API keys. The ONLY live pieces are the real Inngest agent (run + retries + trace) and `group.defer` once it ships. Mock LLM returns canned SQL; mock endpoint returns static rows; the Scores panel is faked. This is a stage prop with a real engine, built to never break on a conference floor.

---

## 0. TL;DR — what Codex is building

A single **Next.js (App Router) + TypeScript** app, deployed to **Vercel**, that demos an Insights-style analytics agent. **Mirror the real Inngest Insights UI** (Dan's reference screenshot, in the Notion outline's Look & Feel section): a SQL query editor with an **"Insights AI" assistant panel** on the right that generates SQL from a plain-English ask, results pane below. Behind it runs a **real Inngest agent** (real orchestration, retries, traces). Everything else is **mocked**: a mock LLM, a mock data endpoint, demo toggles, an in-app annotated **code view**, and a faked **Scores** panel.

**Data world: generic SaaS** (a fictional product's `users` + `events`), NOT Inngest's own `runs` data — a cold booth visitor must grok the query with zero setup.

Design principle: **nothing on the demo's critical path depends on a UI or primitive that doesn't exist yet.** Real Inngest run + retry + trace are the only live dependencies. `group.defer` and scoring are **stubbed behind clean swap-seams** (they're shipping; structure is ready).

The whole thing rides on **one canonical query, one mock LLM, toggles as the star.**

---

## 1. The story it performs (durable → observable → optimize)

Pyramid/crescendo: orchestration (foundation) → tracing (free, because you orchestrate here) → evals (the hero takeaway). 3-minute loud-floor interaction whose job is to make someone **book a demo with Patrick** — not to teach evals end to end.

The one takeaway: **agent evals — online, based on real user behavior.**

## 2. The canonical query (the spine of all three acts)

User asks: **"Show me everyone who signed up in the last two weeks but hasn't activated yet."**

Mock LLM returns this verbatim every time:
```sql
SELECT u.id, u.email, u.signed_up_at
FROM users u
LEFT JOIN events e ON e.user_id = u.id AND e.name = 'activated'
WHERE u.signed_up_at >= now() - interval '14 days'
  AND e.id IS NULL
ORDER BY u.signed_up_at DESC;
```
This same query: fails-and-recovers in Act 1, is traced in Act 2, is saved-and-scored in Act 3.

---

## 3. Stack & deploy

- **Next.js (App Router), TypeScript, Tailwind, shadcn/ui.**
- **Layout mirrors the real Inngest Insights screen** (Dan's screenshot). The **swag store is the component/token layer** — source: **`~/inngest/swag-store-demo`** (the Patrick demo; `~/inngest/swag-store` is the alt/newer build — confirm w/ Sterling). It's Next.js + shadcn on **Tailwind v4** (theme lives in `src/**/globals.css` via `@theme`, not a `tailwind.config` file). Copy: `components.json`, `src/components/ui/`, the globals.css theme tokens. Design layer only, no commerce content. Point it at the Insights screen structure, not a new invented layout.
- **Inngest TypeScript SDK v4** (real). Use the `inngest-dev` skill / Inngest plugin for exact v4 syntax — do not guess primitive signatures.
- Local dev: Inngest **dev server** (`localhost:8288`).
- **No database. No real LLM. No external API keys** required to run.
- Deploy: **Vercel.** (Option for later: run as a connect worker with checkpointing if we want max speed on cloud — NOT required for v1.)

## 4. The real Inngest agent

A real Inngest function — this is the only genuinely live piece.

- Trigger: API route POSTs an event (e.g. `app/query.requested`) or `inngest.send` from the route handler; function picks it up.
- Steps:
  - `step.run("generate-sql", …)` → calls the **mock LLM** → returns the canonical SQL. **This is the step that fails when the toggle is on.**
  - `step.run("run-query", …)` → calls the **mock data endpoint** → returns static rows.
  - (Optional, nice-to-have) publish **realtime** updates to the browser so the run feels live (differentiator vs temporal — push-to-browser). Use Inngest v4 realtime if quick; otherwise poll run status.
- **Retries:** configure the function so when `generate-sql` throws (toggle on), Inngest retries and recovers automatically. The recovery must be visible in the trace.
- **No `step.ai`** — it's being removed. Wrap the mock LLM call in `step.run`.

### Scoring / defer — STUB with a swap-seam
`group.defer` and the scoring primitive are coming. Build the seam now:
```ts
// lib/scoring.ts
// TODO(launch): replace with real group.defer + scoring primitive when shipped.
export async function scoreSavedQuery(runId: string, signal: "saved" | "discarded") {
  // STUB: today, update the in-app mock score store and (optionally) send a normal
  // Inngest event so a deferred-looking run appears in the dashboard runs tab.
  // SWAP: this becomes a real group.defer block that scores asynchronously.
}
```
Keep it isolated so swapping in the real primitive is a one-file change.

## 5. Mock LLM (`lib/mock-llm.ts`)

- `generateSQL(prompt): Promise<string>` → returns the canonical SQL after a configurable "thinking" delay (default ~600ms).
- **Failure injection:** when `DEMO_FLAGS.llmOffline` is on, throw a realistic error (`"Opus unavailable: 503"`) on the first `failureCount` attempts (default 1), then succeed — so the retry/recover beat is fast and reliable, never an open-ended outage.
- Deterministic. Never hallucinates. Same output every run.

## 6. Mock data endpoint (`/api/run-query`)

- Accepts `{ sql }`, **ignores it**, returns a static set of ~10 fake users: `{ id, email, signed_up_at, activated: false }`. ~100ms delay.
- Looks real, identical every time.

## 7. Demo toggles — the star (`Demo Controls` drawer)

A visible, easy-to-flip controls panel (bottom drawer or side panel). State in a client store, passed to the agent run:
- `llmOffline: boolean` — makes `generate-sql` fail-then-recover.
- `failureCount: number` — retries before recovery (default 1).
- `latencyMs: number` — optional added delay / "slow mode."
- **Reset demo** button — clears run state for a clean next demo (mirror the swag-store reset endpoint pattern; critical for back-to-back booth demos).

## 8. In-app Code View (Sterling's requirement — build this carefully)

A read-only, syntax-highlighted **Code** tab inside the app. **Not** live VS Code. Shows **curated, annotated code with commented-out explanation interleaved between the `step.run`s.** Top-level reads THIN and pretty.

- Source: a `content/code-snippets.ts` holding curated code strings + a short human description per snippet.
- Render with a highlighter (shiki or prism). Tabs/sections per act.
- **Progressive reveal matching the acts:**
  - **Act 1 (durable):**
    ```ts
    const writeQuery = inngest.createFunction(
      { id: "write-query", retries: 4 },        // ← Inngest retries this automatically
      { event: "app/query.requested" },
      async ({ event, step }) => {
        // 1. Ask the model for SQL — wrap it so a failure here is retried, not fatal
        const sql = await step.run("generate-sql", () => llm.generateSQL(event.data.prompt));

        // 2. Run it. Each step is independently retried and memoized.
        const rows = await step.run("run-query", () => db.run(sql));

        // your agent logic goes here — every step is durable + recoverable
        return { sql, rows };
      }
    );
    ```
  - **Act 2 (observable):** show that observability is "free" — a comment callout that orchestrating here means every step above is already traced (inputs/outputs/timing), plus event replay. Minimal/zero extra code — that's the point.
  - **Act 3 (optimize):** the `group.defer` block, clearly commented as the new piece:
    ```ts
    // When the user SAVES the query, that's a signal the answer was good.
    // Score it asynchronously — this can land seconds or DAYS later.
    await step.group.defer("score-on-save", async () => {   // ← shipping; stubbed today
      // comment line: your agent loop / scoring logic
      // group.defer → score this query from real product behavior
    });
    ```
- Each snippet has a one-line description beside it the demoer can read aloud.

## 9. Faked Scores tab

- Current query score: **0.92 ✓**, label "based on: saved to dashboard."
- A 2-week **quality trend sparkline** (seeded static array).
- **Experiment** sub-tab (only shown if time): GPT-5.5 vs Opus 4.7 win-rate bars.
- On **Save**: toast "scored 0.92 ✓", trend appends a point. All client-side mock.
- Seam it so a real score store can replace the mock later.

## 10. Screens & layout (mirror real Insights — then simplify hard)

Model the screen on Dan's Insights screenshot, **stripped to the essentials** (his note: *"we can simplify this a ton to reduce distractions"*). Three zones:
- **Left/center — SQL query editor:** shows the SQL the agent generated (read-only-ish, syntax highlighted). A **Run query** button + a **Save** button in the toolbar.
- **Right — "Insights AI" assistant panel:** the chat ("Ask the insights agent to query…"), pre-fillable with the canonical query + a one-click "use sample query." This is the agent surface; asking here generates the SQL into the editor.
- **Below editor — results pane:** the static rows; "Your results will appear here" empty state.

**Strip these from the real UI** (distractions for a 3-min floor): the saved-queries sidebar (keep ≤2 items or hide), multiple open tabs, Schema Explorer, row-limit/history-limit chips, Chart/Table toggle, Download.

**Add:** a tab/segmented control for **[Result] [Trace] [Code] [Scores]**, and a **Demo Controls** drawer always reachable.
- **Trace** = "View trace" opens the real Inngest run (dev server locally; cloud at the booth) — or a short link.
- Visual: swag-store design system / shadcn on the Insights layout, Inngest vibe, a little motion on run + score.

## 11. The 2-minute golden path (click → act mapping)

1. Canonical ask pre-filled in the **Insights AI** panel → it generates the SQL into the editor → **Run** → results appear (live foreground agent).
2. Flip **Opus offline** → ask again → SQL generation fails → **retries → recovers** → results. "Let me show you the trace." *(Act 1)*
3. **Trace** tab → the loop, inputs/outputs, the retry that recovered. *(Act 2)*
4. **Code** tab → `step.run` + `retries` + the "observability for free" callout. *(Act 2 code)*
5. **Save** → "scored 0.92 ✓" → **Scores** tab → trend (+ experiment if time). *(Act 3)*
6. **Code** tab → `group.defer` snippet (commented as the new piece). *(Act 3 code)*

## 12. Constraints & voice

- The booth IS the June 30 launch, so naming **Agent Evals / scoring / online evals publicly is fine at the event.** For any pre-launch filming/sharing before June 30, keep the existing "natural next step of durable execution" framing.
- `step.run` only. No `step.ai`.
- Energetic, Sterling-personality copy for any in-app text. No em dashes.
- Competitive angle = organic moments + talk-track, never side-by-side comparison screens.

## 13. Dependencies / build order

| Piece | Status | Build now? |
|---|---|---|
| Next.js app, design system, screens, tabs | none | ✅ |
| Real Inngest agent: `step.run` + retries + trace | live | ✅ |
| Mock LLM (+ failure injection), mock data endpoint | none | ✅ |
| Demo toggles + reset | none | ✅ |
| In-app Code View (annotated snippets) | none | ✅ |
| Faked Scores tab (score + trend + experiment) | none | ✅ |
| `group.defer` real wiring | ~Wed | 🟡 stub now, swap later |
| Extended traces (AI inputs/outputs in trace) | ~this week | 🟡 trace view degrades gracefully if not landed |

## 14. Proposed file tree
```
agent-evals-booth-demo/
├── app/
│   ├── page.tsx                  # main demo screen (input, results, tabs)
│   ├── api/
│   │   ├── inngest/route.ts       # Inngest serve endpoint
│   │   ├── run-query/route.ts     # mock data endpoint (static rows)
│   │   └── trigger/route.ts       # accepts prompt, sends app/query.requested
│   └── components/
│       ├── QueryConsole.tsx
│       ├── ResultsTable.tsx
│       ├── DemoControls.tsx        # the toggles
│       ├── CodeView.tsx            # annotated snippets, syntax highlighted
│       └── ScoresPanel.tsx         # faked score + trend + experiment
├── inngest/
│   ├── client.ts
│   └── functions/write-query.ts    # the real agent
├── lib/
│   ├── mock-llm.ts
│   ├── scoring.ts                  # STUB + swap-seam
│   └── demo-flags.ts
├── content/
│   ├── code-snippets.ts            # curated code + descriptions per act
│   └── seed-data.ts                # static users + 2-week score trend
└── tailwind.config.ts              # from swag store
```

---

## 15. CODEX BRIEF (paste-ready)

> Build a Next.js (App Router, TypeScript, Tailwind, shadcn/ui) app called `agent-evals-booth-demo`, deployable to Vercel, that demos an Insights-style analytics agent backed by a real Inngest v4 function. Use the `inngest-dev` skill for exact v4 syntax; do not guess.
>
> The agent answers one canonical question — "everyone who signed up in the last two weeks but hasn't activated" — by running two steps: `generate-sql` (calls a mock LLM that returns a fixed SQL string after ~600ms) and `run-query` (calls a local mock endpoint returning ~10 static fake users). Configure retries on the function.
>
> Add a **Demo Controls** drawer with toggles: `llmOffline` (makes `generate-sql` throw "Opus unavailable: 503" for `failureCount` attempts, default 1, then succeed so Inngest retries and recovers), `latencyMs`, and a **Reset** button.
>
> Tabs: **Result** (the rows), **Trace** ("View trace" deep-links to the Inngest run), **Code** (read-only syntax-highlighted curated snippets with commented-out explanation interleaved between the `step.run`s, progressive per act — see `content/code-snippets.ts`), **Scores** (faked: a 0.92 score on save, a seeded 2-week trend sparkline, an optional GPT-vs-Claude experiment sub-tab).
>
> Saving a query calls `lib/scoring.ts::scoreSavedQuery` — today a STUB that updates the mock score store and optionally sends an event so a deferred-looking run shows in the dashboard; leave a clear TODO to swap to real `group.defer` + scoring. Do NOT use `step.ai`. No database, no real LLM, no API keys.
>
> Layout mirrors the real Inngest Insights screen (SQL editor + "Insights AI" assistant panel on the right + results below), stripped to essentials. For styling, reuse the design layer from `~/inngest/swag-store-demo` (Next.js + shadcn, Tailwind v4): copy `components.json`, `src/components/ui/`, and the `globals.css` `@theme` tokens — design only, no commerce content.

---

## 16. Open / to confirm before/while building
- Single canonical query → **locked** (§2).
- Opening routing question → **locked** ("What are you using today to know if your agents are actually working in production?") + 4 pivots (in working doc §Audience routing).
- Score surface faked → **locked** (§9).
- Layout = mirror real Inngest Insights, simplified per Dan → **locked** (§10).
- Data world = generic SaaS (`users` + `events`), not Inngest `runs` → **locked** (§0, §2).
- Swag-store design-system source → `~/inngest/swag-store-demo` (confirm vs `~/inngest/swag-store`).
- 🟡 Realtime vs polling for the live-run feel — Codex's call based on effort; realtime is the better differentiator if cheap.
