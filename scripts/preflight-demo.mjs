#!/usr/bin/env node

/**
 * Deployment readiness check for the loop demo.
 *
 * Deliberately narrow: it verifies that the app is up, that the Inngest serve
 * endpoint answers, and that the environment is configured the way the booth
 * expects. It does NOT exercise the demo - `demo:smoke-loop` does that, by
 * running a real agent and asserting on the captured timeline.
 *
 * The previous version probed /api/score, /api/demo/seed and /api/demo/reset,
 * which belonged to the retired incident-triage surfaces.
 */

const baseUrl = normalizeBaseUrl(process.env.DEMO_BASE_URL ?? process.argv[2]);
const checks = [];

await checkHealth();
const status = await checkStatus();
await checkServeEndpoint();

if (status) {
  checkConfiguration(status);
}

report();

async function checkHealth() {
  const { ok, status, body, error } = await fetchJson("/api/health");

  add(ok && body.ok === true ? "pass" : "fail", "Liveness endpoint",
    ok ? "/api/health responded" : (error ?? `HTTP ${status}`));
  return ok;
}

async function checkStatus() {
  const { ok, status, body, error } = await fetchJson("/api/demo/status");

  if (!ok) {
    add("fail", "Diagnostics endpoint", error ?? `HTTP ${status}`);
    return null;
  }

  add("pass", "Diagnostics endpoint",
    `mode=${body.runtime?.inngestMode}, target=${body.runtime?.demoTarget}`);
  return body;
}

async function checkServeEndpoint() {
  const { ok, status, body, error } = await fetchJson("/api/inngest");

  if (!ok) {
    add("fail", "Inngest serve endpoint", error ?? `HTTP ${status}`);
    return;
  }

  const count = body.function_count ?? 0;
  // The booth serves: support-agent, its metrics scorer, and the model
  // split test.
  add(count >= 3 ? "pass" : "fail", "Inngest functions served",
    `${count} function(s) registered`);
}

function checkConfiguration(body) {
  const runtime = body.runtime ?? {};
  const config = body.configuration ?? {};
  const isCloud = runtime.demoTarget === "cloud";

  if (runtime.modeConflict) {
    add("fail", "Inngest mode", "DEMO_TARGET=cloud but INNGEST_DEV is also set");
  } else {
    add("pass", "Inngest mode", `client is in ${runtime.inngestMode} mode`);
  }

  if (isCloud) {
    add(config.hasEventKey ? "pass" : "fail", "Cloud event key",
      config.hasEventKey ? "INNGEST_EVENT_KEY present" : "missing INNGEST_EVENT_KEY");
    add(config.hasSigningKey ? "pass" : "fail", "Cloud signing key",
      config.hasSigningKey ? "INNGEST_SIGNING_KEY present" : "missing INNGEST_SIGNING_KEY");
    add(config.hasDashboardUrl ? "pass" : "warn", "Dashboard deep links",
      config.hasDashboardUrl ? "dashboard URL configured" : "links fall back to the generic dashboard");
  } else {
    add("pass", "Local mode", "dev server path; no Cloud keys required");
  }

  const llm = body.llm ?? {};
  add("pass", "Model source", `${llm.mode} (${llm.model})`);

  const split = body.splitTest ?? {};
  add(split.current && split.challenger ? "pass" : "warn", "Split-test models",
    `${split.current} (current) vs ${split.challenger} (challenger)`);

  // Sandboxes are opt-in; report which state the booth will actually show.
  add("pass", "Sandboxes",
    body.sandboxEnabled
      ? `enabled, entitlement probe says "${body.sandbox?.mode}"`
      : "disabled by NEXT_PUBLIC_DEMO_SANDBOX");
}

function report() {
  for (const c of checks) {
    console.log(`${c.status.toUpperCase().padEnd(4)} ${c.label}`);
    if (c.detail) console.log(`  ${c.detail}`);
  }

  const failures = checks.filter((c) => c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warn");

  if (failures.length) {
    console.error(`\n${failures.length} preflight check(s) failed.`);
    process.exit(1);
  }

  console.log(
    `\nAll ${checks.length} preflight checks passed${warnings.length ? ` (${warnings.length} warning(s))` : ""}.`
  );
}

async function fetchJson(path) {
  try {
    const response = await fetch(new URL(path, baseUrl));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: {}, error: error instanceof Error ? error.message : String(error) };
  }
}

function add(status, label, detail) {
  checks.push({ status, label, detail });
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
