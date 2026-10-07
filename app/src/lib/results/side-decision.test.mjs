/**
 * Stage 3D — the frozen pregame side decision (founder Q3 YES). Fixtures and invariants only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SIDE_DECISION_SCHEMA, SIDE_RULE, TOO_CLOSE, freezeSideDecision, validateSideDecision } from "./side-decision.mjs";
import { SIDE_PROBLEM, nflReceiptWinnerGrade, nflSideInput, winnerOfRecord } from "./nfl-model-favored.mjs";
import { SIDE_BASIS } from "./forecast-of-record.mjs";
import { buildGradedRecord } from "../sports/graded-picks.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const freeze = (HOME, AWAY, extra = {}) => freezeSideDecision({ sideProbabilities: { HOME, AWAY, TIE: 0.03 }, sides: ["HOME", "AWAY"], rule: SIDE_RULE.MODEL_FAVORED_V1, frozenAt: "2026-10-11T15:00:00Z", ...extra });

test("the rule freezes the higher side; both teams under 50% is NOT too close (no threshold in Stage 3)", () => {
  const d = freeze(0.4963, 0.4747);
  assert.deepEqual(d, { schemaVersion: SIDE_DECISION_SCHEMA, publishedSide: "HOME", rule: SIDE_RULE.MODEL_FAVORED_V1, abstention: null, frozenAt: "2026-10-11T15:00:00Z" });
  assert.equal(freeze(0.31, 0.66).publishedSide, "AWAY");
});

test("TOO_CLOSE only when there is no side at all (equal probabilities); an abstention rule is a founder gate", () => {
  assert.equal(freeze(0.485, 0.485).publishedSide, TOO_CLOSE);
  assert.throws(() => freeze(0.5, 0.47, { abstention: { id: "band-0.02" } }), /founder gate/);
  assert.throws(() => freeze(0.5, 0.47, { rule: "BOTH_UNDER_HALF" }), /unknown side rule/);
  assert.throws(() => freeze(0.5, null), /frozen probability/);
});

test("validation: a decision frozen at/after the start, with an unknown side, or an adopted-looking abstention is refused", () => {
  const d = freeze(0.6, 0.37);
  assert.deepEqual(validateSideDecision(d, { sides: ["HOME", "AWAY"], startUtc: "2026-10-11T17:00:00Z" }), []);
  assert.ok(validateSideDecision(d, { sides: ["HOME", "AWAY"], startUtc: "2026-10-11T15:00:00Z" }).includes("frozen at or after the start"));
  assert.ok(validateSideDecision({ ...d, publishedSide: "DRAW" }, { sides: ["HOME", "AWAY"] }).length > 0);
  assert.ok(validateSideDecision({ ...d, abstention: { id: "x" } }, { sides: ["HOME", "AWAY"] }).length > 0);
});

/* ── Results reads the frozen side, never re-derives it ─────────────────────────────────────────── */

const CUTOVER = "2026-10-08T12:00:00Z";
const receipt = (o) => ({ generatedAt: "2026-10-11T15:00:00Z", kickoffUtc: "2026-10-11T17:00:00Z", forecastSummary: { winProbability: { home: 0.4963, away: 0.4747, tieMass: 0.029 } }, ...o });

test("after the cutover the frozen side is graded as frozen, even against the probabilities", () => {
  // A side frozen AWAY on a home-favored distribution is graded AWAY: the reader does not second-guess what was frozen.
  const r = receipt({ sideDecision: { ...freeze(0.4963, 0.4747), publishedSide: "AWAY" } });
  const g = nflReceiptWinnerGrade(r, { home: 30, away: 27 }, { cutoverAt: CUTOVER });
  assert.deepEqual([g.modelFavoured, g.correct, g.sideBasis], ["AWAY", false, SIDE_BASIS.PUBLISHED]);
});

test("a frozen TOO_CLOSE is NO_PICK: never a loss, never a win", () => {
  const r = receipt({ sideDecision: freeze(0.485, 0.485) });
  const g = nflReceiptWinnerGrade(r, { home: 30, away: 27 }, { cutoverAt: CUTOVER });
  assert.deepEqual([g.correct, g.sideBasis], [null, SIDE_BASIS.TOO_CLOSE]);
});

