/**
 * Stage 3C — historical NFL winner semantics (founder Q4 HIGHER). Fixtures and invariants only: no live total is
 * pinned. The two real games are copied from their frozen receipts (CIN @ PIT 2026-09-27, LAR @ PHI 2026-10-04).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CORRECTION_SCHEMA, HISTORICAL_MODEL_FAVORED_LABEL, NFL_WINNER_BASIS, indexCorrections, nflModelFavored,
  nflWinnerForecast, nflWinnerGrade, pendingCorrections, winnerOfRecord,
} from "./nfl-model-favored.mjs";
import { OUTCOME, SIDE_BASIS, outcomeOf, recordBasis, tally } from "./forecast-of-record.mjs";
import { compareLedgers } from "../forecast-ledger/append-only.mjs";
import { nflGameRows } from "../forecast-ledger/adapters/nfl.mjs";

// Frozen receipts (values as published). PIT and PHI are home.
const CIN_AT_PIT = { home: 0.4963, away: 0.4747, tieMass: 0.029 };
const LAR_AT_PHI = { home: 0.4887, away: 0.4803, tieMass: 0.031 };

test("Q4 HIGHER: the model-favored team is the higher frozen win probability, even below 50% (PIT 49.63 vs CIN 47.47)", () => {
  assert.deepEqual(nflModelFavored(CIN_AT_PIT), { side: "HOME", basis: SIDE_BASIS.HISTORICAL_MODEL_FAVORED });
  assert.equal(nflModelFavored(LAR_AT_PHI).side, "HOME");
  assert.equal(nflModelFavored({ home: 0.31, away: 0.66, tieMass: 0.03 }).side, "AWAY");
});

test("the old P(home) > 0.5 rule is gone: both real games swap, the aggregate can stay the same", () => {
  const pit = nflWinnerGrade({ winProbability: CIN_AT_PIT, actual: { home: 30, away: 27 } });
  const phi = nflWinnerGrade({ winProbability: LAR_AT_PHI, actual: { home: 20, away: 24 } });
  assert.deepEqual([pit.modelFavoured, pit.correct], ["HOME", true]);
  assert.deepEqual([phi.modelFavoured, phi.correct], ["HOME", false]);
  // Old rule: CIN (loss) and LAR (win). One win and one loss either way: rows swap, the total does not move.
  assert.equal([pit, phi].filter((g) => g.correct).length, 1);
});

test("an exact tie between the teams is no side (never HOME), and a tie GAME is void, never a loss", () => {
  const even = nflWinnerGrade({ winProbability: { home: 0.485, away: 0.485, tieMass: 0.03 }, actual: { home: 21, away: 17 } });
  assert.deepEqual([even.modelFavoured, even.correct], ["EVEN", null]);
  const tieGame = nflWinnerGrade({ winProbability: CIN_AT_PIT, actual: { home: 20, away: 20 } });
  assert.deepEqual([tieGame.outcome, tieGame.correct], ["TIE", null]);
  assert.equal(outcomeOf(nflWinnerForecast({ providerEventId: "1", winProbability: CIN_AT_PIT, actual: { home: 20, away: 20 } })), OUTCOME.VOID);
  assert.equal(outcomeOf(nflWinnerForecast({ providerEventId: "1", winProbability: CIN_AT_PIT })), OUTCOME.PENDING);
});

test("the side is read from the frozen receipt only: changing the final never changes the model-favored team", () => {
  for (const actual of [{ home: 30, away: 27 }, { home: 3, away: 40 }]) {
    assert.equal(nflWinnerGrade({ winProbability: CIN_AT_PIT, actual }).modelFavoured, "HOME");
  }
});

test("label: a model-favored record is 'historical model-favored winner accuracy', never 'our pick'", () => {
  const rows = [
    nflWinnerForecast({ providerEventId: "1", winProbability: CIN_AT_PIT, actual: { home: 30, away: 27 } }),
    nflWinnerForecast({ providerEventId: "2", winProbability: LAR_AT_PHI, actual: { home: 20, away: 24 } }),
  ];
  const t = tally(rows);
  assert.deepEqual([t.win, t.loss], [1, 1]);
  assert.equal(recordBasis(t), SIDE_BASIS.HISTORICAL_MODEL_FAVORED);
  assert.equal(HISTORICAL_MODEL_FAVORED_LABEL, "historical model-favored winner accuracy");
  assert.equal(NFL_WINNER_BASIS, "HISTORICAL_MODEL_FAVORED");
});

test("3D seam: a frozen published side or TOO_CLOSE wins over the historical rule", () => {
  const pub = nflWinnerGrade({ winProbability: CIN_AT_PIT, actual: { home: 30, away: 27 }, publishedSide: "AWAY" });
  assert.deepEqual([pub.modelFavoured, pub.correct, pub.sideBasis], ["AWAY", false, SIDE_BASIS.PUBLISHED]);
  const abstain = nflWinnerGrade({ winProbability: CIN_AT_PIT, actual: { home: 30, away: 27 }, publishedSide: "TOO_CLOSE" });
  assert.deepEqual([abstain.modelFavoured, abstain.correct, abstain.sideBasis], ["EVEN", null, SIDE_BASIS.TOO_CLOSE]);
});

/* ── append-only correction ─────────────────────────────────────────────────────────────────────── */

