#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const checks = [];
const missingLocalInputs = [];
const missingVercelProduction = [];
const missingFinalVercelProduction = [];
const missingFinalInputs = [];
let vercelProductionEnvReadable = false;
const phase =
  process.env.DEMO_CLOUD_HANDOFF_PHASE === "final" ? "final" : "deploy";
const deployRequiredVercelProduction = [
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "INNGEST_API_KEY",
  "DEMO_SEED_TOKEN",
  "NEXT_PUBLIC_INNGEST_DASHBOARD_URL",
];
const finalRequiredVercelProduction = ["INNGEST_INSIGHTS_SCORE_QUERY"];
const optionalVercelProduction = [
  "INNGEST_ENCRYPTION_KEY",
  "INNGEST_ENV",
  "INNGEST_API_BASE_URL",
  "NEXT_PUBLIC_INNGEST_RUNS_URL",
];

await checkVercelProject();
await checkLocalInngestCliAuth();
await checkVercelProductionEnv();
checkDeployInputs();
await checkDeployedRuntime();
await checkCloudAppSync();

for (const check of checks) {
  console.log(`${check.status.toUpperCase()} ${check.label}`);
  if (check.detail) {
    console.log(`  ${check.detail}`);
  }
}

printNextActions();

const failures = checks.filter((check) => check.status === "fail");

if (failures.length > 0) {
  console.error(`\n${failures.length} Cloud handoff check(s) failed.`);
  process.exit(1);
}

async function checkVercelProject() {
  try {
    const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));

    addCheck(
      "pass",
      "Vercel project is linked",
      `${project.projectName ?? "unknown"} (${project.projectId ?? "no project id"})`
    );
  } catch {
    addCheck(
      "fail",
      "Vercel project is linked",
      "Run `npx vercel link` before deploying."
    );
  }
}

async function checkLocalInngestCliAuth() {
  if (!process.env.INNGEST_API_KEY) {
    trackMissing(missingLocalInputs, "INNGEST_API_KEY");
    addCheck(
      "fail",
      "Local Inngest Cloud API auth is available",
      "Set INNGEST_API_KEY in this shell before running Cloud API commands."
    );
    return;
  }

  const result = await runCommand("npx", [
    "inngest-cli@latest",
    "api",
    "--prod",
    "get-account",
  ]);

  if (result.ok) {
    addCheck("pass", "Local Inngest Cloud API auth is available");
  } else {
    addCheck(
      "fail",
      "Local Inngest Cloud API auth is available",
      summarizeCommandFailure(result)
    );
  }
}

async function checkVercelProductionEnv() {
  const result = await runCommand("npx", ["vercel", "env", "ls", "production"]);

  if (!result.ok) {
    addCheck(
      "fail",
      "Vercel production env list is readable",
      summarizeCommandFailure(result)
    );
    return;
  }

  vercelProductionEnvReadable = true;
  addCheck("pass", "Vercel production env list is readable");

  for (const name of deployRequiredVercelProduction) {
    if (result.output.includes(name)) {
      addCheck("pass", `Vercel production env has ${name}`);
    } else {
      trackMissing(missingVercelProduction, name);
      addCheck(
        "fail",
        `Vercel production env has ${name}`,
        `Add with: printf '%s' \"$${name}\" | npx vercel env add ${name} production`
      );
    }
  }

  for (const name of finalRequiredVercelProduction) {
    if (result.output.includes(name)) {
      addCheck("pass", `Final Vercel production env has ${name}`);
    } else if (phase === "final") {
      trackMissing(missingFinalVercelProduction, name);
      addCheck(
        "fail",
        `Final Vercel production env has ${name}`,
        `Add after Cloud score data exists: printf '%s' \"$${name}\" | npx vercel env add ${name} production`
      );
    } else {
      addCheck(
        "warn",
        `Final Vercel production env has ${name}`,
        "Generate and add after Cloud events have been seeded."
      );
    }
  }

  for (const name of optionalVercelProduction) {
    addCheck(
      result.output.includes(name) ? "pass" : "warn",
      `Optional Vercel production env has ${name}`,
      result.output.includes(name) ? undefined : "Optional for this demo path."
    );
  }
}

