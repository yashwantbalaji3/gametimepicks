/**
 * PUBLIC PRODUCT LANGUAGE (founder decision 2026-11-11). Customer pages use the MODEL PROJECTION label and plain words: no
 * research, preregistration, calibration-gate or internal model-version vocabulary. This pins the shared wording sources
 * every surface prints from; the per-surface tests (hub-readiness, possession-render, paper-products-visitor-strings,
 * week1-public-readiness, forecast-view) check the rendered pages. Safety sentences are unchanged and pinned there.
 *
 * Run (from app/): npx tsx --test src/lib/uiux/public-language.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const W = await import("../sports/nba/elo-win-probability.mjs");
const { estimateLabel, withheldReasonText } = await import("../sports/nfl/family-publication.mjs");
const { ESTIMATE_DETAIL } = await import("../sports/nfl/forecast-view.mjs");
const L = await import("../simulation-theater/nba/possession/labels.mjs");
const { NBA_MODEL_PERFORMANCE_NOTE } = await import("../public-registry.ts");

const BANNED = /experimental|preregist|forward evaluation|shadow|calibration standard|failed bar|not cleared|n\/300|\bv\d+(\.\d+)?\b|sim-v\d|@\d\b|Challenger|research/i;

test("the shared public wording carries none of the removed vocabulary", () => {
  const texts = {
    eloLabel: W.ELO_WIN_PROBABILITY_LABEL,
    eloSource: W.ELO_SOURCE_WITH_PROBABILITY,
    eloDisclosure: W.eloAccuracyDisclosure({ graded: 160, minN: 300 }),
    eloCaveat: W.eloCalibrationCaveat({ graded: 160, minN: 300 }),
    nbaNote: NBA_MODEL_PERFORMANCE_NOTE,
    nflEstimate: estimateLabel("SECOND_LOOK_REJECTED — failed bar: threshold calibration"),
    nflEstimatePublication: estimateLabel("RESEARCH_ONLY"),
    nflDetail: ESTIMATE_DETAIL,
    nflWithheldCal: withheldReasonText("SHADOW_ELIGIBLE — failed bar(s): calOk"),
    nflWithheldOther: withheldReasonText("RESEARCH_ONLY"),
    engine: L.ENGINE_LABEL,
    accuracy: L.ACCURACY_NOTE,
    ...Object.fromEntries(L.ROLE_C_NOTE.map((x, i) => [`roleNote${i}`, x])),
  };
  for (const [k, v] of Object.entries(texts)) assert.doesNotMatch(v, BANNED, `${k}: ${v}`);
  for (const k of ["eloDisclosure", "eloCaveat"]) assert.doesNotMatch(texts[k], /\b160\b|\b300\b/, `${k}: the counts live on Results and Methodology`);
});

test("the labels themselves", () => {
  assert.equal(W.ELO_WIN_PROBABILITY_LABEL, "Game-winner projection");
  assert.equal(estimateLabel("anything"), "Wider projection range");
  assert.match(W.eloAccuracyDisclosure({ graded: 1, minN: 300 }), /^Accuracy record still building\. /);
  // the safety sentence is unchanged
  assert.match(W.eloAccuracyDisclosure({ graded: 1, minN: 300 }), /not an independently validated probability, not a simulation result, and not a betting recommendation\.$/);
  assert.notEqual(withheldReasonText("calOk"), withheldReasonText("RESEARCH_ONLY"), "the reason is still read from the artifact");
});
