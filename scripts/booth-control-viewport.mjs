#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = normalizeBaseUrl(process.env.DEMO_BASE_URL ?? process.argv[2]);
const boothUrl = new URL("/booth-control", baseUrl);
const outputDir = path.resolve(
  process.env.DEMO_VIEWPORT_OUTPUT ??
    "output/playwright/booth-control-viewport"
);
const viewports = [
  { id: "booth-320", label: "320px booth pane", width: 320, height: 860 },
  { id: "booth-390", label: "390px booth pane", width: 390, height: 900 },
  { id: "booth-460", label: "460px booth pane", width: 460, height: 940 },
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
      baseUrl: boothUrl.toString(),
      generatedAt: new Date().toISOString(),
      results,
    },
    null,
    2
  )
);

console.log(`\nViewport QA report: ${reportPath}`);
console.log(`Screenshots: ${outputDir}`);

const failures = results.filter((result) => result.status === "fail");
if (failures.length > 0) {
  console.error(`\n${failures.length} booth viewport check(s) failed.`);
  process.exit(1);
}

async function runViewportCheck(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();

  try {
    await page.goto(boothUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await screenshot(page, viewport, "initial");
    await assertNoPageOverflow(page, viewport, "initial");
    await assertVisible(page, viewport, "Booth Control", "text=Booth Control");
    await assertVisible(page, viewport, "Durable section", "text=Durable");
    await assertVisible(page, viewport, "Investigate", "text=Investigate");
    await assertVisible(page, viewport, "Open Inngest", "text=Open Inngest");

    await page.getByRole("button", { name: /^scores$/i }).click();
    await screenshot(page, viewport, "scores");
    await assertNoPageOverflow(page, viewport, "scores");
    await assertVisible(page, viewport, "Save analysis", "text=Save analysis");
    await assertVisible(page, viewport, "Open session", "text=Open session");

    await page.getByRole("button", { name: /^experiment$/i }).click();
    await page.getByRole("button", { name: /show experiment/i }).click();
    await screenshot(page, viewport, "experiment");
    await assertNoPageOverflow(page, viewport, "experiment");
    await assertVisible(page, viewport, "Open experiment", "text=Open experiment");
    await assertVisible(page, viewport, "Open Insights", "text=Open Insights");

    await page.getByRole("button", { name: /^code$/i }).click();
    const sheet = page.locator('[data-slot="sheet-content"]').first();
    await sheet.getByText("Curated code").waitFor({ timeout: 5000 });
    await page.waitForTimeout(450);
    await screenshot(page, viewport, "code");
    await assertNoPageOverflow(page, viewport, "code");
    await assertVisible(page, viewport, "code drawer", '[data-slot="sheet-content"]');
    await assertLocatorVisible(sheet.getByText(/^Act 1$/), viewport, "Act 1 code");
    await assertLocatorVisible(sheet.getByText(/^Act 2$/), viewport, "Act 2 code");
    await assertLocatorVisible(sheet.getByText(/^Act 3$/), viewport, "Act 3 code");
  } catch (error) {
    await screenshot(page, viewport, "failure").catch(() => {});
    addResult(
      "fail",
      `${viewport.label} completed booth viewport flow`,
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    await context.close();
  }
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

  if (box.x < -1 || box.x + box.width > viewport.width + 1) {
    throw new Error(`${viewport.label}: ${label} is outside the viewport`);
  }

  addResult("pass", `${viewport.label}: ${label} visible`);
}

async function assertLocatorVisible(locator, viewport, label) {
  const first = locator.first();

  if (!(await first.isVisible().catch(() => false))) {
    throw new Error(`${viewport.label}: ${label} is not visible`);
  }

  const box = await first.boundingBox();

  if (!box) {
    throw new Error(`${viewport.label}: ${label} has no visible bounds`);
  }

  if (box.x < -1 || box.x + box.width > viewport.width + 1) {
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
    fullPage: false,
    path: path.join(outputDir, `${viewport.id}-${stage}.png`),
  });
}

function addResult(status, label, detail) {
  results.push({ status, label, detail });
}

function normalizeBaseUrl(value) {
  if (!value) {
    return new URL("http://localhost:3000");
  }

  try {
    return new URL(value);
  } catch {
    console.error(`Invalid DEMO_BASE_URL: ${value}`);
    process.exit(1);
  }
}
