/**
 * SPRINT 051 — the adapter must pass values through, and must never invent a healthy state.
 *
 * The two failure modes being pinned:
 *
 *   1. RECOMPUTATION. If the adapter ever derives a rate instead of reading one, the contract stops
 *      being a single source and the pages drift apart again — the exact defect that shipped a stale
 *      51.7% on two pages for weeks.
 *   2. OPTIMISTIC DEFAULTS. A missing or unreadable artifact must surface as UNAVAILABLE. A status
 *      page that shows green when it cannot read its own inputs is worse than one that is down.
 *
 * Run: npx tsx --test src/lib/research/public-contract-adapter.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  STATE_LABEL,
  STATE_MEANING,
  SUPPORTED_SCHEMA_VERSION,
  formatRate,
  loadDailyBrief,
  loadSystemStatus,
  loadTerminal,
} from "./public-contract-adapter.ts";

const APP = process.cwd();
const DIR = path.join(APP, "public/data/research");
const raw = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

// ── values pass through unchanged ──────────────────────────────────────────────

test("the model universe is read, never recomputed", () => {
  const a = raw("terminal-summary.json");
  const v = loadTerminal();
  assert.equal(v.available, true);
  assert.equal(v.modelUniverse.decisiveRows, a.modelUniverse.decisiveRows);
  assert.equal(v.modelUniverse.hitRate, a.modelUniverse.hitRate, "the rate must be identical, not re-derived");
  assert.equal(v.modelUniverse.overconfidencePp, a.modelUniverse.overconfidencePp);
  assert.deepEqual([...v.modelUniverse.dateRange], a.modelUniverse.dateRange);
});

test("every registry market keeps its exact rate, interval and sample", () => {
  const a = raw("terminal-summary.json").registry.markets;
  for (const m of loadTerminal().registry.markets) {
    const src = a[m.market];
    assert.ok(src, `${m.market} is not in the artifact`);
    assert.equal(m.status, src.status);
    assert.equal(m.n, src.n);
    assert.equal(m.hitRate, src.hitRate, `${m.market} rate drifted`);
    assert.equal(m.hitRate95.low, src.hitRate95.low, `${m.market} interval drifted`);
    assert.equal(m.hitRate95.high, src.hitRate95.high);
  }
});

test("calibration figures are read verbatim", () => {
  const e = raw("terminal-summary.json").calibration.evaluation;
  const c = loadTerminal().calibration;
  assert.equal(c.rawBrier, e.rawModelBrier);
  assert.equal(c.calibratedBrier, e.calibratedBrier);
  assert.equal(c.marketBrier, e.marketBrier);
  assert.equal(c.stillBehindMarket, e.stillBehindMarket);
});

test("the adapter contains no rate arithmetic at all", () => {
  // Structural: a reader that starts averaging is no longer a reader.
  const src = fs.readFileSync(path.join(APP, "src/lib/research/public-contract-adapter.ts"), "utf8");
  const body = src.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const forbidden of [/\.reduce\(/, /\/\s*rows\b/, /wins\s*\/\s*/, /\* 100\s*\)\s*\/\s*/]) {
    assert.doesNotMatch(body, forbidden, `the adapter appears to compute a rate: ${forbidden}`);
  }
});

// ── fail-closed ────────────────────────────────────────────────────────────────

test("an unknown schema version is refused rather than guessed at", () => {
  const p = path.join(DIR, "terminal-summary.json");
  const original = fs.readFileSync(p);
  try {
    const bumped = { ...JSON.parse(original.toString()), schemaVersion: SUPPORTED_SCHEMA_VERSION + 99 };
    fs.writeFileSync(p, JSON.stringify(bumped, null, 2));
    const v = loadTerminal();
    assert.equal(v.available, false, "a future artifact must not be rendered");
    assert.match(v.unavailableReason, /schema version/);
    assert.equal(v.systemStatus.overall, "UNAVAILABLE");
  } finally {
    fs.writeFileSync(p, original);
  }
  assert.equal(loadTerminal().available, true, "the artifact must be restored");
});

test("a missing artifact is UNAVAILABLE, never READY", () => {
  const p = path.join(DIR, "system-status.json");
  const original = fs.readFileSync(p);
  try {
    fs.rmSync(p);
    const s = loadSystemStatus();
    assert.equal(s.overall, "UNAVAILABLE");
    assert.equal(s.unreadable, true, "the surface must be able to tell 'cannot read' from 'unhealthy'");
    assert.equal(s.stages.length, 0);
  } finally {
    fs.writeFileSync(p, original);
  }
  assert.equal(loadSystemStatus().unreadable, false, "the artifact must be restored");
});

