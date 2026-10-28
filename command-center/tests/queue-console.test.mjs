/**
 * D1 console: the content queue on desktop (1440) and iPhone (390, 430). A queue is built in-process from a seeded
 * approved calendar at the pinned data commit, then the real console server serves that ledger and a browser:
 * approves one post's caption, records the X link (the manual receipt), saves engagement numbers, and checks that an
 * X reply can't be approved without confirming its sources. No horizontal overflow; touch targets ≥ 44 px on phones.
 * Screenshots land in command-center/out/screens/ (git-ignored).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT } from "../lib/util.mjs";
import { createFileStore } from "../ledger/store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { FOUNDER, tempDir } from "./helpers.mjs";
import { QUEUE_PINNED, QUEUE_NOW, X_URL, hasPinned, seedApprovedCalendar } from "./queue-fixtures.mjs";

const { chromium } = createRequire(path.join(REPO_ROOT, "app/package.json"))("@playwright/test");
const SCREENS = path.join(CC_ROOT, "out/screens");
const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "iphone-390", width: 390, height: 844, phone: true },
  { name: "iphone-430", width: 430, height: 932, phone: true },
];

async function builtQueue() {
  const dir = tempDir("gtp-cc-queue-console-");
  const clock = () => QUEUE_NOW;
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  seedApprovedCalendar(store);
  const o = createOrchestrator({ store, clock, outDir: dir, queueRender: false, calendarDataSource: gitDataSource(REPO_ROOT, QUEUE_PINNED) });
  await o.handleCommand("Team, prepare today's content queue", FOUNDER);
  return dir;
}

function startServer(port, outDir) {
  const child = spawn(process.execPath, [path.join(CC_ROOT, "surfaces/console/server.mjs")], {
    env: { ...process.env, GTP_CC_PORT: String(port), GTP_CC_OUT_DIR: outDir, GTP_CC_STEP_DELAY_MS: "0", GTP_CC_X_HANDLE: "GameTimePicks" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", (d) => { if (String(d).includes("http://127.0.0.1")) resolve(child); });
    child.on("exit", (code) => reject(new Error(`console exited ${code}: ${err}`)));
  });
}

for (const [i, vp] of VIEWPORTS.entries()) {
  test(`queue in the console on ${vp.name}: approve one post, record its X link and engagement`, { skip: hasPinned ? false : "pinned data commit missing" }, async () => {
    const outDir = await builtQueue();
    const port = 4800 + i * 7 + Math.floor(Math.random() * 400);
    const browser = await chromium.launch();
    const server = await startServer(port, outDir).catch(async (err) => { await browser.close(); throw err; });
    fs.mkdirSync(SCREENS, { recursive: true });
    try {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, ...(vp.phone ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true } : {}) });
      const dialogs = [];
      page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.waitForSelector("#queue .post", { state: "attached" });
      if (vp.phone) await page.click('[data-tab="queue"]');
      const queue = page.locator("#queue");
      await assert.doesNotReject(queue.locator(".post").first().waitFor({ state: "visible" }));
      const overflow = async (label) => {
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        assert.ok(m.sw <= m.cw, `${label}: page scrolls sideways (${m.sw} > ${m.cw})`);
      };
      await overflow("queue");
      await page.screenshot({ path: path.join(SCREENS, `queue-${vp.name}.png`) });

      // An X reply can't be approved until the founder confirms the cited posts.
      const reply = queue.locator(".post", { hasText: "Join: trade deadline talk" });
      await reply.locator("[data-post-approve]").click();
      await page.waitForFunction(() => true);
      await page.waitForTimeout(300);
      assert.ok(dialogs.some((m) => /SOURCES_NOT_CONFIRMED/.test(m)), `dialogs: ${dialogs.join(" | ")}`);

      // Approve SF @ ATL with caption B.
      const card = queue.locator(".post", { hasText: "SF @ ATL" });
      await card.locator('input[type="radio"][value="B"]').check({ force: true });
      const approve = card.locator("[data-post-approve]");
      if (vp.phone) { const box = await approve.boundingBox(); assert.ok(box.height >= 44, `approve is ${box.height}px`); }
      await approve.click();
      await card.locator(".receipt").waitFor();
      assert.match(await card.locator(".receipt").innerText(), /Approved caption B/);
      await overflow("approved");

      // Record the X link → published, then engagement.
      await card.locator("input[type=url]").fill(X_URL);
      await card.locator('[data-post-record="publish"]').click();
      await queue.locator(".post", { hasText: "SF @ ATL" }).locator(".life-published").waitFor();
      const published = queue.locator(".post", { hasText: "SF @ ATL" });
      assert.match(await published.locator(".receipt").first().innerText(), /Posted by you/);
      await published.locator('input[data-draft$=":likes"]').fill("12");
      await published.locator('[data-post-record="engagement"]').click();
      await published.locator("summary", { hasText: "likes 12" }).waitFor();
      await published.scrollIntoViewIfNeeded();
      await overflow("published");
      await page.screenshot({ path: path.join(SCREENS, `queue-${vp.name}-published.png`) });

      if (vp.phone) {
        const small = await page.evaluate(() => [...document.querySelectorAll("#queue .btn, #queue input[type=url], #queue input[type=number], #queue input[type=datetime-local]")]
          .filter((e) => e.offsetParent && e.getBoundingClientRect().height < 40).map((e) => `${e.textContent || e.type}:${Math.round(e.getBoundingClientRect().height)}`));
        assert.deepEqual(small, [], "touch targets under 40 px");
      }
    } finally {
      await browser.close();
      server.kill();
    }
  });
}
