/**
 * MLB RECALIBRATION HONESTY GUARDS (2026-07-21).
 *
 * A leakage-safe, out-of-sample recalibration of the 4 demoted MLB markets was run. It fixed the raw model's
 * overconfidence but did NOT beat the de-vigged market out of sample, so NO market earns PUBLIC_MODEL_OK and
 * nothing is restored. These guards pin the honesty so a future change can't quietly re-inflate the claim:
 *   1. Eligibility policy: only PUBLIC_MODEL_OK unlocks product eligibility; every other verdict → false.
 *   2. Current verdicts: no market is PUBLIC_MODEL_OK ⇒ zero validated modeled legs.
 *   3. The recalibration artifacts are internal (public:false), never production-approved, and never claim
 *      PUBLIC_MODEL_OK; the MARKET_CONTEXT_ONLY markets did not beat the market (diff ≥ 0).
 *   4. Protocol integrity: holdout declared separate from selection, join has 0 dupes / 0 unmatched / 0 leakage.
 *   5. Internal calibration artifacts are absent from public/static output.
 *   6. The existing public demotion disclosures are unchanged (still shown).
 *   7. Money md5 unchanged.
 *
 * Run: npx tsx --test src/lib/mlb-recalibration-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { eligibilityFor, MLB_MARKET_VERDICT, validatedModeledMarkets, isProductEligibleModeledMarket } from "./mlb/calibration/eligibility-policy.ts";
import { anyModeledMarketBeatsMarket } from "./mlb/model-calibration-status.ts";

const app = process.cwd();
const repo = path.dirname(app);
const CAL = path.join(repo, "data/internal/mlb/calibration");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const MARKETS = ["pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis"];

test("1 · eligibility policy: ONLY PUBLIC_MODEL_OK unlocks product eligibility / model-advantage", () => {
  assert.equal(eligibilityFor("PUBLIC_MODEL_OK").productEligible, true);
  assert.equal(eligibilityFor("PUBLIC_MODEL_OK").publicModelAdvantage, true);
  for (const v of ["NEEDS_CAUTION", "MARKET_CONTEXT_ONLY", "INSUFFICIENT_OUT_OF_SAMPLE_DATA", "RECALIBRATION_UNSTABLE"]) {
    assert.equal(eligibilityFor(v).productEligible, false, `${v} is not product-eligible`);
    assert.equal(eligibilityFor(v).publicModelAdvantage, false, `${v} claims no model advantage`);
  }
});

test("2 · no market is PUBLIC_MODEL_OK ⇒ zero validated modeled legs (nothing restored)", () => {
  for (const m of MARKETS) {
    assert.notEqual(MLB_MARKET_VERDICT[m], "PUBLIC_MODEL_OK", `${m} is not PUBLIC_MODEL_OK`);
    assert.equal(isProductEligibleModeledMarket(m), false, `${m} is not product-eligible`);
  }
  assert.deepEqual(validatedModeledMarkets(), [], "zero validated modeled markets");
});

test("3 · recalibration artifacts are internal, not production-approved, and never claim PUBLIC_MODEL_OK", () => {
  const sel = readJson(path.join(CAL, "selected-calibrators.json"));
  if (!sel) { console.log("  (skip — artifacts not present in this checkout)"); return; }
  assert.equal(sel.public, false, "selected-calibrators is internal");
  assert.equal(sel.approvedForProduction, false, "not production-approved");
  const hold = readJson(path.join(CAL, "final-holdout-results.json"));
  for (const m of MARKETS) {
    const v = sel.byMarket[m];
    assert.equal(v.approvedForProduction, false, `${m} calibrator not production-approved`);
    assert.notEqual(v.verdict, "PUBLIC_MODEL_OK", `${m} did not earn PUBLIC_MODEL_OK`);
    // a MARKET_CONTEXT_ONLY market must NOT actually have beaten the market on the holdout (diff ≥ 0)
    if (v.verdict === "MARKET_CONTEXT_ONLY" && hold) {
      const h = hold.byMarket[m].holdout;
      assert.ok(h.brier.diffVsMarket >= 0 || h.logloss.diffVsMarket >= 0, `${m} does not beat market on both metrics`);
    }
  }
});

test("4 · protocol integrity: holdout separate from selection, clean join, no leakage", () => {
  const proto = readJson(path.join(CAL, "protocol.json"));
  if (!proto) { console.log("  (skip — protocol not present)"); return; }
  assert.equal(proto.declaredBeforeFitting, true);
  assert.equal(proto.benchmark, "de-vigged market probability");
  // holdout dates are strictly after selection dates (chronological)
  assert.ok(proto.finalHoldoutDates[0] > proto.selectionDates[1], "holdout starts after selection ends");
  assert.equal(proto.join.dupes, 0, "no duplicate ids");
  assert.equal(proto.join.unmatched, 0, "no unmatched leans");
  assert.equal(proto.join.leakageFailures, 0, "no projection leakage-guard failures");
});

test("5 · internal calibration artifacts are NOT web-served (absent from app/public + out/)", () => {
  assert.ok(!CAL.includes(`${path.sep}public${path.sep}`), "calibration dir is outside app/public");
  const out = path.join(app, "out");
  if (fs.existsSync(out)) {
    const hit = fs.readdirSync(path.join(app, "out"), { recursive: true }).filter((p) => String(p).includes("selected-calibrators") || String(p).includes("final-holdout-results"));
    assert.equal(hit.length, 0, "no calibration artifact under out/");
  }
});

test("6 · existing public demotion disclosures are unchanged (still demoted; nothing re-inflated)", () => {
  assert.equal(anyModeledMarketBeatsMarket(), false, "public status: no market beats the market");
  const report = fs.readFileSync(path.join(app, "src/components/game/mlb-simulation-report-v2.tsx"), "utf8");
  assert.match(report, /Model calibration notice/, "the calibration notice is still shown");
  assert.match(report, /Paper candidates/, "picks are still 'Paper candidates', not restored to product-eligible");
});

test("7 · money md5 unchanged (the whole experiment is internal + analysis-only)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
