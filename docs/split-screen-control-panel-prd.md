# Split-Screen Booth Control Panel PRD

**Date:** 2026-06-22  
**Status:** Experimental PRD for a Codex implementation thread  
**Goal:** Preserve the existing demo foundations, but reframe the booth experience so the left side is only a trigger/control surface and Inngest is the product surface.

## 1. Why This Exists

Lauren's June 22 feedback was that the current demo looks too much like a standalone product. The app layer is doing valuable work, but in a loud booth context it creates a question we do not want visitors asking:

> Is this custom app the product, or is Inngest the product?

The current implementation has strong building blocks:

- A real durable Inngest-backed agent run.
- A retry/recovery beat.
- A code-triage/Jester-style agent scenario.
- Score and session signals.
- Experimentation data.
- Code snippets and a broader vision panel.

The issue is framing. The existing app currently presents those pieces as a full four-act workbench. This PRD explores a smaller, booth-first layout where the demo app becomes a **control panel** and Inngest becomes the proof.

## 2. Core Idea

Build an experimental route that is designed to run as the **left third of a split-screen booth setup**.

The left pane is a compact controller with three sections:

1. **Durable Agents**
2. **Scores + Sessions**
3. **Experimentation**

The right two-thirds of the booth screen is the real Inngest dashboard, opened manually or via deep links. The control panel should trigger the same events and provide the exact next link/action the demo driver needs, but it should not try to become the product UI.

Do not throw away the existing `IncidentDemo`. This is a parallel experiment.

## 3. Product Principle

The left pane should feel like a remote control for the demo, not like a product.

Good:

- Pick a bug report.
- Trigger `Investigate`.
- Toggle a one-time failure.
- Send thumbs up/down.
- Save analysis.
- Trigger or reveal an experiment.
- Show tiny local status.
- Provide `Open run`, `Open scores`, `Open session`, and `Open experiment` links.

Avoid:

- Large charts that look like a product dashboard.
- Multi-tab fake product surfaces.
- Full-screen score/session/experiment workbenches inside the demo app.
- UI copy that implies the left panel is Inngest.

## 4. Target Booth Layout

Recommended physical layout:

```txt
+--------------------------+--------------------------------------------------+
| Demo Control Panel       | Inngest Dashboard                                |
| 33% width                | 67% width                                        |
|                          |                                                  |
| Durable Agents           | Runs / trace / step detail                       |
| Scores + Sessions        | Scores / session history                         |
| Experimentation          | Experiment / Insights                            |
+--------------------------+--------------------------------------------------+
```

The implementation should optimize the control panel for a 320-460px wide pane. It should be usable as:

- A browser window snapped to the left third of the display.
- A narrow responsive route on a laptop.
- A fallback full-page view, where the right side is replaced by links and instructions.

Do not rely on iframe embedding of Inngest unless explicitly proven. Assume the real product dashboard opens in a separate adjacent browser pane because auth/CSP may block embedding.

## 5. Proposed Route

Add a new route:

```txt
/booth-control
```

This route should reuse the existing demo state, APIs, and data where possible:

- `src/content/incidents.ts`
- `/api/trigger`
- `/api/run-status`
- `/api/score`
- existing score history logic
- existing seeded session and experiment data
- `src/lib/inngest-dashboard.ts` deep links
- existing `DemoControls` logic where it fits

The existing root route can stay unchanged while this experiment is evaluated.

## 6. Left Pane Information Architecture

### 6.1 Header

Purpose: orient the driver, not the visitor.

Suggested content:

- Title: `Booth Control`
- Small status pill: `ready`, `running`, `retrying`, `complete`, `error`
- Product link button: `Open Inngest`
- Reset button

Avoid branding the panel as a standalone app.

### 6.2 Section 1: Durable Agents

This is Act 1.

Controls:

- Bug report selector.
- `Investigate` button.
- Optional toggle: `Fail repo read once`.
- Optional retry count, default 1.
- `Open run` or `Open trace` button after trigger.

Local display:

