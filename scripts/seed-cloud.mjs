#!/usr/bin/env node
/**
 * seed-cloud.mjs — Emit a corpus of REAL incident runs + scores + experiments
 * into an Inngest CLOUD account using the real primitives/events.
 *
 * What it does (per INTEGRATION-PLAN.md §5 SEED):
 *   For each corpus incident it sends, in order:
 *     1. agent/incident.received   → drives `triage-agent` (run-level step.score in cloud)
 *     2. agent/incident.saved      → drives `score-incident` → defer()'d `localization-scorer`
 *                                     (the deferred outcome score on the run)
 *     3. agent/experiment.requested → drives `experiment-bakeoff` (group.experiment +
 *                                     per-variant inngest.score)
 *   So scores + experiments land in the Inngest Cloud dashboard via the real
 *   served functions — this script only emits events, it does not score directly.
 *
 * HOW IT SENDS: events are POSTed to the Inngest Cloud Event API
 *   (https://inn.gs/e/<INNGEST_EVENT_KEY>) authenticated by INNGEST_EVENT_KEY.
 *   The served functions (running in Cloud, authenticated by INNGEST_SIGNING_KEY)
 *   pick them up. We do NOT need a running local app — events go straight to Cloud.
 *
 * IDEMPOTENT: every event carries a deterministic `id`, so re-running dedupes
 *   inside Inngest's 24h window. Ids:
 *     cloud-seed:incident:<incidentId>
 *     cloud-seed:saved:<incidentId>
 *     cloud-seed:exp:<incidentId>
 *
 * ────────────────────────────────────────────────────────────────────────────
 * REQUIRED ENV
 *   DEMO_TARGET=cloud          Hard guard. Refuses to run otherwise.
 *   INNGEST_EVENT_KEY=...      Cloud Event API key (used in the ingest URL).
 *   INNGEST_SIGNING_KEY=...    Required so the served functions are actually the
 *                              cloud-registered ones (presence-checked here; not
 *                              used by this script directly, but its absence means
 *                              the functions aren't wired to Cloud → nothing scores).
 *
 * OPTIONAL ENV
 *   INNGEST_EVENT_API_BASE_URL Override the event ingest base. Default
 *                              https://inn.gs . (Self-hosted/branch envs.)
 *   INNGEST_ENV                Inngest environment / branch (sent as x-inngest-env
 *                              header when set, e.g. "production" or a branch env).
 *   DEMO_SEED_COUNT            Number of corpus runs to emit. Default = all
 *                              incidents in incidents.ts. Cycles if > corpus size.
 *   DRY_RUN=1                  Same as --dry-run.
 *
 * FLAGS
 *   --dry-run                  Print the planned events + ids and send NOTHING
 *                              (no network calls, no key requirement beyond the
 *                              DEMO_TARGET guard being relaxed — see below).
 *   --count <n>                Same as DEMO_SEED_COUNT.
 *
 * USAGE
 *   DEMO_TARGET=cloud INNGEST_EVENT_KEY=... INNGEST_SIGNING_KEY=... \
 *     node scripts/seed-cloud.mjs
 *   node scripts/seed-cloud.mjs --dry-run            # plan only, no keys needed
 *   npm run demo:seed-cloud                          # wired in package.json
 * ────────────────────────────────────────────────────────────────────────────
 */

import { incidents } from "../src/content/incidents.ts";

// ── arg / env parsing ──────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run") || process.env.DRY_RUN === "1";

const countFlagIndex = argv.indexOf("--count");
const countArg =
  countFlagIndex !== -1 ? argv[countFlagIndex + 1] : process.env.DEMO_SEED_COUNT;

const demoTarget = process.env.DEMO_TARGET;
const eventKey = process.env.INNGEST_EVENT_KEY;
const signingKey = process.env.INNGEST_SIGNING_KEY;
const inngestEnv = process.env.INNGEST_ENV;
const eventApiBase =
  process.env.INNGEST_EVENT_API_BASE_URL?.replace(/\/+$/, "") ??
  "https://inn.gs";

