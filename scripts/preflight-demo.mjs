#!/usr/bin/env node

const baseUrl = normalizeBaseUrl(process.env.DEMO_BASE_URL ?? process.argv[2]);
const isLocalhost =
  baseUrl.hostname === "localhost" ||
  baseUrl.hostname === "127.0.0.1" ||
  baseUrl.hostname === "::1";
const skipOpsLockCheck =
  process.env.DEMO_PREFLIGHT_SKIP_OPS_LOCK === "1" ||
  process.env.DEMO_PREFLIGHT_SKIP_SEED_LOCK === "1";
const checks = [];
let demoStatus = null;

await checkDemoStatus();
await checkInngestServe();
await checkScoreHistory();
await checkProtectedDemoOpsLock("/api/demo/seed", "seed");
await checkProtectedDemoOpsLock("/api/demo/reset", "reset");

const failures = checks.filter((check) => check.status === "fail");
const warnings = checks.filter((check) => check.status === "warn");

for (const check of checks) {
  console.log(`${symbolFor(check.status)} ${check.label}`);
  if (check.detail) {
    console.log(`  ${check.detail}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} preflight check(s) failed.`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(`\n${warnings.length} preflight warning(s).`);
}

async function checkDemoStatus() {
  const { ok, status, body, error } = await fetchJson("/api/demo/status");

  if (!ok) {
    addCheck("fail", "Demo status endpoint is reachable", error ?? `HTTP ${status}`);
    return;
  }

  demoStatus = body;
  const runtime = body.runtime ?? {};
  const configuration = body.configuration ?? {};

  addCheck(
    "pass",
    "Demo status endpoint is reachable",
    `mode=${stringValue(runtime.inngestMode) ?? "unknown"}, scoreSource=${
      stringValue(body.scoreHistory?.source) ?? "unknown"
    }`
  );

  if (!isLocalhost) {
    if (runtime.inngestMode === "dev") {
      addCheck(
        "fail",
        "Deployed app is not using Inngest dev mode",
        "Unset INNGEST_DEV in production so the app talks to Inngest Cloud."
      );
    } else {
      addCheck("pass", "Deployed app is not using Inngest dev mode");
    }

    if (!configuration.hasEventKey || !configuration.hasSigningKey) {
      addCheck(
        "fail",
        "Cloud Inngest env is configured",
        `eventKey=${Boolean(configuration.hasEventKey)}, signingKey=${Boolean(
          configuration.hasSigningKey
        )}`
      );
    } else {
      addCheck(
        "pass",
        "Cloud Inngest env is configured",
        "eventKey=true, signingKey=true"
      );
    }

    if (!configuration.hasSeedToken) {
      addCheck(
        "fail",
        "Production seed token is configured",
        "Set DEMO_SEED_TOKEN so production history can be seeded safely."
      );
    } else {
      addCheck("pass", "Production seed token is configured");
    }
  }
}

async function checkInngestServe() {
  const { ok, status, body, error } = await fetchJson("/api/inngest");

  if (!ok) {
    addCheck(
      "fail",
      "Inngest serve endpoint is reachable",
      inngestFailureDetail(status, error)
    );
    return;
  }

  const functionCount = Number(body.function_count);
  const mode = stringValue(body.mode) ?? "unknown";
  const hasEventKey = Boolean(body.has_event_key);
  const hasSigningKey = Boolean(body.has_signing_key);

  if (!isLocalhost) {
    if (mode === "dev") {
      addCheck(
        "fail",
        "Inngest serve endpoint is not using dev mode",
        "The deployed /api/inngest endpoint reports mode=dev. Unset INNGEST_DEV."
      );
    } else {
      addCheck("pass", "Inngest serve endpoint is not using dev mode");
    }
  }

  if (functionCount < 2) {
    addCheck(
      "fail",
      "Inngest serve endpoint exposes demo functions",
      `Expected at least 2 functions, received ${functionCount || 0}.`
    );
    return;
  }

  addCheck(
    "pass",
    "Inngest serve endpoint exposes demo functions",
    `${functionCount} functions, mode=${mode}, eventKey=${hasEventKey}, signingKey=${hasSigningKey}`
  );

  if (!isLocalhost && (!hasEventKey || !hasSigningKey)) {
    addCheck(
      "fail",
      "Cloud Inngest keys are configured",
      "Deployed demos should show eventKey=true and signingKey=true."
    );
  }
}

async function checkScoreHistory() {
  const { ok, status, body, error } = await fetchJson("/api/score");

  if (!ok) {
    addCheck("fail", "Score history API is reachable", error ?? `HTTP ${status}`);
    return;
  }

  const history = body.history;
  const source = stringValue(history?.source) ?? "unknown";
  const trend = Array.isArray(history?.trend) ? history.trend : [];
  const points = Array.isArray(history?.points) ? history.points : [];

  if (trend.length === 0) {
    addCheck(
      "fail",
      "Score history API returns trend data",
      "No trend values returned."
    );
    return;
  }

  addCheck(
    "pass",
    "Score history API returns trend data",
    `${trend.length} trend points, ${points.length} scored events, source=${source}`
  );

  const statusScoreSource = stringValue(demoStatus?.scoreHistory?.source);

  if (!isLocalhost && source !== "inngest-insights") {
    addCheck(
      "fail",
      "Cloud score history is backed by Inngest Insights",
      `Current source is ${
        statusScoreSource ?? source
      }. Configure INNGEST_INSIGHTS_SCORE_QUERY before the booth demo.`
    );
  }
}

async function checkProtectedDemoOpsLock(pathname, operation) {
  if (isLocalhost || skipOpsLockCheck) {
    addCheck(
      "pass",
      `Production ${operation} endpoint lock check`,
      isLocalhost
        ? "Skipped for localhost; dev seeding is intentionally one-click."
        : "Skipped by DEMO_PREFLIGHT_SKIP_OPS_LOCK=1."
    );
    return;
  }

  const { status, body, error } = await fetchJson(pathname, {
    method: "POST",
    body: JSON.stringify({ count: 1 }),
  });

  if (status === 401 || status === 403) {
    addCheck(
      "pass",
      `Production ${operation} endpoint is locked without token`,
      `HTTP ${status}: ${stringValue(body.error) ?? "locked"}`
    );
    return;
  }

  addCheck(
    "fail",
    `Production ${operation} endpoint is locked without token`,
    error ?? `Expected 401/403, received HTTP ${status}.`
  );
}

async function fetchJson(pathname, init = {}) {
  const url = new URL(pathname, baseUrl);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({}));

    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {},
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

function normalizeBaseUrl(value) {
  if (!value) {
    return new URL("http://localhost:3001");
  }

  try {
    return new URL(value);
  } catch {
    console.error(`Invalid DEMO_BASE_URL: ${value}`);
    process.exit(1);
  }
}

function addCheck(status, label, detail) {
  checks.push({ status, label, detail });
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function symbolFor(status) {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  return "FAIL";
}

function inngestFailureDetail(status, error) {
  if (error) {
    return error;
  }

  if (status === 500) {
    return "HTTP 500. In production mode this usually means INNGEST_SIGNING_KEY is missing or invalid.";
  }

  return `HTTP ${status}`;
}