- Current bug title.
- One-sentence scenario.
- Run status.
- Last known run id/event id.
- A tiny ordered list of current steps:
  - receive bug report
  - plan next action
  - search repo
  - read file
  - retry/recover
  - create/update ticket
  - notify team
  - suggest fix
  - return analysis

Right-pane driver instruction:

> On the Inngest side, show the run trace, failed step, retry, and recovered output.

Primary talk track:

> This is a real agent run. Every model turn and tool call is a durable Inngest step. When a tool fails, Inngest retries the failed boundary instead of making us rebuild the orchestration.

### 6.3 Section 2: Scores + Sessions

This is Act 2.

Controls:

- `Thumbs up`
- `Thumbs down`
- `Save analysis`
- `Discard`
- `Open scores`
- `Open session`

Local display:

- Tiny fast score confirmation.
- Tiny outcome score confirmation.
- Session id.
- Last scored timestamp or status.

Do not render the large current score dashboard from `ScoresPanel` in this route. The left pane should only confirm that the signal was sent and tell the driver what to show in Inngest.

Right-pane driver instruction:

> On the Inngest side, show the score attached to the run, then show the session/history view.

Primary talk track:

> Once the agent produces useful work, product behavior can become an eval signal. The score and the session belong to the same run history, not a separate eval stack.

### 6.4 Section 3: Experimentation

This is Act 3.

Controls:

- `Show experiment`
- Optional `Run bakeoff` if the real or seeded event path already exists.
- Optional model/corpus summary.
- `Open experiment`
- `Open Insights`

Local display:

- Experiment id.
- Model pair.
- Corpus count.
- Winner summary, one line only.

Do not render the full experiment grid in the left pane. The experiment grid belongs in Inngest or in a fallback drawer only.

Right-pane driver instruction:

> On the Inngest side, show the experiment group and/or Insights query over scored runs.

Primary talk track:

> Now the same scorer can evaluate a corpus of resolved bugs across models. The durable run history gives us the data we need for experiments and Insights.

## 7. Code View Treatment

Code still matters, but it should not be a main booth act by default.

Add a small `Code` affordance, probably:

- A button in the header.
- Or a per-section `Code` link.
- Opens a drawer/sheet, not a main tab.

The code drawer should reuse `CodeView` and `src/content/code-snippets.ts`.

Default booth path should not require opening code. Use code only if a developer asks how it is wired.

Code drawer acceptance:

- Shows Act 1 durable `step.run` snippet.
- Shows Act 2 score/session snippet.
- Shows Act 3 experiment snippet.
- Uses compact navigation.
- Does not resize or disrupt the left control panel.

## 8. Reuse Versus New Work

Reuse:

- Existing Inngest functions.
- Existing trigger/status/score APIs.
- Existing incidents.
- Existing scoring/session/experiment seed data.
- Existing dashboard deep-link helpers.
- Existing code snippets.
- Existing demo flags, if they can be adapted cleanly.

New:

- A compact route/component for the booth control panel.
- A narrow-pane CSS/layout pass.
- A simpler local state machine that guides the driver through the three sections.
- Small status summaries and right-pane instructions.
- Optional named-window behavior for opening Inngest links.

Do not:

- Delete the current root demo.
- Replace `IncidentDemo` unless the experiment proves better and Sterling explicitly asks.
- Rework Cloud plumbing unless required by the new route.
- Build a fake Inngest dashboard inside the app.

## 9. Dashboard Link Behavior

The control panel should make it easy to keep the right pane on the correct Inngest view.

Minimum:

- Buttons use existing `DashboardLink` / `getDeepLink` behavior.
- Buttons open in a new tab/window.

Nice experimental behavior:

- Use a stable target name for dashboard links, e.g. `target="inngest-booth"`, so repeated clicks reuse the same right-side browser tab/window.
- If this is implemented, keep it simple and browser-native. Do not add complex cross-window control.

## 10. Visual Requirements

The route should be dense, calm, and operational.

Design direction:

