#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = normalizeBaseUrl(process.env.DEMO_BASE_URL ?? process.argv[2]);
const outputDir = path.resolve(
  process.env.DEMO_VIEWPORT_OUTPUT ?? "output/playwright/demo-viewport-qa"
);
const viewports = [
  {
    id: "booth-32-half",
    label: "32-inch split pane",
    width: 1280,
    height: 1320,
  },
  {
    id: "laptop-16-half",
    label: "16-inch laptop split pane",
    width: 920,
    height: 980,
  },
  {
    id: "laptop-14-half",
    label: "14-inch laptop split pane",
    width: 760,
    height: 900,
  },
  {
    id: "compact-safety",
    label: "compact safety pane",
    width: 640,
    height: 820,
  },
];
const results = [];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true }).catch((error) => {
  console.error(
    "Unable to start Playwright Chromium. Run `npx playwright install chromium` and retry."
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

try {
  for (const viewport of viewports) {
    await runViewportCheck(browser, viewport);
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) => result.status === "fail");

for (const result of results) {
  console.log(`${result.status.toUpperCase()} ${result.label}`);
  if (result.detail) {
    console.log(`  ${result.detail}`);
  }
}

const reportPath = path.join(outputDir, "report.json");
await writeFile(
  reportPath,
  JSON.stringify(
    {
      baseUrl: baseUrl.toString(),
      generatedAt: new Date().toISOString(),
      results,
    },
    null,
    2
  )
);

console.log(`\nViewport QA report: ${reportPath}`);
console.log(`Screenshots: ${outputDir}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} viewport QA check(s) failed.`);
  process.exit(1);
}

async function runViewportCheck(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();

  try {
    await page.goto(baseUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await screenshot(page, viewport, "initial");

    await assertNoPageOverflow(page, viewport, "initial");
    await assertCoreChrome(page, viewport);

    await page.getByRole("button", { name: /ask agent/i }).click();
    await page.waitForFunction(
      () => {
        const bodyText = document.body.innerText.toLowerCase();

        return bodyText.includes("select u.id") && bodyText.includes("10 rows");
      },
      null,
      { timeout: 12000 }
    );
    await screenshot(page, viewport, "result");
    await assertNoPageOverflow(page, viewport, "result");
    await assertVisible(page, viewport, "generated SQL", "text=SELECT u.id");
    await assertVisible(page, viewport, "row count", "text=/10 rows/i");

    await page.getByRole("button", { name: /^trace$/i }).click();
    await page.waitForSelector("text=Inngest trace", { timeout: 5000 });
    await screenshot(page, viewport, "trace");
    await assertNoPageOverflow(page, viewport, "trace");
    await assertVisible(page, viewport, "trace panel", "text=Inngest trace");
    await assertVisible(page, viewport, "trace run", "text=write-query");

    await page.getByRole("button", { name: /^save$/i }).click();
    await page.getByRole("button", { name: /^scores$/i }).click();
    await page.waitForSelector("text=Current query score", { timeout: 5000 });
    await screenshot(page, viewport, "scores");
    await assertNoPageOverflow(page, viewport, "scores");
    await assertVisible(page, viewport, "current score", "text=Current query score");
    await assertVisible(page, viewport, "behavior signals", "text=Behavior signals");

    await page.getByRole("button", { name: /^code$/i }).click();
    await page.waitForSelector("text=Curated code", { timeout: 5000 });
    await screenshot(page, viewport, "code");
    await assertNoPageOverflow(page, viewport, "code");
    await assertVisible(page, viewport, "code view", "text=Curated code");
    await assertVisible(
      page,
      viewport,
      "code zoom out",
      'button[aria-label="Zoom code out"]'
    );
    await assertVisible(
      page,
      viewport,
      "code zoom in",
      'button[aria-label="Zoom code in"]'
    );
    await assertVisible(page, viewport, "Act 1 code control", "text=Act 1");
    await assertVisible(page, viewport, "Act 2 code control", "text=Act 2");
    await assertVisible(page, viewport, "Act 3 code control", "text=Act 3");
    await page.getByRole("button", { name: /^act 3$/i }).click();
    await page.waitForSelector("text=Optimize", { timeout: 5000 });
    await assertVisible(page, viewport, "optimize code view", "text=Optimize");

    await page.getByRole("button", { name: /demo controls/i }).click();
    await page.waitForSelector("text=Opus offline", { timeout: 5000 });
    await screenshot(page, viewport, "controls");
    await assertNoPageOverflow(page, viewport, "controls");
    await assertVisible(page, viewport, "opus offline toggle", "text=Opus offline");
  } catch (error) {
    await screenshot(page, viewport, "failure").catch(() => {});
    addResult(
      "fail",
      `${viewport.label} completed viewport flow`,
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    await context.close();
  }
}

async function assertCoreChrome(page, viewport) {
  await assertVisible(page, viewport, "demo title", "text=Agent Evals Booth Demo");
  await assertVisible(page, viewport, "Inngest link", "text=Inngest");
  await assertVisible(page, viewport, "Demo Controls button", "text=Demo Controls");
  await assertVisible(page, viewport, "SQL editor title", "text=SQL query editor");
  await assertVisible(page, viewport, "Run query button", "text=Run query");
  await assertVisible(page, viewport, "Save button", "text=Save");
  await assertVisible(page, viewport, "Result tab", "text=Result");
  await assertVisible(page, viewport, "Trace tab", "text=Trace");
  await assertVisible(page, viewport, "Scores tab", "text=Scores");
  await assertVisible(page, viewport, "Code tab", "text=Code");
}

async function assertVisible(page, viewport, label, selector) {
  const locator = page.locator(selector).first();

  if (!(await locator.isVisible().catch(() => false))) {
    throw new Error(`${viewport.label}: ${label} is not visible`);
  }

  const box = await locator.boundingBox();

  if (!box) {
    throw new Error(`${viewport.label}: ${label} has no visible bounds`);
  }

  if (box.x < -1 || box.x + Math.min(box.width, 1) > viewport.width + 1) {
    throw new Error(`${viewport.label}: ${label} is outside the viewport`);
  }

  addResult("pass", `${viewport.label}: ${label} visible`);
}

async function assertNoPageOverflow(page, viewport, stage) {
  const overflow = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  const maxScrollWidth = Math.max(
    overflow.bodyScrollWidth,
    overflow.documentScrollWidth
  );

  if (maxScrollWidth > overflow.viewportWidth + 2) {
    throw new Error(
      `${viewport.label}: ${stage} page overflows horizontally (${maxScrollWidth}px > ${overflow.viewportWidth}px)`
    );
  }

  addResult(
    "pass",
    `${viewport.label}: ${stage} has no page-level horizontal overflow`,
    `${overflow.viewportWidth}px viewport`
  );
}

async function screenshot(page, viewport, stage) {
  await page.screenshot({
    fullPage: true,
    path: path.join(outputDir, `${viewport.id}-${stage}.png`),
  });
}

function addResult(status, label, detail) {
  results.push({ status, label, detail });
}

function normalizeBaseUrl(value) {
  if (!value) {
    return new URL("http://localhost:3001");
  }

  try {
    return new URL(value);
  } catch {
    console.error(`Invalid DEMO_BASE_URL: ${value}`);
    process.exit(1);
  }
}
