/**
 * iPhone acceptance (390 × 844 and 430 × 932): the CEO console works one-handed on a phone.
 *
 * Starts the real console server on a spare loopback port with a temp ledger and the pinned 2026-10-25 slate, then
 * drives it in mobile Chromium (touch, 3× scale) through the whole flow: send the recap command → the team works
 * in Chat → "Review in Approvals" → Pause from the top bar blocks an approval → Resume → publish → receipt; Tasks,
 * Activity and Team views. Every view must have no horizontal page overflow, and the primary controls must be at
 * least 44 px tall (Apple's minimum touch target; the top-bar Pause is 40 px). Screenshots land in
 * command-center/out/screens/ (git-ignored).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT } from "../lib/util.mjs";
import { tempDir, TEST_SLATE, RECAP_COMMAND } from "./helpers.mjs";

const { chromium } = createRequire(path.join(REPO_ROOT, "app/package.json"))("@playwright/test");
const SCREENS = path.join(CC_ROOT, "out/screens");
const PHONES = [
  { name: "iphone-390", width: 390, height: 844 },
  { name: "iphone-430", width: 430, height: 932 },
];

function startServer(port) {
  const child = spawn(process.execPath, [path.join(CC_ROOT, "surfaces/console/server.mjs")], {
    env: { ...process.env, GTP_CC_PORT: String(port), GTP_CC_OUT_DIR: tempDir("gtp-cc-console-"), GTP_CC_STEP_DELAY_MS: "0", GTP_CC_SLATE_DATE: TEST_SLATE },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", (d) => { if (String(d).includes("http://127.0.0.1")) resolve(child); });
    child.on("exit", (code) => reject(new Error(`console exited ${code}: ${err}`)));
  });
}

async function noHorizontalOverflow(page, label) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(m.sw <= m.cw, `${label}: page scrolls sideways (${m.sw} > ${m.cw})`);
}

async function minHeight(locator, px, label) {
  const box = await locator.boundingBox();
  assert.ok(box, `${label} is not visible`);
  assert.ok(box.height >= px, `${label} is ${box.height}px tall (< ${px})`);
}

for (const [i, phone] of PHONES.entries()) {
  test(`console on ${phone.name}: chat, approvals with Pause, tasks, activity, team`, async () => {
    const port = 4290 + i + Math.floor(Math.random() * 500);
    // Browser first: if it can't launch, no server has been started that could be left running.
    const browser = await chromium.launch();
    const server = await startServer(port).catch(async (err) => { await browser.close(); throw err; });
    fs.mkdirSync(SCREENS, { recursive: true });
    try {
      const page = await browser.newPage({ viewport: { width: phone.width, height: phone.height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await page.goto(`http://127.0.0.1:${port}/`);
      const tab = (id) => page.locator(`.tab[data-tab="${id}"]`);

      // Chat: the default view, with the tab bar and the top-bar Pause always on screen.
      await page.locator(".tabbar").waitFor();
      for (const id of ["chat", "decisions", "tasks", "history", "team"]) await minHeight(tab(id), 44, `tab ${id}`);
      await minHeight(page.locator("#pause-top"), 40, "top-bar Pause");
      await minHeight(page.locator("#composer button[type=submit]"), 44, "Send");
      assert.equal(await page.locator("#decisions").isVisible(), false, "only one section at a time");
      await noHorizontalOverflow(page, "chat (empty)");

      await page.locator("#input").fill(RECAP_COMMAND);
      await page.locator("#composer button[type=submit]").tap();
      await page.locator(".msg.report").waitFor({ timeout: 60_000 });
      await page.locator('.tab[data-tab="decisions"] .dot').waitFor();
      assert.ok(await page.locator(".msg .deliverable img").first().isVisible(), "the graphic shows in the chat");
      await noHorizontalOverflow(page, "chat (after the team ran)");
      await page.screenshot({ path: path.join(SCREENS, `${phone.name}-chat.png`) });

      // Approvals, reached from the report's button.
      await page.locator(".msg.report [data-goto=decisions]").tap();
      await page.locator("#decisions .decision img").waitFor();
      await minHeight(page.locator("#decisions [data-approve]"), 44, "Approve");
      await noHorizontalOverflow(page, "approvals");
      await page.screenshot({ path: path.join(SCREENS, `${phone.name}-approvals.png`), fullPage: false });

      // Pause from the top bar blocks the approved draft at the send boundary.
      await page.locator("#pause-top").tap();
      await page.locator("#pause-top.paused").waitFor();
      await page.locator("#decisions [data-approve]").tap();
      await page.locator("#decisions .blocked").waitFor();
      assert.match(await page.locator("#decisions .blocked").innerText(), /PAUSED/);
      await page.screenshot({ path: path.join(SCREENS, `${phone.name}-paused.png`) });

      // Resume, then the same approval publishes once (mock).
      await page.locator("#pause-top").tap();
      await page.locator("#pause-top.live").waitFor();
      await page.locator("#decisions [data-approve]").tap();
      await page.locator("#decisions .receipt").waitFor();
      assert.match(await page.locator("#decisions .receipt").innerText(), /PUBLISHED_MOCK/);
      assert.equal(await page.locator('.tab[data-tab="decisions"] .dot').count(), 0, "no open approvals left");
      await page.screenshot({ path: path.join(SCREENS, `${phone.name}-receipt.png`) });

      // Tasks, Activity, Team.
      await tab("tasks").tap();
      assert.equal(await page.locator("#tasks .task").count(), 6);
      await noHorizontalOverflow(page, "tasks");
      await page.screenshot({ path: path.join(SCREENS, `${phone.name}-tasks.png`) });
      await tab("history").tap();
      assert.ok((await page.locator("#history .hist div").count()) > 20);
      await noHorizontalOverflow(page, "activity");
      await tab("team").tap();
      assert.ok(await page.locator("#controls").isVisible());
      assert.ok(await page.locator("#team select").first().isVisible());
      await noHorizontalOverflow(page, "team");
      await page.screenshot({ path: path.join(SCREENS, `${phone.name}-team.png`) });
    } finally {
      server.kill();
      await browser.close();
    }
  });
}
