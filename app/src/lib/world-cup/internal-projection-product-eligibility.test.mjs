/**
 * Phase 8 product-eligibility guard: the internal projection engines must never leak into Bank Builder /
 * Moonshot, and settlement-blocked soccer markets must stay product-ineligible.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MARKET_COVERAGE, isProductEligible } from "../market-coverage.ts";

const APP = process.cwd();

test("settlement-blocked soccer markets are NOT product-eligible", () => {
  const blocked = ["anytime_scorer", "shots_shots_on_target", "correct_score", "corners_cards"];
  for (const key of blocked) {
    const m = MARKET_COVERAGE.find((x) => x.sport === "soccer" && x.market === key);
    assert.ok(m, `coverage row exists for soccer/${key}`);
    assert.equal(isProductEligible(m), false, `soccer/${key} must be product-ineligible (settlement blocked)`);
  }
});

test("isProductEligible requires supported settlement — an unsupported/pending market can never qualify", () => {
  for (const m of MARKET_COVERAGE) {
    if (m.settlementSupport !== "supported") {
      assert.equal(isProductEligible(m), false, `${m.sport}/${m.market} has ${m.settlementSupport} settlement => ineligible`);
    }
  }
});

test("NO product / proposal / portfolio builder imports the internal projection engine or reads its artifacts", () => {
  const productDirs = ["src/lib/parlays", "src/lib/mr-dub"];
  const productFiles = [];
  const walk = (dir) => {
    const abs = path.join(APP, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (/\.(ts|mjs)$/.test(e.name) && !e.name.includes(".test.")) productFiles.push(path.join(dir, e.name));
    }
  };
  productDirs.forEach(walk);
  // also any bank-builder / moonshot / product-* lib file
  for (const e of fs.readdirSync(path.join(APP, "src/lib"))) {
    if (/^(bank-builder|moonshot|product).*\.(ts|mjs)$/.test(e) && !e.includes(".test.")) productFiles.push(path.join("src/lib", e));
  }
  const offenders = productFiles.filter((f) => {
    const src = fs.readFileSync(path.join(APP, f), "utf8");
    return /internal-soccer-projection|projection-engine|internal_soccer_projection|full-game-sim/.test(src);
  });
  assert.deepEqual(offenders, [], `internal engines must not be referenced by product builders; found: ${offenders.join(", ")}`);
});

test("the internal soccer artifact is public:false so the product pipeline (which reads public artifacts) can't consume it", () => {
  const p = path.resolve(APP, "..", "data/internal/world-cup/projection-engine/2026-07-14.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(j.public, false);
});
