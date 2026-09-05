/**
 * A CANDIDATE CANNOT PROMOTE ITSELF — Program 234 · Release H.
 *
 * Run: npx tsx --test src/lib/model-eval/preregistration.test.mjs
 *
 * The charter's acceptance for this release is that the evaluation SYSTEM works, and that its
 * outcome may honestly be a correctly rejected candidate. So almost every assertion here is about a
 * refusal: leakage, a missing denominator, a sample below the frozen minimum, a margin below the
 * frozen bar, and — the one the whole module exists for — a window that was scored before its terms
 * were fixed, which cannot earn a promotion however good the number turns out to be.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRegistration, decide, isRecommendation, VERDICTS } from "./preregistration.mjs";

const REG = Object.freeze({
  id: "mlb-isotonic-2026-09",
  sport: "mlb",
  state: "PREREGISTERED",
  candidateVersion: "isotonic-v1",
  incumbentVersion: "raw-model",
  trainingCutoff: "2026-08-10",
  evaluationOpensAt: "2026-08-11",
  featureSources: ["public/data/mlb/results/calibration/*.jsonl"],
  eligibility: "decisive settled MLB player-prop rows carrying both a model and a de-vigged market probability",
  metric: "brier",
  minimumDecisiveRows: 2000,
  minimumCoverage: 0.9,
  requiredImprovement: 0.005,
  registeredAt: "2026-08-01",
});

const OBS = Object.freeze({
  evaluationFrom: "2026-08-11", evaluationTo: "2026-09-04",
  decisiveRows: 11829, eligibleRows: 12000,
  candidate: { brier: 0.2443, logLoss: 0.6816 },
  incumbent: { brier: 0.2529, logLoss: 0.7009 },
});

test("a complete registration validates", () => {
  assert.deepEqual(validateRegistration(REG), { ok: true });
});

test("EVERY TERM IS REQUIRED — an open term is a result chosen after the fact", () => {
  for (const f of Object.keys(REG)) {
    const bad = { ...REG }; delete bad[f];
    const v = validateRegistration(bad);
    assert.equal(v.ok, false, `${f} was allowed to be absent`);
    assert.ok(v.problems.some((p) => p.includes(f)), `${f}'s absence must be named`);
  }
});

test("a bar of zero is refused — it would promote noise", () => {
  assert.equal(validateRegistration({ ...REG, requiredImprovement: 0 }).ok, false);
});

test("terms fixed AFTER the window opened are not a preregistration", () => {
  const late = validateRegistration({ ...REG, registeredAt: "2026-08-20" });
  assert.equal(late.ok, false);
  assert.match(late.problems.join(" "), /that is not a preregistration/i);
});

test("an evaluation window opening on the training cutoff is refused at validation", () => {
  assert.equal(validateRegistration({ ...REG, evaluationOpensAt: "2026-08-10" }).ok, false);
});

test("LEAKAGE OUTRANKS EVERY OTHER RESULT", () => {
  const d = decide(REG, { ...OBS, evaluationFrom: "2026-08-01" });
  assert.equal(d.verdict, "LEAKED");
  assert.equal(d.delta, null, "no metric is reported for a leaked window — it is meaningless, not merely weak");
});

test("a missing denominator is INSUFFICIENT_COVERAGE, never 100%", () => {
  for (const eligibleRows of [undefined, null, 0, NaN]) {
    const d = decide(REG, { ...OBS, eligibleRows });
    assert.equal(d.verdict, "INSUFFICIENT_COVERAGE", `eligibleRows=${eligibleRows} was treated as full coverage`);
  }
});

test("A SAMPLE BELOW THE FROZEN MINIMUM CANNOT EARN ANYTHING, however good the metric", () => {
  const d = decide(REG, { ...OBS, decisiveRows: 100, eligibleRows: 100 });
  assert.equal(d.verdict, "INSUFFICIENT_SAMPLE");
  assert.match(d.reasons.join(" "), /frozen minimum of 2000/);
});

test("missing events are not assumed to resemble the scored ones", () => {
  const d = decide(REG, { ...OBS, decisiveRows: 6000, eligibleRows: 12000 });
  assert.equal(d.verdict, "INSUFFICIENT_COVERAGE");
  assert.match(d.reasons.join(" "), /not assumed to resemble/i);
});

test("a candidate that does not improve is REJECTED", () => {
  const d = decide(REG, { ...OBS, candidate: { brier: 0.2600 } });
  assert.equal(d.verdict, "REJECTED");
  assert.ok(d.delta < 0);
});

test("an improvement below the frozen bar is INCONCLUSIVE, not a win", () => {
  const d = decide(REG, { ...OBS, candidate: { brier: 0.2529 - 0.001 } });
  assert.equal(d.verdict, "INCONCLUSIVE");
  assert.match(d.reasons.join(" "), /below the frozen bar/);
});

test("A WINDOW SCORED BEFORE ITS TERMS WERE FIXED CANNOT EARN A PROMOTION", () => {
  /* The same numbers that earn one under PREREGISTERED. */
  const prior = decide({ ...REG, state: "PRIOR_OBSERVATION" }, OBS);
  assert.equal(prior.verdict, "INCONCLUSIVE");
  assert.match(prior.reasons.join(" "), /scored before its terms were fixed/i);
  assert.ok(prior.delta > REG.requiredImprovement, "the metric genuinely cleared the bar — the refusal is about the process, not the number");

  const pre = decide(REG, OBS);
  assert.equal(pre.verdict, "PROMOTION_EARNED");
});

