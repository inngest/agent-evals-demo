#!/usr/bin/env node

const baseUrl = normalizeBaseUrl(process.env.DEMO_BASE_URL ?? process.argv[2]);
const isLocalhost =
  baseUrl.hostname === "localhost" ||
  baseUrl.hostname === "127.0.0.1" ||
  baseUrl.hostname === "::1";
const requireInngest =
  process.env.DEMO_SMOKE_REQUIRE_INNGEST === "1" || !isLocalhost;
const shouldSeed = process.env.DEMO_SMOKE_SEED === "1";
const seedToken = process.env.DEMO_SEED_TOKEN;
const checks = [];

await checkStatus("Initial demo status");
const trigger = await checkTrigger();
await checkRunQuery();
await checkSaveScore(trigger?.clientRunId);

if (shouldSeed) {
  await checkSeedHistory();
}

if (isLocalhost) {
  await checkResetDemoState();
}

await checkStatus("Final demo status");

const failures = checks.filter((check) => check.status === "fail");
const warnings = checks.filter((check) => check.status === "warn");

for (const check of checks) {
  console.log(`${symbolFor(check.status)} ${check.label}`);
  if (check.detail) {
    console.log(`  ${check.detail}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed.`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(`\n${warnings.length} smoke warning(s).`);
}

async function checkStatus(label) {
  const { ok, status, body, error } = await fetchJson("/api/demo/status");

  if (!ok) {
    addCheck("fail", label, error ?? `HTTP ${status}`);
    return null;
  }

  addCheck(
    "pass",
    label,
    `mode=${body.runtime?.inngestMode ?? "unknown"}, scoreSource=${
      body.scoreHistory?.source ?? "unknown"
    }, points=${body.scoreHistory?.points ?? 0}`
  );

  return body;
}

async function checkTrigger() {
  const { ok, status, body, error } = await fetchJson("/api/trigger", {
    method: "POST",
    body: JSON.stringify({
      prompt:
        "Find recently signed-up users who activated but have not returned.",
    }),
  });

  if (!ok) {
    addCheck("fail", "Agent trigger route accepts prompt", error ?? `HTTP ${status}`);
    return null;
  }

  if (!body.ok || typeof body.clientRunId !== "string") {
    addCheck(
      "fail",
      "Agent trigger route returns a client run ID",
      JSON.stringify(body)
    );
    return null;
  }

  if (!body.sent) {
    addCheck(
      requireInngest ? "fail" : "warn",
      "Agent trigger sent event to Inngest",
      body.error ?? "Foreground demo continued without Inngest event send."
    );
  } else {
    addCheck(
      "pass",
      "Agent trigger sent event to Inngest",
      `clientRunId=${body.clientRunId}`
    );
  }

  return body;
}

async function checkRunQuery() {
  const { ok, status, body, error } = await fetchJson("/api/run-query", {
    method: "POST",
    body: JSON.stringify({
      sql: "SELECT u.id, u.email, u.signed_up_at FROM users u LIMIT 10;",
    }),
  });

  if (!ok) {
    addCheck("fail", "Query runner returns rows", error ?? `HTTP ${status}`);
    return;
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (rows.length === 0) {
    addCheck("fail", "Query runner returns rows", "No rows returned.");
    return;
  }

  addCheck("pass", "Query runner returns rows", `${rows.length} rows`);
}

async function checkSaveScore(clientRunId) {
  const runId =
    typeof clientRunId === "string" && clientRunId.length > 0
      ? clientRunId
      : crypto.randomUUID();
  const { ok, status, body, error } = await fetchJson("/api/score", {
    method: "POST",
    body: JSON.stringify({ runId, signal: "saved" }),
  });

  if (!ok) {
    addCheck("fail", "Save route scores the query", error ?? `HTTP ${status}`);
    return;
  }

  const score = Number(body.score?.score);
  const points = Array.isArray(body.history?.points)
    ? body.history.points.length
    : 0;

  if (!Number.isFinite(score)) {
    addCheck(
      "fail",
      "Save route scores the query",
      "Response did not include numeric score."
    );
    return;
  }

  addCheck(
    "pass",
    "Save route scores the query",
    `score=${score.toFixed(2)}, historyPoints=${points}`
  );
}

async function checkSeedHistory() {
  const { ok, status, body, error } = await fetchJson("/api/demo/seed", {
    method: "POST",
    headers: seedToken ? { "x-demo-seed-token": seedToken } : {},
    body: JSON.stringify({ count: Number(process.env.DEMO_SMOKE_SEED_COUNT ?? 4) }),
  });

  if (!ok) {
    addCheck("fail", "Seed route creates dashboard history", error ?? `HTTP ${status}`);
    return;
  }

  const runs = Number(body.runs);
  const scoreSignals = Number(body.scoreSignals);
  const durableScoreEvents = Number(body.durableScoreEvents);
  const happyPathRuns = Number(body.happyPathRuns);
  const retryDemoRuns = Number(body.retryDemoRuns);
  const savedScoreSignals = Number(body.savedScoreSignals);
  const discardedScoreSignals = Number(body.discardedScoreSignals);

  if (
    !Number.isFinite(runs) ||
    runs < 1 ||
    !Number.isFinite(scoreSignals) ||
    scoreSignals < 1 ||
    !Number.isFinite(durableScoreEvents) ||
    durableScoreEvents < 1
  ) {
    addCheck(
      "fail",
      "Seed route creates dashboard history",
      JSON.stringify(body)
    );
    return;
  }

  if (
    runs >= 2 &&
    (!Number.isFinite(happyPathRuns) ||
      happyPathRuns < 1 ||
      !Number.isFinite(retryDemoRuns) ||
      retryDemoRuns < 1)
  ) {
    addCheck(
      "fail",
      "Seed route includes retry recovery examples",
      JSON.stringify(body)
    );
    return;
  }

  if (
    runs >= 2 &&
    (!Number.isFinite(savedScoreSignals) ||
      savedScoreSignals < 1 ||
      !Number.isFinite(discardedScoreSignals) ||
      discardedScoreSignals < 1)
  ) {
    addCheck(
      "fail",
      "Seed route includes saved and discarded behavior signals",
      JSON.stringify(body)
    );
    return;
  }

  addCheck(
    "pass",
    "Seed route creates dashboard history",
    `${runs} runs, ${scoreSignals} score signals, ${durableScoreEvents} durable score events`
  );

  addCheck(
    "pass",
    "Seed route includes retry recovery examples",
    `${happyPathRuns} happy-path runs, ${retryDemoRuns} retry-demo runs`
  );

  addCheck(
    "pass",
    "Seed route includes saved and discarded behavior signals",
    `${savedScoreSignals} saved, ${discardedScoreSignals} discarded`
  );
}

async function checkResetDemoState() {
  const reset = await fetchJson("/api/demo/reset", {
    method: "POST",
    body: JSON.stringify({}),
  });

  if (!reset.ok) {
    addCheck(
      "fail",
      "Reset route clears local demo state",
      reset.error ?? `HTTP ${reset.status}`
    );
    return;
  }

  let status = null;
  let source = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    status = await fetchJson("/api/demo/status");
    source = status.body.scoreHistory?.source;

    if (status.ok && source !== "memory") {
      break;
    }

    await sleep(100);
  }

  if (!status?.ok) {
    addCheck(
      "fail",
      "Reset route clears local demo state",
      status?.error ?? `HTTP ${status?.status ?? 0}`
    );
    return;
  }

  if (source === "memory") {
    addCheck(
      "fail",
      "Reset route clears local demo state",
      "Score history still reports memory-backed live points after reset."
    );
    return;
  }

  addCheck(
    "pass",
    "Reset route clears local demo state",
    `scoreSource=${source ?? "unknown"}`
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function symbolFor(status) {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  return "FAIL";
}