function checkDeployInputs() {
  let demoBaseUrl = null;

  if (process.env.DEMO_BASE_URL) {
    try {
      demoBaseUrl = new URL(process.env.DEMO_BASE_URL);
    } catch {
      trackMissing(missingFinalInputs, "DEMO_BASE_URL");
      addCheck(
        "fail",
        "Final deployed DEMO_BASE_URL is valid",
        `Received: ${process.env.DEMO_BASE_URL}`
      );
    }
  }

  if (demoBaseUrl) {
    if (phase === "final" && isLocalhost(demoBaseUrl)) {
      addCheck(
        "fail",
        "Final deployed DEMO_BASE_URL is not localhost",
        "Use the deployed Vercel URL for the final booth gate."
      );
    } else if (phase === "final" && demoBaseUrl.protocol !== "https:") {
      addCheck(
        "fail",
        "Final deployed DEMO_BASE_URL uses HTTPS",
        "Use the deployed HTTPS URL for the final booth gate."
      );
    } else {
      addCheck("pass", "Final deployed DEMO_BASE_URL is set");
    }
  } else if (phase === "final") {
    trackMissing(missingFinalInputs, "DEMO_BASE_URL");
    addCheck(
      "fail",
      "Final deployed DEMO_BASE_URL is set",
      "Set after `npx vercel --prod`, for example DEMO_BASE_URL=https://<domain>."
    );
  } else {
    addCheck(
      "warn",
      "Final deployed DEMO_BASE_URL is set",
      "Set after `npx vercel --prod`, for example DEMO_BASE_URL=https://<domain>."
    );
  }

  if (process.env.INNGEST_CLOUD_APP_ID) {
    addCheck("pass", "INNGEST_CLOUD_APP_ID is set for sync-app");
  } else if (phase === "final") {
    trackMissing(missingFinalInputs, "INNGEST_CLOUD_APP_ID");
    addCheck(
      "fail",
      "INNGEST_CLOUD_APP_ID is set for sync-app",
      "Find the app ID in Inngest Cloud before running sync-app."
    );
  } else {
    addCheck(
      "warn",
      "INNGEST_CLOUD_APP_ID is set for sync-app",
      "Find the app ID in Inngest Cloud before running sync-app."
    );
  }
}

async function checkDeployedRuntime() {
  if (!process.env.DEMO_BASE_URL) {
    return;
  }

  let baseUrl;
  try {
    baseUrl = new URL(process.env.DEMO_BASE_URL);
  } catch {
    addCheck(
      "fail",
      "DEMO_BASE_URL is a valid URL",
      `Received: ${process.env.DEMO_BASE_URL}`
    );
    return;
  }

  const statusResult = await fetchJsonEndpoint(
    new URL("/api/demo/status", baseUrl)
  );

  if (statusResult.ok && isCurrentStatusBody(statusResult.body)) {
    addCheck("pass", "Deployed demo status endpoint is current");
  } else {
    const detail = statusResult.ok
      ? "Response shape did not match current demo status API"
      : statusResult.detail;

    addCheck(
      "fail",
      "Deployed demo status endpoint is current",
      `${detail}. Deploy the current branch before final handoff.`
    );
  }

  if (
    phase === "final" &&
    statusResult.ok &&
    isCurrentStatusBody(statusResult.body) &&
    !statusResult.body.readiness.demoOpsTokenConfigured
  ) {
    addCheck(
      "fail",
      "Final demo ops token is configured",
      "DEMO_SEED_TOKEN is required for protected production seed/reset operations."
    );
  }

  if (
    phase === "final" &&
    statusResult.ok &&
    isCurrentStatusBody(statusResult.body) &&
    !statusResult.body.readiness.scoreHistoryBackedByInsights
  ) {
    addCheck(
      "fail",
      "Final score history is backed by Inngest Insights",
      `Current source is ${statusResult.body.scoreHistory.source}.`
    );
  }

  const serveResult = await fetchJsonEndpoint(new URL("/api/inngest", baseUrl));

  if (serveResult.ok && isCurrentInngestServeBody(serveResult.body)) {
    addCheck("pass", "Deployed Inngest serve endpoint is reachable");
  } else {
    const detail = serveResult.ok
      ? "Response shape did not expose the expected demo functions"
      : serveResult.detail;

    addCheck(
      "fail",
      "Deployed Inngest serve endpoint is reachable",
      `${detail}. Check INNGEST_SIGNING_KEY and the deployed /api/inngest route.`
    );
  }
}

