// src/lib/inngest-dashboard.ts (CODEVIEW owns)
//
// Typed per-act deep-link map for the "open in Inngest" buttons. Placeholder
// localhost:8288 values for the booth; one clearly-marked swap point for a
// cloud recording.
//
// FRONTEND: import `getDeepLink` for all "open in Inngest" buttons. Do not
// hardcode dashboard URLs in components.

// Captured 2026-06-17 in app.inngest.com, org "Inngest Demo", env "Production":
// - Env dashboard: https://app.inngest.com/env/production
// - Cloud run trace: https://app.inngest.com/env/production/runs/01KVBA4ZSW0X10ZJEEZV9SN4HC
// - Local run trace: http://localhost:8290/run?runID=01KVBAT0PDMF968YB8DWF0ZS5Q
// - Scores: https://app.inngest.com/env/production/scores
// - Experiments: https://app.inngest.com/env/production/experiments
// - Insights query editor: https://app.inngest.com/env/production/insights
// - Session: no session route was exposed in this env; /env/production/sessions
//   rendered "Environment not found", so session links fall back to Runs.

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
  runTrace: (ids) => {
    if (isLocalDashboard()) {
      return ids?.runId && looksLikeInngestRunId(ids.runId)
        ? `${DASHBOARD_BASE}/run?runID=${encodeURIComponent(ids.runId)}`
        : joinDashboardPath("runs");
    }

    return joinDashboardPath("runs", ids?.runId ?? "demo-run");
  },
  scoresOnTrace: () =>
    isLocalDashboard() ? joinDashboardPath("runs") : joinDashboardPath("scores"),
  // SESSIONS: FAKED in both local and cloud modes this pass. Placeholder URL
  // (falls back to Runs) in both modes. BLOCKED: needs the unified
  // scoring+sessions SDK tag (pr-1547 / base 4.6.1). Owner: Jakob. Do NOT wire
  // a real sessions deep-link against pr-1521 — sessions do not exist there.
  session: () => joinDashboardPath("runs"),
  experiment: () =>
    isLocalDashboard() ? joinDashboardPath("runs") : joinDashboardPath("experiments"),
  envDashboard: () => DASHBOARD_BASE,
  insights: () =>
    isLocalDashboard() ? DASHBOARD_BASE : joinDashboardPath("insights"),
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
  return joinDashboardPath("runs");
}

function joinDashboardPath(...parts: string[]): string {
  const base = DASHBOARD_BASE.replace(/\/+$/, "");
  const suffix = parts
    .filter((part) => part.length > 0)
    .map((part) => encodePathPart(part))
    .join("/");

  return suffix ? `${base}/${suffix}` : base;
}

function encodePathPart(part: string): string {
  return part
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isLocalDashboard(): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(
    DASHBOARD_BASE
  );
}

function looksLikeInngestRunId(id: string): boolean {
  return /^01[A-Z0-9]{24}$/.test(id);
}
