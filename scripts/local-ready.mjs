#!/usr/bin/env node

import { spawn } from "node:child_process";

const baseUrl = process.env.DEMO_BASE_URL ?? process.argv[2] ?? "http://localhost:3001";
const seedCount = process.env.DEMO_LOCAL_READY_SEED_COUNT ?? "2";

const steps = [
  {
    label: "Lint",
    command: "npm",
    args: ["run", "lint"],
  },
  {
    label: "Build",
    command: "npm",
    args: ["run", "build"],
  },
  {
    label: "Preflight",
    command: "npm",
    args: ["run", "demo:preflight"],
    env: { DEMO_BASE_URL: baseUrl },
  },
  {
    label: "Smoke",
    command: "npm",
    args: ["run", "demo:smoke"],
    env: { DEMO_BASE_URL: baseUrl },
  },
  {
    label: "Seeded smoke",
    command: "npm",
    args: ["run", "demo:smoke"],
    env: {
      DEMO_BASE_URL: baseUrl,
      DEMO_SMOKE_SEED: "1",
      DEMO_SMOKE_SEED_COUNT: seedCount,
    },
  },
  {
    label: "Viewport QA",
    command: "npm",
    args: ["run", "demo:viewport"],
    env: { DEMO_BASE_URL: baseUrl },
  },
];

console.log(`Local demo readiness target: ${baseUrl}`);

try {
  for (const step of steps) {
    console.log(`\n== ${step.label} ==`);
    await runStep(step);
  }
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : "Local readiness failed."}`);
  process.exit(1);
}

console.log(`\nLocal demo readiness passed for ${baseUrl}.`);

function runStep(step) {
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
