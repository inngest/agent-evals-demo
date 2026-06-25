#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = normalizeBaseUrl(process.env.DEMO_BASE_URL ?? process.argv[2]);
const storyUrl = new URL("/booth-story", baseUrl);
const outputDir = path.resolve(
  process.env.DEMO_VIEWPORT_OUTPUT ?? "output/playwright/booth-story-viewport"
);
const viewports = [
  { id: "story-390", label: "390px product pane", width: 390, height: 920 },
  { id: "story-900", label: "900px laptop", width: 900, height: 900 },
  { id: "story-1280", label: "1280px booth split", width: 1280, height: 900 },
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
  if (result.detail) console.log(`  ${result.detail}`);
}

const reportPath = path.join(outputDir, "report.json");
await writeFile(
  reportPath,
  JSON.stringify(
    { baseUrl: storyUrl.toString(), generatedAt: new Date().toISOString(), results },
    null,
    2
  )
);

console.log(`\nViewport QA report: ${reportPath}`);
console.log(`Screenshots: ${outputDir}`);

const failures = results.filter((result) => result.status === "fail");
if (failures.length > 0) {
  console.error(`\n${failures.length} booth story viewport check(s) failed.`);
  process.exit(1);
}

async function runViewportCheck(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();

  try {
    await page.goto(storyUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await screenshot(page, viewport, "initial");
    await assertNoPageOverflow(page, viewport, "initial");
    await assertVisible(page, viewport, "production app", "text=Acme Support Concierge");
    await assertVisible(page, viewport, "Inngest proof", "text=Execution data, already there");
    await assertVisible(page, viewport, "Ask agent", "text=Ask agent");
    await assertVisible(page, viewport, "code drawer trigger", 'button[aria-label="Open code drawer"]');

    await page.getByRole("button", { name: /open code drawer/i }).click();
    await page.waitForSelector('[data-slot="sheet-content"]', { timeout: 3000 });
    await assertVisible(page, viewport, "code drawer", '[data-slot="sheet-content"]');
    await page.keyboard.press("Escape");
    await page
      .locator('[data-slot="sheet-content"]')
      .waitFor({ state: "hidden", timeout: 3000 })
      .catch(() => {});

    await page.getByRole("button", { name: /ask agent/i }).click();
    await page.waitForSelector("text=Conversation resumed", { timeout: 12000 });
    await page.waitForSelector("text=I found the likely fix path", { timeout: 10000 });
    await screenshot(page, viewport, "recovered");
    await assertNoPageOverflow(page, viewport, "recovered");
    await assertInViewport(page, viewport, "recovery event", "text=Conversation resumed");
    await assertInViewport(page, viewport, "final agent answer", "text=I found the likely fix path");
    await assertVisible(page, viewport, "run trace link", "text=Open the run trace");
  } catch (error) {
    await screenshot(page, viewport, "failure").catch(() => {});
    addResult(
      "fail",
      `${viewport.label} completed booth story flow`,
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
  if (!box) throw new Error(`${viewport.label}: ${label} has no visible bounds`);

  if (box.x < -1 || box.x + Math.min(box.width, 1) > viewport.width + 1) {
    throw new Error(`${viewport.label}: ${label} is outside the viewport`);
  }

  addResult("pass", `${viewport.label}: ${label} visible`);
}

async function assertInViewport(page, viewport, label, selector) {
  const locator = page.locator(selector).first();

  if (!(await locator.isVisible().catch(() => false))) {
    throw new Error(`${viewport.label}: ${label} is not visible`);
  }

  const box = await locator.boundingBox();
  if (!box) throw new Error(`${viewport.label}: ${label} has no visible bounds`);

  const midpointX = box.x + box.width / 2;
  const midpointY = box.y + Math.min(box.height / 2, 12);
  if (
    midpointX < 0 ||
    midpointX > viewport.width ||
    midpointY < 0 ||
    midpointY > viewport.height
  ) {
    throw new Error(`${viewport.label}: ${label} is outside the viewport`);
  }

  addResult("pass", `${viewport.label}: ${label} visible in viewport`);
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
  if (!value) return new URL("http://localhost:3000");

  try {
    return new URL(value);
  } catch {
    console.error(`Invalid DEMO_BASE_URL: ${value}`);
    process.exit(1);
  }
}
