#!/usr/bin/env node

/**
 * Smoke test for the booth demo at `/`: the support agent, its feedback
 * metric, and the model split test, end to end against a running app.
 *
 * The assertions are deliberately hard failures rather than warnings. The
 * booth UI falls back to a labelled replay when Inngest is unreachable, so a
 * demo that renders fine can still be quietly simulated; this script is how
 * you find out before the doors open.
 */

const baseUrl = normalizeBaseUrl(process.env.DEMO_BASE_URL ?? process.argv[2]);
const checks = [];

const FAILING_STEP = "lookup-order";
const REPLY_STEP = "call-llm-draft-reply";
// The durable steps the booth draws, in order. The timeline also carries the
// step.sendEvent that hands off to the scorer, which the pipeline does not show.
const AGENT_STEPS = [
  "classify-ticket",
  "lookup-customer",
  FAILING_STEP,
  REPLY_STEP,
  "policy-check",
  "send-reply",
];
// Stated out loud in the booth copy ("six durable steps").
const EXPECTED_STEPS = 6;
const SPLIT_RUNS = 8;
const POLL_INTERVAL_MS = 600;
const POLL_TIMEOUT_MS = Number(process.env.DEMO_SMOKE_TIMEOUT_MS ?? 60_000);

await checkHealth();
const trigger = await checkTrigger();
const final = trigger?.sent ? await pollToTerminal(trigger) : null;

if (final) {
  checkTimeline(final);
  await checkSignal(trigger);
  await checkSplitTest();
}

report();

async function checkHealth() {
  const { ok, status, error } = await fetchJson("/api/health");

  addCheck(ok ? "pass" : "fail", "Liveness endpoint", ok ? "/api/health responded" : error ?? `HTTP ${status}`);
}

async function checkTrigger() {
  const { ok, status, body, error } = await fetchJson("/api/support/trigger", {
    method: "POST",
    body: JSON.stringify({ ticketId: "where-is-my-order" }),
  });

  if (!ok || !body.supportRunId) {
    addCheck("fail", "Trigger support run", error ?? `HTTP ${status}, no supportRunId`);
    return null;
  }

  if (!body.sent) {
    addCheck(
      "fail",
      "Trigger support run",
      `Inngest did not accept the event: ${body.error ?? "unknown reason"}`,
    );
    return body;
  }

  addCheck("pass", "Trigger support run", `supportRunId=${body.supportRunId}`);
  return body;
}

