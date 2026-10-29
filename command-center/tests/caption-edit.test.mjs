/**
 * Caption editing on the Queue: an edit is a new, checked option (E1, E2, …) whose fingerprint the server computes;
 * approving it binds exactly that text; the generated captions stay; nothing is approved or sent by editing. Then the
 * editor in the real console on desktop and iPhone widths (390, 430): it survives a live refresh while typing, the
 * counter follows the text, and the edited caption is approved like any other. Screenshots: out/screens/.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT, sha256 } from "../lib/util.mjs";
import { createFileStore } from "../ledger/store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { routePermission } from "../hosted/app.mjs";
import { FOUNDER, tempDir, openView, expandPost } from "./helpers.mjs";
import { QUEUE_PINNED, QUEUE_NOW, hasPinned, seedApprovedCalendar } from "./queue-fixtures.mjs";

const { chromium } = createRequire(path.join(REPO_ROOT, "app/package.json"))("@playwright/test");
const SCREENS = path.join(CC_ROOT, "out/screens");
const SUFFIX = "\n\nSee you there.";
const TITLE = "SF @ ATL"; // an NFL recap: the forecast missed (ATL won), so an edit must still say so

async function builtQueue() {
  const dir = tempDir("gtp-cc-caption-edit-");
  const clock = () => QUEUE_NOW;
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  seedApprovedCalendar(store);
  const o = createOrchestrator({ store, clock, outDir: dir, queueRender: false, queueTemplate: "v1", calendarDataSource: gitDataSource(REPO_ROOT, QUEUE_PINNED) });
  await o.handleCommand("Team, prepare today's content queue", FOUNDER);
  return { dir, o };
}
const card = (o, text) => o.state().posts.find((p) => p.package.title?.includes(text) && p.lifecycle === "drafted");

test("caption edit: a new checked option, server-side fingerprint, approved like the rest; rules and roles", { skip: hasPinned ? false : "pinned data commit missing" }, async () => {
  const { o } = await builtQueue();
  let p = card(o, TITLE);
  const B = p.options.find((x) => x.captionId === "B");
  const before = p.options.map((x) => [x.captionId, x.digest]);

  assert.equal(o.editCaption({ decisionId: p.decisionId, basedOn: "B", text: "x" }, { role: "viewer", id: "v1" }).code, "NOT_FOUNDER", "a viewer can't edit");
  assert.equal(o.editCaption({ decisionId: p.decisionId, basedOn: "Z", text: "x" }, FOUNDER).code, "UNKNOWN_OPTION");
  assert.equal(o.editCaption({ decisionId: p.decisionId, basedOn: "B", text: "   " }, FOUNDER).code, "EMPTY_CAPTION");
  assert.equal(o.editCaption({ decisionId: p.decisionId, basedOn: "B", text: B.text }, FOUNDER).code, "UNCHANGED");
  assert.equal(o.editCaption({ decisionId: "nope", basedOn: "B", text: "x" }, FOUNDER).code, "UNKNOWN_POST");

  const r = o.editCaption({ decisionId: p.decisionId, basedOn: "B", text: `${B.text}${SUFFIX}`, digest: "attacker-chosen" }, { role: "drafter", id: "d1" });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.option.captionId, "E1");
  assert.ok(r.option.check.ok, JSON.stringify(r.option.check));
  assert.match(r.next, /not approved/);
  p = card(o, TITLE);
  assert.deepEqual(p.options.slice(0, before.length).map((x) => [x.captionId, x.digest]), before, "the generated captions are unchanged");
  const E1 = p.options.find((x) => x.captionId === "E1");
  assert.equal(E1.publishBundle.captionSha256, sha256(`${B.text}${SUFFIX}`));
  assert.notEqual(E1.digest, "attacker-chosen");
  assert.equal(E1.editedBy, "d1");

  // an untraceable number fails the same check the generated captions pass; it is saved but can't be approved
  const bad = o.editCaption({ decisionId: p.decisionId, basedOn: "B", text: `${B.text} Final score 999.` }, FOUNDER);
  assert.ok(bad.ok);
  assert.equal(bad.option.check.ok, false);
  assert.equal((await o.decide({ decisionId: p.decisionId, verdict: "approve", captionId: "E2", digest: bad.option.digest }, FOUNDER)).code, "CAPTION_CHECK_FAILED");
  const link = o.editCaption({ decisionId: p.decisionId, basedOn: "B", text: `${B.text} gametimepicks.com` }, FOUNDER);
  assert.equal(link.option.check.ok, false, "no links");
  const hidesMiss = o.editCaption({ decisionId: p.decisionId, basedOn: "B", text: "ATL beat SF 29-20. Our prediction for this game is in." }, FOUNDER);
  assert.deepEqual(hidesMiss.option.check.problems.map((x) => x.code), ["MISS_NOT_DISCLOSED"], "a recap edit can't hide the miss");

  // approving E1 needs its digest; a drafter can't approve
  assert.equal((await o.decide({ decisionId: p.decisionId, verdict: "approve", captionId: "E1", digest: B.digest }, FOUNDER)).code, "APPROVAL_DIGEST_MISMATCH");
  assert.equal((await o.decide({ decisionId: p.decisionId, verdict: "approve", captionId: "E1", digest: E1.digest }, { role: "drafter", id: "d1" })).code, "NOT_FOUNDER");
  const ok = await o.decide({ decisionId: p.decisionId, verdict: "approve", captionId: "E1", digest: E1.digest }, FOUNDER);
  assert.ok(ok.ok, JSON.stringify(ok));
  const approved = o.state().posts.find((x) => x.decisionId === p.decisionId);
  assert.equal(approved.resolution.captionId, "E1");
  assert.equal(approved.resolution.approvedExactDigest, E1.digest);
  assert.equal(o.editCaption({ decisionId: p.decisionId, basedOn: "A", text: "new words" }, FOUNDER).code, "ALREADY_DECIDED", "decided posts can't be edited");
  assert.equal(o.state().posts.filter((x) => x.receipt).length, 0, "nothing was published");
  assert.equal(routePermission("/api/caption"), "draft", "hosted: drafters and up");
});

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "iphone-390", width: 390, height: 844, phone: true },
  { name: "iphone-430", width: 430, height: 932, phone: true },
];
function startServer(port, outDir) {
  const child = spawn(process.execPath, [path.join(CC_ROOT, "surfaces/console/server.mjs")], {
    env: { ...process.env, GTP_CC_X_VAULT: "memory", GTP_CC_SCHEDULER: "off", GTP_CC_PORT: String(port), GTP_CC_OUT_DIR: outDir, GTP_CC_STEP_DELAY_MS: "0", GTP_CC_X_HANDLE: "GameTimePicks" },
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
  test(`caption editor in the console on ${vp.name}: edit, survive a refresh while typing, save, approve the edit`, { skip: hasPinned ? false : "pinned data commit missing" }, async () => {
    const { dir } = await builtQueue();
    const port = 5300 + i * 11 + Math.floor(Math.random() * 300);
    const browser = await chromium.launch();
    const server = await startServer(port, dir).catch(async (err) => { await browser.close(); throw err; });
    fs.mkdirSync(SCREENS, { recursive: true });
    try {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, ...(vp.phone ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true } : {}) });
      const dialogs = [];
      page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.waitForSelector("#queue .post", { state: "attached" });
      await openView(page, "queue");
      const post = page.locator("#queue .post", { hasText: TITLE });
      await expandPost(post);
      const edit = post.locator('[data-caption-open][data-based-on="B"]');
      if (vp.phone) { const box = await edit.boundingBox(); assert.ok(box.height >= 40, `Edit is ${box.height}px`); }
      await edit.click();
      const box = post.locator("textarea[data-caption-edit]");
      await box.waitFor();
      assert.equal(await box.evaluate((e) => e === document.activeElement), true, "the editor takes focus");
      assert.equal(await box.evaluate((e) => getComputedStyle(e).fontSize), "16px", "16px: iOS doesn't zoom");
      const counter = post.locator("[data-caption-count]");
      const n0 = parseInt(await counter.innerText(), 10);
      await page.keyboard.type(" See you");
      assert.equal(parseInt(await counter.innerText(), 10), n0 + 8, "the counter follows the text");
      // the ledger changes while typing (a pause from another device): the editor keeps its text and focus
      await page.evaluate(() => fetch("/api/pause", { method: "POST", headers: { "Content-Type": "application/json", "X-CC-Console": "1" }, body: JSON.stringify({ paused: true }) }));
      await page.waitForTimeout(1500);
      assert.equal(await box.evaluate((e) => e === document.activeElement), true, "still focused after the refresh");
      await page.keyboard.type(" there.");
      assert.match(await box.inputValue(), /See you there\.$/);
      await page.evaluate(() => fetch("/api/pause", { method: "POST", headers: { "Content-Type": "application/json", "X-CC-Console": "1" }, body: JSON.stringify({ paused: false }) }));
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      assert.ok(m.sw <= m.cw, `editor scrolls sideways (${m.sw} > ${m.cw})`);
      await page.screenshot({ path: path.join(SCREENS, `caption-edit-${vp.name}.png`) });
      assert.match(await post.locator("[data-post-approve]").innerText(), /Save or cancel the edit first/);
      assert.equal(await post.locator("[data-post-approve]").isDisabled(), true, "no approving the old caption mid-edit");

      await post.locator("[data-caption-save]").click();
      await post.locator('input[type="radio"][value="E1"]').waitFor({ state: "attached" });
      assert.ok(dialogs.some((d) => /Saved as caption E1\. It is not approved/.test(d)), dialogs.join(" | "));
      assert.match(await post.locator(".option", { hasText: "Caption E1" }).innerText(), /edited wording/);
      assert.equal(await post.locator('input[type="radio"][value="E1"]').isChecked(), true, "the edit is selected");
      await post.locator("[data-post-approve]").click();
      await post.locator(".receipt").waitFor();
      assert.match(await post.locator(".receipt").innerText(), /Approved caption E1/);
      assert.notEqual(await post.evaluate((el) => el.closest("details.cal-day")?.open ?? true), false, "the day being worked on stays open after approving");
      await post.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SCREENS, `caption-edit-${vp.name}-approved.png`) });
    } finally {
      server.kill();
      await browser.close();
    }
  });
}
