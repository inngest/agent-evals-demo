// src/lib/inngest-dashboard.ts (CODEVIEW owns)
//
// Typed per-act deep-link map for the "open in Inngest" buttons. Placeholder
// localhost:8288 values for the booth; one clearly-marked swap point for a
// cloud recording.
//
// FRONTEND: import `getDeepLink` for all "open in Inngest" buttons. Do not
// hardcode dashboard URLs in components.

// ⬇⬇⬇ SWAP TO CLOUD URLS HERE ⬇⬇⬇
// For the booth on local: leave as-is. For a cloud recording, set
// NEXT_PUBLIC_INNGEST_DASHBOARD_BASE to https://app.inngest.com/env/<env>
// and the paths below resolve against it.
const DASHBOARD_BASE =
  process.env.NEXT_PUBLIC_INNGEST_DASHBOARD_BASE?.trim() ||
  "http://localhost:8288";
// ⬆⬆⬆ SWAP TO CLOUD URLS HERE ⬆⬆⬆

export type DeepLinkKey =
  | "runTrace" // Act 1: the rich agent trace
  | "scoresOnTrace" // Act 2: scores attached to the trace
  | "session" // Act 2: the incident thread (multi-run) view
  | "experiment" // Act 3: group.experiment results page
  | "envDashboard" // Act 4: env-level dashboard
  | "insights"; // Act 4: Insights query view

export type DeepLinkIds = {
  runId?: string;
  sessionId?: string;
  experimentId?: string;
};

// Each entry is a function of optional ids so deep-links can target a specific
// run/session/experiment. All return absolute URLs.
export const deepLinks: Record<DeepLinkKey, (ids?: DeepLinkIds) => string> = {
  runTrace: (ids) => `${DASHBOARD_BASE}/runs/${ids?.runId ?? "demo-run"}`,
  scoresOnTrace: (ids) =>
    `${DASHBOARD_BASE}/runs/${ids?.runId ?? "demo-run"}?tab=scores`,
  session: (ids) =>
    `${DASHBOARD_BASE}/sessions/${ids?.sessionId ?? "demo-session"}`,
  experiment: (ids) =>
    `${DASHBOARD_BASE}/experiments/${ids?.experimentId ?? "demo-experiment"}`,
  envDashboard: () => `${DASHBOARD_BASE}/functions`,
  insights: () => `${DASHBOARD_BASE}/insights`,
};

export function getDeepLink(key: DeepLinkKey, ids?: DeepLinkIds): string {
  return deepLinks[key](ids);
}

// ── Back-compat shims ──────────────────────────────────────────────────────
// The pre-reskin route files (api/demo/*, api/trigger) import these. FRONTEND
// owns those routes and is rewriting them to use getDeepLink; these aliases
// keep the build green until that lands. Safe to delete once no callers remain.
export function getInngestDashboardUrl(): string {
  return DASHBOARD_BASE;
}

export function getInngestRunsUrl(): string {
  return `${DASHBOARD_BASE}/runs`;
}