async function pollToTerminal(trigger) {
  const started = Date.now();
  const deadline = started + POLL_TIMEOUT_MS;
  let last = null;

  while (Date.now() < deadline) {
    const params = new URLSearchParams({ supportRunId: trigger.supportRunId });
    if (trigger.inngestEventId) params.set("inngestEventId", trigger.inngestEventId);

    const { ok, body } = await fetchJson(`/api/support/status?${params}`);

    if (ok) {
      last = body;

      if (body.status === "completed" || body.status === "failed") {
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        addCheck(
          body.status === "completed" ? "pass" : "fail",
          "Run reaches a terminal state",
          `status=${body.status} in ${seconds}s`,
        );
        // The booth's watchdog replays a run that has not finished in time;
        // a live run slower than this will not be what the audience sees.
        addCheck(
          Number(seconds) <= 20 ? "pass" : "warn",
          "Run fits the booth budget",
          `${seconds}s (budget 20s)`,
        );
        return body;
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  addCheck(
    "fail",
    "Run reaches a terminal state",
    `still ${last?.status ?? "unknown"} after ${POLL_TIMEOUT_MS / 1000}s`,
  );
  return null;
}

function checkTimeline(final) {
  const steps = (final.timeline?.steps ?? []).filter((step) =>
    AGENT_STEPS.includes(step.displayName),
  );

  // Exact, not a floor: the booth copy says "six durable steps" out loud.
  addCheck(
    steps.length === EXPECTED_STEPS ? "pass" : "fail",
    "All support steps recorded",
    `${steps.length} steps (expected exactly ${EXPECTED_STEPS}; update the booth copy if this changed)`,
  );

  const failing = steps.find((step) => step.displayName === FAILING_STEP);
  addCheck(
    (failing?.failedAttempts?.length ?? 0) > 0 ? "pass" : "fail",
    "Outage beat fired",
    failing?.failedAttempts?.length
      ? `${FAILING_STEP} failed ${failing.failedAttempts.length}x, then recovered`
      : `${FAILING_STEP} never failed; the 503 beat did not fire`,
  );

  const replayed = steps.filter((step) => step.memoized).length;
  addCheck(
    replayed > 0 ? "pass" : "fail",
    "Finished steps replayed, not re-run",
    replayed > 0 ? `${replayed} memoized step(s)` : "no memoized steps after the retry",
  );

  const reply = steps.find((step) => step.displayName === REPLY_STEP);
  let parsed = null;
  try {
    parsed = reply?.output ? JSON.parse(reply.output) : null;
  } catch {
    parsed = null;
  }

  // Unparseable output silently removes the reply bubble from the booth.
  addCheck(
    typeof parsed?.output === "string" && parsed.output.length > 0 ? "pass" : "fail",
    "Drafted reply captured",
    parsed?.output ? `${parsed.output.length} chars` : `${REPLY_STEP} output missing or not valid JSON`,
  );
}

async function checkSignal(trigger) {
  const { ok, status, body, error } = await fetchJson("/api/support/signal", {
    method: "POST",
    body: JSON.stringify({ supportRunId: trigger.supportRunId, signal: "good" }),
  });

  addCheck(
    ok && body.sent ? "pass" : "fail",
    "Feedback metric sent",
    ok ? `signal=${body.signal}, score=${body.score}, sent=${body.sent}` : error ?? `HTTP ${status}`,
  );
}

async function checkSplitTest() {
  const { ok, body } = await fetchJson("/api/support/experiment", {
    method: "POST",
    body: JSON.stringify({ count: SPLIT_RUNS }),
  });

  if (!ok || !body.sent) {
    addCheck("fail", "Split test accepted", body?.error ?? "request failed");
    return;
  }

  const deadline = Date.now() + 15_000;
  let last = null;

  while (Date.now() < deadline) {
    const status = await fetchJson(
      `/api/support/experiment/status?batchId=${encodeURIComponent(body.batchId)}&count=${SPLIT_RUNS}`,
    );
    last = status.body;
    if (last?.completedRuns >= SPLIT_RUNS) break;
    await sleep(POLL_INTERVAL_MS);
  }

  addCheck(
    last?.completedRuns >= SPLIT_RUNS ? "pass" : "fail",
    "Split test lands within 15s",
    `${last?.completedRuns ?? 0}/${SPLIT_RUNS} runs, winner=${last?.winner ?? "none"}`,
  );
}

function report() {
  for (const check of checks) {
    console.log(`${symbolFor(check.status)} ${check.label}`);
    if (check.detail) console.log(`  ${check.detail}`);
  }

  const failures = checks.filter((check) => check.status === "fail");

  if (failures.length > 0) {
    console.error(`\n${failures.length} loop smoke check(s) failed.`);
    process.exit(1);
  }

  console.log(`\nAll ${checks.length} loop smoke checks passed.`);
}

async function fetchJson(path, init = {}) {
  const url = new URL(path, baseUrl);

  try {
    const response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({}));

    return {
      ok: response.ok || response.status === 202,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function addCheck(status, label, detail) {
  checks.push({ status, label, detail });
}

function symbolFor(status) {
  return status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(value) {
  if (!value) return new URL("http://localhost:3000");

  try {
    return new URL(value);
  } catch {
    console.error(`Invalid DEMO_BASE_URL: ${value}`);
    process.exit(1);
  }
}
