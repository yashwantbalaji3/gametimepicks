/**
 * H0 end to end: the hosted handler (hosted/dev-server.mjs, real @simplewebauthn/server, PGlite, in-process
 * worker) driven in iPhone-sized Chromium with a virtual platform authenticator (user verification on, like
 * Face ID). First passkey with the setup token → recovery codes → recap → Pause (no prompt) → Resume (step-up) →
 * Approve (step-up) → receipt → sign out → sign in with the passkey. The page must load with zero CSP violations.
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
const SETUP = "e2e-setup-token-0123456789";

function startServer(port) {
  const child = spawn(process.execPath, [path.join(CC_ROOT, "hosted/dev-server.mjs")], {
    env: { ...process.env, GTP_CC_HOSTED_PORT: String(port), GTP_CC_OUT_DIR: tempDir("gtp-cc-hosted-e2e-"), GTP_CC_SETUP_TOKEN: SETUP, GTP_CC_SLATE_DATE: TEST_SLATE },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", (d) => { if (String(d).includes("http://localhost")) resolve(child); });
    child.on("exit", (code) => reject(new Error(`dev server exited ${code}: ${err}`)));
  });
}

test("hosted mode on iPhone 390: passkey setup, step-up approvals, Pause without a prompt, sign out and in", async () => {
  const port = 4600 + Math.floor(Math.random() * 300);
  const browser = await chromium.launch();
  const server = await startServer(port).catch(async (err) => { await browser.close(); throw err; });
  fs.mkdirSync(SCREENS, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const problems = [];
    page.on("console", (m) => { if (m.type() === "error" && !/401/.test(m.text())) problems.push(m.text()); });
    page.on("pageerror", (e) => problems.push(String(e)));
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    const assertions = async () => (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials[0]?.signCount ?? 0;

    await page.goto(`http://localhost:${port}/`);
    await page.locator("#auth-setup").waitFor();
    assert.equal(await page.locator(".layout").isVisible(), false, "nothing of the console shows before sign-in");
    await page.screenshot({ path: path.join(SCREENS, "hosted-390-setup.png") });

    // wrong setup token is refused
    await page.locator("#setup-token").fill("wrong");
    await page.locator("[data-register]").tap();
    await page.locator("#auth-msg", { hasText: "setup token is not right" }).waitFor();

    await page.locator("#setup-token").fill(SETUP);
    await page.locator("[data-register]").tap();
    await page.locator("#auth-codes").waitFor();
    const codes = (await page.locator("#recovery-codes").innerText()).trim().split("\n");
    assert.equal(codes.length, 10);
    await page.locator("[data-codes-saved]").tap();
    await page.locator(".tabbar").waitFor();
    const cookies = await context.cookies();
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].httpOnly, true);
    assert.equal(cookies[0].sameSite, "Strict");

    // the team works through the in-process worker
    await page.locator("#input").fill(RECAP_COMMAND);
    await page.locator("#composer button[type=submit]").tap();
    await page.locator(".msg.report").waitFor({ timeout: 90_000 });
    await page.locator(".msg .deliverable img").first().waitFor();
    assert.ok(await page.locator(".msg .deliverable img").first().evaluate((img) => img.complete && img.naturalWidth === 1080), "the graphic is served through the authenticated media route");

    // Pause: no passkey prompt
    const before = await assertions();
    await page.locator("#pause-top").tap();
    await page.locator("#pause-top.paused").waitFor();
    assert.equal(await assertions(), before, "Pause needed no assertion");
    // Resume: a step-up assertion
    await page.locator("#pause-top").tap();
    await page.locator("#pause-top.live").waitFor();
    assert.equal(await assertions(), before + 1, "Resume needed exactly one assertion");

    await page.locator(".msg.report [data-goto=decisions]").last().tap();
    await page.locator("#decisions [data-approve]").tap();
    await page.locator("#decisions .receipt").waitFor({ timeout: 30_000 });
    assert.match(await page.locator("#decisions .receipt").innerText(), /PUBLISHED_MOCK/);
    assert.equal(await assertions(), before + 2, "Approve needed exactly one assertion");
    await page.screenshot({ path: path.join(SCREENS, "hosted-390-receipt.png") });

    // Activity shows the audit trail without secrets
    await page.locator('.tab[data-tab="history"]').tap();
    const hist = await page.locator("#history").innerText();
    assert.match(hist, /Auth: passkey-registered/);
    assert.match(hist, /Auth: stepup \(approve\)/);
    for (const c of codes) assert.ok(!hist.includes(c));

    // sign out, then back in with the passkey
    await page.locator('.tab[data-tab="team"]').tap();
    await page.locator("[data-logout]").tap();
    await page.locator("#auth-login").waitFor();
    assert.equal(await page.evaluate(async () => (await fetch("/api/state")).status), 401);
    await page.locator("[data-login]").tap();
    await page.locator(".tabbar").waitFor();
    await page.locator('.tab[data-tab="decisions"]').tap();
    await page.locator("#decisions .receipt").waitFor();

    const sw = await page.evaluate(async () => Boolean(await navigator.serviceWorker?.getRegistration()));
    assert.equal(sw, true, "installable: service worker registered");
    assert.deepEqual(problems, [], `console errors / CSP violations:\n${problems.join("\n")}`);
  } finally {
    server.kill();
    await browser.close();
  }
});
