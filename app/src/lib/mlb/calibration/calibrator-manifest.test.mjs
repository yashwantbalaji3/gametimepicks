/**
 * SPRINT 049 — the calibrator must refuse to apply itself where it does not belong.
 *
 * Every case below fails SILENTLY without an explicit check: a calibrator fitted on one model version
 * applied to another, or on four prop families applied to a fifth, still returns a number between 0
 * and 1. It just isn't a valid one. That is the shape of every defect this repository has spent six
 * sprints removing, so compatibility is asserted rather than assumed — and the real manifest on disk is
 * checked too, not only fixtures.
 *
 * Run: npx tsx --test src/lib/mlb/calibration/calibrator-manifest.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  MAX_CALIBRATOR_AGE_DAYS,
  checkCompatibility,
  manifestInterpretation,
} from "./calibrator-manifest.ts";

const MANIFEST_PATH = path.resolve(process.cwd(), "../data/internal/mlb/model-learning/calibrator-manifest.json");

const base = () => ({
  calibratorVersion: "platt-1",
  method: "platt",
  modelSchemaVersion: "mlb-board-lean-1",
  marketFamilies: ["pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis"],
  parameters: { a: 0.5710847015699214, b: -0.22247426879950416, trainRows: 14938 },
  fitWindow: { from: "2026-05-16", to: "2026-06-24", rows: 14938 },
  heldOutWindow: { from: "2026-07-01", to: "2026-07-27", rows: 6695 },
  heldOutEvaluation: {
    rawModelBrier: 0.2559, calibratedBrier: 0.2455, marketBrier: 0.2413,
    brierImprovementVsRaw: 0.0104, brierGapToMarket: 0.0042,
    stillBehindMarket: true, observedRate: 0.4984,
  },
  corpusFingerprint: "3f60fbe593c46368",
  corpusRows: 21633,
  generatedForSettledDate: "2026-07-27",
});

const ask = (over = {}) => checkCompatibility({
  manifest: base(),
  marketFamily: "batter_hits",
  modelSchemaVersion: "mlb-board-lean-1",
  asOfSettledDate: "2026-07-27",
  ...over,
});

// ── the happy path ─────────────────────────────────────────────────────────────

test("a matching calibrator is compatible, and says why", () => {
  const v = ask();
  assert.equal(v.compatible, true);
  assert.equal(v.code, "OK");
  assert.match(v.reason, /14,938/, "the reason must carry the training sample");
});

test("every fitted market family is accepted", () => {
  for (const m of base().marketFamilies) {
    assert.equal(ask({ marketFamily: m }).compatible, true, `${m} should be compatible`);
  }
});

// ── the refusals ───────────────────────────────────────────────────────────────

test("a missing manifest is refused, not defaulted", () => {
  for (const m of [null, undefined]) {
    const v = ask({ manifest: m });
    assert.equal(v.compatible, false);
    assert.equal(v.code, "MISSING_MANIFEST");
  }
});

test("a different model schema is refused", () => {
  const v = ask({ modelSchemaVersion: "mlb-board-lean-2" });
  assert.equal(v.code, "SCHEMA_MISMATCH");
  assert.match(v.reason, /may not mean the same thing/);
});

test("a market family the calibrator never saw is refused", () => {
  const v = ask({ marketFamily: "batter_home_runs" });
  assert.equal(v.code, "MARKET_NOT_IN_FIT");
  assert.match(v.reason, /batter_home_runs/);
});

test("a calibrator older than the limit is refused", () => {
  const tooOld = new Date(Date.UTC(2026, 6, 27) + (MAX_CALIBRATOR_AGE_DAYS + 1) * 86400000)
    .toISOString().slice(0, 10);
  const v = ask({ asOfSettledDate: tooOld });
  assert.equal(v.code, "STALE");
  assert.match(v.reason, new RegExp(String(MAX_CALIBRATOR_AGE_DAYS)));
});

test("a calibrator exactly at the limit is still accepted", () => {
  // Pins the boundary so a future edit cannot quietly loosen or tighten it by one day.
  const atLimit = new Date(Date.UTC(2026, 6, 27) + MAX_CALIBRATOR_AGE_DAYS * 86400000)
    .toISOString().slice(0, 10);
  assert.equal(ask({ asOfSettledDate: atLimit }).compatible, true);
});

test("an unparseable date is refused — an unknown age is not a young age", () => {
  const v = ask({ asOfSettledDate: "yesterday" });
  assert.equal(v.compatible, false);
  assert.equal(v.code, "STALE");
  assert.match(v.reason, /unknown age is not a young age/);
});

test("malformed parameters are refused before anything else is checked", () => {
  for (const params of [null, { a: NaN, b: 0, trainRows: 10 }, { a: 1, b: Infinity, trainRows: 10 }, { a: 1, b: 0, trainRows: 0 }]) {
    const v = checkCompatibility({
      manifest: { ...base(), parameters: params },
      marketFamily: "batter_hits", modelSchemaVersion: "mlb-board-lean-1", asOfSettledDate: "2026-07-27",
    });
    assert.equal(v.code, "MALFORMED_PARAMETERS", `params ${JSON.stringify(params)} should be refused`);
  }
});

test("every refusal carries an actionable reason", () => {
  const cases = [
    ask({ manifest: null }), ask({ modelSchemaVersion: "other" }),
    ask({ marketFamily: "nope" }), ask({ asOfSettledDate: "2030-01-01" }),
  ];
  for (const v of cases) {
    assert.equal(v.compatible, false);
    assert.ok(v.reason.length > 25, `unhelpful reason: "${v.reason}"`);
  }
});

// ── the public interpretation ──────────────────────────────────────────────────

test("the interpretation is derived from the manifest's own measured numbers", () => {
  const text = manifestInterpretation(base());
  assert.match(text, /0\.2559/, "must quote the raw Brier it actually measured");
  assert.match(text, /0\.2455/, "and the calibrated one");
  assert.match(text, /6,695/, "and the held-out sample size");
  assert.match(text, /do not out-predict the sportsbook/);
});

test("the interpretation drops the market caveat only when the measurement supports it", () => {
  const ahead = manifestInterpretation({
    ...base(),
    heldOutEvaluation: { ...base().heldOutEvaluation, stillBehindMarket: false },
  });
  assert.doesNotMatch(ahead, /do not out-predict/);
  assert.doesNotMatch(ahead, /\bbeat/i, "absence of the caveat must not become a claim");
});

test("the interpretation is honest when calibration did not help", () => {
  const worse = manifestInterpretation({
    ...base(),
    heldOutEvaluation: { ...base().heldOutEvaluation, brierImprovementVsRaw: -0.002 },
  });
  assert.match(worse, /did not improve/);
});

// ── the real artifact on disk ──────────────────────────────────────────────────

test("the committed manifest is well-formed and currently compatible", () => {
  assert.ok(fs.existsSync(MANIFEST_PATH), `no manifest at ${MANIFEST_PATH}`);
  const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

  for (const k of ["calibratorVersion", "modelSchemaVersion", "marketFamilies", "parameters", "corpusFingerprint", "generatedForSettledDate"]) {
    assert.ok(m[k] != null, `manifest is missing ${k}`);
  }
  assert.ok(Number.isFinite(m.parameters.a) && Number.isFinite(m.parameters.b));
  assert.ok(m.fitWindow.to < m.heldOutWindow.from, "the fit window must end before the held-out window begins");

  const v = checkCompatibility({
    manifest: m, marketFamily: "batter_hits",
    modelSchemaVersion: m.modelSchemaVersion, asOfSettledDate: m.generatedForSettledDate,
  });
  assert.equal(v.compatible, true, `the committed manifest is not usable: ${v.reason}`);
});

test("the committed manifest records that calibration does not reach the market", () => {
  // If this ever flips, it is a finding that needs its own evidence — not a caption change.
  const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  assert.equal(typeof m.heldOutEvaluation.stillBehindMarket, "boolean");
  assert.ok(m.heldOutEvaluation.calibratedBrier > 0 && m.heldOutEvaluation.marketBrier > 0);
  assert.equal(
    m.heldOutEvaluation.stillBehindMarket,
    m.heldOutEvaluation.calibratedBrier > m.heldOutEvaluation.marketBrier,
    "the stillBehindMarket flag must agree with the Brier scores it summarises",
  );
});
