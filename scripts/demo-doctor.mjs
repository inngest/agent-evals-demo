#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

const checks = [];
const candidates = buildCandidateUrls();
let selectedApp = null;
let missingCloudInputs = [];

await checkDemoApp();
await checkSelectedAppSurface();
await checkLocalInngestDevServer();
await checkCloudInputs();
await checkVercelLink();

for (const check of checks) {
  console.log(`${check.status.toUpperCase()} ${check.label}`);
  if (check.detail) {
    console.log(`  ${check.detail}`);
  }
}

if (selectedApp) {
  console.log("\nDetected local commands:");
  console.log(`  DEMO_BASE_URL=${selectedApp.url} npm run demo:preflight`);
  console.log(`  DEMO_BASE_URL=${selectedApp.url} npm run demo:local-ready`);
}

console.log("\nCloud gate:");
console.log("  npm run demo:cloud-handoff");
printCloudHandoffInputs();

const failures = checks.filter((check) => check.status === "fail");
if (failures.length > 0) {
  console.error(`\n${failures.length} demo doctor check(s) failed.`);
  process.exit(1);
}

async function checkDemoApp() {
  const results = [];

  for (const candidate of candidates) {
    const result = await fetchJson(new URL("/api/demo/status", candidate.url));
    results.push({ ...candidate, result });
  }

  const healthy = results.filter(({ result }) => isCurrentStatusBody(result.body));

  if (healthy.length === 0) {
    addCheck(
      "fail",
      "Demo app is running",
      `No current /api/demo/status response found at ${results
        .map(({ url }) => url)
        .join(", ")}. Start with \`npm run dev\`.`
    );
    return;
  }

  const envTarget = healthy.find(({ source }) => source === "DEMO_BASE_URL");
  selectedApp = envTarget ?? healthy[0];

  addCheck(
    "pass",
    "Demo app is running",
    `${selectedApp.url} (${selectedApp.source})`
  );

  if (process.env.DEMO_BASE_URL && !envTarget) {
    const configured = normalizeBaseUrl(process.env.DEMO_BASE_URL);
    addCheck(
      "warn",
      "DEMO_BASE_URL points at the current demo",
      `${configured ?? process.env.DEMO_BASE_URL} did not expose the current status API; using ${selectedApp.url}.`
    );
  }

  const otherHealthy = healthy.filter(({ url }) => url !== selectedApp.url);
  if (otherHealthy.length > 0) {
    addCheck(
      "warn",
      "Only one current demo app should be active",
      `Also found ${otherHealthy.map(({ url }) => url).join(", ")}. Close stale dev servers before the booth.`
    );
  }
}

async function checkSelectedAppSurface() {
  if (!selectedApp) {
    return;
  }

  const status = await fetchJson(new URL("/api/demo/status", selectedApp.url));
  const body = status.body;
  const mode = stringValue(body.runtime?.inngestMode) ?? "unknown";
  const dashboardUrl =
    stringValue(body.runtime?.dashboardUrl) ?? "http://localhost:8288";
  const runsUrl = stringValue(body.runtime?.runsUrl) ?? dashboardUrl;
  const scoreSource = stringValue(body.scoreHistory?.source) ?? "unknown";
  const points = numberValue(body.scoreHistory?.points) ?? 0;

  addCheck(
    "pass",
    "Demo status is current",
    `mode=${mode}, dashboard=${dashboardUrl}, runs=${runsUrl}, scoreSource=${scoreSource}, points=${points}`
  );

  const serve = await fetchJson(new URL("/api/inngest", selectedApp.url));
  const functionCount = numberValue(serve.body.function_count) ?? 0;

  if (serve.ok && functionCount >= 2) {
    addCheck(
      "pass",
      "Inngest serve endpoint exposes demo functions",
      `${functionCount} functions, mode=${stringValue(serve.body.mode) ?? "unknown"}`
    );
  } else {
    addCheck(
      "fail",
      "Inngest serve endpoint exposes demo functions",
      serve.detail ?? `Expected at least 2 functions, received ${functionCount}.`
    );
  }

  const scores = await fetchJson(new URL("/api/score", selectedApp.url));
  const trend = Array.isArray(scores.body.history?.trend)
    ? scores.body.history.trend
    : [];

  if (scores.ok && trend.length > 0) {
    addCheck(
      "pass",
      "Score history API returns trend data",
      `${trend.length} trend points`
    );
  } else {
    addCheck(
      "fail",
      "Score history API returns trend data",
      scores.detail ?? "No trend values returned."
    );
  }
}