async function checkCloudAppSync() {
  if (phase !== "final") {
    return;
  }

  if (
    !process.env.DEMO_BASE_URL ||
    !process.env.INNGEST_CLOUD_APP_ID ||
    !process.env.INNGEST_API_KEY
  ) {
    addCheck(
      "warn",
      "Final Inngest Cloud app sync completed",
      "Skipped until DEMO_BASE_URL, INNGEST_CLOUD_APP_ID, and INNGEST_API_KEY are set."
    );
    return;
  }

  let serveUrl;
  try {
    serveUrl = new URL("/api/inngest", process.env.DEMO_BASE_URL).toString();
  } catch {
    addCheck(
      "fail",
      "Final Inngest Cloud app sync completed",
      `Invalid DEMO_BASE_URL: ${process.env.DEMO_BASE_URL}`
    );
    return;
  }

  const result = await runCommand("npx", [
    "inngest-cli@latest",
    "api",
    "--prod",
    "sync-app",
    "--app-id",
    process.env.INNGEST_CLOUD_APP_ID,
    "--url",
    serveUrl,
  ]);

  if (result.ok) {
    addCheck(
      "pass",
      "Final Inngest Cloud app sync completed",
      `Synced ${serveUrl}`
    );
  } else {
    addCheck(
      "fail",
      "Final Inngest Cloud app sync completed",
      summarizeCommandFailure(result)
    );
  }
}

async function runCommand(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      env: process.env,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });

    return { ok: true, output: `${stdout}\n${stderr}` };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
      message: error.message,
    };
  }
}

function summarizeCommandFailure(result) {
  const output = stripAnsi(result.output).trim();
  const firstLines = output.split("\n").slice(0, 4).join(" ");

  return firstLines || result.message || "Command failed.";
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function addCheck(status, label, detail) {
  checks.push({ status, label, detail });
}

function printNextActions() {
  console.log("\nNext Cloud handoff steps:");

  if (missingLocalInputs.length > 0) {
    console.log("  Set local shell auth:");
    for (const name of missingLocalInputs) {
      console.log(`    export ${name}=<value>`);
    }
  }

  if (!vercelProductionEnvReadable) {
    console.log("  Make Vercel env readable:");
    console.log("    npx vercel login");
    console.log("    npx vercel link");
  }

  if (missingVercelProduction.length > 0) {
    console.log("  Add required Vercel production env vars:");
    for (const name of missingVercelProduction) {
      console.log(`    printf '%s' "$${name}" | npx vercel env add ${name} production`);
    }
  }

  if (missingFinalVercelProduction.length > 0) {
    console.log("  Add final Vercel production env vars after Cloud score data exists:");
    for (const name of missingFinalVercelProduction) {
      console.log(`    printf '%s' "$${name}" | npx vercel env add ${name} production`);
    }
  }

  if (phase === "deploy") {
    console.log("  After deploy envs are present:");
    console.log("    npx vercel --prod");
    console.log("    export DEMO_BASE_URL=https://<vercel-domain>");
    console.log("    export INNGEST_CLOUD_APP_ID=<cloud-app-id>");
    console.log("    DEMO_CLOUD_HANDOFF_PHASE=final npm run demo:cloud-handoff");
  } else if (missingFinalInputs.length > 0) {
    console.log("  Set final local inputs:");
    for (const name of missingFinalInputs) {
      console.log(`    export ${name}=<value>`);
    }
  }

  console.log("  Final booth gate:");
  console.log("    npm run demo:cloud-ready");
}

function trackMissing(list, name) {
  if (!list.includes(name)) {
    list.push(name);
  }
}

async function fetchJsonEndpoint(url) {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, detail: `HTTP ${response.status}` };
    }

    return { ok: true, body };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "Request failed",
    };
  }
}

function isCurrentStatusBody(body) {
  return (
    body?.ok === true &&
    typeof body.runtime?.inngestMode === "string" &&
    typeof body.configuration?.hasEventKey === "boolean" &&
    typeof body.configuration?.hasSigningKey === "boolean" &&
    typeof body.readiness?.canSendCloudEvents === "boolean" &&
    typeof body.readiness?.canServeCloudInngest === "boolean" &&
    typeof body.readiness?.demoOpsRequireToken === "boolean" &&
    typeof body.readiness?.demoOpsTokenConfigured === "boolean" &&
    typeof body.readiness?.seedEndpointProtected === "boolean" &&
    typeof body.readiness?.scoreHistoryBackedByInsights === "boolean" &&
    typeof body.scoreHistory?.source === "string" &&
    typeof body.scoreHistory?.points === "number"
  );
}

function isCurrentInngestServeBody(body) {
  return (
    Number(body?.function_count) >= 2 &&
    typeof body?.mode === "string" &&
    typeof body?.has_event_key === "boolean" &&
    typeof body?.has_signing_key === "boolean"
  );
}

function isLocalhost(url) {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  );
}
