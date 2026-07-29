/**
 * SPRINT 048 — publishing eligibility must inform, not curate.
 *
 * The failure this guards against is subtle and self-reinforcing: if a gate HIDES weak markets, the
 * remaining measured record improves without the model improving, and the platform slowly curates
 * itself into a flattering subset of its own history. So the central assertion here is that the worst
 * market in the corpus (`batter_total_bases`, 43.76% on 4,120 rows) is still SHOWN — with its record
 * attached.
 *
 * Run: npx tsx --test src/lib/mlb/calibration/publishing-eligibility.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildProbabilityLayers } from "./probability-layers.ts";
import { decideEligibility, shouldShowProbability } from "./publishing-eligibility.ts";

const PLATT = { a: 0.5710847015699214, b: -0.22247426879950416, trainRows: 14938 };
const PROVENANCE = {
  method: "platt", trainedThrough: "2026-06-24", trainRows: 14938,
  measuredBrierImprovement: 0.0104, stillBehindMarket: true,
};

const layers = (over = {}) => buildProbabilityLayers({
  rawProbability: 0.65, side: "over", impliedOver: 0.55, impliedUnder: 0.52,
  calibrator: PLATT, provenance: PROVENANCE, ...over,
});

const evidence = (over = {}) => ({
  market: "batter_hits", status: "APPROVED", n: 9005, hitRate: 0.5381,
  hitRate95: { low: 0.5278, high: 0.5484 }, beatsMarketBrier: true, overconfidencePp: 6.7, ...over,
});

// ── the central property ───────────────────────────────────────────────────────

test("the WORST market is still shown, with its record — never hidden", () => {
  // The real batter_total_bases numbers.
  const d = decideEligibility({
    layers: layers(),
    evidence: evidence({
      market: "batter_total_bases", status: "DISABLED", n: 4120, hitRate: 0.4376,
      hitRate95: { low: 0.4225, high: 0.4528 }, beatsMarketBrier: false, overconfidencePp: 11.6,
    }),
    provenanceComplete: true,
  });
  assert.equal(d.treatment, "SHOW_WITH_WARNING", "a disabled market must be shown, not suppressed");
  assert.ok(shouldShowProbability(d), "and its probability is still shown, in context");
  assert.match(d.disclosure, /43\.8%/, "the disclosure must carry the actual measured rate");
  assert.match(d.disclosure, /4,120/, "and the sample size");
  assert.match(d.disclosure, /below break-even/);
});

test("no status causes a prediction to disappear entirely", () => {
  for (const status of ["APPROVED", "MONITOR", "RECALIBRATE", "DISABLED"]) {
    const d = decideEligibility({ layers: layers(), evidence: evidence({ status }), provenanceComplete: true });
    assert.ok(
      ["SHOW", "SHOW_WITH_WARNING", "SHOW_WITHOUT_PROBABILITY"].includes(d.treatment),
      `${status} produced ${d.treatment} — every treatment must still show the prediction`,
    );
  }
});

// ── the one thing genuinely withheld ───────────────────────────────────────────

test("a probability is withheld when provenance cannot be proven", () => {
  const d = decideEligibility({ layers: layers(), evidence: evidence(), provenanceComplete: false });
  assert.equal(d.treatment, "SHOW_WITHOUT_PROBABILITY");
  assert.equal(shouldShowProbability(d), false);
  assert.match(d.disclosure, /can't prove when/i);
});

test("provenance outranks a good market record", () => {
  // An APPROVED market with unprovable timing must still withhold the number.
  const d = decideEligibility({
    layers: layers(), evidence: evidence({ status: "APPROVED" }), provenanceComplete: false,
  });
  assert.equal(d.treatment, "SHOW_WITHOUT_PROBABILITY");
});

test("a probability is withheld on a sample too small to support any statement", () => {
  const d = decideEligibility({
    layers: layers(), evidence: evidence({ status: "MONITOR", n: 12 }), provenanceComplete: true,
  });
  assert.equal(d.treatment, "SHOW_WITHOUT_PROBABILITY");
  assert.match(d.disclosure, /12 results/, "must name the actual sample");
  assert.match(d.disclosure, /not enough/i);
});

// ── the wording ────────────────────────────────────────────────────────────────

test("a RECALIBRATE market states the limitation even when calibrated", () => {
  const d = decideEligibility({ layers: layers(), evidence: evidence({ status: "RECALIBRATE" }), provenanceComplete: true });
  assert.equal(d.treatment, "SHOW_WITH_WARNING");
  assert.match(d.disclosure, /doesn't score better than the sportsbook/i);
  assert.ok(d.probabilityIsCalibrated, "these layers are calibrated");
});

test("an uncalibrated RECALIBRATE market warns about the inflation instead", () => {
  const uncal = buildProbabilityLayers({
    rawProbability: 0.65, side: "over", impliedOver: 0.55, impliedUnder: 0.52,
    calibrator: null, provenance: { ...PROVENANCE, method: "none" },
  });
  const d = decideEligibility({ layers: uncal, evidence: evidence({ status: "RECALIBRATE" }), provenanceComplete: true });
  assert.match(d.disclosure, /aren't calibrated yet/i);
  assert.equal(d.probabilityIsCalibrated, false);
});

test("every decision carries at least one machine-readable reason", () => {
  for (const status of ["APPROVED", "MONITOR", "RECALIBRATE", "DISABLED"]) {
    for (const prov of [true, false]) {
      const d = decideEligibility({ layers: layers(), evidence: evidence({ status }), provenanceComplete: prov });
      assert.ok(d.reasons.length > 0, `${status}/${prov} produced no reasons`);
      assert.ok(d.disclosure.length > 30, `${status}/${prov} disclosure is too thin to be useful`);
    }
  }
});

test("no disclosure contains promotional or market-beating language", () => {
  const BANNED = [/\bedge\b/i, /\block\b/i, /\bguarantee/i, /\bbeat(s|ing)? the (market|sportsbook)\b/i, /\bbest bet\b/i, /\bprofitab/i];
  for (const status of ["APPROVED", "MONITOR", "RECALIBRATE", "DISABLED"]) {
    for (const prov of [true, false]) {
      const d = decideEligibility({ layers: layers(), evidence: evidence({ status }), provenanceComplete: prov });
      for (const re of BANNED) {
        assert.doesNotMatch(d.disclosure, re, `${status}: banned phrasing in "${d.disclosure}"`);
      }
    }
  }
});

test("the source file itself carries no market-beating language", () => {
  const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "publishing-eligibility.ts"), "utf8");
  for (const re of [/\bbeat(s|ing)? the (market|sportsbook)\b/i, /\bguarantee(d|s)?\b/i, /\bprofitab(le|ility)\b/i]) {
    assert.doesNotMatch(src, re, `banned phrasing in publishing-eligibility.ts`);
  }
});
