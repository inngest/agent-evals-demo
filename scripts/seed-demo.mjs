#!/usr/bin/env node

const baseUrl = process.env.DEMO_BASE_URL ?? process.argv[2];
const seedToken = process.env.DEMO_SEED_TOKEN;
const count = Number(process.env.DEMO_SEED_COUNT ?? process.argv[3] ?? 14);

if (!baseUrl) {
  console.error("Set DEMO_BASE_URL or pass the deployed app URL as argv[2].");
  process.exit(1);
}

const parsedBaseUrl = parseUrl(baseUrl);
const isLocal = isLocalhost(parsedBaseUrl);

if (!isLocal && parsedBaseUrl.protocol !== "https:") {
  console.error("demo:seed requires HTTPS when seeding a deployed app.");
  process.exit(1);
}

if (!isLocal && !seedToken) {
  console.error("Set DEMO_SEED_TOKEN before seeding a deployed app.");
  process.exit(1);
}

if (!Number.isFinite(count) || count < 1) {
  console.error("DEMO_SEED_COUNT must be a positive number.");
  process.exit(1);
}

const seedUrl = new URL("/api/demo/seed", parsedBaseUrl);
const response = await fetch(seedUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(seedToken ? { "x-demo-seed-token": seedToken } : {}),
  },
  body: JSON.stringify({ count }),
});
const body = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

const runs = Number(body.runs);
const scoreSignals = Number(body.scoreSignals);
const retryDemoRuns = Number(body.retryDemoRuns);
const happyPathRuns = Number(body.happyPathRuns);
const savedScoreSignals = Number(body.savedScoreSignals);
const discardedScoreSignals = Number(body.discardedScoreSignals);
const eventsSent = Number(body.eventsSent);

if (!body.ok || !Number.isFinite(runs) || runs < 1) {
  console.error("Seed response did not include a positive run count.");
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (!Number.isFinite(scoreSignals) || scoreSignals < 1) {
  console.error("Seed response did not include score signals.");
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (
  count >= 2 &&
  (!Number.isFinite(retryDemoRuns) ||
    retryDemoRuns < 1 ||
    !Number.isFinite(happyPathRuns) ||
    happyPathRuns < 1)
) {
  console.error(
    "Seed response did not include both happy-path and retry demo runs."
  );
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (
  count >= 2 &&
  (!Number.isFinite(savedScoreSignals) ||
    savedScoreSignals < 1 ||
    !Number.isFinite(discardedScoreSignals) ||
    discardedScoreSignals < 1)
) {
  console.error(
    "Seed response did not include both saved and discarded score signals."
  );
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (!Number.isFinite(eventsSent) || eventsSent < runs) {
  console.error("Seed response did not confirm events were sent.");
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(
  [
    `Seeded ${runs} demo runs.`,
    `Included ${happyPathRuns} happy-path runs and ${retryDemoRuns} retry-demo runs.`,
    `Sent ${scoreSignals} score signals: ${savedScoreSignals} saved, ${discardedScoreSignals} discarded.`,
    `Sent ${eventsSent} total events.`,
    `Dashboard: ${body.dashboardUrl ?? "not reported"}`,
    `Serve endpoint: ${body.appUrl ?? "not reported"}`,
    `Seeded at: ${body.seededAt ?? "unknown"}`,
  ].join("\n")
);

if (body.registered === false) {
  console.warn(
    "Warning: local Inngest dev server did not report this app URL as registered."
  );
}

console.log(
  [
    "",
    "Next checks:",
    ...nextChecks(parsedBaseUrl, isLocal),
  ].join("\n")
);

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

function nextChecks(url, local) {
  if (local) {
    return [
      `  DEMO_BASE_URL=${url.toString()} npm run demo:preflight`,
      `  DEMO_BASE_URL=${url.toString()} npm run demo:smoke`,
    ];
  }

  return [
    "  npm run demo:insights-check",
    `  DEMO_BASE_URL=${url.toString()} npm run demo:preflight`,
    `  DEMO_BASE_URL=${url.toString()} npm run demo:cloud-ready`,
  ];
}
