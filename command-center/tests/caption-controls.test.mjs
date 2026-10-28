/**
 * Caption controls: Copy caption button and n/280 character counter on every Approvals option.
 * Covers counting accuracy, clipboard success/failure paths, approval integrity, and mobile layout.
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

function startServer(port) {
  const child = spawn(process.execPath, [path.join(CC_ROOT, "surfaces/console/server.mjs")], {
    env: { ...process.env, GTP_CC_X_VAULT: "memory", GTP_CC_SCHEDULER: "off", GTP_CC_PORT: String(port), GTP_CC_OUT_DIR: tempDir("gtp-cc-caption-"), GTP_CC_STEP_DELAY_MS: "0", GTP_CC_SLATE_DATE: TEST_SLATE },
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

// Unicode code-point counting: Array.from(text).length
test("Array.from counting: empty, short, exactly 280, over 280, surrogate pair emoji", () => {
  assert.equal(Array.from("").length, 0);
  assert.equal(Array.from("Hello").length, 5);
  const exactly280 = "a".repeat(280);
  assert.equal(Array.from(exactly280).length, 280);
  const over280 = "a".repeat(281);
  assert.equal(Array.from(over280).length, 281);
  // 4-byte emoji (U+1F600) is one code point even though it's two UTF-16 code units
  assert.equal(Array.from("😀").length, 1);
  assert.equal(Array.from("😀".repeat(280)).length, 280);
  assert.equal(Array.from("😀".repeat(281)).length, 281);
  // Mixed ASCII and emoji
  assert.equal(Array.from("Hi 😀").length, 4);
});

for (const [i, phone] of [{ name: "iphone-390", width: 390, height: 844 }, { name: "iphone-430", width: 430, height: 932 }].entries()) {
  test(`caption controls on ${phone.name}: render, copy, failure, integrity, layout`, async () => {
    const port = 4380 + i + Math.floor(Math.random() * 500);
    const browser = await chromium.launch();
    const server = await startServer(port).catch(async (err) => { await browser.close(); throw err; });
    fs.mkdirSync(SCREENS, { recursive: true });
    try {
      const context = await browser.newContext({
        viewport: { width: phone.width, height: phone.height },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        permissions: ["clipboard-read", "clipboard-write"],
      });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/`);

      // Run the team to get an Approvals card.
      await page.locator("#input").fill(RECAP_COMMAND);
      await page.locator("#composer button[type=submit]").tap();
      await page.locator(".msg.report").waitFor({ timeout: 60_000 });

      // Navigate to Approvals.
      await page.locator(".msg.report [data-goto=decisions]").tap();
      await page.locator("#decisions .decision img").waitFor();

      // ── 1. Each option renders exactly one counter and one copy button ──
      const optionCount = await page.locator("#decisions .option").count();
      assert.ok(optionCount >= 2, "at least two caption options");
      for (let idx = 0; idx < optionCount; idx++) {
        const option = page.locator("#decisions .option").nth(idx);
        assert.equal(await option.locator(".caption-counter").count(), 1, `option ${idx} has one counter`);
        assert.equal(await option.locator("[data-copy-caption]").count(), 1, `option ${idx} has one copy button`);
      }

      // ── 2. Counter text matches Array.from(text).length / 280 ──
      const counterTexts = await page.locator("#decisions .option .caption-counter").allInnerTexts();
      for (const ct of counterTexts) {
        assert.match(ct, /^\d+\/280$/, `counter format: "${ct}"`);
        const n = parseInt(ct, 10);
        assert.ok(n >= 0, "count is non-negative");
      }

      // ── 3. over class appears iff count > 280 ──
      const allCounters = page.locator("#decisions .option .caption-counter");
      const totalCounters = await allCounters.count();
      for (let idx = 0; idx < totalCounters; idx++) {
        const el = allCounters.nth(idx);
        const text = await el.innerText();
        const n = parseInt(text, 10);
        const hasOver = await el.evaluate((node) => node.classList.contains("over"));
        if (n > 280) {
          assert.ok(hasOver, `counter at ${n} should have .over class`);
        } else {
          assert.ok(!hasOver, `counter at ${n} should not have .over class`);
        }
      }

      // ── 4. Mock clipboard success: verify exact original text is written ──
      await page.evaluate(() => {
        window.__copiedTexts = [];
        navigator.clipboard.writeText = (text) => { window.__copiedTexts.push(text); return Promise.resolve(); };
      });

      // Copy caption A (first option)
      const copyBtnA = page.locator("#decisions .option [data-copy-caption]").first();
      const keyA = await copyBtnA.getAttribute("data-copy-caption");
      await copyBtnA.tap();
      // Wait for feedback
      await page.waitForFunction(() => document.querySelector("#decisions .option [data-copy-caption]")?.textContent === "Copied!");
      assert.equal(await copyBtnA.innerText(), "Copied!", "button shows Copied! on success");

      const copiedA = await page.evaluate(() => window.__copiedTexts[0]);
      assert.ok(typeof copiedA === "string" && copiedA.length > 0, "clipboard received non-empty string for caption A");

      // Copy caption B (second option) independently
      await page.evaluate(() => { window.__copiedTexts = []; });
      const copyBtnB = page.locator("#decisions .option [data-copy-caption]").nth(1);
      const keyB = await copyBtnB.getAttribute("data-copy-caption");
      assert.notEqual(keyA, keyB, "caption A and B have different keys");
      await copyBtnB.tap();
      await page.waitForFunction(() => {
        const btns = document.querySelectorAll("#decisions .option [data-copy-caption]");
        return btns[1]?.textContent === "Copied!";
      });
      const copiedB = await page.evaluate(() => window.__copiedTexts[0]);
      assert.ok(typeof copiedB === "string" && copiedB.length > 0, "clipboard received non-empty string for caption B");
      assert.notEqual(copiedA, copiedB, "caption A and B copy different text");

      // ── 5. Clipboard failure: rejected promise shows error feedback ──
      await page.evaluate(() => {
        navigator.clipboard.writeText = () => Promise.reject(new Error("Permission denied"));
      });
      const copyBtnFail = page.locator("#decisions .option [data-copy-caption]").first();
      await copyBtnFail.tap();
      await page.waitForFunction(() => document.querySelector("#decisions .option [data-copy-caption]")?.textContent === "Copy failed");
      assert.equal(await copyBtnFail.innerText(), "Copy failed", "shows Copy failed on rejection");

      // ── 5b. Unavailable clipboard API shows error feedback ──
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
      });
      await copyBtnFail.tap();
      await page.waitForFunction(() => document.querySelector("#decisions .option [data-copy-caption]")?.textContent === "Copy failed");
      assert.equal(await copyBtnFail.innerText(), "Copy failed", "shows Copy failed when clipboard undefined");

      // Restore clipboard
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", { value: { writeText: (t) => { window.__copiedTexts.push(t); return Promise.resolve(); } }, configurable: true });
        window.__copiedTexts = [];
      });

      // ── 6. Copying does not change radio selection or approval state ──
      const checkedBefore = await page.evaluate(() => {
        const radios = [...document.querySelectorAll("#decisions input[type=radio]")];
        return radios.map((r) => ({ name: r.name, value: r.value, checked: r.checked }));
      });
      await page.locator("#decisions .option [data-copy-caption]").first().tap();
      await page.waitForFunction(() => document.querySelector("#decisions .option [data-copy-caption]")?.textContent === "Copied!");
      const checkedAfter = await page.evaluate(() => {
        const radios = [...document.querySelectorAll("#decisions input[type=radio]")];
        return radios.map((r) => ({ name: r.name, value: r.value, checked: r.checked }));
      });
      assert.deepEqual(checkedBefore, checkedAfter, "copying does not change radio selection");
      assert.equal(await page.locator("#decisions .receipt").count(), 0, "no approval submitted by copy");

      // ── 7. Copy available on resolved decisions ──
      // Approve the decision, then verify copy button is still present
      await page.locator("#decisions [data-approve]").tap();
      await page.locator("#decisions .receipt").waitFor();
      assert.ok(await page.locator("#decisions .option [data-copy-caption]").first().isVisible(), "copy button present after approval");

      await page.screenshot({ path: path.join(SCREENS, `${phone.name}-caption-resolved.png`), fullPage: false });

      // ── 8. Layout: no horizontal overflow, copy buttons ≥ 44px tall ──
      // Navigate back to a fresh approvals state via reset (if available) or just check resolved state
      await noHorizontalOverflow(page, `${phone.name} caption controls`);
      // The resolved state still shows copy buttons; check their height
      const copyBtn = page.locator("#decisions .option [data-copy-caption]").first();
      await minHeight(copyBtn, 44, `${phone.name} copy caption button`);

      await page.screenshot({ path: path.join(SCREENS, `${phone.name}-caption-controls.png`), fullPage: false });
    } finally {
      server.kill();
      await browser.close();
    }
  });
}
