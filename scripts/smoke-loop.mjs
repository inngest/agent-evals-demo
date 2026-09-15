#!/usr/bin/env node

/**
 * Smoke test for the loop demo at `/`.
 *
 * `demo:smoke` exercises /api/trigger, /api/run-query and /api/score - the
 * legacy incident-triage surfaces. It never touches any /api/research/* route,
 * so a green run there proves nothing about the demo actually being given at
 * the booth. This script covers the loop path instead.
 *
 * The assertions are deliberately hard failures rather than warnings: the
 * whole point is to catch a demo that renders but is quietly simulated, or a
 * run whose brief cannot be parsed out of the timeline.
 */

const baseUrl = normalizeBaseUrl(process.env.DEMO_BASE_URL ?? process.argv[2]);
const checks = [];

const FAILING_STEP = "fetch-competitor-changelog";
const BRIEF_STEP = "call-llm-synthesize-brief";
const POLL_INTERVAL_MS = 800;
const POLL_TIMEOUT_MS = Number(process.env.DEMO_SMOKE_TIMEOUT_MS ?? 120_000);

await checkHealth();
const trigger = await checkTrigger();
const final = trigger ? await pollToTerminal(trigger) : null;

if (final) {
  checkTimeline(final);
  await checkSignal(trigger);
  await checkExperiment(trigger, final);
}

report();

async function checkHealth() {
  const { ok, status, body, error } = await fetchJson("/api/health");

  if (!ok) {
    addCheck("fail", "Liveness endpoint", error ?? `HTTP ${status}`);
    return null;
  }

  addCheck("pass", "Liveness endpoint", "/api/health responded");
  return body;
}

async function checkTrigger() {
  const { ok, status, body, error } = await fetchJson("/api/research/trigger", {
    method: "POST",
    body: JSON.stringify({
      topic: "Competitive research brief for AI workflow platforms",
      failureStep: FAILING_STEP,
      useSandbox: true,
      model: "gpt-5.5",
    }),
  });

  if (!ok) {
    addCheck("fail", "Trigger research run", error ?? `HTTP ${status}`);
    return null;
  }

  if (!body.researchRunId) {
    addCheck("fail", "Trigger research run", "no researchRunId returned");
    return null;
  }

  if (!body.sent) {
    addCheck(
      "fail",
      "Trigger research run",
      `Inngest did not accept the event: ${body.error ?? "unknown reason"}`
    );
    return body;
  }

  addCheck("pass", "Trigger research run", `researchRunId=${body.researchRunId}`);
  return body;
}

async function pollToTerminal(trigger) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let last = null;

  while (Date.now() < deadline) {
    const params = new URLSearchParams({
      researchRunId: trigger.researchRunId,
      useSandbox: "true",
      failureStep: FAILING_STEP,
    });

    if (trigger.inngestEventId) {
      params.set("inngestEventId", trigger.inngestEventId);
    }

    const { ok, body } = await fetchJson(`/api/research/status?${params}`);

    if (ok) {
      last = body;

      if (body.status === "completed" || body.status === "failed") {
        addCheck(
          body.status === "completed" ? "pass" : "fail",
          "Run reaches a terminal state",
          `status=${body.status}, steps=${body.completedSteps}/${body.totalSteps}`
        );
        return body;
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  addCheck(
    "fail",
    "Run reaches a terminal state",
    `still ${last?.status ?? "unknown"} after ${POLL_TIMEOUT_MS / 1000}s`
  );
  return last;
}

function checkTimeline(final) {
  const timeline = final.timeline;

  if (!timeline) {
    addCheck("fail", "Timeline captured", "no timeline in the status response");
    return;
  }

  // The central assertion. A simulated timeline means Inngest never ran the
  // function: the UI still renders, which is exactly why this has to fail
  // loudly rather than pass quietly.
  if (timeline.simulated || final.simulated) {
    addCheck(
      "fail",
      "Timeline is real, not simulated",
      "the run fell back to the offline rehearsal timeline; Inngest did not execute it"
    );
    return;
  }

  addCheck("pass", "Timeline is real, not simulated", `runId=${timeline.runId}`);

  const steps = timeline.steps ?? [];

  // Exact, not a floor: the Run stage copy states this number out loud, so a
  // step added or removed without updating it should fail here.
  const expectedSteps = 9;
  addCheck(
    steps.length === expectedSteps ? "pass" : "fail",
    "All research steps recorded",
    `${steps.length} steps (expected exactly ${expectedSteps} with sandbox off; update runBrief in loop-messaging.ts if this changed)`
  );

  const replayed = steps.filter((step) => step.memoized).length;
  addCheck(
    replayed > 0 ? "pass" : "fail",
    "Retry and replay beat fired",
    replayed > 0
      ? `${replayed} memoized step(s)`
      : `no memoized steps; the ${FAILING_STEP} failure did not produce a replay`
  );

  const briefStep = steps.find((step) => step.displayName === BRIEF_STEP);

  if (!briefStep?.output) {
    addCheck("fail", "Research brief captured", `${BRIEF_STEP} has no output`);
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(briefStep.output);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    // This is the payload-truncation regression: unparseable output makes the
    // research output card disappear from the UI without any other symptom.
    addCheck(
      "fail",
      "Research brief parses",
      `${BRIEF_STEP} output is not valid JSON (payload truncation regression?)`
    );
    return;
  }

  if (typeof parsed.output !== "string" || parsed.output.length === 0) {
    addCheck("fail", "Research brief parses", "parsed output field is empty");
    return;
  }

  addCheck(
    "pass",
    "Research brief parses",
    `${parsed.output.length} chars${parsed.__truncated ? " (truncated, still valid)" : ""}`
  );
}

async function checkSignal(trigger) {
  const { ok, status, body, error } = await fetchJson("/api/research/signal", {
    method: "POST",
    body: JSON.stringify({
      researchRunId: trigger.researchRunId,
      signal: "useful",
    }),
  });

  if (!ok) {
    addCheck("fail", "Feedback signal recorded", error ?? `HTTP ${status}`);
    return;
  }

  addCheck(
    typeof body.score === "number" ? "pass" : "fail",
    "Feedback signal recorded",
    `signal=${body.signal}, score=${body.score}`
  );
}

async function checkExperiment(trigger, final) {
  const { ok, status, body, error } = await fetchJson(
    "/api/research/experiment",
    {
      method: "POST",
      body: JSON.stringify({
        topic: "Competitive research brief for AI workflow platforms",
        corpusRuns: [
          {
            researchRunId: trigger.researchRunId,
            sessionId: final.result?.sessionId,
            feedbackSignal: "useful",
            feedbackScore: 1,
          },
        ],
      }),
    }
  );

  if (!ok) {
    addCheck("fail", "Model bakeoff accepted", error ?? `HTTP ${status}`);
    return;
  }

  addCheck(
    body.sent ? "pass" : "fail",
    "Model bakeoff accepted",
    body.sent
      ? `experimentRunId=${body.experimentRunId}`
      : `Inngest did not accept the event: ${body.error ?? "unknown reason"}`
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
