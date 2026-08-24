/**
 * The learning report, and the stopping rule that keeps it from becoming a fishing expedition.
 *
 * Run: npx tsx --test src/lib/sports/epl/learning-report.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { MIN_SAMPLE_FOR_COMPARISON, buildEplLearningReport, stoppingRule } from "./learning-report.mjs";

/** n graded matches where the model scores `m` and the market `k`. */
const rows = (n, m, k) => Array.from({ length: n }, () => ({
  scores: { logLoss: m, brier: m / 2 },
  ...(k == null ? {} : { market: { scores: { logLoss: k, brier: k / 2 } } }),
}));

test("SIGN · a LOWER log loss is better, so a NEGATIVE delta means the model is ahead", () => {
  // The single most inversion-prone line in this module. A flipped sign would report a model losing
  // to the closing line as a model beating it, and every downstream decision would follow it.
  const ahead = buildEplLearningReport(rows(40, 0.90, 1.00));
  assert.ok(ahead.comparison.onPairedMatches.logLossDelta < 0);
  assert.equal(ahead.comparison.state, "MODEL_AHEAD");

  const behind = buildEplLearningReport(rows(40, 1.05, 1.00));
  assert.ok(behind.comparison.onPairedMatches.logLossDelta > 0);
  assert.equal(behind.comparison.state, "MODEL_BEHIND");
  // And the prose must not require the reader to remember which direction is good.
  assert.match(behind.comparison.detail, /HIGHER|losing to the price/);
});

test("a match with NO recorded price is excluded from the comparison, never scored as a market miss", () => {
  // 10 paired, 30 unpaired. An absent price is a gap in OUR records; treating it as market error
  // would manufacture an advantage out of our own missing data.
  const out = buildEplLearningReport([...rows(10, 1.0, 1.0), ...rows(30, 1.0, null)]);
  assert.equal(out.sample.graded, 40, "every graded match counts toward the model's own record");
  assert.equal(out.sample.pairedWithMarket, 10, "only matches carrying a price enter the comparison");
});

test("the model and the market are averaged over the SAME matches", () => {
  // 20 paired where the model is poor, plus 20 unpaired where it is excellent. If the model's
  // comparison figure were taken over all 40 it would look better than the market purely because
  // the market was absent from its best matches.
  const out = buildEplLearningReport([...rows(20, 1.20, 1.00), ...rows(20, 0.10, null)]);
  assert.equal(out.comparison.onPairedMatches.model.logLoss, 1.2, "the comparison uses paired matches only");
  assert.equal(out.model.n, 40, "the model's own record still spans everything graded");
  assert.notEqual(out.model.logLoss, out.comparison.onPairedMatches.model.logLoss, "the two figures answer different questions");
});

test("below the minimum sample NO verdict is issued, whatever the numbers look like", () => {
  const out = buildEplLearningReport(rows(MIN_SAMPLE_FOR_COMPARISON - 1, 0.50, 1.00));
  assert.equal(out.comparison.state, "SAMPLE_TOO_SMALL");
  // The figures are still reported — hiding them would be its own dishonesty — but the text has to
  // say they support nothing. A crushing-looking delta over 29 matches is still noise.
  assert.ok(out.comparison.onPairedMatches.logLossDelta < 0, "the figure is reported");
  assert.match(out.comparison.detail, /support no conclusion/);
  assert.equal(out.stoppingRule.state, "NOT_YET_ASSESSABLE");
});

test("no paired matches is NO_PAIRED_MATCHES, not a level result", () => {
  const out = buildEplLearningReport(rows(5, 0.7, null));
  assert.equal(out.comparison.state, "NO_PAIRED_MATCHES");
  assert.equal(out.comparison.onPairedMatches.logLossDelta, null, "absent is null, never zero");
});

test("STOPPING RULE · a materially worse model is demoted, not tuned and re-run", () => {
  // The rule exists because MLB ran the tune-and-re-run loop three times before anyone wrote a
  // stopping condition down. Demotion to market context is the same outcome all four MLB markets
  // reached, and the text says so explicitly so the next person does not rediscover it.
  const stop = stoppingRule(50, 0.05);
  assert.equal(stop.state, "STOP_AND_DEMOTE");
  assert.match(stop.detail, /Do not tune and re-run/);
});

test("STOPPING RULE · tracking the market without beating it is its own verdict", () => {
  // The most likely real outcome, and the one most easily talked into "nearly there".
  assert.equal(stoppingRule(50, 0.0).state, "NO_MEASURABLE_ADVANTAGE");
  assert.equal(stoppingRule(50, -0.004).state, "NO_MEASURABLE_ADVANTAGE");
  // Only a lead beyond the noise floor continues.
  assert.equal(stoppingRule(50, -0.05).state, "CONTINUE");
});

test("the rule cannot be reached before its own sample threshold", () => {
  assert.equal(stoppingRule(MIN_SAMPLE_FOR_COMPARISON - 1, -0.5).state, "NOT_YET_ASSESSABLE");
  assert.equal(stoppingRule(0, null).state, "NOT_YET_ASSESSABLE");
});

test("the report FITS NOTHING — measuring and adjusting on one pass always finds an improvement", () => {
  const src = fs.readFileSync(new URL("./learning-report.mjs", import.meta.url), "utf8");
  for (const forbidden of [/\bfit[A-Z]/, /\brecommend/i, /\btune\b(?!\s+and\s+re-run)/i]) {
    // The module may NAME the failure mode in prose; it must not perform it.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, forbidden, `learning-report.mjs must only report: ${forbidden}`);
  }
});

test("COVERAGE · every unpaired match is counted BY CAUSE, and our defects are named as engineering", () => {
  /*
   * P196 · Release D. Exclusion from the comparison stands; exclusion without a cause made
   * "is pairing failing for a fixable reason?" unanswerable. NO_PRICE_ON_FORECAST is reality;
   * MALFORMED_/AMBIGUOUS_ causes are ours and must surface as engineering-owned.
   */
  const paired = { scores: { logLoss: 0.5, brier: 0.3 }, market: { scores: { logLoss: 0.6, brier: 0.35 } } };
  const rows = [
    paired,
    { scores: { logLoss: 0.7, brier: 0.4 }, market: null, marketAbsence: "NO_PRICE_ON_FORECAST" },
    { scores: { logLoss: 0.7, brier: 0.4 }, market: null, marketAbsence: "MALFORMED_NOVIG_SET" },
    { scores: { logLoss: 0.7, brier: 0.4 }, market: null }, // graded before causes were recorded
  ];
  const out = buildEplLearningReport(rows);
  assert.equal(out.coverage.paired, 1);
  assert.equal(out.coverage.unpaired.total, 3);
  assert.deepEqual(out.coverage.unpaired.byCause, {
    NO_PRICE_ON_FORECAST: 1,
    MALFORMED_NOVIG_SET: 1,
    UNRECORDED_CAUSE_PRE_P196: 1,
  });
  assert.deepEqual(out.coverage.engineeringOwnedCauses, ["MALFORMED_NOVIG_SET"],
    "a malformed set is OUR defect; a missing price and a pre-cause row are not engineering items");
});
