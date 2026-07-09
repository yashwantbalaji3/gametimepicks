/**
 * CALIBRATION SCAFFOLDING (2026-07-09) — pure, safe, and DELIBERATELY UNWIRED.
 *
 * Pins the safety properties the methodology-upgrade audit promises: probabilities clamp to [0,1], a
 * missing model never fabricates a blend (result == market, edge 0), thin/unavailable data discounts
 * the model, learned reliability moves the blend the right way — and, most importantly, merely adding
 * this module changes NO public recommendation (nothing under src/ outside this folder imports it).
 * Money md5 is unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { calibrate, blendProbabilities, reliabilityWeight, clamp01, dataQualityFactor } from "./index.ts";

const app = process.cwd();

test("1 · probabilities clamp to [0,1] (inputs, blend, result)", () => {
  assert.equal(clamp01(1.4), 1);
  assert.equal(clamp01(-0.2), 0);
  assert.equal(clamp01(Number.NaN), 0);
  assert.equal(blendProbabilities(1.5, 2, 0.5), 1); // clamped ends ⇒ clamped blend
  const r = calibrate({ marketProbability: 1.3, modelProbability: -0.5, marketType: "batter_hits", sport: "MLB", dataQuality: "high", historicalReliability: 0.65 });
  assert.ok(r.calibratedProbability >= 0 && r.calibratedProbability <= 1);
  assert.ok(r.marketProbability >= 0 && r.marketProbability <= 1);
});

test("2 · no model probability ⇒ no fake blend (result == market, weight 0, edge 0)", () => {
  const r = calibrate({ marketProbability: 0.58, marketType: "batter_hits", sport: "MLB", dataQuality: "high", historicalReliability: 0.9 });
  assert.equal(r.calibratedProbability, 0.58);
  assert.equal(r.reliabilityWeight, 0);
  assert.equal(r.edge, 0);
  assert.equal(r.modelProbability, null);
  assert.equal(r.usedModel, false);
});

test("3 · thin / unavailable data discounts (or kills) the model weight", () => {
  const base = { marketProbability: 0.5, modelProbability: 0.7, marketType: "batter_hits", sport: "MLB", historicalReliability: 0.8 };
  const high = reliabilityWeight({ ...base, dataQuality: "high" });
  const thin = reliabilityWeight({ ...base, dataQuality: "thin" });
  const none = reliabilityWeight({ ...base, dataQuality: "unavailable" });
  assert.ok(high > thin, "thin data reduces weight vs high");
  assert.equal(none, 0, "unavailable data ⇒ zero model weight");
  assert.ok(dataQualityFactor("high") > dataQualityFactor("thin"));
  // Unavailable data ⇒ the blend defers entirely to the market.
  const r = calibrate({ ...base, dataQuality: "unavailable" });
  assert.equal(r.calibratedProbability, 0.5);
  assert.equal(r.usedModel, false);
});

test("4 · calibration nudges toward the model only as much as reliability earns", () => {
  // Neutral reliability (0.5) + high data ⇒ weight 0.5 ⇒ halfway blend.
  const mid = calibrate({ marketProbability: 0.4, modelProbability: 0.6, marketType: "x", sport: "MLB", dataQuality: "high", historicalReliability: 0.5 });
  assert.ok(Math.abs(mid.calibratedProbability - 0.5) < 1e-9, "0.5 weight ⇒ midpoint");
  // Hold market + model fixed, vary ONLY reliability: lower reliability ⇒ smaller edge, closer to market.
  const cfg = { marketProbability: 0.4, modelProbability: 0.9, marketType: "batter_total_bases", sport: "MLB", dataQuality: "high" };
  const strong = calibrate({ ...cfg, historicalReliability: 0.8 });
  const weak = calibrate({ ...cfg, historicalReliability: 0.28 }); // like a net-negative market
  assert.ok(weak.edge > 0 && weak.edge < strong.edge, "smaller reliability ⇒ smaller edge (same market+model)");
  assert.ok(weak.calibratedProbability < strong.calibratedProbability, "low reliability keeps the result nearer the market");
});

// ── Walk src/ for any import of this module OUTSIDE the calibration folder. ──
function collectSources(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      collectSources(p, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      acc.push(p);
    }
  }
  return acc;
}

test("5 · UNWIRED — no public recommendation imports the calibration module", () => {
  const srcDir = path.join(app, "src");
  const files = collectSources(srcDir, []).filter((p) => !p.includes(`${path.sep}calibration${path.sep}`));
  const offenders = files.filter((p) => {
    const s = fs.readFileSync(p, "utf8");
    return /from\s+["'](@\/lib\/calibration|\.\.?\/.*calibration\/(index|market-blend|reliability|types))["']/.test(s);
  });
  assert.deepEqual(offenders.map((p) => path.relative(app, p)), [], "calibration scaffolding must stay unwired until a backtested rollout");
});

test("6 · money md5 unchanged; the module is money-independent", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
  for (const f of ["types.ts", "reliability.ts", "market-blend.ts", "index.ts"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(app, "src/lib/calibration", f), "utf8"), /portfolio\.json|mr-dub|bankroll/);
  }
});