const event = (id, wp, actual, stored) => ({
  ev: { providerEventId: id, canonicalEventId: `nfl-${id}`, matchup: "A @ H", kickoffUtc: "2026-09-27T17:00Z",
    lineage: { receiptFile: `r/${id}.json` }, grade: { actual: { ...actual, tie: actual.home === actual.away }, winner: stored } },
  receipt: { forecastSummary: { winProbability: wp } },
});
const OLD_PIT = { outcome: "HOME", modelFavoured: "AWAY", correct: false };
const pitEvent = event("401872950", CIN_AT_PIT, { home: 30, away: 27 }, OLD_PIT);
const okEvent = event("9", { home: 0.7, away: 0.27, tieMass: 0.03 }, { home: 24, away: 10 }, { outcome: "HOME", modelFavoured: "HOME", correct: true });
const log = (entries, file = "data/internal/nfl/winner-corrections/a.json") => ({ file, doc: { schemaVersion: CORRECTION_SCHEMA, correctionId: "a", entries } });

test("an old-rule grade with no restatement is refused (no reader can carry the old rule silently)", () => {
  assert.throws(() => winnerOfRecord(pitEvent.ev, pitEvent.receipt, new Map()), /breaks the rule/);
});

test("pendingCorrections lists exactly the old-rule grades; the log restates them; stored grades are untouched", () => {
  const entries = pendingCorrections([{ ...pitEvent, event: pitEvent.ev, gradedIn: "x.json" }, { event: okEvent.ev, receipt: okEvent.receipt, gradedIn: "y.json" }]);
  assert.deepEqual(entries.map((e) => e.providerEventId), ["401872950"]);
  assert.deepEqual(entries[0].before, { modelFavoured: "AWAY", correct: false, rule: "P(home) > 0.5 else away" });
  assert.equal(entries[0].after.modelFavoured, "HOME");
  const idx = indexCorrections([log(entries)]);
  const before = JSON.stringify(pitEvent.ev);
  const { winner, correction } = winnerOfRecord(pitEvent.ev, pitEvent.receipt, idx);
  assert.deepEqual([winner.modelFavoured, winner.correct, winner.sideBasis], ["HOME", true, NFL_WINNER_BASIS]);
  assert.equal(correction.before.modelFavoured, "AWAY");
  assert.equal(JSON.stringify(pitEvent.ev), before, "the stored grade is never mutated");
  assert.equal(pendingCorrections([{ event: pitEvent.ev, receipt: pitEvent.receipt, gradedIn: "x" }], idx).length, 0, "restated once, never again");
});

