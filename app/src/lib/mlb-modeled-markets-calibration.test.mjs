/**
 * MLB MODELED-MARKETS CALIBRATION DEMOTION (2026-07-21).
 *
 * A leakage-safe audit (settled leans ⋈ pregame board) found that NONE of the 4 public-modeled markets beat the
 * market — all are DEMOTED to market-anchored research signal. These checks pin the honest surfacing so nobody
 * reads the model board as an edge, and so a future refresh can't silently re-inflate the claim:
 *   1. The calibration status is the demotion (no market beats the market; disclosure present).
 *   2. The MLB report renders the prominent calibration notice + the product Calibration flag.
 *   3. The report no longer labels picks "Product-eligible" as if validated (now "Paper candidates").
 *   4. No banned "edge/beat the market" language leaked into the new copy.
 *   5. Money md5 unchanged.
 *
 * Run: npx tsx --test src/lib/mlb-modeled-markets-calibration.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { MLB_MARKET_CALIBRATION, modelBeatsMarket, anyModeledMarketBeatsMarket, isCalibrationFailed, MLB_CALIBRATION_DISCLOSURE } from "./mlb/model-calibration-status.ts";

const app = process.cwd();
const report = fs.readFileSync(path.join(app, "src/components/game/mlb-simulation-report-v2.tsx"), "utf8");
const MARKETS = ["pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis"];

test("1 · calibration status: every modeled market is demoted; none beats the market", () => {
  for (const m of MARKETS) {
    assert.ok(MLB_MARKET_CALIBRATION[m], `${m} has a calibration record`);
    assert.equal(MLB_MARKET_CALIBRATION[m].verdict, "DEMOTE_TO_MARKET_CONTEXT", `${m} is demoted`);
    assert.equal(modelBeatsMarket(m), false, `${m} does not beat the market`);
    assert.equal(isCalibrationFailed(m), true, `${m} is calibration-failed`);
    // the recorded numbers actually show the market winning (guards against a typo re-inflating the claim)
    assert.ok(MLB_MARKET_CALIBRATION[m].brierMarket <= MLB_MARKET_CALIBRATION[m].brierModel, `${m}: market Brier ≤ model Brier`);
    assert.ok(MLB_MARKET_CALIBRATION[m].loglossMarket <= MLB_MARKET_CALIBRATION[m].loglossModel, `${m}: market logloss ≤ model logloss`);
    assert.ok(MLB_MARKET_CALIBRATION[m].sampleSize >= 100, `${m} sufficient sample`);
  }
  assert.equal(anyModeledMarketBeatsMarket(), false, "no modeled market beats the market");
  assert.match(MLB_CALIBRATION_DISCLOSURE, /research signal/, "disclosure frames output as a research signal");
});

test("2 · the MLB report renders the calibration notice + the product Calibration flag", () => {
  assert.match(report, /import \{ MLB_CALIBRATION_DISCLOSURE, isCalibrationFailed, anyModeledMarketBeatsMarket \}/, "report imports the calibration status");
  assert.match(report, /Model calibration notice/, "the prominent notice is rendered");
  assert.match(report, /\{MLB_CALIBRATION_DISCLOSURE\}/, "the disclosure text is rendered");
  assert.match(report, /Calibration flag/, "the product-eligibility calibration flag is rendered");
  assert.match(report, /!anyModeledMarketBeatsMarket\(\)/, "the notice/flag are gated on the audit (auto-hide if a market is ever validated)");
});

test("3 · the report no longer presents picks as validated 'Product-eligible' (now 'Paper candidates')", () => {
  assert.match(report, /Paper candidates/, "the eligibility tile is reworded honestly");
  assert.match(report, /not market-proven/, "the tile notes the picks are not market-proven");
  assert.ok(!/label="Product-eligible"/.test(report), "no tile still claims 'Product-eligible'");
});

test("4 · no banned edge/market-beating language in the new copy", () => {
  const stripped = report.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
  const FORBIDDEN = /\bedge\b|\block\b|best bet|positive EV|\bguaranteed\b|beat the market|market-beating|sure thing/i;
  assert.ok(!FORBIDDEN.test(stripped), "report body has no banned language");
  assert.ok(!/\bedge\b/i.test(MLB_CALIBRATION_DISCLOSURE), "disclosure avoids the word 'edge'");
});

test("5 · money md5 unchanged (audit + demotion are display-only)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