// ── guards (mirror seed-demo.mjs guard style) ──────────────────────────────
// In dry-run we relax the cloud guards so the plan can be inspected anywhere.
if (!dryRun) {
  if (demoTarget !== "cloud") {
    console.error(
      "seed-cloud refuses to run unless DEMO_TARGET=cloud. " +
        "Use --dry-run to preview the plan without keys."
    );
    process.exit(1);
  }
  if (!eventKey) {
    console.error("Set INNGEST_EVENT_KEY before seeding Inngest Cloud.");
    process.exit(1);
  }
  if (!signingKey) {
    console.error(
      "Set INNGEST_SIGNING_KEY. Without it the served functions are not " +
        "registered against Cloud, so emitted events would not be scored."
    );
    process.exit(1);
  }
} else if (demoTarget && demoTarget !== "cloud") {
  // Non-fatal: in dry-run we still warn if the flag looks wrong.
  console.warn(
    `Note: DEMO_TARGET="${demoTarget}" (not "cloud"). --dry-run still prints the plan.`
  );
}

const corpusSize = incidents.length;
let count = corpusSize;
if (countArg !== undefined && countArg !== "") {
  const parsed = Number(countArg);
  if (!Number.isFinite(parsed) || parsed < 1) {
    console.error("--count / DEMO_SEED_COUNT must be a positive number.");
    process.exit(1);
  }
  count = Math.floor(parsed);
}

// ── build the corpus plan ──────────────────────────────────────────────────
// Deterministic timestamps so re-runs produce identical payloads (idempotent).
// Anchor on a fixed epoch rather than Date.now() so dedupe ids + ts are stable.
const ANCHOR_TS = Date.UTC(2026, 5, 1, 0, 0, 0); // 2026-06-01T00:00:00Z, fixed
const STEP_MS = 5 * 60 * 1000; // 5 min between runs
const SAVED_OFFSET_MS = 90 * 1000; // saved signal lands 90s after received
const EXP_OFFSET_MS = 120 * 1000; // experiment request 120s after received

const plan = Array.from({ length: count }, (_, index) => {
  const incident = incidents[index % corpusSize];
  const receivedTs = ANCHOR_TS + index * STEP_MS;
  const clientRunId = `cloud-seed-${incident.id.toLowerCase()}-${index}`;

  // Mix the corpus: ~1/3 trigger a retry (failureCount:1), some add latency,
  // ~1/5 get discarded (no outcome score) so the dashboard shows both shapes.
  const shouldRetry = index % 3 === 0;
  const discarded = index % 5 === 2;
  const flags = {
    llmOffline: false,
    failureCount: shouldRetry ? 1 : 0,
    latencyMs: index % 4 === 0 ? 250 : 0,
  };

  return {
    incident,
    clientRunId,
    receivedTs,
    savedTs: receivedTs + SAVED_OFFSET_MS,
    expTs: receivedTs + EXP_OFFSET_MS,
    shouldRetry,
    discarded,
    flags,
  };
});

// ── event builders (shapes match src/inngest/client.ts eventTypes) ─────────
function receivedEvent(p) {
  return {
    name: "agent/incident.received",
    id: `cloud-seed:incident:${p.incident.id}`,
    ts: p.receivedTs,
    data: {
      incidentId: p.incident.id,
      title: p.incident.title,
      body: p.incident.body,
      flags: p.flags,
      clientRunId: p.clientRunId,
      requestedAt: new Date(p.receivedTs).toISOString(),
      source: "booth-demo",
    },
  };
}

