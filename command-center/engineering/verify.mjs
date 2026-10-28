/**
 * INDEPENDENT VERIFICATION — the orchestrator checks Claude's work itself; Claude's own claims are not evidence.
 *
 *   tests        `node --test command-center/tests/*.test.mjs` inside the working copy, with the no-network
 *                guard loaded from the ORCHESTRATOR's checkout (the working copy's tests/ is editable by Claude,
 *                so its guard can't be trusted to guard itself);
 *   screenshots  the working copy's console, started on a spare loopback port with a temp ledger and the pinned
 *                test slate, driven through the recap command to its Approvals card, captured at desktop
 *                1440×900 and iPhone 390×844 / 430×932. Every non-loopback request is aborted.
 *
 * Both run code that Claude may have written, so they are bounded: a timeout, a scrubbed environment, loopback only.
 * On the hosted runner (`sandbox`) that code also runs as a separate Linux user with no sudo and an empty
 * environment — the worker's process environment (database URL, OAuth token) is unreadable to it — and the test
 * suite runs in its own network namespace with no network at all.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { CC_ROOT, REPO_ROOT, sha256 } from "../lib/util.mjs";

const GUARD = path.join(CC_ROOT, "tests/no-network-preload.mjs");
const TEST_SLATE = "2026-10-25";
const RECAP = "Team, prepare GameTimePicks' NFL postgame recap content for last night's games. Identify content opportunities, draft graphics and captions, and report what needs my approval.";

const testEnv = () => ({
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: os.tmpdir(), LANG: process.env.LANG ?? "en_US.UTF-8",
  ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH } : {}),
});

/**
 * The command line that runs `cmd args` for Claude-written code: unchanged locally; on the hosted runner, as
 * `sandbox.user` via sudo with `env -i` (only `env`), a hard timeout, and optionally no network namespace access.
 * @param {{ user: string, home: string }|null} sandbox
 */
export function sandboxedCommand(cmd, args, env, { sandbox = null, network = true, timeoutSec = 600 } = {}) {
  if (!sandbox) return { cmd, args, env };
  const vars = Object.entries({ ...env, HOME: sandbox.home, TMPDIR: sandbox.home }).map(([k, v]) => `${k}=${v}`);
  const asUser = ["-n", "-u", sandbox.user, "--", "env", "-i", ...vars, "timeout", "--kill-after=10", String(timeoutSec), cmd, ...args];
  if (network) return { cmd: "sudo", args: asUser, env: { PATH: process.env.PATH } };
  // A fresh network namespace has loopback down; bring it up (as root, inside the namespace) so tests can bind
  // 127.0.0.1, then drop to the sandbox user. Nothing else exists in that namespace.
  return { cmd: "sudo", args: ["-n", "unshare", "--net", "--", "sh", "-c", 'ip link set lo up && exec "$@"', "sh", "sudo", ...asUser], env: { PATH: process.env.PATH } };
}

/**
 * Kill everything the sandbox user is running. The runner user can't signal another user's processes and a
 * `setsid` daemon escapes `timeout`, so after every sandboxed step (and before the change set is re-read) the
 * whole user is reaped through sudo.
 */
export function reapSandbox(sandbox) {
  if (sandbox) spawnSync("sudo", ["-n", "pkill", "-KILL", "-u", sandbox.user]);
}

/** The sandbox user must be able to read and write the working copy (tests write their own scratch dirs). */
function openForSandbox(dir, sandbox) {
  if (sandbox) spawnSync("chmod", ["-R", "a+rwX", dir]);
}

/** Kill a detached child and everything it started (servers, browsers), so nothing outlives a timeout. */
const killGroup = (child, signal = "SIGKILL") => {
  try { process.kill(-child.pid, signal); } catch { /* already gone */ }
};