test("PROMOTION_EARNED IS A RECOMMENDATION AND SAYS SO", () => {
  const d = decide(REG, OBS);
  assert.ok(isRecommendation(d.verdict));
  assert.match(d.reasons.join(" "), /separate governed act/i);
  assert.match(d.reasons.join(" "), /incumbent continues/i);
});

test("nothing else is a recommendation", () => {
  for (const v of VERDICTS.filter((x) => x !== "PROMOTION_EARNED")) {
    assert.equal(isRecommendation(v), false, `${v} must not authorise a change`);
  }
});

test("THE SAME COHORT REPRODUCES THE SAME VERDICT", () => {
  const a = decide(REG, OBS);
  const b = decide(REG, JSON.parse(JSON.stringify(OBS)));
  assert.deepEqual(a, b);
});

test("the decision reads only what it was given — no clock, no files", () => {
  /* A verdict that depended on the wall clock could differ between two runs of the same cohort. */
  const src = String(decide);
  assert.doesNotMatch(src, /Date\.now|new Date\(\)/, "decide() must not read a clock");
});

test("NOT YET IS NOT CONTAMINATED — a cohort before the window is early, not leaked", () => {
  /* The forward registration on the day it is written: the audit's cohort predates its window
     entirely. Reporting that as LEAKED would alarm an operator about a problem that does not
     exist, and both refusals would then call for the same (wrong) action. */
  const early = decide(
    { ...REG, trainingCutoff: "2026-09-05", evaluationOpensAt: "2026-09-06", registeredAt: "2026-09-05" },
    { ...OBS, evaluationFrom: "2026-08-11", evaluationTo: "2026-09-04" },
  );
  assert.equal(early.verdict, "WINDOW_NOT_OPEN");
  assert.match(early.reasons.join(" "), /nothing to score yet/i);
  assert.equal(early.delta, null, "no metric is reported for a window that has not opened");

  /* Genuine contamination still reads LEAKED. */
  const leaked = decide(REG, { ...OBS, evaluationFrom: "2026-08-01", evaluationTo: "2026-09-04" });
  assert.equal(leaked.verdict, "LEAKED");
  assert.match(leaked.reasons.join(" "), /rows it was fitted to/i);
});

test("an observation with no window at all is INVALID, not silently accepted", () => {
  assert.equal(decide(REG, { ...OBS, evaluationFrom: null }).verdict, "INVALID");
});