test("a restatement the rule does not reproduce, a stale one, or two that disagree are refused", () => {
  const wrong = indexCorrections([log([{ providerEventId: "401872950", before: {}, after: { modelFavoured: "AWAY", correct: false } }])]);
  assert.throws(() => winnerOfRecord(pitEvent.ev, pitEvent.receipt, wrong), /does not reproduce/);
  const stale = indexCorrections([log([{ providerEventId: "9", before: {}, after: { modelFavoured: "HOME", correct: true } }])]);
  assert.throws(() => winnerOfRecord(okEvent.ev, okEvent.receipt, stale), /already follows the rule/);
  assert.throws(() => indexCorrections([
    log([{ providerEventId: "1", after: { modelFavoured: "HOME", correct: true } }], "a.json"),
    log([{ providerEventId: "1", after: { modelFavoured: "AWAY", correct: false } }], "b.json"),
  ]), /restated differently/);
});

/* ── Forecast Ledger ────────────────────────────────────────────────────────────────────────────── */

const receiptFor = (id, wp) => ({
  providerEventId: id, canonicalEventId: `nfl-${id}`, kickoffUtc: "2026-09-27T17:00:00Z", generatedAt: "2026-09-27T15:00:00Z",
  matchup: "CIN @ PIT", home: { abbr: "PIT" }, away: { abbr: "CIN" }, model: { id: "m", version: 1 },
  forecastSummary: { winProbability: wp, total: { median: 44, p10: 30, p90: 58 }, margin: { median: 1, p10: -12, p90: 14 }, projectedScore: { home: 22, away: 21 } },
});

test("ledger: the winner row grades the model-favored team, names the basis, and notes the restatement", () => {
  const ev = { ...pitEvent.ev, lineage: { ...pitEvent.ev.lineage, forecastGeneratedAt: "2026-09-27T15:00:00Z", receiptFile: "r/401872950.json" } };
  const settledEvents = [{ event: ev, receipt: receiptFor("401872950", CIN_AT_PIT) }];
  assert.throws(() => nflGameRows({ settledEvents, now: "2026-10-07T00:00:00Z" }), /breaks the rule/);
  const idx = indexCorrections([log(pendingCorrections([{ event: ev, receipt: settledEvents[0].receipt, gradedIn: "x" }]))]);
  const w = nflGameRows({ settledEvents, now: "2026-10-07T00:00:00Z", winnerCorrections: idx }).find((r) => r.family === "nfl_game_winner");
  assert.equal(w.measurement.directionalResult, "WIN");
  assert.equal(w.measurement.directionalBasis, NFL_WINNER_BASIS);
  assert.equal(w.categoryPrediction, "AWAY", "the immutable P(home) bucket is not rewritten");
  assert.ok(w.provenance.notes.some((n) => n.startsWith("winner grade restated by")));
});

test("append-only guard: a directional flip on an unchanged settlement needs a committed restatement", () => {
  const row = { forecastId: "fl1-0000000000000001", publicationStatus: "PUBLISHED", settlement: { state: "SETTLED", finalValue: 1, finalCategory: "HOME" }, measurement: { directionalResult: "LOSS", directionalBasis: "HIGHER_WIN_PROBABILITY_SIDE" } };
  const flipped = { ...row, measurement: { directionalResult: "WIN", directionalBasis: NFL_WINNER_BASIS } };
  assert.deepEqual(compareLedgers([row], [flipped]).map((v) => v.kind), ["DIRECTIONAL_REWRITTEN"]);
  assert.deepEqual(compareLedgers([row], [flipped], { directionalRestated: new Set([row.forecastId]) }), []);
  const renamed = { ...row, measurement: { directionalResult: "LOSS", directionalBasis: NFL_WINNER_BASIS } };
  assert.deepEqual(compareLedgers([row], [renamed]), [], "a basis rename alone is not a rewrite");
});