function savedEvent(p) {
  return {
    name: "agent/incident.saved",
    id: `cloud-seed:saved:${p.incident.id}`,
    ts: p.savedTs,
    data: {
      incidentId: p.incident.id,
      clientRunId: p.clientRunId,
      signal: p.discarded ? "discarded" : "saved",
      savedAt: new Date(p.savedTs).toISOString(),
      source: "booth-demo",
    },
  };
}

// agent/experiment.requested drives experiment-bakeoff (group.experiment).
// BACKEND owns adding this eventType to client.ts; SEED only emits the name +
// the minimal data the bakeoff fn reads ({ incidentId }). Extra fields are
// harmless and aid dashboard correlation.
function experimentEvent(p) {
  return {
    name: "agent/experiment.requested",
    id: `cloud-seed:exp:${p.incident.id}`,
    ts: p.expTs,
    data: {
      incidentId: p.incident.id,
      clientRunId: p.clientRunId,
      requestedAt: new Date(p.expTs).toISOString(),
      source: "booth-demo",
    },
  };
}

// ── network send ────────────────────────────────────────────────────────────
async function sendBatch(events) {
  const url = `${eventApiBase}/e/${eventKey}`;
  const headers = { "Content-Type": "application/json" };
  if (inngestEnv) {
    headers["x-inngest-env"] = inngestEnv;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(events),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(
      `Event ingest failed (HTTP ${response.status}).`,
      JSON.stringify(body, null, 2)
    );
    process.exit(1);
  }
  return body;
}

// ── main ─────────────────────────────────────────────────────────────────────
const allEvents = plan.flatMap((p) => [
  receivedEvent(p),
  savedEvent(p),
  experimentEvent(p),
]);

if (dryRun) {
  console.log("seed-cloud --dry-run — no network calls.");
  console.log(
    `Plan: ${plan.length} corpus runs → ${allEvents.length} events ` +
      `(${plan.length} received, ${plan.length} saved, ${plan.length} experiment).`
  );
  console.log(`Event ingest endpoint (would POST to): ${eventApiBase}/e/<INNGEST_EVENT_KEY>`);
  if (inngestEnv) {
    console.log(`x-inngest-env: ${inngestEnv}`);
  }
  console.log("");
  for (const p of plan) {
    const savedSignal = p.discarded ? "discarded" : "saved";
    console.log(
      `• ${p.incident.id} (run ${p.clientRunId})` +
        `${p.shouldRetry ? " [retry]" : ""}` +
        ` → saved:${savedSignal}`
    );
  }
  console.log("");
  console.log("Events (name → id):");
  for (const ev of allEvents) {
    console.log(`  ${ev.name}  ${ev.id}`);
  }
  console.log("");
  console.log(
    "Dry run complete. Set DEMO_TARGET=cloud + INNGEST_EVENT_KEY + " +
      "INNGEST_SIGNING_KEY and drop --dry-run to emit."
  );
  process.exit(0);
}

console.log(
  `Seeding Inngest Cloud: ${plan.length} runs → ${allEvents.length} events ` +
    `via ${eventApiBase}/e/****`
);

// Send received + saved + experiment as one idempotent batch. Deterministic
// ids mean re-runs are deduped by Inngest; ordering inside the batch does not
// matter because each fn is triggered independently by its own event.
const result = await sendBatch(allEvents);

console.log(
  [
    `Sent ${allEvents.length} events for ${plan.length} corpus runs.`,
    `  received:    ${plan.length} (agent/incident.received → triage-agent run-level score)`,
    `  saved:       ${plan.length} (agent/incident.saved → score-incident → deferred localization-scorer)`,
    `  experiment:  ${plan.length} (agent/experiment.requested → experiment-bakeoff group.experiment)`,
    `Ingest response: ${JSON.stringify(result)}`,
    "",
    "Re-running is safe: deterministic event ids dedupe within Inngest's 24h window.",
    "Check the Inngest Cloud dashboard for runs, run-level scores, deferred outcome",
    "scores, and the localization-bakeoff experiment.",
  ].join("\n")
);
