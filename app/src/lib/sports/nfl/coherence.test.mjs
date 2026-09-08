/**
 * P245 — corruption fixtures for the one coherence rule. The real defect classes stay caught;
 * the tie-mass mislabel and the snap-band straddle stay publishable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { coherentDirection, MEDIAN_SNAP_BAND } from "./coherence.mjs";

test("CORRUPTION · a material direction conflict refuses in both directions", () => {
  assert.equal(coherentDirection({ medMargin: 7, pHome: 0.42, pAway: 0.55 }), false, "home by 7 with away favoured is a contradiction");
  assert.equal(coherentDirection({ medMargin: -7, pHome: 0.55, pAway: 0.42 }), false, "away by 7 with home favoured is a contradiction");
  assert.equal(coherentDirection({ medMargin: 2, pHome: 0.44, pAway: 0.53 }), false, "the band is exactly ±1 — a 2-point median already refuses");
});

test("the tie-mass favourite is judged pHome vs pAway, never pHome vs 0.5 (the BAL@IND case)", () => {
  // d ≈ +11 Elo: analytic logistic 0.516 scaled by 3.2% tie mass → pHome 0.4997, pAway 0.4683.
  assert.equal(coherentDirection({ medMargin: 1, pHome: 0.4997, pAway: 0.4683 }), true);
  // and even a +2 median with that pair is coherent — home IS the favourite on both heads
  assert.equal(coherentDirection({ medMargin: 2, pHome: 0.4997, pAway: 0.4683 }), true);
});

test("the snap band is the sampled median's own width, and only that", () => {
  assert.equal(MEDIAN_SNAP_BAND, 1, "±0.5 integer snap + ~0.17pt sampling of a σ≈13.7 median at n=10k");
  assert.equal(coherentDirection({ medMargin: 1, pHome: 0.47, pAway: 0.50 }), true, "a one-point straddle at the crossover is honest");
  assert.equal(coherentDirection({ medMargin: -1, pHome: 0.50, pAway: 0.47 }), true);
});
