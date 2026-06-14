#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const query = process.env.INNGEST_INSIGHTS_SCORE_QUERY;

if (!process.env.INNGEST_API_KEY) {
  console.error("Set INNGEST_API_KEY before running the Insights score check.");
  process.exit(1);
}

if (!query) {
  console.error("Set INNGEST_INSIGHTS_SCORE_QUERY before running this check.");
  process.exit(1);
}

const result = await runCommand("npx", [
  "inngest-cli@latest",
  "api",
  "--prod",
  "query-insights",
  "--query",
  query,
]);

if (!result.ok) {
  console.error(summarizeCommandFailure(result));
  process.exit(1);
}

const body = parseJson(result.output);
const rows = extractRows(body);
const points = rows.map(toScorePoint).filter(Boolean);

if (points.length === 0) {
  console.error(
    "Insights query returned no valid score rows. Expected runId, score, scoredAt, and optional signal."
  );
  console.error(`Rows returned: ${rows.length}`);
  process.exit(1);
}

const saved = points.filter((point) => point.signal === "saved").length;
const discarded = points.filter((point) => point.signal === "discarded").length;

if (saved === 0 || discarded === 0) {
  console.error(
    "Insights query must return both saved and discarded score signals for the booth demo."
  );
  console.error(`Saved: ${saved}`);
  console.error(`Discarded: ${discarded}`);
  process.exit(1);
}

const latest = points.reduce((current, point) =>
  new Date(point.scoredAt).getTime() > new Date(current.scoredAt).getTime()
    ? point
    : current
);

console.log(`Insights score query returned ${points.length} valid score rows.`);
console.log(`Saved: ${saved}`);
console.log(`Discarded: ${discarded}`);
console.log(`Latest score: ${latest.score.toFixed(2)} at ${latest.scoredAt}`);

function parseJson(output) {
  const trimmed = stripAnsi(output).trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");

    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    }

    console.error("Could not parse JSON from `inngest api query-insights`.");
    console.error(trimmed.split("\n").slice(0, 8).join("\n"));
    process.exit(1);
  }
}

function extractRows(body) {
  const directRows = body?.data ?? body?.rows ?? body?.result;
  const nestedRows = body?.data?.rows ?? body?.data?.data ?? body?.result?.rows;
  const rows = directRows ?? nestedRows ?? [];

  return Array.isArray(rows) ? rows : [];
}

function toScorePoint(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const runId = stringValue(row.runId) ?? stringValue(row.run_id) ?? stringValue(row.id);
  const score = Number(row.score);
  const scoredAt =
    stringValue(row.scoredAt) ??
    stringValue(row.scored_at) ??
    stringValue(row.timestamp) ??
    stringValue(row.ts);

  if (!runId || !Number.isFinite(score) || !scoredAt) {
    return null;
  }

  return {
    runId,
    score,
    scoredAt,
    signal: row.signal === "discarded" ? "discarded" : "saved",
  };
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
  const firstLines = output.split("\n").slice(0, 6).join(" ");

  return firstLines || result.message || "Command failed.";
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
