/**
 * Guards for the interval-calibration monitor.
 *
 * The load-bearing properties are the two refusals: it makes no claim below the sample floor, and
 * it never applies the scale factor it proposes. Both are what separate a monitor from a fudge.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CALIBRATION_BARS, coverageVerdict, judgeCohort, normInv, worstState } from "./interval-calibration.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

test("normInv matches known normal quantiles", () => {
  assert.ok(Math.abs(normInv(0.5) - 0) < 1e-9);
  assert.ok(Math.abs(normInv(0.9) - 1.2815515655) < 1e-6, "the 90th percentile sets an 80% central interval");
  assert.ok(Math.abs(normInv(0.975) - 1.9599639845) < 1e-6);
  assert.ok(Number.isNaN(normInv(0)) && Number.isNaN(normInv(1)));
});

test("THE FINDING · the preseason margin interval is overconfident", () => {
  // Measured 2026-09-10 from data/internal/nfl/experimental-settlement/summary.json:
  // 43 decisive preseason forecasts, margin 80% interval covered 65.12% (28 of 43).
  const v = coverageVerdict({ n: 43, covered: 28 });
  assert.equal(v.state, "OVERCONFIDENT");
  assert.ok(v.z < -2, `z ${v.z} must clear the bar`);
  assert.ok(v.impliedScale > 1.2, `intervals need widening, scale ${v.impliedScale}`);
  assert.match(v.claim, /too narrow/);
});

test("THE CONTROL · the preseason total interval is not flagged", () => {
  // Same cohort, total 80% interval covered 88.37% (38 of 43). Wider than nominal but well inside
  // the bar — a monitor that flagged this too would be reporting noise as a finding.
  const v = coverageVerdict({ n: 43, covered: 38 });
  assert.equal(v.state, "CALIBRATED");
  assert.ok(Math.abs(v.z) < 2);
});

test("a perfectly calibrated head is CALIBRATED, not flagged", () => {
  const v = coverageVerdict({ n: 100, covered: 80 });
  assert.equal(v.state, "CALIBRATED");
  assert.equal(v.z, 0);
  assert.ok(Math.abs(v.impliedScale - 1) < 0.01, "and needs no correction");
});

test("too-wide intervals are named, not silently accepted", () => {
  const v = coverageVerdict({ n: 100, covered: 95 });
  assert.equal(v.state, "UNDERCONFIDENT");
  assert.ok(v.impliedScale < 1, "the proposal narrows them");
});

test("REFUSAL 1 · no claim below the sample floor", () => {
  // 2 of 5 covered is 40% — z = -2.24, which clears the threshold arithmetically and means nothing.
  // Yesterday's regular-season cohort was n=1; a monitor that spoke on n=1 would have declared the
  // model broken on the strength of a single tail game.
  for (const n of [1, 5, 19]) {
    const v = coverageVerdict({ n, covered: Math.round(n * 0.4) });
    assert.equal(v.state, "INSUFFICIENT", `n=${n} must not produce a verdict`);
    assert.equal(v.z, null, "and must not report a statistic it cannot support");
    assert.equal(v.impliedScale, null, "nor a correction");
  }
  const ok = coverageVerdict({ n: CALIBRATION_BARS.MIN_SAMPLE, covered: 8 });
  assert.notEqual(ok.state, "INSUFFICIENT", "exactly at the floor, it speaks");
});

test("REFUSAL 2 · the module proposes a scale and never applies one", () => {
  const src = fs.readFileSync(path.join(HERE, "interval-calibration.mjs"), "utf8");
  // Nothing here may write a forecast, a sigma, or an artifact. It reads and judges.
  assert.ok(!/writeFileSync|appendFileSync/.test(src), "a monitor that edits the model is not a monitor");
  assert.match(src, /never applied here|does not apply one|never a promotion/i, "the refusal is stated");
  // And the proposal is reported as a number, not folded into any returned interval.
  const v = coverageVerdict({ n: 43, covered: 28 });
  assert.deepEqual(Object.keys(v).sort(), ["claim","covered","expected","impliedScale","n","observed","state","z"].sort());
});

test("degenerate and hostile inputs never throw and never claim", () => {
  for (const bad of [{}, { n: 0, covered: 0 }, { n: NaN, covered: 3 }, { n: 43, covered: NaN }, null]) {
    const v = coverageVerdict(bad ?? undefined);
    assert.equal(v.state, "INSUFFICIENT");
  }
});

test("judgeCohort reads the settlement summary's own shape", () => {
  const j = judgeCohort({
    label: "preseason", settledForecasts: 43, decisive: 41,
    winnerAccuracy: 0.5366, marginMAE: 12.3953, totalMAE: 8.186,
    marginInterval80Coverage: 0.6512, totalInterval80Coverage: 0.8837,
  });
  // `decisive` is the denominator: a tie is a question the model was not asked (the graded-picks
  // ledger already treats it that way, and the two must not disagree).
  assert.equal(j.n, 41);
  assert.equal(j.margin.state, "OVERCONFIDENT");
  assert.equal(j.total.state, "CALIBRATED");
  assert.equal(j.marginMAE, 12.3953);
});

test("cohorts are judged separately and the worst one surfaces", () => {
  const judged = [
    judgeCohort({ label: "preseason", decisive: 41, marginInterval80Coverage: 0.6512, totalInterval80Coverage: 0.8837 }),
    judgeCohort({ label: "regular-season", decisive: 1, marginInterval80Coverage: 1, totalInterval80Coverage: 0 }),
  ];
  assert.equal(judged[1].margin.state, "INSUFFICIENT", "n=1 says nothing either way");
  assert.equal(judged[1].total.state, "INSUFFICIENT");
  assert.equal(worstState(judged), "OVERCONFIDENT", "the preseason breach is what an operator sees first");
});

/* MUTATION PROBE — the guard must fail against a monitor that cannot detect the real breach. */
test("probe: a monitor with a looser bar would miss the finding it was built for", () => {
  const v = coverageVerdict({ n: 43, covered: 28 });
  assert.ok(
    Math.abs(v.z) > CALIBRATION_BARS.Z_THRESHOLD,
    "raising Z_THRESHOLD past 2.44 would silence the 65%-vs-80% breach — the bar is preregistered, not tuned to taste",
  );
  assert.equal(CALIBRATION_BARS.Z_THRESHOLD, 2);
  assert.equal(CALIBRATION_BARS.MIN_SAMPLE, 20);
});
