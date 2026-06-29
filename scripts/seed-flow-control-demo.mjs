#!/usr/bin/env node
/**
 * Emit a burst of same-account events for the Flow control demo function.
 *
 * Default behavior is tuned for a short website capture:
 *   - 16 events
 *   - one accountId, so throttle + keyed concurrency both apply
 *   - unique event ids per run, so repeated recordings do not dedupe
 *
 * Examples:
 *   node scripts/seed-flow-control-demo.mjs --dry-run
 *   npm run demo:flow-control -- --count 24 --account-id acme
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(__dirname, "..", ".env.local"));

const argv = process.argv.slice(2);
const dryRun = hasFlag("--dry-run") || process.env.DRY_RUN === "1";
const count = readPositiveInt("--count", "DEMO_FLOW_CONTROL_COUNT", 16);
const batchSize = readPositiveInt("--batch-size", "DEMO_FLOW_CONTROL_BATCH_SIZE", 50);
const batchDelayMs = readNonNegativeInt(
  "--batch-delay-ms",
  "DEMO_FLOW_CONTROL_BATCH_DELAY_MS",
  0
);
const workMs = readNonNegativeInt(
  "--work-ms",
  "DEMO_FLOW_CONTROL_WORK_MS",
  7500
);
const accountId =
  readFlag("--account-id") ?? process.env.DEMO_FLOW_CONTROL_ACCOUNT_ID ?? "acme";
const accountName =
  readFlag("--account-name") ??
  process.env.DEMO_FLOW_CONTROL_ACCOUNT_NAME ??
  "Acme Corp";
const batchId =
  readFlag("--batch-id") ??
  process.env.DEMO_FLOW_CONTROL_BATCH_ID ??
  `flow-${compactTimestamp(new Date())}`;
const eventApiBase =
  (readFlag("--event-api-base-url") ??
    process.env.INNGEST_EVENT_API_BASE_URL ??
    "https://inn.gs").replace(/\/+$/, "");
const eventKey = process.env.INNGEST_EVENT_KEY;
const inngestEnv = process.env.INNGEST_ENV;

if (!dryRun && !eventKey) {
  console.error(
    "Set INNGEST_EVENT_KEY or add it to .env.local before seeding the flow-control demo."
  );
  process.exit(1);
}

if (batchSize < 1) {
  console.error("--batch-size must be at least 1.");
  process.exit(1);
}

const now = Date.now();
const events = Array.from({ length: count }, (_, index) => {
  const requestNumber = index + 1;
  const requestId = `${batchId}-${String(requestNumber).padStart(3, "0")}`;

  return {
    name: "demo/flow-control.requested",
    id: `flow-control-demo:${batchId}:${requestNumber}`,
    ts: now + index,
    data: {
      requestId,
      batchId,
      accountId,
      accountName,
      workMs,
      requestedAt: new Date(now + index).toISOString(),
      source: "booth-demo",
    },
  };
});

printPlan();

if (dryRun) {
  process.exit(0);
}

const sentIds = [];
for (const [index, batch] of chunk(events, batchSize).entries()) {
  const result = await sendBatch(batch);
  const ids = Array.isArray(result.ids) ? result.ids : [];
  sentIds.push(...ids);
  console.log(
    `Sent flow-control batch ${index + 1}/${Math.ceil(events.length / batchSize)} ` +
      `(${batch.length} events${ids.length ? `, ${ids.length} ids` : ""}).`
  );

  if (batchDelayMs > 0 && index < Math.ceil(events.length / batchSize) - 1) {
    await sleep(batchDelayMs);
  }
}

console.log("");
console.log(
  [
    `Seeded ${events.length} flow-control demo events.`,
    `Function: Flow control demo`,
    `Event: demo/flow-control.requested`,
    `Account key: ${accountId}`,
    `Batch ID: ${batchId}`,
  ].join("\n")
);

if (sentIds.length > 0) {
  const visibleIds = sentIds.slice(0, 12);
  console.log(
    `Inngest event IDs: ${visibleIds.join(", ")}${
      sentIds.length > visibleIds.length ? `, ... (${sentIds.length} total)` : ""
    }`
  );
}

async function sendBatch(batch) {
  const response = await fetch(`${eventApiBase}/e/${eventKey}`, {
    method: "POST",
    headers: omitUndefined({
      "Content-Type": "application/json",
      "x-inngest-env": inngestEnv,
    }),
    body: JSON.stringify(batch),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(
      `Event ingest failed with HTTP ${response.status}: ${JSON.stringify(body, null, 2)}`
    );
    process.exit(1);
  }

  return body;
}

function printPlan() {
  console.log(
    `${dryRun ? "Dry run: " : ""}flow-control demo seed plan for ${eventApiBase}/e/<INNGEST_EVENT_KEY>`
  );
  if (inngestEnv) {
    console.log(`Inngest env header: ${inngestEnv}`);
  }
  console.log(
    [
      `Events: ${events.length}`,
      `Account key: ${accountId}`,
      `Work per run: ${workMs}ms`,
      `Batch ID: ${batchId}`,
      `First event id: ${events[0]?.id ?? "n/a"}`,
    ].join("\n")
  );
  console.log("");
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readFlag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;

  return argv[index + 1];
}

function hasFlag(name) {
  return argv.includes(name);
}

function readPositiveInt(flag, envName, fallback) {
  const value = readFlag(flag) ?? process.env[envName];
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    console.error(`${flag} / ${envName} must be a positive integer.`);
    process.exit(1);
  }

  return Math.floor(parsed);
}

function readNonNegativeInt(flag, envName, fallback) {
  const value = readFlag(flag) ?? process.env[envName];
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error(`${flag} / ${envName} must be a non-negative integer.`);
    process.exit(1);
  }

  return Math.floor(parsed);
}

function compactTimestamp(date) {
  return date.toISOString().replace(/[-:.]/g, "").replace("Z", "");
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function omitUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