/** Run the working copy's test suite. Returns { ok, exitCode, pass, fail, durationMs, tail, timedOut }. */
export function runTests(wcDir, { timeoutMs = 6 * 60_000, sandbox = null } = {}) {
  const testsDir = path.join(wcDir, "command-center/tests");
  const files = fs.existsSync(testsDir) ? fs.readdirSync(testsDir).filter((f) => f.endsWith(".test.mjs")).sort().map((f) => path.join("command-center/tests", f)) : [];
  const started = Date.now();
  return new Promise((resolve) => {
    if (!files.length) return resolve({ ok: false, exitCode: null, pass: 0, fail: 0, durationMs: 0, tail: "no test files", timedOut: false, files: [] });
    openForSandbox(wcDir, sandbox);
    const c = sandboxedCommand(process.execPath, ["--import", GUARD, "--test", ...files], testEnv(), { sandbox, network: false, timeoutSec: Math.ceil(timeoutMs / 1000) });
    const child = spawn(c.cmd, c.args, { cwd: wcDir, env: c.env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let out = "";
    child.stdout.on("data", (d) => (out = (out + d).slice(-200_000)));
    child.stderr.on("data", (d) => (out = (out + d).slice(-200_000)));
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killGroup(child); }, timeoutMs);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      killGroup(child); // anything the tests left behind
      reapSandbox(sandbox);

      const num = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, "m")) ?? [])[1] ?? 0);
      const failing = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
      resolve({
        ok: exitCode === 0 && !timedOut,
        exitCode, pass: num("pass"), fail: num("fail"), durationMs: Date.now() - started, timedOut,
        failing, files: files.map((f) => path.basename(f)),
        tail: out.split("\n").filter((l) => /^(ok|not ok|# (tests|pass|fail))/.test(l)).slice(-40).join("\n"),
      });
    });
  });
}

function startConsole(wcDir, port, sandbox) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-cc-verify-"));
  openForSandbox(wcDir, sandbox);
  openForSandbox(out, sandbox);
  // The browser stays outside the sandbox and must reach this server, so the server keeps loopback networking.
  const c = sandboxedCommand(process.execPath, [path.join(wcDir, "command-center/surfaces/console/server.mjs")],
    { ...testEnv(), GTP_CC_PORT: String(port), GTP_CC_OUT_DIR: out, GTP_CC_STEP_DELAY_MS: "0", GTP_CC_SLATE_DATE: TEST_SLATE }, { sandbox, timeoutSec: 300 });
  const child = spawn(c.cmd, c.args, { env: c.env, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    let err = "";
    const t = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("console did not start in 20 s")); }, 20_000);
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", (d) => { if (String(d).includes("http://127.0.0.1")) { clearTimeout(t); resolve(child); } });
    child.on("exit", (code) => { clearTimeout(t); reject(new Error(`console exited ${code}: ${err.slice(-500)}`)); });
  });
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "iphone-390", width: 390, height: 844, mobile: true },
  { name: "iphone-430", width: 430, height: 932, mobile: true },
];

/**
 * Screenshot the working copy's console Approvals card. Returns [{ name, file, sha256, overflow }].
 * @param {string} wcDir
 * @param {{ outDir: string, prefix: string }} o
 */
export async function captureScreens(wcDir, { outDir, prefix, sandbox = null }) {
  const { chromium } = createRequire(path.join(REPO_ROOT, "app/package.json"))("@playwright/test");
  const port = 4600 + Math.floor(Math.random() * 300);
  const server = await startConsole(wcDir, port, sandbox);
  const browser = await chromium.launch({ args: ["--disable-background-networking"] });
  const shots = [];
  try {
    fs.mkdirSync(outDir, { recursive: true });
    for (const [i, vp] of VIEWPORTS.entries()) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 3 : 1, isMobile: vp.mobile, hasTouch: vp.mobile });
      await page.route("**/*", (route) => (new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort()));
      await page.goto(`http://127.0.0.1:${port}/`);
      if (i === 0) {
        await page.locator("#input").fill(RECAP);
        await page.locator("#composer button[type=submit]").click();
      }
      await page.locator(".msg.report").first().waitFor({ timeout: 60_000 });
      if (vp.mobile) await page.locator('.tab[data-tab="decisions"]').click();
      const option = page.locator("#decisions .option").first();
      await option.waitFor({ timeout: 30_000 });
      // Bring the first caption option to the top so the pinned phone action bar never covers it.
      await option.evaluate((el) => el.scrollIntoView({ block: "start" }));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const file = path.join(outDir, `${prefix}-${vp.name}.png`);
      await page.screenshot({ path: file });
      shots.push({ name: vp.name, file: path.basename(file), sha256: sha256(fs.readFileSync(file)), overflow, width: vp.width, height: vp.height });
      await page.close();
    }
  } finally {
    await browser.close();
    server.kill();
    reapSandbox(sandbox);
  }
  return shots;
}
