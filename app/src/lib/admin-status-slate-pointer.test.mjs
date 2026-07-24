/**
 * ADMIN STATUS SLATE-POINTER GUARD (Sprint 007 — July-24 incident class).
 *
 * On July 24 the internal /ops admin status showed `slate.date = 2026-07-21` while the real MLB board had
 * already advanced to 2026-07-24, because the slate pointer was derived from the (money-state) daily-portfolio
 * date, which legitimately lags when no card is placed. The public product was correct (currentSlateDate=07-24);
 * only the admin pointer lagged. This guard pins the invariant so that class of silent lag cannot recur:
 *
 *   the admin status slate pointer ALWAYS equals the newest generated slate board (never the daily-portfolio
 *   date), and is never ahead of the current ET date.
 *
 * It runs the real builder (via `node`, no TS deps) against the committed artifacts, writing to a throwaway
 * --out file so the committed public/data/admin/status.json is never mutated by the test. Money is asserted
 * untouched.
 *
 * Run: npx tsx --test scripts/admin-status-slate-pointer.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const app = process.cwd();
const script = path.join(app, "scripts", "build-admin-status.mjs");
const portfolioPath = path.join(app, "public", "data", "mr-dub", "portfolio.json");
const etDate = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** Run the real builder with a fixed clock into a throwaway file; return the parsed status. */
function buildStatusAt(nowIso) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-admin-status-"));
  const out = path.join(dir, "status.json");
  execFileSync("node", [script, "--now", nowIso, "--out", out], { cwd: app, stdio: "pipe" });
  const status = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(dir, { recursive: true, force: true });
  return status;
}

test("the slate pointer equals the newest MLB board and never lags at the daily-portfolio date", () => {
  const now = "2026-07-24T20:00:00Z";
  const s = buildStatusAt(now);
  assert.ok(typeof s.slate.date === "string" && /^2\d{3}-\d{2}-\d{2}$/.test(s.slate.date), "slate.date is a real ISO date");

  // The exact July-24 incident: when the newest MLB board is newer than the daily-portfolio date, the slate
  // pointer MUST follow the board — not the lagging money-state date.
  if (s.slate.mlbSlate && s.slate.mlbSlate <= etDate(now)) {
    assert.equal(s.slate.date, s.slate.mlbSlate, "slate.date must equal the newest (non-future) MLB board");
  }
  if (s.slate.dailyPortfolioDate && s.slate.mlbSlate && s.slate.dailyPortfolioDate < s.slate.mlbSlate) {
    assert.notEqual(s.slate.date, s.slate.dailyPortfolioDate, "slate.date must NOT fall back to the lagging daily-portfolio date");
    assert.ok(s.slate.date > s.slate.dailyPortfolioDate, "slate.date advances past the lagging daily-portfolio date");
  }
});

test("the slate pointer is never ahead of the current ET date (a future board can't jump it forward)", () => {
  const now = "2026-07-24T20:00:00Z";
  const s = buildStatusAt(now);
  assert.ok(s.slate.date <= etDate(now), `slate.date ${s.slate.date} must be <= ET today ${etDate(now)}`);
});

test("building the admin status never mutates canonical money (portfolio md5 pinned)", () => {
  const before = crypto.createHash("md5").update(fs.readFileSync(portfolioPath)).digest("hex");
  buildStatusAt("2026-07-24T20:00:00Z");
  const after = crypto.createHash("md5").update(fs.readFileSync(portfolioPath)).digest("hex");
  assert.equal(after, before, "portfolio.json md5 unchanged by the status build");
  assert.equal(after, "affe6b21071f2b3be96bb2774eb347c3", "money stays canonical 19-14");
});
