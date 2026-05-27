/**
 * Tests for the daily-audit JSON loader.
 *
 * Run: npx tsx --test app/src/lib/data-daily-audit.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  listDailyAuditDates,
  getDailyAudit,
  getLatestDailyAudit,
  getDailyAuditPolicy,
} from "./data-daily-audit.ts";

const FIXTURE_DIR = path.join(
  process.cwd(),
  "public",
  "data",
  "audit",
  "daily",
);

test("listDailyAuditDates returns sorted YYYY-MM-DD strings", () => {
  const dates = listDailyAuditDates();
  // The 5/25 audit committed in this PR should always be present.
  assert.ok(Array.isArray(dates));
  assert.ok(dates.includes("2026-05-25"),
    `expected 2026-05-25 in dates, got ${dates.join(",")}`);
  // Strict ascending order.
  for (let i = 0; i < dates.length - 1; i++) {
    assert.ok(dates[i] < dates[i + 1],
      `dates must be ascending; ${dates[i]} should sort before ${dates[i + 1]}`);
  }
});

test("getDailyAudit reads the 5/25 audit cleanly", () => {
  const audit = getDailyAudit("2026-05-25");
  assert.ok(audit, "5/25 audit must be loadable");
  assert.equal(audit.date, "2026-05-25");
  // Numeric subset — full numbers verified in pipeline tests; here
  // we just confirm the loader didn't drop required fields.
  assert.equal(typeof audit.summary.wins, "number");
  assert.equal(typeof audit.summary.losses, "number");
  assert.equal(typeof audit.summary.hitRate, "number");
  assert.equal(typeof audit.summary.totalSlips, "number");
  assert.ok(Array.isArray(audit.recommendations));
  assert.ok(Array.isArray(audit.warnings));
});

test("getDailyAudit returns null for missing date", () => {
  assert.equal(getDailyAudit("1999-01-01"), null);
});

test("getLatestDailyAudit returns the newest dated file", () => {
  const latest = getLatestDailyAudit();
  const all = listDailyAuditDates();
  assert.ok(latest);
  assert.equal(latest.date, all[all.length - 1]);
});

test("loader is defensive against malformed JSON / missing fields", () => {
  // Write a malformed audit file into a tmp dir and point the loader
  // at it via a temporarily-overridden cwd-relative path. The loader
  // resolves AUDIT_DIR from `process.cwd()`, so we test by spoofing
  // a date that doesn't exist (already covered) + we cover the parse
  // path by writing a real-but-corrupt file in the real dir then
  // cleaning up.
  const corrupt = path.join(FIXTURE_DIR, "2099-12-31.json");
  fs.writeFileSync(corrupt, "{ this is not valid json ");
  try {
    assert.equal(getDailyAudit("2099-12-31"), null,
      "malformed JSON must return null, not throw");
  } finally {
    fs.unlinkSync(corrupt);
  }
});

// ---------------------------------------------------------------------------
// PR #118 — getDailyAuditPolicy
// ---------------------------------------------------------------------------

const POLICY_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "audit",
  "policy.json",
);

test("getDailyAuditPolicy returns a sane summary for current policy.json", () => {
  // PR #118 writes the policy on every settle. If the file doesn't
  // exist locally yet, skip — the contract just says the loader must
  // not crash.
  if (!fs.existsSync(POLICY_PATH)) {
    const out = getDailyAuditPolicy();
    assert.equal(out, null,
      "loader must return null when policy.json absent — never invented");
    return;
  }
  const out = getDailyAuditPolicy();
  assert.ok(out, "loader must return a summary when policy.json exists");
  assert.equal(typeof out.daysAvailable, "number");
  assert.equal(typeof out.daysRequired, "number");
  assert.equal(typeof out.confirmed, "boolean");
  assert.ok(Array.isArray(out.confirmedSignalNames));
  // With ≤ 2 audit days, top-level confirmed MUST be false. We don't
  // hard-code 1 here because tonight's cron may have added a second.
  if (out.daysAvailable < out.daysRequired) {
    assert.equal(out.confirmed, false,
      "top-level confirmed must be false below threshold");
  }
});

test("getDailyAuditPolicy is defensive against malformed JSON", () => {
  // Back up real file if present.
  const backup = fs.existsSync(POLICY_PATH)
    ? fs.readFileSync(POLICY_PATH, "utf8")
    : null;
  try {
    fs.writeFileSync(POLICY_PATH, "{ this isn't json");
    assert.equal(getDailyAuditPolicy(), null,
      "malformed policy.json must return null, not throw");
  } finally {
    if (backup !== null) {
      fs.writeFileSync(POLICY_PATH, backup);
    } else {
      fs.unlinkSync(POLICY_PATH);
    }
  }
});

test("recommendation entries are filtered of garbage", () => {
  // Write an audit with one valid + one malformed recommendation;
  // loader should keep only the valid one.
  const target = path.join(FIXTURE_DIR, "2099-11-30.json");
  fs.writeFileSync(target, JSON.stringify({
    date: "2099-11-30",
    generatedAt: "2099-11-30T00:00:00Z",
    summary: {
      wins: 0, losses: 0, pushes: 0, pending: 0,
      decisive: 0, hitRate: 0, totalSlips: 0,
    },
    recommendations: [
      { id: "ok_one", severity: "warn", message: "ok" },
      null,
      "garbage",
      { severity: "warn", message: "no id" },
    ],
    warnings: ["legit warning", 42, null],
  }));
  try {
    const out = getDailyAudit("2099-11-30");
    assert.ok(out);
    assert.equal(out.recommendations.length, 1);
    assert.equal(out.recommendations[0].id, "ok_one");
    // Non-string warnings filtered out.
    assert.deepEqual(out.warnings, ["legit warning"]);
  } finally {
    fs.unlinkSync(target);
  }
});
