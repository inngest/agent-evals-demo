const DEFAULT_DASHBOARD_URL = "http://localhost:8288";

export function getInngestDashboardUrl() {
  return (
    cleanUrl(process.env.NEXT_PUBLIC_INNGEST_DASHBOARD_URL) ??
    DEFAULT_DASHBOARD_URL
  );
}

export function getInngestRunsUrl() {
  return (
    cleanUrl(process.env.NEXT_PUBLIC_INNGEST_RUNS_URL) ??
    getInngestDashboardUrl()
  );
}

function cleanUrl(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}
