/**
 * The X-research team workflow in the real console at iPhone width: the Grok prompt appears, the founder pastes
 * Grok's and ChatGPT's answers, every card carries its execution label, the passing draft becomes a decision with
 * approve / reject / revise / defer, and the Providers panel shows each provider's real state. No network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT } from "../lib/util.mjs";
import { tempDir, TEST_SLATE } from "./helpers.mjs";

const { chromium } = createRequire(path.join(REPO_ROOT, "app/package.json"))("@playwright/test");
const SCREENS = path.join(CC_ROOT, "out/screens");
const CMD = "Team, analyze today's biggest NFL conversations on X and identify three opportunities for GameTimePicks to contribute useful content.";
const RESEARCH = { query: "NFL on X", findings: [
  { topic: "Seahawks defense", summary: "Fans debating Seattle holding KC to 3", sources: [{ url: "https://x.com/nflfan/status/1849000000000000001", author: "@nflfan" }] },
  { topic: "Unsourced rumour", summary: "chatter", sources: [{ url: "javascript:alert(1)" }] },
], caveats: [] };
const PROPOSALS = { proposals: [
  { findingIndex: 0, type: "reply", replyToUrl: "https://x.com/nflfan/status/1849000000000000001", text: "Our pregame forecast had Seattle at 62.6% to win. Final: Seahawks 20, Chiefs 3.", rationale: "joins the thread" },
  { findingIndex: 0, type: "post", text: "Seattle's defense made the forecast look easy: Seahawks 20, Chiefs 3.", rationale: "own post" },
  { findingIndex: 1, type: "post", text: "Lock it in.", rationale: "x" },
] };

function startServer(port) {
  const child = spawn(process.execPath, [path.join(CC_ROOT, "surfaces/console/server.mjs")], {
    env: { ...process.env, GTP_CC_X_VAULT: "memory", GTP_CC_SCHEDULER: "off", GTP_CC_PORT: String(port), GTP_CC_OUT_DIR: tempDir("gtp-cc-team-console-"), GTP_CC_STEP_DELAY_MS: "0", GTP_CC_SLATE_DATE: TEST_SLATE },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", (d) => { if (String(d).includes("http://127.0.0.1")) resolve(child); });
    child.on("exit", (code) => reject(new Error(`console exited ${code}: ${err}`)));
  });
}

test("team workflow in the console at 390 px: paste Grok and ChatGPT, labelled cards, proposal decisions, Providers panel", async () => {
  const port = 4900 + Math.floor(Math.random() * 300);
  const browser = await chromium.launch();
  const server = await startServer(port).catch(async (err) => { await browser.close(); throw err; });
  fs.mkdirSync(SCREENS, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Shorter, and mention the frozen time" : undefined));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.locator("#input").fill(CMD);
    await page.locator("#composer button[type=submit]").tap();

    const paste = async (obj) => {
      const box = page.locator("textarea[data-draft]").last();
      await box.waitFor();
      await box.fill("```json\n" + JSON.stringify(obj) + "\n```");
      await page.locator("[data-submit]").last().tap();
    };
    await page.getByText("Grok", { exact: false }).first().waitFor();
    await paste(RESEARCH);
    await page.locator(".findings a[href^='https://x.com/']").first().waitFor();
    assert.equal(await page.locator(".findings a[href^='javascript']").count(), 0, "a non-X link is never rendered as a link");
    await paste(PROPOSALS);
    await page.locator(".msg.report").waitFor({ timeout: 30_000 });
    assert.ok(await page.locator(".tag.exec-manual").count() >= 2, "Grok and ChatGPT cards say MANUAL PROVIDER HANDOFF");
    assert.equal(await page.locator(".tag.exec-sim").count(), 0, "nothing simulated");
    await page.screenshot({ path: path.join(SCREENS, "team-390-chat.png"), fullPage: false });

    await page.locator('.tab[data-tab="decisions"]').tap();
    const cards = page.locator("#decisions .decision");
    assert.equal(await cards.count(), 2, "two drafts passed the content check");
    for (const v of ["approve", "reject", "revise", "defer"]) assert.equal(await cards.first().locator(`[data-verdict="${v}"]`).count(), 1);
    await cards.first().locator('[data-verdict="approve"]').tap();
    await page.locator("#decisions .receipt", { hasText: "APPROVED AS A DRAFT" }).waitFor();
    await cards.nth(1).locator('[data-verdict="revise"]').tap();
    await page.locator("#decisions .blocked", { hasText: "REVISION REQUESTED" }).waitFor();
    await page.screenshot({ path: path.join(SCREENS, "team-390-decisions.png"), fullPage: false });

    await page.locator('.tab[data-tab="team"]').tap();
    await page.locator(".provider").first().waitFor();
    const text = await page.locator("#team").innerText();
    assert.match(text, /ChatGPT · OpenAI/);
    assert.match(text, /Grok · xAI/);
    assert.match(text, /NOT CONFIGURED/);
    assert.match(text, /billed separately from ChatGPT Plus/);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(m.sw <= m.cw, `Team view scrolls sideways (${m.sw} > ${m.cw})`);
    await page.locator(".provider").nth(1).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: path.join(SCREENS, "team-390-providers.png") });
    assert.deepEqual(errors, []);
  } finally {
    server.kill();
    await browser.close();
  }
});
