/**
 * Market-coverage registry — the product's "no hidden gaps, no overclaim" contract.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MARKET_COVERAGE,
  coverageForSport,
  isProductEligible,
} from "./market-coverage.ts";

test("every entry has an honest public explanation + required data when blocked", () => {
  for (const m of MARKET_COVERAGE) {
    assert.ok(m.publicLabel && m.publicExplanation, `${m.sport}/${m.market} has label + explanation`);
    // Anything not fully supported must name what would unblock it (no silent gaps).
    if (m.status !== "supported") {
      assert.ok(m.requiredData.length > 0, `${m.sport}/${m.market} names required data/source`);
    }
  }
});

test("no overclaim: soccer is market-implied (never an independent sim); MLB full-game is not independent", () => {
  for (const m of coverageForSport("soccer")) {
    assert.notEqual(m.predictionSource, "independent_sim", `soccer ${m.market} is not claimed as an independent sim`);
  }
  const fullGame = MARKET_COVERAGE.find((m) => m.sport === "mlb" && m.market === "full_game_sim");
  assert.equal(fullGame.predictionSource, "market_implied", "MLB full-game is market-implied, not an independent sim");
  assert.equal(fullGame.status, "experimental", "MLB full-game sim is experimental, not 'supported'");
});

test("settlement-blocked + experimental markets can NEVER enter a product card", () => {
  for (const m of MARKET_COVERAGE) {
    if (m.status === "settlement_blocked" || m.status === "experimental" || m.status === "provider_needed") {
      assert.equal(isProductEligible(m), false, `${m.sport}/${m.market} is not product-eligible`);
    }
  }
  // All UFC markets are non-eligible (unvalidated).
  for (const m of coverageForSport("ufc")) {
    assert.equal(isProductEligible(m), false, `UFC ${m.market} excluded from products`);
  }
});

test("soccer set-piece / correct-score props are still provider_needed (no feed), not faked", () => {
  for (const key of ["corners_cards", "correct_score"]) {
    const m = MARKET_COVERAGE.find((x) => x.sport === "soccer" && x.market === key);
    assert.ok(m, `soccer ${key} present in the registry (shown, not hidden)`);
    assert.equal(m.status, "provider_needed", `soccer ${key} is provider_needed`);
    assert.equal(m.settlementSupport, "unsupported", `soccer ${key} has no settlement`);
    assert.equal(m.predictionSource, "none", `soccer ${key} makes no prediction (never faked)`);
  }
});

test("Phase C pilot: goalscorer + shots are LIVE (market-implied) but settlement-pending → still product-ineligible", () => {
  for (const key of ["anytime_scorer", "shots_shots_on_target"]) {
    const m = MARKET_COVERAGE.find((x) => x.sport === "soccer" && x.market === key);
    assert.equal(m.status, "experimental", `soccer ${key} is experimental (feed live, pilot)`);
    assert.equal(m.predictionSource, "market_implied", `soccer ${key} is a market-implied read (real odds)`);
    assert.equal(m.settlementSupport, "unsupported", `soccer ${key} settlement still pending`);
    assert.equal(isProductEligible(m), false, `soccer ${key} still cannot enter a product card`);
  }
});

test("no forbidden claims in any public explanation", () => {
  const banned = /\block\b|guaranteed|best bet|positive EV|validated edge|sure thing/i;
  for (const m of MARKET_COVERAGE) {
    assert.doesNotMatch(m.publicExplanation, banned, `${m.sport}/${m.market} explanation is claim-clean`);
  }
});

test("the coverage matrix is wired into /simulate", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/app/simulate/page.tsx"), "utf8");
  assert.match(src, /SimulationCoverageMatrix/, "/simulate renders the coverage matrix");
});
