# Codex Goal — Finish the Four-Act Incident-Triage Booth Demo

> **Historical.** Written when the third loop stage was called *Evaluate*;
> it is now **A/B Test**. Inngest SDK names in this file (createScorer,
> step.score, group.experiment, defer) are unchanged and still correct.

You are finishing a Next.js booth demo for AI Engineer World's Fair. Work on the
current branch `feature/four-act-demo` in this repo (`~/inngest/evals-demo`).

## Outcome (what "done" means today)
A locally testable demo:
- `npm run build` passes clean.
- `npm run dev` + `npx inngest-cli@latest dev`: the app loads, you pick an incident, click **Investigate**, and a **real Inngest run executes on the local dev server**. The trace shows ~12 steps (think-N + tool-N) and the durability beat: one `read_repo_file` step 503s on attempt 0, Inngest retries, prior steps return memoized, the failed step re-runs and succeeds, the run completes with an RCA.
- All 4 acts navigate via the act stepper.
- Act 2 shows the fast up/down score + the deferred localization score + the session thread (one incident, multiple runs).
- Act 3 shows the GPT-5.5 vs Claude bakeoff with accuracy/latency/cost sliders that **flip the winner** as you drag them.
- Act 4 shows the "vision" panel (env dashboards, Insights, "the scorer is just your function returning 0-1").
- Every "Open in Inngest" button deep-links to a **real captured dashboard URL** (see Task 2).
- Seeded scores / sessions / experiment data make the dashboards look populated.

## Authoritative spec
**Read `CONTRACT.md` at the repo root first and follow it literally.** It locks every
event name, TypeScript shape, the agent tool set, the incident corpus schema, the seed
schema, the deep-link config, the component inventory, and the file-ownership map. Do not
re-derive these — implement them.

## Where things stand (current branch state)
An automated build wrote `CONTRACT.md` and then started the build before being stopped
mid-flight. The branch has **partial, possibly inconsistent scaffolding** committed as a
WIP checkpoint:
- Touched: `src/inngest/client.ts`, `src/lib/mock-llm.ts`, `src/lib/scoring.ts`,
  `src/lib/inngest-dashboard.ts`, `src/lib/mock-tools.ts` (new),
  `src/inngest/functions/` (new), several `src/components/demo/*` (incl. new
  `ActStepper.tsx`, `SubstrateCallout.tsx`), `src/content/code-snippets.ts`,
  `src/components/ui/slider.tsx` (new). `src/inngest/functions/write-query.ts` deleted.
- **Not yet done:** `src/app/page.tsx` shell wiring, the incident corpus
  (`src/content/incidents.ts`), the seed data rewrite (`src/content/seed-data.ts`), the
  API routes, `ExperimentPanel.tsx`, `VisionPanel.tsx`, `IncidentDemo.tsx`, and the
  real deep-link capture.

**Treat the scaffolding as a starting point, not as correct.** Verify every existing
file against `CONTRACT.md`, finish the unbuilt pieces, and fix anything inconsistent.

## Your tasks
1. **Finish the build to `CONTRACT.md`** across all four areas: the durable triage agent
   + mock LLM/tools (BACKEND), the 12-incident Inngest-flavored corpus + seed data
   (DATA), the 4-act UI reskin + new panels + API routes (FRONTEND), and the per-act
   code snippets (CODEVIEW). Port the agent loop, crash semantics, and the EXE-1737
   scenario from `~/inngest/inngest-agents/demo` (`triage-durable.ts`, `lib/tools.ts`,
   `lib/stubs.ts`, `lib/prompt.ts`, `lib/llm.ts`).

2. **Capture the real deep-links with your browser** (the part the prior run could not
   do). Log into `app.inngest.com`, open the **demo environment** (the one with scoring,
   sessions, and experiments enabled). Navigate to and capture the real URLs for: a run
   trace, scores on a trace, a session (multi-run) view, an experiment / group.experiment
   results page, an env-level dashboard, and the Insights query view. Then update
   `src/lib/inngest-dashboard.ts`: **correct the path templates to match the real
   dashboard routes** (the current ones are localhost guesses and are probably wrong),
   set the cloud base via `NEXT_PUBLIC_INNGEST_DASHBOARD_BASE`, and keep the localhost
   fallback + the swap marker. Record the captured URLs in a short comment block.

3. **Make it build and boot.** `npm install`; resolve all cross-module type/import
   mismatches (you may edit any file to reconcile integration); `npm run build` until
   clean; start `next dev` + the Inngest dev server; trigger an incident; confirm the
   real local run shows the ~12 steps and the retry/recover beat. Run a self-QA pass
   against the acceptance list above and fix gaps.

## Constraints
- **Mirror the existing Inngest v4 syntax** (`src/inngest/client.ts` and the ported
  gester demo). Do not invent Inngest primitives. Use the `inngest-dev` skill if unsure.
- **Mock the LLM and the tools.** The only live dependency is the local Inngest dev
  server. The app must run with no Anthropic key and no cloud keys.
- **Keep the shared-substrate positioning visible** (per `CONTRACT.md` §0 / Lauren): the
  score and experiment data exist because Inngest runs the agent, which a Temporal +
  Braintrust or BullMQ + homegrown-evals setup can't cheaply capture. Surface it in the
  Act 1 and Act 3 copy via `SubstrateCallout`.
- **UI copy:** energetic, in Sterling's voice. No em dashes in any user-facing copy.

## Reference
- `CONTRACT.md` (repo root) — the binding spec.
- Agent to port: `~/inngest/inngest-agents/demo/`.
- Notion PRD: https://app.notion.com/p/381b64753bbd8194b740f76babec76af
- Act-by-act mechanics + code: https://app.notion.com/p/381b64753bbd810f8dcffb6a0c5d10fb
- Existing app shells to reskin: `src/components/demo/*`, `src/app/page.tsx`.

## Run / verify commands
```bash
npm install
npm run build                       # must pass
# two terminals:
npx inngest-cli@latest dev          # local Inngest dev server (:8288)
npm run dev                         # the app (:3000)
# then: open the app, pick an incident, Investigate, watch the run + trace at :8288
```
