/**
 * Session 5 · B4 — Ask files a parlay candidate under the PRICE band of its combined odds (the same bands as the
 * public ladder), never under the optimizer's section key. A +450 optimizer "medium" slip is High risk.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { getRiskBucketForCombinedOdds } from "../parlays/risk-odds-bands.mjs";

const SRC = fs.readFileSync("scripts/ask/build-ask-projections.mjs", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("WIRED: the projection's risk profile is the canonical band of the candidate's own price", () => {
  assert.match(SRC, /const band = payout \? getRiskBucketForCombinedOdds\(payout\.american\) : null;/);
  assert.match(SRC, /profile: band\.toUpperCase\(\),/);
  assert.match(SRC, /optimizerSection: String\(s\.profile \?\? profile\)\.toUpperCase\(\),/, "the optimizer's own section is kept as provenance, not as the risk level");
  assert.match(SRC, /if \(!band\) \{ unbanded \+= 1; continue; \}/, "an unpriced candidate is counted, never guessed into a band");
});

test("the bands an optimizer section actually spans map to the ladder's levels", () => {
  // optimizer low < +300, medium +300–600, high +600–1000, longshot ≥ +1000 (parlay_optimizer.py)
  assert.equal(getRiskBucketForCombinedOdds(250), "medium");
  assert.equal(getRiskBucketForCombinedOdds(450), "high");
  assert.equal(getRiskBucketForCombinedOdds(800), "longshot");
  assert.equal(getRiskBucketForCombinedOdds(-150), "low");
});
