#!/usr/bin/env node
/**
 * Emit a large, story-shaped research-agent corpus into Inngest Cloud.
 *
 * The script sends:
 *   1. research/run.requested       -> durable Act 1 agent runs
 *   2. seeded feedback instructions -> emitted by the agent after it knows
 *                                      the real Cloud run ID, so Act 2 scores
 *                                      attach back to the durable agent run
 *   3. research/experiment.requested -> Act 3 model bakeoff runs
 *
 * Default profile:
 *   - 120 research-agent runs
 *   - 90 model-bakeoff experiment requests
 *   - feedback streaks that begin with 2-5 positive signals, then a 10-run
 *     negative streak, then recovery positives, with randomized repeats.
 *
 * Examples:
 *   node scripts/seed-research-load.mjs --dry-run
 *   node scripts/seed-research-load.mjs --count 250 --experiments 180
 *   npm run demo:seed-research-load -- --count 300 --experiments 300
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultResearchTopic,
  researchSessionId,
} from "../src/content/research-demo.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(__dirname, "..", ".env.local"));

const argv = process.argv.slice(2);
const dryRun = hasFlag("--dry-run") || process.env.DRY_RUN === "1";
const batchId =
  readFlag("--batch-id") ??
  process.env.DEMO_RESEARCH_SEED_BATCH_ID ??
  `aiewf-${compactTimestamp(new Date())}`;
const seed = readFlag("--seed") ?? process.env.DEMO_RESEARCH_SEED ?? batchId;
const rng = mulberry32(hashString(seed));
const count = readPositiveInt("--count", "DEMO_RESEARCH_SEED_COUNT", 120);
const experiments = readPositiveInt(
  "--experiments",
  "DEMO_RESEARCH_EXPERIMENT_COUNT",
  Math.max(1, Math.ceil(count * 0.75))
);
const batchSize = readPositiveInt("--batch-size", "DEMO_RESEARCH_BATCH_SIZE", 50);
const batchDelayMs = readNonNegativeInt(
  "--batch-delay-ms",
  "DEMO_RESEARCH_BATCH_DELAY_MS",
  100
);
const spacingMs = readNonNegativeInt(
  "--spacing-ms",
  "DEMO_RESEARCH_SPACING_MS",
  30 * 60 * 1000
);
const feedbackOffsetMs = readNonNegativeInt(
  "--feedback-offset-ms",
  "DEMO_RESEARCH_FEEDBACK_OFFSET_MS",
  8 * 60 * 1000
);
const experimentOffsetMs = readNonNegativeInt(
  "--experiment-offset-ms",
  "DEMO_RESEARCH_EXPERIMENT_OFFSET_MS",
  15 * 60 * 1000
);
const failureRate = readProbability(
  "--failure-rate",
  "DEMO_RESEARCH_FAILURE_RATE",
  0.14
);
const latencyMs = readNonNegativeInt(
  "--latency-ms",
  "DEMO_RESEARCH_LATENCY_MS",
  0
);
const eventApiBase =
  (readFlag("--event-api-base-url") ??
    process.env.INNGEST_EVENT_API_BASE_URL ??
    "https://inn.gs").replace(/\/+$/, "");
const eventKey = process.env.INNGEST_EVENT_KEY;
const inngestEnv = process.env.INNGEST_ENV;
const fromTs = parseFromTimestamp(
  readFlag("--from") ?? process.env.DEMO_RESEARCH_SEED_FROM,
  count,
  spacingMs
);
const skipRuns = hasFlag("--no-runs");
const skipFeedback = hasFlag("--no-feedback");
const skipExperiments = hasFlag("--no-experiments");

if (!dryRun && !eventKey) {
  console.error(
    "Set INNGEST_EVENT_KEY or add it to .env.local before seeding Inngest Cloud."
  );
  process.exit(1);
}

if (batchSize < 1) {
  console.error("--batch-size must be at least 1.");
  process.exit(1);
}

const feedbackSignals = buildFeedbackSignals(count, rng);
const researchEvents = skipRuns
  ? []
  : Array.from({ length: count }, (_, index) =>
      buildResearchRunEvent(index, feedbackSignals[index])
    );
const experimentEvents = skipExperiments
  ? []
  : Array.from({ length: experiments }, (_, index) =>
      buildExperimentEvent(index, researchEvents)
    );
const allEvents = [...researchEvents, ...experimentEvents];
const positiveSignals = feedbackSignals.filter((signal) => signal !== "missed-context");
const negativeSignals = feedbackSignals.filter((signal) => signal === "missed-context");
const retryRuns = researchEvents.filter(
  (event) => event.data.failureStep
).length;

printPlan();

if (dryRun) {
  process.exit(0);
}

const sentIds = [];
for (const [index, batch] of chunk(allEvents, batchSize).entries()) {
  const result = await sendBatch(batch);
  const ids = Array.isArray(result.ids) ? result.ids : [];
  sentIds.push(...ids);
  console.log(
    `Sent batch ${index + 1}/${Math.ceil(allEvents.length / batchSize)} ` +
      `(${batch.length} events${ids.length ? `, ${ids.length} ids` : ""}).`
  );

  if (batchDelayMs > 0 && index < Math.ceil(allEvents.length / batchSize) - 1) {
    await sleep(batchDelayMs);
  }
}

console.log("");
console.log(
  [
    `Seeded ${researchEvents.length} Act 1 research-agent events.`,
    skipFeedback
      ? "Skipped Act 2 feedback instructions."
      : `Queued ${feedbackSignals.length} Act 2 feedback instructions ` +
        `(${positiveSignals.length} positive, ${negativeSignals.length} negative).`,
    `Seeded ${experimentEvents.length} Act 3 experiment events.`,
    `Expected downstream function runs: ~${researchEvents.length * (skipFeedback ? 2 : 3) + experimentEvents.length}` +
      `${retryRuns ? ` plus ${retryRuns} retry attempts` : ""}.`,
    `Batch ID: ${batchId}`,
    `Seed: ${seed}`,
  ].join("\n")
);

function buildResearchRunEvent(index, feedbackSignal) {
  const ts = fromTs + index * spacingMs;
  const researchRunId = `${batchId}-research-${String(index + 1).padStart(4, "0")}`;
  const model = rng() < 0.58 ? "gpt-5.5" : "claude-opus-4.8";
  const shouldRetry = rng() < failureRate;
  const failureStep = shouldRetry ? pickFailureStep(index) : undefined;
  const sessionId = `${researchSessionId}-wave-${Math.floor(index / 25) + 1}`;
  const feedbackAt = new Date(ts + feedbackOffsetMs).toISOString();

  return omitUndefined({
    name: "research/run.requested",
    id: `seed-research-load:${batchId}:run:${index + 1}`,
    ts,
    data: omitUndefined({
      researchRunId,
      topic: topicForIndex(index),
      cadence: "seeded",
      model,
      failureStep,
      latencyMs,
      seededFeedbackSignal: skipFeedback ? undefined : feedbackSignal,
      seededFeedbackAt: skipFeedback ? undefined : feedbackAt,
      requestedAt: new Date(ts).toISOString(),
      source: "booth-demo",
    }),
    meta: sessionMeta(sessionId),
  });
}

function buildExperimentEvent(index, runEvents) {
  const baseTs = fromTs + (runEvents.length ? index % runEvents.length : index) * spacingMs;
  const ts = baseTs + experimentOffsetMs + Math.floor(index / Math.max(1, count)) * spacingMs;
  const experimentRunId = `${batchId}-experiment-${String(index + 1).padStart(4, "0")}`;
  const corpusRunIds = sampleCorpusRunIds(index, runEvents);
  const sessionId = `${researchSessionId}-experiment-wave-${Math.floor(index / 25) + 1}`;

  return {
    name: "research/experiment.requested",
    id: `seed-research-load:${batchId}:experiment:${index + 1}`,
    ts,
    data: {
      experimentRunId,
      topic: topicForIndex(index),
      corpusRunIds,
      requestedAt: new Date(ts).toISOString(),
      source: "booth-demo",
    },
    meta: sessionMeta(sessionId),
  };
}

function buildFeedbackSignals(total, random) {
  const signals = [];
  let cycle = 0;

  while (signals.length < total) {
    pushPositive(signals, randomInt(random, 2, 5), random);
    pushNegative(signals, cycle === 0 ? 10 : randomInt(random, 3, 10));
    pushPositive(signals, randomInt(random, 5, 14), random);

    if (random() < 0.35) {
      pushNegative(signals, randomInt(random, 1, 3));
    }

    cycle += 1;
  }

  return signals.slice(0, total);
}

function pushPositive(signals, length, random) {
  for (let i = 0; i < length; i += 1) {
    signals.push(random() < 0.22 ? "saved" : "useful");
  }
}

function pushNegative(signals, length) {
  for (let i = 0; i < length; i += 1) {
    signals.push("missed-context");
  }
}

function topicForIndex(index) {
  const topics = [
    defaultResearchTopic,
    "Competitive research brief for durable AI agent platforms",
    "Q3 win-loss readout for AI workflow orchestration",
    "Model cost and quality comparison for autonomous research agents",
  ];

  return topics[index % topics.length];
}

function pickFailureStep(index) {
  const failureSteps = [
    "fetch-competitor-changelog",
    "run-parallel-web-search",
    "query-g2-reviews",
    "fetch-slack-win-loss",
  ];

  return failureSteps[index % failureSteps.length];
}

function sampleCorpusRunIds(index, runEvents) {
  if (runEvents.length === 0) {
    return [`${batchId}-research-placeholder-${String(index + 1).padStart(4, "0")}`];
  }

  const size = Math.min(runEvents.length, randomInt(rng, 8, 24));
  const start = (index * 7) % runEvents.length;

  return Array.from({ length: size }, (_, offset) => {
    const event = runEvents[(start + offset) % runEvents.length];
    return event.data.researchRunId;
  });
}

async function sendBatch(events) {
  const response = await fetch(`${eventApiBase}/e/${eventKey}`, {
    method: "POST",
    headers: omitUndefined({
      "Content-Type": "application/json",
      "x-inngest-env": inngestEnv,
    }),
    body: JSON.stringify(events),
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
    `${dryRun ? "Dry run: " : ""}research load seed plan for ${eventApiBase}/e/<INNGEST_EVENT_KEY>`
  );
  if (inngestEnv) {
    console.log(`Inngest env header: ${inngestEnv}`);
  }
  console.log(
    [
      `Batch ID: ${batchId}`,
      `Seed: ${seed}`,
      `Timeline starts: ${new Date(fromTs).toISOString()}`,
      `Act 1 research runs: ${researchEvents.length}`,
      skipFeedback
        ? "Act 2 feedback: skipped"
        : `Act 2 feedback: ${feedbackSignals.length} instructions ` +
          `(${positiveSignals.length} positive, ${negativeSignals.length} negative)`,
      `Act 1 retry demos: ${retryRuns}`,
      `Act 3 experiments: ${experimentEvents.length}`,
      `Events emitted directly: ${allEvents.length}`,
    ].join("\n")
  );
  console.log("");
  console.log("First feedback signals:");
  console.log(
    feedbackSignals
      .slice(0, Math.min(30, feedbackSignals.length))
      .map((signal) => (signal === "missed-context" ? "-" : "+"))
      .join(" ")
  );
  console.log("");
  console.log("Sample events:");
  for (const event of [...researchEvents.slice(0, 3), ...experimentEvents.slice(0, 2)]) {
    console.log(
      `  ${event.name} ${event.id} ${new Date(event.ts).toISOString()}`
    );
  }
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

function readProbability(flag, envName, fallback) {
  const value = readFlag(flag) ?? process.env[envName];
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    console.error(`${flag} / ${envName} must be between 0 and 1.`);
    process.exit(1);
  }

  return parsed;
}

function parseFromTimestamp(value, total, stepMs) {
  if (value) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      console.error("--from / DEMO_RESEARCH_SEED_FROM must be an ISO date.");
      process.exit(1);
    }

    return parsed;
  }

  return Date.now() - Math.max(1, total) * Math.max(1, stepMs);
}

function sessionMeta(sessionId) {
  return {
    sessions: {
      research_session_id: sessionId,
    },
  };
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function omitUndefined(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  );
}

function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z");
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seedValue) {
  return function next() {
    let value = (seedValue += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
