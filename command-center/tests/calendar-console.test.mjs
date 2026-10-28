/**
 * The calendar in the real console at iPhone width: earlier NFL plan → Revise with a note → calendar command → the
 * ChatGPT paste → the calendar card (days, statuses, sources), approve / revise / reject / defer, the Markdown export.
 * Data is read at a pinned commit; Claude Code never runs (no billing confirmation in this temp ledger). No network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT } from "../lib/util.mjs";
import { tempDir, TEST_SLATE } from "./helpers.mjs";

const { chromium } = createRequire(path.join(REPO_ROOT, "app/package.json"))("@playwright/test");
const SCREENS = path.join(CC_ROOT, "out/screens");
const PINNED = "02002df5f79c9d00430b903c211b94ffaa04a602";
const available = (() => { try { execFileSync("git", ["cat-file", "-e", `${PINNED}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; } })();
const fence = (o) => "```json\n" + JSON.stringify(o) + "\n```";

function startServer(port) {
  const child = spawn(process.execPath, [path.join(CC_ROOT, "surfaces/console/server.mjs")], {
    env: { ...process.env, GTP_CC_PORT: String(port), GTP_CC_OUT_DIR: tempDir("gtp-cc-cal-console-"), GTP_CC_STEP_DELAY_MS: "0", GTP_CC_SLATE_DATE: TEST_SLATE, GTP_CC_DATA_REF: PINNED },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", (d) => { if (String(d).includes("http://127.0.0.1")) resolve(child); });
    child.on("exit", (code) => reject(new Error(`console exited ${code}: ${err}`)));
  });
}

test("calendar in the console at 390 px", { skip: available ? false : "pinned data commit not in this clone" }, async () => {
  const port = 5200 + Math.floor(Math.random() * 300);
  const browser = await chromium.launch();
  const server = await startServer(port).catch(async (err) => { await browser.close(); throw err; });
  fs.mkdirSync(SCREENS, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Expand to NFL, NBA, MLB, UFC and EPL." : undefined));
    await page.goto(`http://127.0.0.1:${port}/`);
    const send = async (text) => { await page.locator('.tab[data-tab="chat"]').tap(); await page.locator("#input").fill(text); await page.locator("#composer button[type=submit]").tap(); };
    const paste = async (obj) => {
      const box = page.locator("textarea[data-draft]").last();
      await box.waitFor();
      await box.fill(fence(obj));
      await page.locator("[data-submit]").last().tap();
    };

    await send("Team, review GameTimePicks' current NFL social-content opportunities and propose an improved weekly X content plan.");
    await paste({ query: "NFL", findings: [{ topic: "TNF preview", summary: "Fans previewing CAR @ GB", sources: [{ url: "https://x.com/nflfan/status/1849000000000000001" }] }], caveats: [] });
    await page.locator("pre[id^=prompt-]", { hasText: "You are the Content Strategist" }).waitFor();
    await paste({ summary: "NFL recap-first week", weekly: [{ day: "Mon", format: "card", theme: "recap", dataSource: "ledger" }, { day: "Wed", format: "thread", theme: "misses", dataSource: "ledger" }, { day: "Sun", format: "post", theme: "preview", dataSource: "forecasts" }], kpis: [], risks: [] });
    await page.locator(".msg.report").first().waitFor({ timeout: 30_000 }).catch(async () => {
      const st = await page.evaluate(async () => (await fetch("/api/state")).json());
      throw new Error(`no report: ${JSON.stringify(st.commands.at(-1).tasks.map((t) => [t.ownerRole, t.status])).slice(0, 600)} ${JSON.stringify(st.commands.at(-1).refusals).slice(0, 600)}`);
    });
    await page.locator('.tab[data-tab="decisions"]').tap();
    await page.locator('#decisions [data-verdict="revise"]').first().tap();
    await page.locator("#decisions .blocked", { hasText: "REVISION REQUESTED" }).waitFor();

    await send("Team, turn the revised weekly plan into a seven-day content calendar covering NFL, NBA, MLB, UFC and EPL.");
    const prompt = page.locator("pre[id^=prompt-]").last();
    await prompt.waitFor({ timeout: 60_000 });
    const text = await prompt.innerText();
    assert.match(text, /OPPORTUNITY GRID/);
    const ids = [...text.matchAll(/^(\d{4}-\d{2}-\d{2}:[A-Z]{3}:[a-z-]+:[a-z0-9]+) \| (READY|NEEDS_VERIFICATION)/gm)].map((m) => m[1]);
    assert.ok(ids.length >= 2, "ready / verify slots listed for ChatGPT");
    await paste({ summary: "Recap-led week across five sports", picks: ids.slice(0, 3).map((slotId, i) => ({ slotId, priority: i + 1, angle: `angle ${i + 1}` })) });

    await page.locator('.tab[data-tab="decisions"]').tap();
    const card = page.locator("#decisions .decision", { hasText: "Seven-day content calendar" });
    await card.waitFor({ timeout: 30_000 });
    assert.ok(await card.locator(".cal-day").count() >= 2, "grouped by day");
    assert.ok(await card.locator(".st-READY").count() >= 1);
    for (const v of ["approve", "reject", "revise", "defer"]) assert.equal(await card.locator(`[data-verdict="${v}"]`).count(), 1);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(m.sw <= m.cw, `calendar scrolls sideways (${m.sw} > ${m.cw})`);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SCREENS, "calendar-390.png") });
    const href = await card.locator("a", { hasText: "Markdown export" }).getAttribute("href");
    const md = await page.evaluate(async (u) => (await fetch(u)).text(), href);
    assert.match(md, /seven-day content calendar/);
    await card.locator('[data-verdict="approve"]').tap();
    await page.locator("#decisions .receipt", { hasText: "APPROVED" }).first().waitFor();
    assert.deepEqual(errors, []);
  } finally {
    server.kill();
    await browser.close();
  }
});
