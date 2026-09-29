#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const noOpen = process.argv.includes("--no-open");
const APP_PORT = 3000;
const DEV_PORT = 8288;
const APP_URL = `http://localhost:${APP_PORT}`;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const HEALTH_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 500;

const killPatterns = ["next dev", "next-server", "inngest-cli dev"];

killStaleProcesses();
await waitForPortsFree();
const children = startServers();
registerShutdown(children);
await waitForHealth();
reportReady();

function killStaleProcesses() {
  let killed = false;
  for (const pattern of killPatterns) {
    const found = spawnSync("pgrep", ["-fl", pattern], { encoding: "utf8" });
    if (found.status !== 0 || !found.stdout.trim()) continue;
    console.log(`Killing stale process (${pattern}):`);
    for (const line of found.stdout.trim().split("\n")) {
      console.log(`  ${line}`);
    }
    spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });
    killed = true;
  }
  if (!killed) console.log("No stale demo processes found.");
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function waitForPortsFree() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const appFree = await isPortFree(APP_PORT);
    const devFree = await isPortFree(DEV_PORT);
    if (appFree && devFree) return;
    await sleep(POLL_INTERVAL_MS);
  }
  console.error(
    `Ports ${APP_PORT}/${DEV_PORT} still busy after killing stale processes.\nCheck what holds them:  lsof -nP -iTCP:${APP_PORT} -sTCP:LISTEN  lsof -nP -iTCP:${DEV_PORT} -sTCP:LISTEN`
  );
  process.exit(1);
}

function startServers() {
  const next = spawn("npm", ["run", "dev"], {
    env: { ...process.env, INNGEST_DEV: "1" },
    shell: process.platform === "win32",
  });
  const inngest = spawn("npm", ["run", "inngest:dev"], {
    shell: process.platform === "win32",
  });

  pipePrefixed(next, "[next]");
  pipePrefixed(inngest, "[inngest]");
  failIfExited(next, "next dev");
  failIfExited(inngest, "inngest dev");

  return [next, inngest];
}

function pipePrefixed(child, prefix) {
  pipeStream(child.stdout, prefix);
  pipeStream(child.stderr, prefix);
}

function pipeStream(stream, prefix) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) process.stdout.write(`${prefix} ${line}\n`);
  });
  stream.on("end", () => {
    if (buffer) process.stdout.write(`${prefix} ${buffer}\n`);
  });
}

function failIfExited(child, label) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`${label} exited unexpectedly (${signal ?? `code ${code}`}).`);
    console.error("Output above should show the failure. Not continuing.");
    process.exit(1);
  });
}

async function waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let appUp = false;
  let devUp = false;

  while (Date.now() < deadline && !(appUp && devUp)) {
    appUp = appUp || (await isHealthy(`${APP_URL}/api/health`));
    devUp = devUp || (await isHealthy(DEV_URL));
    if (!(appUp && devUp)) await sleep(POLL_INTERVAL_MS);
  }

  if (!(appUp && devUp)) {
    console.error(
      `Servers did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s (app: ${appUp ? "up" : "DOWN"}, dev server: ${devUp ? "up" : "DOWN"}).`
    );
    shutdown();
  }

  await warmDemoRoute();
}

/**
 * Compile the demo route before announcing readiness. `next dev` builds a
 * route on its first request, and `/` server-renders every loop snippet and
 * primitive card through shiki. Without this the script prints "Booth ready",
 * opens the browser, and the first visitor waits several seconds on a white
 * screen. Best-effort: a failure here is not worth aborting the booth for.
 */
async function warmDemoRoute() {
  process.stdout.write("Warming the demo route... ");

  try {
    await fetch(APP_URL, { headers: { accept: "text/html" } });
    console.log("done.");
  } catch {
    console.log("skipped (route did not respond; it will compile on first view).");
  }
}

async function isHealthy(url) {
  try {
    const response = await fetch(url);
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

function reportReady() {
  console.log(`
Booth ready.
  Demo app:    ${APP_URL}
  Runs view:   ${DEV_URL}/runs
Ctrl+C stops both servers.`);

  if (noOpen || process.platform !== "darwin") return;
  spawn("open", [APP_URL, `${DEV_URL}/runs`], { stdio: "ignore" });
}

let shuttingDown = false;

function registerShutdown(children) {
  const stop = () => shutdown(children);
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

function shutdown(children = []) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  for (const pattern of killPatterns) {
    spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });
  }
  process.exit(0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
