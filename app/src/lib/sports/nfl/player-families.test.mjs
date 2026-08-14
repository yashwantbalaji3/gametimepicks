/**
 * Release B guards (Program 183): four families, judged alone against bars frozen in a previous
 * commit, and REJECTED — so no per-player projection ships.
 *
 * The load-bearing property is independence. Receiving rows outnumber passing rows roughly five to
 * one, so a family passing tells you nothing about its neighbours. These tests hold that, hold the
 * contract's precedence, and hold the consequence: a rejected family may not appear as a number.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const CONTRACT_REL = "data/internal/research/nfl/contracts/player-family-contract-v1.json";
const contract = read(CONTRACT_REL);
const scorecard = read("data/internal/research/nfl/reports/player-family-scorecard.json");
const publicSummary = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/player-families-public.json"), "utf8"));
const src = fs.readFileSync(path.join(APP, "scripts/nfl/evaluate-nfl-player-families.mjs"), "utf8");

test("THE BARS PREDATE THE RESULTS, and the scorecard names the file it ran against", () => {
  assert.match(contract.declaredBefore, /before any held-out metric was computed/);
  const onDisk = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, CONTRACT_REL))).digest("hex");
  assert.equal(scorecard.contract.sha256, onDisk, "a changed contract cannot be passed off as the original");
  assert.match(src, /REFUSED: no committed player-family contract/);
});

test("EVERY FAMILY IS JUDGED ALONE — and every one of them failed", () => {
  const families = ["passing", "rushing", "receiving", "touchdowns"];
  for (const f of families) {
    const r = scorecard.families[f];
    assert.ok(r, `${f} is evaluated`);
    assert.ok(["VALIDATED", "REJECTED", "INSUFFICIENT"].includes(r.verdict), `${f}: ${r.verdict} is outside the closed set`);
    assert.ok(r.n > 0, `${f} reports its own n`);
    assert.equal(r.verdict, "REJECTED", `${f} failed its own bars`);
    assert.ok(Object.values(r.bars).some((b) => !b.pass), `${f}: a rejection must name a failing bar`);
  }
  assert.match(scorecard.independence, /promotes or fails ALONE/);
  // sample sizes really are wildly different — which is why independence matters
  assert.ok(scorecard.families.receiving.n > scorecard.families.passing.n * 3);
});

test("THE FINDING · a player's own history does not beat 'what this kind of player usually does'", () => {
  // Receiving is the sharpest version: the model is very slightly WORSE than the plain role mean.
  assert.ok(scorecard.families.receiving.metrics.improvement <= 0,
    "the receiving model did not improve on its baseline at all");
  for (const f of ["passing", "rushing"]) {
    const m = scorecard.families[f].metrics;
    assert.ok(m.improvement < 0.5, `${f}: the improvement is far short of the bar (${m.improvement})`);
  }
  assert.ok(scorecard.families.touchdowns.metrics.modelBrier > scorecard.families.touchdowns.metrics.baselineBrier,
    "the scorer model is worse than the league-wide rate");
});

test("PASSING INTERVALS WERE TOO NARROW — a separate failure from the point estimate", () => {
  const cov = scorecard.families.passing.metrics.interval80Coverage;
  assert.ok(cov < 0.70, `passing coverage ${cov} is outside the [0.70, 0.90] band`);
  // rushing shows the contrast: honest intervals, unhelpful projection. Two different failures.
  const rc = scorecard.families.rushing.metrics.interval80Coverage;
  assert.ok(rc >= 0.70 && rc <= 0.90, `rushing intervals were honest (${rc}) — its failure was the projection, not the range`);
});

test("PRESEASON IS ITS OWN COHORT — a regular-season head is not evidence here", () => {
  assert.match(scorecard.cohort, /PRESEASON only/);
  assert.match(src, /PRESEASON only — the cohort the current slate belongs to/);
  assert.match(contract.splits.preseasonSeparation, /may not be reported as evidence for a preseason projection/);
  assert.match(src, /g\.dateUtc\.slice\(0, 10\) >= LOCKED_FROM/, "the locked forward cohort is excluded by date");
});

test("ORDERED SCORER MARKETS ARE UNSUPPORTED BY CONSTRUCTION, not by omission", () => {
  for (const k of ["firstTouchdown", "lastTouchdown", "longestPlay"]) {
    assert.ok(contract.unsupportedByConstruction[k], `${k} is declared unsupported`);
  }
  assert.match(contract.unsupportedByConstruction.rule, /may never borrow an anytime-TD probability under a different label/);
  assert.deepEqual(scorecard.unsupported, contract.unsupportedByConstruction, "the scorecard carries the declaration forward verbatim");
});

test("A REJECTED FAMILY DOES NOT SHIP AS A NUMBER", () => {
  // No per-player projection artifact may exist while every family is rejected.
  const projDir = path.join(APP, "public/data/nfl/player-projections");
  assert.ok(!fs.existsSync(projDir), "no public per-player projection directory exists");
  const blob = JSON.stringify(publicSummary);
  assert.ok(!/playerId|nfl-athlete-/.test(blob), "the public summary carries no player rows");
  assert.match(publicSummary.whatItMeans, /not publishing per-player projections/);
  assert.match(contract.failureIsAnOutcome, /a lock boundary, not a reason to lower a bar/);
});

test("PUBLIC · the rejection is explained in plain words, with its denominators", () => {
  assert.equal(publicSummary.dataClass, "PUBLIC_DERIVED");
  assert.match(publicSummary.headline, /rejected every one/);
  assert.match(publicSummary.theCompetitor, /deliberately simple/);
  for (const r of publicSummary.results) {
    assert.equal(r.verdict, "REJECTED");
    assert.ok(r.n > 0, `${r.family} shows its n`);
    assert.ok(r.why.length > 40, `${r.family} explains itself`);
  }
  assert.match(publicSummary.noMarketAnyway, /no NFL player markets/);
  const blob = JSON.stringify(publicSummary);
  for (const banned of ["edge", "lock", "guaranteed", "profitable", "best bet"]) {
    assert.doesNotMatch(blob, new RegExp(`\\b${banned}\\b`, "i"), `must not say "${banned}"`);
  }
  for (const leak of ["data/internal", "PRIVATE_RESEARCH", "sha256", "contract"]) {
    assert.ok(!blob.includes(leak), `no research payload: "${leak}"`);
  }
});
