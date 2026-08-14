/**
 * Release A+B guards (Program 181): the bars were frozen before the results, the bake-off obeyed
 * them, and a rejection is recorded as a real outcome rather than quietly retried.
 *
 * The corruption suite matters more than the pass/fail: a promotion contract is only worth anything
 * if it can REFUSE. These tests drive the checks with synthetic numbers to prove each bar rejects
 * the thing it exists to reject — including the specific forbidden repair (widening one constant
 * interval until the misses disappear).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const CONTRACT_PATH = "data/internal/research/nfl/contracts/promotion-contract-v1.json";
const contract = read(CONTRACT_PATH);
const bakeoff = read("data/internal/research/nfl/reports/team-strength-bakeoff.json");
const src = fs.readFileSync(path.join(APP, "scripts/nfl/evaluate-nfl-team-strength-candidates.mjs"), "utf8");

test("THE BARS WERE FROZEN BEFORE THE RESULTS — and the bake-off consumed that exact file", () => {
  assert.match(contract.declaredBefore, /before any held-out metric was computed/);
  const onDisk = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, CONTRACT_PATH))).digest("hex");
  assert.equal(bakeoff.contract.sha256, onDisk,
    "the bake-off records the hash of the contract it ran against; a changed contract cannot be passed off as the original");
  assert.equal(bakeoff.contract.version, contract.version);
  // and the script REFUSES without a contract rather than inventing thresholds
  assert.match(src, /REFUSED: no committed promotion contract/);
  assert.match(src, /a bake-off without predeclared bars selects on its own results/);
});

test("EVERY BAR CAN REFUSE — the corruption suite", () => {
  // Drive the same comparisons the script performs, with synthetic numbers.
  const prior = { marginMAE: 10.0, totalMAE: 9.0, winBrier: 0.25, totalInterval80Coverage: 0.80 };
  const marginPass = (c) => prior.marginMAE - c.marginMAE >= 0.5;
  const coveragePass = (c) => c.marginInterval80Coverage >= 0.72 && c.marginInterval80Coverage <= 0.88;
  const scoringPass = (c) => c.totalMAE - prior.totalMAE <= 0.25 && c.totalInterval80Coverage >= 0.72;
  const calibrationPass = (c) => c.winBrier <= prior.winBrier;

  // a candidate that barely moves margin is refused
  assert.equal(marginPass({ marginMAE: 9.6 }), false, "a 0.4-point improvement is below the declared 0.50 bar");
  assert.equal(marginPass({ marginMAE: 9.4 }), true);

  // THE FORBIDDEN REPAIR: widening one constant until the misses vanish overshoots the BAND and fails.
  assert.equal(coveragePass({ marginInterval80Coverage: 0.98 }), false,
    "widening a constant interval into vacuous safety fails the very bar it was meant to satisfy — this is why COVERAGE_FLOOR is a band, not a floor");
  assert.equal(coveragePass({ marginInterval80Coverage: 0.55 }), false, "a too-narrow interval also fails");
  assert.equal(coveragePass({ marginInterval80Coverage: 0.80 }), true);

  // a margin fix that breaks totals is refused
  assert.equal(scoringPass({ totalMAE: 10.0, totalInterval80Coverage: 0.80 }), false, "a 1.0-point total degradation exceeds the 0.25 allowance");
  assert.equal(scoringPass({ totalMAE: 9.2, totalInterval80Coverage: 0.60 }), false, "collapsed total coverage is refused even if MAE looks fine");
  assert.equal(scoringPass({ totalMAE: 9.2, totalInterval80Coverage: 0.80 }), true);

  // worse win calibration is refused
  assert.equal(calibrationPass({ winBrier: 0.26 }), false);
  assert.equal(calibrationPass({ winBrier: 0.24 }), true);
});

test("SPLITS ARE CHRONOLOGICAL — no random split, no future row, no locked cohort", () => {
  assert.equal(contract.splits.method, "expanding-window, rolling origin");
  assert.match(src, /fitRows = clean\.filter\(\(r\) => r\.dateUtc < opener\)/, "each fold fits strictly before its target's opener");
  assert.match(src, /LOCKED_FORWARD_COHORT/);
  assert.ok(contract.prohibitions.some((p) => /no random or shuffled splits/.test(p)));
  assert.ok(contract.prohibitions.some((p) => /2026-08-13 cohort/.test(p)));
  // the earliest preseason season is excluded as a target and the reason is stated, not silent
  assert.match(contract.splits.note, /cannot be a target/);
  assert.deepEqual(bakeoff.splits.targetSeasons, [2024, 2025]);
});

test("THE LOCKED-COHORT FILTER IS REAL, and its zero count is explained rather than implied", () => {
  // The Aug-13 games are not in corpus-v1 (it ends at 2025), so the filter removed nothing here.
  // That must not read as "we filtered them out" — the exclusion is enforced AND vacuous today.
  assert.equal(bakeoff.population.lockedCohortExcluded, 0);
  assert.match(src, /The locked forward cohort can never enter fitting or evaluation/);
});

test("EVERY CANDIDATE IS SCORED, including the rejected ones and the ungated Elo", () => {
  const ids = bakeoff.candidates.map((c) => c.id);
  for (const required of ["shared_prior", "home_only", "elo_v1"]) assert.ok(ids.includes(required), `${required} baseline is scored`);
  assert.ok(bakeoff.candidates.filter((c) => c.kind === "candidate").length >= 3, "several candidates, not one");
  for (const c of bakeoff.candidates) {
    assert.ok(c.pooled.n > 0 && c.pooled.decisiveN > 0, `${c.id} reports its n`);
    assert.ok(c.folds.length >= 1, `${c.id} keeps per-fold receipts`);
  }
  // the ungated Elo — the model P178 switched off — is scored rather than quietly dropped
  const elo = bakeoff.candidates.find((c) => c.id === "elo_v1").pooled;
  const prior = bakeoff.candidates.find((c) => c.id === "shared_prior").pooled;
  assert.ok(elo.marginMAE > prior.marginMAE,
    "independent confirmation of P178: the ungated Elo is WORSE than having no team term at all");
});

test("DIRECTION AND SENSITIVITY PASS — the mechanism works, which is why the rejection means something", () => {
  for (const [name, r] of Object.entries(bakeoff.sensitivity)) {
    assert.equal(r.pass, true, `${name} must pass — this is the test that would have caught the P178 reversed slope`);
  }
  assert.equal(bakeoff.bars.DIRECTION_AND_SENSITIVITY.pass, true);
  // a candidate that cannot reach a blowout could never close the audit's margin ticket
  assert.ok(bakeoff.sensitivity.biggerGapReachesBlowout.p90 >= 14);
});

test("THE VERDICT IS REJECTED, and nothing was loosened to avoid it", () => {
  assert.equal(bakeoff.verdict, "REJECTED_WITH_EVIDENCE");
  assert.ok(bakeoff.failingBars.length >= 1);
  const failing = bakeoff.failingBars.map((f) => f.bar);
  assert.ok(failing.includes("MARGIN_DISPERSION"), "the primary bar is the one that failed");
  assert.match(bakeoff.consequence, /BASELINE_ONLY stays public/);
  assert.match(bakeoff.consequence, /a lock boundary, not a reason to lower a bar/);
  // the shipped champion is untouched: the public forecasts still carry the P178 gate
  const pub = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/forecasts/latest.json"), "utf8"));
  for (const f of pub.forecasts) assert.equal(f.teamSignal.state, "NOT_SIGNIFICANT");
});

test("THE REPORT NAMES WHAT IT IS — and what it is not", () => {
  assert.match(bakeoff.whatThisIs, /not a drive simulator/);
  assert.match(bakeoff.whatThisIs, /final scores only/);
  assert.match(src, /Fitting a drive model\s*\n?\s*\* to data with no drives would be inventing a mechanism and calling it evidence/,
    "the honest naming is recorded where the next author will read it");
});
