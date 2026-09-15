/**
 * DEMO_TARGET flag — the single source of truth for which demo path runs.
 *
 *   local (default) → faked/seeded/offline path. Dev server, deterministic,
 *                     no real Inngest scoring primitives fire. Behaviorally
 *                     identical to today.
 *   cloud           → emit the REAL Inngest scoring primitives (run-level
 *                     step.score, createScorer/createDefer deferred outcome
 *                     scorer, group.experiment) against Inngest Cloud.
 *
 * IMPORTANT: this is the ONLY file allowed to read process.env.DEMO_TARGET.
 * Everywhere else imports `isCloud` / `DEMO_TARGET` from here. The faked path
 * is always the fallback; every real-primitive call site is wrapped
 * `if (isCloud) { …real… } else { …existing faked… }`.
 */

export type DemoTarget = "local" | "cloud";

export const DEMO_TARGET: DemoTarget =
  process.env.DEMO_TARGET === "cloud" ? "cloud" : "local";

export const isCloud = DEMO_TARGET === "cloud";