async function checkLocalInngestDevServer() {
  if (!selectedApp || !isLocalhost(new URL(selectedApp.url))) {
    return;
  }

  const result = await runCommand("npx", [
    "inngest-cli@latest",
    "api",
    "health",
  ]);

  if (result.ok && result.output.includes('"status": "ok"')) {
    addCheck(
      "pass",
      "Local Inngest dev server is reachable",
      "Open http://localhost:8288 for the split-screen Runs view."
    );
    return;
  }

  addCheck(
    "fail",
    "Local Inngest dev server is reachable",
    "Start it with `APP_URL=<detected-app-url> npm run inngest:dev`."
  );
}

async function checkCloudInputs() {
  missingCloudInputs = [
    "INNGEST_API_KEY",
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
    "DEMO_SEED_TOKEN",
    "NEXT_PUBLIC_INNGEST_DASHBOARD_URL",
    "INNGEST_CLOUD_APP_ID",
    "INNGEST_INSIGHTS_SCORE_QUERY",
  ].filter((name) => !process.env[name]);

  if (missingCloudInputs.length > 0) {
    addCheck(
      "warn",
      "Cloud handoff inputs are present in this shell",
      `Missing ${missingCloudInputs.join(", ")}. This is expected before the final Cloud handoff.`
    );
    return;
  }

  const account = await runCommand("npx", [
    "inngest-cli@latest",
    "api",
    "--prod",
    "get-account",
  ]);

  addCheck(
    account.ok ? "pass" : "warn",
    "Inngest Cloud API auth works",
    account.ok ? undefined : summarizeCommandFailure(account)
  );
}

async function checkVercelLink() {
  try {
    const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
    addCheck(
      "pass",
      "Vercel project is linked",
      `${project.projectName ?? "unknown"} (${project.projectId ?? "no project id"})`
    );
  } catch {
    addCheck(
      "warn",
      "Vercel project is linked",
      "Run `npx vercel link` before production handoff."
    );
  }
}

function buildCandidateUrls() {
  const seen = new Set();
  const urls = [];

  const add = (value, source) => {
    if (!value) {
      return;
    }

    const normalized = normalizeBaseUrl(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    urls.push({ url: normalized, source });
  };

  add(process.env.DEMO_BASE_URL, "DEMO_BASE_URL");

  for (const port of [3001, 3000, 3002, 3010, 3100, 3111, 4000]) {
    add(`http://localhost:${port}`, `port ${port}`);
  }

  return urls;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    const body = JSON.parse(text);

    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {},
      detail:
        error instanceof Error && error.name === "AbortError"
          ? "Request timed out"
          : error instanceof Error
            ? error.message
            : "Request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: 15000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          output: `${stdout}${stderr}`.trim(),
          error,
        });
      }
    );
  });
}

function isCurrentStatusBody(body) {
  return (
    body?.ok === true &&
    typeof body.runtime?.inngestMode === "string" &&
    typeof body.readiness?.canServeCloudInngest === "boolean" &&
    typeof body.scoreHistory?.source === "string"
  );
}

function normalizeBaseUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isLocalhost(url) {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  );
}

function summarizeCommandFailure(result) {
  if (result.output) {
    return result.output.split("\n").slice(0, 4).join(" ");
  }

  if (result.error instanceof Error) {
    return result.error.message;
  }

  return "Command failed.";
}

function printCloudHandoffInputs() {
  console.log("\nCloud handoff inputs:");

  if (missingCloudInputs.length === 0) {
    console.log("  All expected Cloud shell inputs are set.");
    console.log("  Run `npm run demo:cloud-handoff` and then the final cloud-ready gate.");
    return;
  }

  for (const name of missingCloudInputs) {
    console.log(`  export ${name}=<value>`);
  }

  console.log("  See docs/cloud-auth-request.md for the source of each value.");
}

function stringValue(value) {
  return typeof value === "string" ? value : null;
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addCheck(status, label, detail) {
  checks.push({ status, label, detail });
}
