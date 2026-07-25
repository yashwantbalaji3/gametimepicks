/**
 * OPS HEARTBEAT STALENESS GUARD (Overnight Sprint 017 · Phase 1).
 *
 * A heartbeat is a dead-man's switch: what matters is the FRESHNESS of the signal, not the last verdict it
 * happened to record. build-admin-status.mjs used to copy `ok`/`status` straight through, so /ops published
 * `ok: true, status: "pass"` from a heartbeat that had not been written for 17 days. A dashboard that
 * asserts health from a signal that stopped is worse than one that shows nothing.
 *
 * These tests run the real generator against fixture heartbeats and pin that it fails CLOSED.
 *
 * Run: npx tsx --test src/lib/ops-heartbeat-staleness.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APP = process.cwd();
const SCRIPT = path.join(APP, "scripts", "build-admin-status.mjs");
const src = fs.readFileSync(SCRIPT, "utf8");

/** Run the real generator with a pinned clock, writing status to a temp file, and return the parsed JSON. */
function buildStatus(nowIso) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gtp-status-")), "status.json");
  execFileSync("npx", ["tsx", SCRIPT, "--now", nowIso, "--out", out], { cwd: APP, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(fs.readFileSync(out, "utf8"));
}

test("the staleness threshold is stated, not implicit", () => {
  assert.match(src, /HEARTBEAT_STALE_AFTER_HOURS\s*=\s*\d+/, "the window is a named constant");
  assert.match(src, /dead-man/i, "the file explains WHY freshness beats the recorded verdict");
});

test("a stopped heartbeat is never reported as healthy, whatever it last recorded", () => {
  const hb = JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "ops", "heartbeat.json"), "utf8"));
  assert.ok(hb.lastRunAt, "fixture heartbeat has a lastRunAt to age off");
  // Ask for status a year after the last heartbeat — unambiguously stale.
  const far = new Date(Date.parse(hb.lastRunAt) + 365 * 86400000).toISOString();
  const s = buildStatus(far);

  assert.equal(s.workflowHealth.ok, false, "ok must be false once the signal has stopped");
  assert.equal(s.workflowHealth.status, "stale");
  assert.ok(s.workflowHealth.ageHours > 24 * 300, "reports the real age of the signal");
  // The last recorded verdict is preserved for context but must NOT be the live one.
  assert.equal(s.workflowHealth.lastKnown.status, hb.status ?? null, "last known verdict kept alongside");
  assert.ok(s.warnings.some((w) => /heartbeat/i.test(w)), "surfaced as a warning, not buried in a nested field");
});

test("a fresh heartbeat still passes through unchanged", () => {
  const hb = JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "ops", "heartbeat.json"), "utf8"));
  // One hour after the heartbeat — well inside the window.
  const soon = new Date(Date.parse(hb.lastRunAt) + 3600000).toISOString();
  const s = buildStatus(soon);

  assert.notEqual(s.workflowHealth.status, "stale", "a recent signal is not called stale");
  assert.equal(s.workflowHealth.ok, hb.ok ?? null, "the real verdict is reported when the signal is live");
  assert.ok(s.workflowHealth.ageHours <= 1.1, "age is computed from the pinned clock");
  assert.ok(!s.warnings.some((w) => /heartbeat/i.test(w)), "no false stale warning");
});

test("money is never touched by building status", () => {
  // build-admin-status.mjs is a read-only reporter; it carries its own money md5 guard.
  assert.match(src, /portfolioMd5|md5/i, "reports/guards the canonical money hash");
  assert.ok(!/writeFileSync\([^)]*portfolio\.json/.test(src), "never writes the canonical portfolio");
});