test("a post-cutover receipt with no side decision has NO side: the historical rule never reaches a forward forecast", () => {
  const r = receipt({});
  assert.deepEqual(nflSideInput(r, { cutoverAt: CUTOVER }), { publishedSide: null, historical: false, problem: SIDE_PROBLEM.MISSING_SIDE_DECISION });
  const g = nflReceiptWinnerGrade(r, { home: 30, away: 27 }, { cutoverAt: CUTOVER });
  assert.deepEqual([g.correct, g.sideProblem], [null, SIDE_PROBLEM.MISSING_SIDE_DECISION]);
  // the same receipt BEFORE the cutover is historical (Q4)
  const old = receipt({ generatedAt: "2026-10-04T15:00:00Z" });
  assert.equal(nflSideInput(old, { cutoverAt: CUTOVER }).historical, true);
  assert.equal(nflSideInput(old, { cutoverAt: null }).historical, true);
});

test("a side frozen after kickoff is invalid and grades nothing", () => {
  const r = receipt({ sideDecision: { ...freeze(0.6, 0.37), frozenAt: "2026-10-11T18:00:00Z" } });
  assert.equal(nflSideInput(r, { cutoverAt: CUTOVER }).problem, SIDE_PROBLEM.INVALID_SIDE_DECISION);
});

test("winnerOfRecord accepts a settler grade that follows the frozen side, and refuses one that re-derived a side", () => {
  const r = receipt({ sideDecision: freeze(0.4963, 0.4747) });
  const ev = (winner) => ({ providerEventId: "77", grade: { actual: { home: 30, away: 27, tie: false }, winner } });
  assert.equal(winnerOfRecord(ev({ outcome: "HOME", modelFavoured: "HOME", correct: true }), r, new Map(), { cutoverAt: CUTOVER }).winner.sideBasis, SIDE_BASIS.PUBLISHED);
  assert.throws(() => winnerOfRecord(ev({ outcome: "HOME", modelFavoured: "AWAY", correct: false }), r, new Map(), { cutoverAt: CUTOVER }), /breaks the rule/);
});

/* ── a record never pools two bases ─────────────────────────────────────────────────────────────── */

test("graded record: historical and frozen-side picks are split, a mixed record has no pooled rate, TOO_CLOSE is no pick", () => {
  const p = (basis, hit, extra = {}) => ({ basis, hit, ...extra });
  const rec = buildGradedRecord({ sport: "nfl", label: "NFL", what: "x", picks: [
    p("HISTORICAL_MODEL_FAVORED", true), p("HISTORICAL_MODEL_FAVORED", false), p("PUBLISHED", true),
    p("TOO_CLOSE", null, { noPick: true }), p("HISTORICAL_MODEL_FAVORED", null),
  ] });
  assert.equal(rec.recordBasis, "MIXED");
  assert.equal(rec.hitRate, null, "no pooled rate across bases");
  assert.deepEqual(rec.byBasis.map((b) => [b.basis, b.hits, b.misses]), [["HISTORICAL_MODEL_FAVORED", 1, 1], ["PUBLISHED", 1, 0]]);
  assert.deepEqual([rec.counts.voided, rec.counts.noPick], [1, 1], "a TOO_CLOSE is a no-pick, a tie is a void, neither a miss");
  const single = buildGradedRecord({ sport: "nfl", label: "NFL", what: "x", picks: [p("HISTORICAL_MODEL_FAVORED", true)] });
  assert.equal(single.recordBasis, "HISTORICAL_MODEL_FAVORED");
});

test("the NFL producer freezes the side through the one helper and never re-derives one from probabilities", () => {
  const src = fs.readFileSync(path.resolve(HERE, "../../../scripts/nfl/build-nfl-public-forecasts.mjs"), "utf8");
  assert.match(src, /freezeSideDecision\(/);
  assert.match(src, /markSideCutover\(forecast\);\s*fs\.writeFileSync\(revPath/);
  assert.match(src, /markSideCutover\(forecast\);\s*fs\.writeFileSync\(receiptPath/);
});
