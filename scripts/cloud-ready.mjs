#!/usr/bin/env node

import { spawn } from "node:child_process";

const baseUrl = process.env.DEMO_BASE_URL ?? process.argv[2];
const shouldSeed = process.env.DEMO_CLOUD_READY_SEED === "1";
const insightsAttempts = parsePositiveInt(
  process.env.DEMO_CLOUD_READY_INSIGHTS_ATTEMPTS,
  shouldSeed ? 6 : 1
);
const insightsDelayMs = parsePositiveInt(
  process.env.DEMO_CLOUD_READY_INSIGHTS_DELAY_MS,
  5000
);

if (!baseUrl) {
  console.error("Set DEMO_BASE_URL or pass the deployed app URL as argv[2].");
  process.exit(1);
}

const parsedBaseUrl = parseUrl(baseUrl);

if (isLocalhost(parsedBaseUrl)) {
  console.error("demo:cloud-ready requires a deployed URL, not localhost.");
  process.exit(1);
}

if (parsedBaseUrl.protocol !== "https:") {
  console.error("demo:cloud-ready requires an HTTPS deployed URL.");
  process.exit(1);
}

const serveUrl = new URL("/api/inngest", parsedBaseUrl).toString();
const steps = [
  {
    label: "Cloud deploy precheck",
    command: "npm",
    args: ["run", "demo:cloud-handoff"],
    env: { DEMO_BASE_URL: baseUrl },
  },
  {
    label: "Cloud API auth",
    check: () =>
      requireEnv(
        "INNGEST_API_KEY",
        "Set INNGEST_API_KEY before running Cloud API commands."
      ),
  },
  {
    label: "Cloud app ID",
    check: () =>
      requireEnv(
        "INNGEST_CLOUD_APP_ID",
        "Set INNGEST_CLOUD_APP_ID before syncing the Cloud app."
      ),
  },
  {
    label: "Sync Cloud app",
    command: "npx",
    args: [
      "inngest-cli@latest",
      "api",
      "--prod",
      "sync-app",
      "--app-id",
      process.env.INNGEST_CLOUD_APP_ID,
      "--url",
      serveUrl,
    ],
  },
  ...(shouldSeed
    ? [
        {
          label: "Cloud seed token",
          check: () =>
            requireEnv(
              "DEMO_SEED_TOKEN",
              "Set DEMO_SEED_TOKEN when using DEMO_CLOUD_READY_SEED=1."
            ),
        },
        {
          label: "Seed Cloud history",
          command: "npm",
          args: ["run", "demo:seed"],
          env: { DEMO_BASE_URL: baseUrl },
        },
      ]
    : []),
  {
    label: "Insights score query",
    command: "npm",
    args: ["run", "demo:insights-check"],
    attempts: insightsAttempts,
    retryDelayMs: insightsDelayMs,
  },
  {
    label: "Final Cloud handoff",
    command: "npm",
    args: ["run", "demo:cloud-handoff"],
    env: { DEMO_BASE_URL: baseUrl, DEMO_CLOUD_HANDOFF_PHASE: "final" },
  },
  {
    label: "Cloud preflight",
    command: "npm",
    args: ["run", "demo:preflight"],
    env: { DEMO_BASE_URL: baseUrl },
  },
  {
    label: "Cloud smoke",
    command: "npm",
    args: ["run", "demo:smoke"],
    env: { DEMO_BASE_URL: baseUrl },
  },
  {
    label: "Cloud viewport QA",
    command: "npm",
    args: ["run", "demo:viewport"],
    env: { DEMO_BASE_URL: baseUrl },
  },
];

console.log(`Cloud demo readiness target: ${baseUrl}`);

try {
  for (const step of steps) {
    console.log(`\n== ${step.label} ==`);
    await runStep(step);
  }
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : "Cloud readiness failed."}`);
  process.exit(1);
}

console.log(`\nCloud demo readiness passed for ${baseUrl}.`);

async function runStep(step) {
  const attempts = step.attempts ?? 1;
  const retryDelayMs = step.retryDelayMs ?? 0;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      console.log(`Retrying ${step.label} (${attempt}/${attempts})...`);
    }

    try {
      await runStepOnce(step);
      return;
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        const message =
          error instanceof Error ? error.message : `${step.label} failed.`;
        console.warn(message);
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError ?? new Error(`${step.label} failed.`);
}

function runStepOnce(step) {
  if (step.check) {
    return Promise.resolve().then(step.check);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      env: { ...process.env, ...step.env },
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${step.label} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`
        )
      );
    });
  });
}

function requireEnv(name, message) {
  if (!process.env[name]) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    console.error(`Invalid DEMO_BASE_URL: ${value}`);
    process.exit(1);
  }
}

function isLocalhost(url) {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  );
}
