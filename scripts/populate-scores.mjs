#!/usr/bin/env node

/**
 * Fill the Inngest scores page fast: fire a batch of support runs across
 * every ticket and both models against a running app, vote on each reply
 * the way a visitor would, and optionally kick off split-test batches.
 *
 * Every run goes through the same routes the console uses, so each one is
 * scored exactly like a booth run (policy compliance, cost, escalation,
 * reply quality, first-contact resolution, and CSAT from the vote).
 *
 *   node scripts/populate-scores.mjs [baseUrl] [--runs 40] [--concurrency 6]
 *     [--outage] [--experiments 2]
 *
 * Defaults: 40 runs, 6 at a time, no outage beat (faster), no split tests.
 */

const args = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(process.env.DEMO_BASE_URL ?? args._[0]);
const RUNS = positiveInt(args.runs, 40);
const CONCURRENCY = positiveInt(args.concurrency, 6);
const EXPERIMENTS = positiveInt(args.experiments, 0);
const OUTAGE = args.outage === true;

// Mirrored from src/content/support-demo.ts: the three that go well and the
// one that goes badly. Votes lean the same way, with some noise so CSAT is
// not a flat line.
const TICKETS = [
  { id: "where-is-my-order", group: "good" },
  { id: "change-address", group: "good" },
  { id: "suspicious-link", group: "good" },
  { id: "cancel-subscription", group: "bad" },
];
const GOOD_VOTE_RATE = { good: 0.9, bad: 0.2 };
// Runs that miss a vote: real visitors don't all click.
const VOTE_RATE = 0.8;

const POLL_INTERVAL_MS = 1_000;
const RUN_TIMEOUT_MS = 90_000;

const models = await fetchModels();
console.log(
  `Populating scores on ${baseUrl.origin}: ${RUNS} runs, ${CONCURRENCY} at a time` +
    `${OUTAGE ? ", outage beat on" : ""}` +
    (models ? ` · models ${models.current} / ${models.challenger}` : ""),
);

const started = Date.now();
const results = await pool(
  Array.from({ length: RUNS }, (_, index) => index),
  CONCURRENCY,
  runOne,
);

for (let batch = 0; batch < EXPERIMENTS; batch++) {
  const { ok, body } = await fetchJson("/api/support/experiment", {
    method: "POST",
    body: JSON.stringify({ count: 24 }),
  });
  console.log(
    ok && body.sent
      ? `split test ${batch + 1}/${EXPERIMENTS}: batch ${body.batchId} (24 runs)`
      : `split test ${batch + 1}/${EXPERIMENTS} not sent: ${body?.error ?? "request failed"}`,
  );
}

report(results);

async function runOne(index) {
  const ticket = TICKETS[index % TICKETS.length];
  const model = models
    ? Math.random() < 0.5
      ? models.current
      : models.challenger
    : undefined;

  const trigger = await fetchJson("/api/support/trigger", {
    method: "POST",
    body: JSON.stringify({
      ticketId: ticket.id,
      ...(model ? { model } : {}),
      failureStep: OUTAGE ? undefined : "none",
    }),
  });

  if (!trigger.ok || !trigger.body.sent) {
    return log(index, ticket, "not sent", trigger.body?.error ?? trigger.error);
  }

  const final = await waitForTerminal(trigger.body);
  if (!final) return log(index, ticket, "timed out");
  if (final.status !== "completed") return log(index, ticket, final.status);

  // The vote names the run it judges; without parentRunId cloud CSAT has no
  // agent run to attach to.
  if (Math.random() >= VOTE_RATE) return log(index, ticket, "completed", "no vote");

  const signal = Math.random() < GOOD_VOTE_RATE[ticket.group] ? "good" : "bad";
  const vote = await fetchJson("/api/support/signal", {
    method: "POST",
    body: JSON.stringify({
      supportRunId: trigger.body.supportRunId,
      parentRunId: final.runId,
      signal,
    }),
  });

  return log(
    index,
    ticket,
    "completed",
    vote.ok && vote.body.sent ? `voted ${signal}` : "vote not sent",
  );
}

async function waitForTerminal(trigger) {
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  const params = new URLSearchParams({ supportRunId: trigger.supportRunId });
  if (trigger.inngestEventId) params.set("inngestEventId", trigger.inngestEventId);

  while (Date.now() < deadline) {
    const { ok, body } = await fetchJson(`/api/support/status?${params}`);
    if (ok && (body.status === "completed" || body.status === "failed")) return body;
    await sleep(POLL_INTERVAL_MS);
  }

  return null;
}

async function fetchModels() {
  const { ok, body } = await fetchJson("/api/demo/status");
  const split = body?.splitTest;
  return ok && split?.current && split?.challenger
    ? { current: split.current, challenger: split.challenger }
    : null;
}

function log(index, ticket, status, detail) {
  const line = `[${String(index + 1).padStart(String(RUNS).length)}/${RUNS}] ${ticket.id.padEnd(20)} ${status}${detail ? ` · ${detail}` : ""}`;
  console.log(line);
  return { status, detail };
}

function report(results) {
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const completed = results.filter((result) => result.status === "completed").length;
  const voted = results.filter((result) => result.detail?.startsWith("voted")).length;

  console.log(`\n${completed}/${RUNS} runs completed, ${voted} voted, in ${seconds}s.`);
  console.log(
    "The resolution scorer waits out its 15s follow-up window, so the last scores land shortly after this exits.",
  );

  if (completed < RUNS) process.exit(1);
}

/** Run `task` over `items`, at most `limit` at a time, keeping order. */
async function pool(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchJson(path, init = {}) {
  const url = new URL(path, baseUrl);

  try {
    const response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({}));

    return { ok: response.ok || response.status === 202, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseArgs(argv) {
  const parsed = { _: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = value;
      i++;
    }
  }

  return parsed;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(value) {
  if (!value) return new URL("http://localhost:3000");

  try {
    return new URL(value);
  } catch {
    console.error(`Invalid base URL: ${value}`);
    process.exit(1);
  }
}
