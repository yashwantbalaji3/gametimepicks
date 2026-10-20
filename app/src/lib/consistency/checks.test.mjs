/**
 * Consistency gate checks. Run: npx tsx --test src/lib/consistency/checks.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CODES, SEVERITY, boxScoreChecks, crossProductLeans, discrepancy, leanContradictions, nameKeyedRows, nbaRunInvariants, nflRunInvariants,
  postLockRewrites, projectionMismatches, scenarioLeaks, surfaceVersionMix, unqualifiedAsQualified, versionMixFromSources, worldModelWorldInvariants,
} from "./checks.mjs";
import { nflOfficialSnapshot } from "./official-snapshot.mjs";
import { NFL_ID, nflBoard, nflReceipt, receiptsOf } from "./__fixtures__/synthetic.mjs";

const receipts = receiptsOf(nflReceipt());
const snap = nflOfficialSnapshot(NFL_ID, {
  receipts, playerBoard: { path: "board.json", doc: nflBoard() },
  worldModel: { path: "wm.json", doc: { model: { id: "nfl-world-model-v2", version: "2.2.0" }, run: { generatedAt: "2026-11-01T16:00:00Z", inputs: { forecastInputHash: "stale" } } } },
});

test("records carry the shared shape and a number-free fingerprint", () => {
  const d = discrepancy({ code: CODES.PROJECTION_MISMATCH, snapshot: snap, surface: "s", identity: { subjectId: "p", family: "f", field: "x" }, expected: 1.234, actual: 5.678, correction: "c" });
  for (const k of ["code", "severity", "sport", "eventId", "snapshotId", "identity", "sources", "expected", "actual", "correction", "fingerprint"]) assert.ok(k in d, k);
  assert.equal(d.fingerprint, `PROJECTION_MISMATCH|NFL|${NFL_ID}|s|p|f|x`);
  assert.doesNotMatch(d.fingerprint, /1\.234|5\.678/);
  assert.throws(() => discrepancy({ code: "MADE_UP", surface: "s" }));
});

test("PROJECTION_MISMATCH compares exact numbers within the surface's stored precision and aggregates per family", () => {
  const pairs = [
    { subjectId: "a", family: "f", field: "median", expected: 47.5, actual: 47.5 },
    { subjectId: "b", family: "f", field: "median", expected: 47.5, actual: 47.50004, tolerance: 0.5e-4 },
    { subjectId: "c", family: "f", field: "median", expected: 165.2971, actual: 208.9 },
    { subjectId: "d", family: "f", field: "median", expected: 10, actual: 11 },
    { subjectId: "e", family: "g", field: "median", expected: 1, actual: 2 },
  ];
  const out = projectionMismatches({ snapshot: snap, surface: "page", pairs, correction: "c" });
  assert.equal(out.length, 2);
  const f = out.find((d) => d.identity.family === "f");
  assert.equal(f.count, 2);
  assert.equal(f.examples[0].subjectId, "c", "largest difference first");
  assert.equal(f.expected, 165.2971); assert.equal(f.actual, 208.9);
});

test("LEAN_CONTRADICTION: reversed side is an ERROR, a side without price support a WARN, agreement nothing", () => {
  const ev = (lean) => ({ lean, withheldReasons: [] });
  const out = leanContradictions({ snapshot: snap, surface: "live", pairs: [
    { subjectId: "a", family: "f", line: 1.5, productLean: "UNDER", evaluation: ev("OVER") },
    { subjectId: "b", family: "f", line: 2.5, productLean: "UNDER", evaluation: ev("NONE") },
    { subjectId: "c", family: "f", line: 3.5, productLean: "OVER", evaluation: ev("OVER") },
    { subjectId: "d", family: "f", line: 3.5, productLean: null, evaluation: ev("OVER") },
  ], correction: "c" });
  assert.deepEqual(out.map((d) => [d.identity.field, d.severity, d.count]).sort(), [["REVERSED", SEVERITY.ERROR, 1], ["SIDE_WITHOUT_PRICE_SUPPORT", SEVERITY.WARN, 1]]);
  const cross = crossProductLeans({ snapshot: snap, entries: [{ key: "k", lean: "OVER", surface: "bank" }, { key: "k", lean: "UNDER", surface: "parlay" }, { key: "j", lean: "OVER", surface: "bank" }], correction: "c" });
  assert.equal(cross.length, 1);
  assert.equal(cross[0].surface, "bank+parlay");
});

test("SCENARIO_LEAK flags hypothetical or non-official legs in a product", () => {
  const out = scenarioLeaks({ snapshot: snap, surface: "parlay", legs: [{ subjectId: "a", family: "f", sourceRole: "OFFICIAL" }, { subjectId: "b", family: "f", sourceRole: "SUPPORTING_SIMULATION" }, { subjectId: "c", family: "g", hypothetical: true }], correction: "c" });
  assert.equal(out.length, 2);
  assert.ok(out.every((d) => d.code === CODES.SCENARIO_LEAK && d.severity === SEVERITY.ERROR));
  assert.equal(scenarioLeaks({ snapshot: snap, surface: "p", legs: [{ family: "f", sourceRole: "OFFICIAL" }] }).length, 0);
});

test("BOX_SCORE_INCONSISTENT: built-in NFL / NBA / world invariants and an injected validator", () => {
  const good = { runIndex: 1, home: 17, away: 10, overtime: false, periods: { home: [7, 0, 3, 7, 0], away: [3, 7, 0, 0, 0] }, drives: [{ score: [17, 10] }] };
  const bad = { ...good, runIndex: 2, periods: { home: [7, 0, 3, 6, 0], away: [3, 7, 0, 0, 0] }, drives: [{ score: [16, 10] }] };
  assert.deepEqual(nflRunInvariants(good), []);
  assert.equal(nflRunInvariants(bad).length, 2);
  const out = boxScoreChecks({ snapshot: snap, surface: "theater", runs: [good, bad], validator: nflRunInvariants, correction: "c" });
  assert.equal(out.length, 1); assert.equal(out[0].count, 1); assert.equal(out[0].examples[0].runIndex, 2);
  assert.throws(() => boxScoreChecks({ snapshot: snap, surface: "x", runs: [] }));
  assert.equal(boxScoreChecks({ snapshot: snap, surface: "x", runs: [good], validator: () => ["custom"], correction: "c" })[0].examples[0].violations[0], "custom");
  const p = (id, pts, threePm, twoPm, ftm) => ({ providerAthleteId: id, minutes: 48, pts, reb: 1, ast: 0, threePa: threePm, threePm, twoPm, ftm });
  const team = (pl) => ({ pts: pl.reduce((s, x) => s + x.pts, 0), reb: pl.length, ast: 0, threePa: pl.reduce((s, x) => s + x.threePa, 0), threePm: pl.reduce((s, x) => s + x.threePm, 0), twoPm: pl.reduce((s, x) => s + x.twoPm, 0), ftm: pl.reduce((s, x) => s + x.ftm, 0), fgm: pl.reduce((s, x) => s + x.threePm + x.twoPm, 0) });
  const hp = [1, 2, 3, 4, 5].map((i) => p(`h${i}`, 10, 2, 2, 0)); const ap = [1, 2, 3, 4, 5].map((i) => p(`a${i}`, 9, 1, 3, 0));
  const raw = { final: { home: 50, away: 45 }, overtimePeriods: 0, periods: [{ home: 10, away: 10 }, { home: 10, away: 10 }, { home: 15, away: 10 }, { home: 15, away: 15 }], team: { home: team(hp), away: team(ap) }, players: { home: hp, away: ap } };
  assert.deepEqual(nbaRunInvariants({ raw }), []);
  assert.ok(nbaRunInvariants({ raw: { ...raw, final: { home: 51, away: 45 } } }).length > 0);
  assert.deepEqual(worldModelWorldInvariants({ home: { points: 10, scoring: { offensiveTd: 1, extraPoints: 1, fieldGoals: 1 } } }), []);
  assert.equal(worldModelWorldInvariants({ home: { points: 11, scoring: { offensiveTd: 1, extraPoints: 1, fieldGoals: 1 } } }).length, 1);
});

test("MODEL_VERSION_MIX: a misaligned supporting source shown on a surface is an ERROR; per-family mixes are named", () => {
  const out = versionMixFromSources({ snapshot: snap, displayed: { SUPPORTING_SIMULATION: ["game-page"] }, owner: { SUPPORTING_SIMULATION: "wm" } });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, SEVERITY.ERROR); assert.equal(out[0].expected, "aaaaaaaaaaaaaaaa"); assert.equal(out[0].actual, "stale"); assert.equal(out[0].owner, "wm");
  assert.equal(versionMixFromSources({ snapshot: snap, displayed: {} })[0].severity, SEVERITY.WARN);
  const mix = surfaceVersionMix({ snapshot: snap, surface: "page", families: { player_receptions: "nfl-world-model-v2@2.2.0", anytime_td: snap.modelVersions.players.anytime_td }, officialVersions: snap.modelVersions.players, correction: "c" });
  assert.equal(mix.length, 1); assert.equal(mix[0].identity.family, "player_receptions");
});

test("POST_LOCK_REWRITE: written at/after lock, or a frozen hash that moved", () => {
  const out = postLockRewrites({ snapshot: snap, artifacts: [
    { surface: "a", generatedAt: "2026-11-01T17:59:59Z" },
    { surface: "b", generatedAt: "2026-11-01T18:00:00Z" },
    { surface: "c", generatedAt: "2026-11-01T17:00:00Z", frozenHash: "x", currentHash: "y" },
  ] });
  assert.deepEqual(out.map((d) => [d.surface, d.identity.field]), [["b", "generatedAt"], ["c", "frozenHash"]]);
});

test("UNQUALIFIED_AS_QUALIFIED and NAME_JOIN", () => {
  const u = unqualifiedAsQualified({ snapshot: snap, surface: "board", rows: [{ subjectId: "a", family: "f", presentedAs: "QUALIFIED", qualified: false, reasons: ["FAMILY_ESTIMATE"] }, { subjectId: "b", family: "f", presentedAs: "QUALIFIED", qualified: true }], correction: "c" });
  assert.equal(u.length, 1); assert.equal(u[0].count, 1); assert.equal(u[0].identity.field, "FAMILY_ESTIMATE");
  const n = nameKeyedRows({ snapshot: snap, surface: "s", rows: [{ playerId: "nfl-athlete-1", name: "A" }, { playerId: null, name: "B" }], correction: "c" });
  assert.equal(n.length, 1); assert.equal(n[0].code, CODES.NAME_JOIN);
});