- Left pane width target: 360-420px.
- Compact typography.
- Clear section tabs or vertical segmented controls.
- Use icons for actions where obvious.
- No nested cards.
- No marketing hero.
- No large decorative surfaces.
- Stable heights for buttons/status rows.
- Text must not overflow at 320px width.

Suggested visual hierarchy:

```txt
Booth Control        [ready] [Open Inngest] [reset]

[Durable] [Scores] [Experiment]

Durable Agent
Bug: EXE-1737 ...
[Investigate]
[ ] Fail repo read once

Next on Inngest:
Open run trace and show retry recovery.

Run
event: ...
run: ...
status: retrying
```

## 11. Demo Driver Script

### 90-second version

1. Left pane: choose a bug and click `Investigate`.
2. Right pane: show Inngest run and trace.
3. Left pane: click `Save analysis`.
4. Right pane: show score/session.
5. Left pane: click `Show experiment`.
6. Right pane: show experiment/Insights.
7. Close:

> This is the loop: run the agent durably, observe every step, and turn production behavior into eval signals.

### 2-3 minute version

1. "Here is a production-style agent investigating a bug report."
2. Trigger the durable run.
3. Show Inngest retry/recovery.
4. Mention that each model/tool call is a durable step.
5. Send a score signal and save the analysis.
6. Show scores and session history in Inngest.
7. Show the experiment view or Insights query.
8. Offer Patrick handoff if qualified.

## 12. Acceptance Criteria

The experiment is successful when:

- `/booth-control` exists and does not alter the current root demo.
- The route works at 320px, 390px, 460px, and desktop widths.
- Durable Agents section can trigger the existing investigation flow.
- A retry/recovery path can still be triggered and observed in Inngest.
- Scores + Sessions section can send fast feedback and saved/discarded signals.
- Experimentation section can deep-link to experiment/Insights views.
- Code is available through a compact drawer, but not required for the default path.
- The left pane uses no large fake product dashboards.
- The route provides explicit "what to show on Inngest now" guidance.
- `npm run lint` and `npm run build` pass.
- Existing smoke/preflight scripts still pass or are unchanged.
- If Playwright viewport QA exists for the root route only, add a lightweight viewport check or manual notes for `/booth-control`.

## 13. Open Questions For The Implementing Thread

- Can Inngest dashboard links reliably reuse one named browser tab/window?
- Which exact Inngest Cloud URLs should `scores`, `session`, `experiment`, and `Insights` point to in booth mode?
- Is there already a real experiment event trigger, or should this first version only deep-link to seeded/Cloud history?
- Should the left pane include a small transcript/result summary after `Investigate`, or is status plus right-pane proof enough?
- Does Sterling want a `Presenter mode` toggle that hides implementation labels and shows only the three big buttons?

## 14. Suggested Implementation Plan

1. Add `src/app/booth-control/page.tsx`.
2. Create `src/components/demo/BoothControlPanel.tsx`.
3. Extract reusable state helpers from `IncidentDemo` only if needed; otherwise duplicate narrowly for the experiment.
4. Reuse existing API calls:
   - `POST /api/trigger`
   - `GET /api/run-status`
   - `POST /api/score`
   - `POST /api/demo/reset`
5. Add compact sections:
   - `DurableAgentControl`
   - `ScoreSessionControl`
   - `ExperimentControl`
   - `CodeDrawer`
6. Add responsive CSS/classes for 320-460px.
7. Add README link and optional runbook note.
8. Run lint/build and manually test with the Inngest dev server.

## 15. Codex Handoff Prompt

Use this prompt in a fresh Codex thread:

> In `/Users/sterlingchin/inngest/evals-demo`, implement the experimental split-screen booth control panel described in `docs/split-screen-control-panel-prd.md`. Do not remove or replace the current root demo. Add a new `/booth-control` route optimized for a 320-460px left-side pane that triggers the existing durable agent, score/session signals, and experiment/Insights deep links while the real Inngest dashboard is shown in an adjacent right-side browser pane. Reuse existing APIs, incidents, scoring/session/experiment seed data, and code snippets. Keep code view as a compact drawer, not a main act. Verify with lint/build and a narrow viewport check.