test("malformed JSON is UNAVAILABLE, not a crash", () => {
  const p = path.join(DIR, "system-status.json");
  const original = fs.readFileSync(p);
  try {
    fs.writeFileSync(p, "{ this is not json");
    const s = loadSystemStatus();
    assert.equal(s.overall, "UNAVAILABLE");
    assert.match(s.overallReason, /could not be parsed/);
  } finally {
    fs.writeFileSync(p, original);
  }
});

test("an unrecognised stage state degrades to UNAVAILABLE rather than rendering unknown", () => {
  const p = path.join(DIR, "system-status.json");
  const original = fs.readFileSync(p);
  try {
    const d = JSON.parse(original.toString());
    d.stages[0].state = "TOTALLY_FINE";
    fs.writeFileSync(p, JSON.stringify(d, null, 2));
    assert.equal(loadSystemStatus().stages[0].state, "UNAVAILABLE");
  } finally {
    fs.writeFileSync(p, original);
  }
});

// ── the quarantine survives every layer ────────────────────────────────────────

test("quarantine survives the adapter, and never gains a record", () => {
  const v = loadTerminal();
  assert.ok(v.quarantines.length > 0, "2026-07-28 must still be represented");
  for (const q of v.quarantines) {
    assert.equal(q.state, "QUARANTINED");
    assert.ok(q.publicExplanation.length > 80);
    for (const forbidden of ["hitRate", "wins", "losses", "decisiveRows"]) {
      assert.ok(!(forbidden in q), `a quarantined date must never carry ${forbidden}`);
    }
  }
});

test("the quarantined overall status is preserved, not softened", () => {
  const s = loadSystemStatus();
  const settlement = s.stages.find((x) => x.stage === "latestSettlement");
  assert.equal(settlement.state, "QUARANTINED");
  assert.notEqual(s.overall, "READY", "one withheld stage must keep the overall out of READY");
});

// ── separation and safety ──────────────────────────────────────────────────────

test("the paper record cannot reach the model view model", () => {
  const v = loadTerminal();
  const serialized = JSON.stringify(v.modelUniverse);
  assert.doesNotMatch(serialized, /19-14/);
  assert.doesNotMatch(serialized, /19065|19,065/);
  assert.match(v.modelUniverse.separationNote, /never combined/i);
});

test("an empty APPROVED set carries its explanation through", () => {
  const r = loadTerminal().registry;
  if (r.counts.APPROVED === 0) {
    assert.equal(r.noneApproved, true);
    assert.ok(r.statusNote.length > 60, "the explanation must survive the adapter");
  }
});

// ── the daily brief ────────────────────────────────────────────────────────────

test("the brief passes through with its denominators and limitations", () => {
  const a = raw("daily-brief.json");
  const b = loadDailyBrief();
  assert.equal(b.available, true);
  assert.equal(b.decisiveRows, a.decisiveRows);
  assert.equal(b.wins, a.wins);
  assert.equal(b.decisiveHitRate, a.decisiveHitRate);
  assert.equal(b.modelBrier, a.scoring.modelBrier);
  assert.equal(b.marketBrier, a.scoring.marketBrier);
  assert.ok(b.whatShouldNotBeConcluded.length >= 3, "the limitations must not be dropped in transit");
});

test("a missing brief is unavailable with zeroed counts, not a fabricated rate", () => {
  const p = path.join(DIR, "daily-brief.json");
  const original = fs.readFileSync(p);
  try {
    fs.rmSync(p);
    const b = loadDailyBrief();
    assert.equal(b.available, false);
    assert.equal(b.decisiveHitRate, null, "an absent rate must be null, never 0");
  } finally {
    fs.writeFileSync(p, original);
  }
});

// ── presentation helpers ───────────────────────────────────────────────────────

test("every state has a label and a plain-language meaning", () => {
  for (const s of ["READY", "DUE", "DELAYED_WITHIN_GRACE", "FAILED", "QUARANTINED", "STALE", "UNAVAILABLE"]) {
    assert.ok(STATE_LABEL[s], `${s} has no label`);
    assert.ok(STATE_MEANING[s]?.length > 15, `${s} has no usable explanation`);
  }
  // The distinction that matters most: late is not failed.
  assert.match(STATE_MEANING.DELAYED_WITHIN_GRACE, /not a failure/i);
  assert.match(STATE_MEANING.UNAVAILABLE, /not as fine/i);
});

test("formatRate never invents a number", () => {
  assert.equal(formatRate(null), "—");
  assert.equal(formatRate(undefined), "—");
  assert.equal(formatRate(0.5016), "50.16%");
  assert.equal(formatRate(0, 1), "0.0%", "zero is a real value and must render as one");
});
