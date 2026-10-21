/**
 * NBA Top Board grading + append-only ledger + daily report (SYNTHETIC fixtures, clearly marked).
 * Run (from app/): node --test src/lib/sports/nba/top-board-grading.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { freezeBoards } from "./top-boards.mjs";
import {
  GRADE_REASON, PROJECTION_STATUS, SETTLEMENT, actualStat, appendGrades, boardRows, emptyGradesLedger, gradeBoardRow, ledgerAppendOnlyViolations, settleAgainstLine,
} from "./top-board-grading.mjs";
import { buildDailyReport, reportMarkdown } from "./top-board-report.mjs";
import { artifact, boxscore, FIXTURE_NOTE, game, player, SHA } from "./__fixtures__/top-board-fixtures.mjs";

const doc = freezeBoards({
  existing: null, sourceSha256: SHA, frozenAt: "2026-11-01T16:00:00Z", family: "v0.1", date: "2026-11-01",
  artifact: artifact([game("fx-1", { home: [player(1, { pts: 20 }), player(2, { pts: 15 }), player(3, { pts: 10 })], away: [player(4, { pts: 8 })] })]),
}).doc;
const row = (id, cat = "points") => boardRows(doc).find((r) => r.player.providerAthleteId === String(id) && r.category === cat);

test("fixtures are labelled synthetic", () => {
  assert.match(FIXTURE_NOTE, /SYNTHETIC FIXTURE/);
  assert.equal(boxscore("fx-1", []).fixture, FIXTURE_NOTE);
});

test("played, no line → settlement UNGRADABLE (NO_RECORDED_LINE) while projection accuracy is graded", () => {
  const g = gradeBoardRow(row(1), { boxscore: boxscore("fx-1", [{ id: 1, minutes: 33, pts: 26 }]) });
  assert.deepEqual([g.settlement.status, g.settlement.reason], [SETTLEMENT.UNGRADABLE, GRADE_REASON.NO_RECORDED_LINE]);
  assert.equal(g.projectionStatus, PROJECTION_STATUS.GRADED);
  assert.equal(g.accuracy.actual, 26);
  assert.equal(g.accuracy.errorP50, -6, "forecast − actual");
  assert.equal(g.accuracy.absErrorP50, 6);
  assert.equal(g.accuracy.inside80, 1, "26 inside 12–28");
  assert.equal(g.accuracy.atOrAboveP50, 1);
  assert.equal(g.accuracy.minutesError, -3);
});

test("VOID: DNP (coach's decision), not in the box score (late scratch), postponed — never a loss", () => {
  const dnp = gradeBoardRow(row(1), { boxscore: boxscore("fx-1", [{ id: 1, didNotPlay: true, dnpReason: "COACH'S DECISION" }]) });
  assert.deepEqual([dnp.settlement.status, dnp.settlement.reason, dnp.settlement.detail, dnp.projectionStatus], [SETTLEMENT.VOID, GRADE_REASON.DNP, "COACH'S DECISION", PROJECTION_STATUS.VOID]);
  const scratch = gradeBoardRow(row(1), { boxscore: boxscore("fx-1", [{ id: 99 }]) });
  assert.deepEqual([scratch.settlement.status, scratch.settlement.reason], [SETTLEMENT.VOID, GRADE_REASON.NOT_IN_BOXSCORE]);
  const pp = gradeBoardRow(row(1), { boxscore: null, gameStatus: "STATUS_POSTPONED" });
  assert.deepEqual([pp.settlement.status, pp.settlement.reason], [SETTLEMENT.VOID, GRADE_REASON.GAME_POSTPONED]);
});

test("PENDING: no box score, or a box score that is not final — never a loss", () => {
  for (const b of [null, boxscore("fx-1", [{ id: 1, pts: 3 }], { status: "STATUS_IN_PROGRESS" }), boxscore("fx-1", [], { available: false })]) {
    const g = gradeBoardRow(row(1), { boxscore: b });
    assert.deepEqual([g.settlement.status, g.projectionStatus, g.accuracy], [SETTLEMENT.PENDING, PROJECTION_STATUS.PENDING, null]);
  }
});

test("a played row with a null actual is UNGRADABLE (data quality), not a zero", () => {
  const b = boxscore("fx-1", [{ id: 1 }]); b.players[0].pts = null;
  const g = gradeBoardRow(row(1), { boxscore: b });
  assert.deepEqual([g.settlement.status, g.settlement.reason, g.accuracy], [SETTLEMENT.UNGRADABLE, GRADE_REASON.NULL_ACTUAL, null]);
});

test("joint boards (PRA, P+R, P+A) grade against the SUM of the box-score components; a missing component is null, never a partial sum", () => {
  const box = boxscore("fx-1", [{ id: 1, minutes: 33, pts: 26, reb: 7, ast: 5 }]);
  assert.equal(gradeBoardRow(row(1, "pra"), { boxscore: box }).accuracy.actual, 38);
  assert.equal(gradeBoardRow(row(1, "ptsReb"), { boxscore: box }).accuracy.actual, 33);
  assert.equal(gradeBoardRow(row(1, "ptsAst"), { boxscore: box }).accuracy.actual, 31);
  assert.equal(row(1, "pra").marketBasis, "JOINT_SIMULATED_SUM");
  assert.deepEqual(row(1, "pra").components, ["pts", "reb", "ast"]);
  const gap = boxscore("fx-1", [{ id: 1, minutes: 33, pts: 26, reb: 7, ast: 5 }]); gap.players[0].reb = null;
  assert.equal(actualStat(gap.players[0], "pra"), null);
  const g = gradeBoardRow(row(1, "pra"), { boxscore: gap });
  assert.deepEqual([g.settlement.status, g.settlement.reason], [SETTLEMENT.UNGRADABLE, GRADE_REASON.NULL_ACTUAL]);
  assert.equal(actualStat(gap.players[0], "pts"), 26, "marginal stats read directly");
});

test("line settlement vocabulary exists (WIN/LOSS/PUSH) but needs a recorded line AND side", () => {
  assert.equal(settleAgainstLine({ line: 20.5, side: "OVER", actual: 21 }).status, SETTLEMENT.WIN);
  assert.equal(settleAgainstLine({ line: 20.5, side: "OVER", actual: 20 }).status, SETTLEMENT.LOSS);
  assert.equal(settleAgainstLine({ line: 20.5, side: "UNDER", actual: 20 }).status, SETTLEMENT.WIN);
  assert.equal(settleAgainstLine({ line: 20, side: "UNDER", actual: 20 }).status, SETTLEMENT.PUSH);
  assert.deepEqual(settleAgainstLine({ line: null, side: "OVER", actual: 20 }), { status: SETTLEMENT.UNGRADABLE, reason: GRADE_REASON.NO_RECORDED_LINE });
  assert.deepEqual(settleAgainstLine({ line: 20.5, side: null, actual: 20 }), { status: SETTLEMENT.UNGRADABLE, reason: GRADE_REASON.NO_SIDE });
  // and no frozen row can reach it: every row's line is null
  for (const r of boardRows(doc)) assert.equal(r.marketLine, null);
});

test("ledger is append-only: INITIAL → identical re-grade appends nothing → PENDING_RESOLVED → CORRECTION with lineage", () => {
  const r1 = row(1);
  const pending = { ...gradeBoardRow(r1, { boxscore: null }), date: "2026-11-01", edition: 1 };
  const a = appendGrades(emptyGradesLedger({ family: "v0.1" }), [pending], { gradedAt: "2026-11-02T08:00:00Z" });
  assert.deepEqual(a.appended.map((e) => e.lineageReason), ["INITIAL"]);
  const same = appendGrades(a.ledger, [pending], { gradedAt: "2026-11-02T09:00:00Z" });
  assert.equal(same.appended.length, 0);
  const played = { ...gradeBoardRow(r1, { boxscore: boxscore("fx-1", [{ id: 1, pts: 18 }]) }), date: "2026-11-01", edition: 1 };
  const b = appendGrades(a.ledger, [played], { gradedAt: "2026-11-02T10:00:00Z" });
  assert.deepEqual([b.appended[0].lineageReason, b.appended[0].supersedes], ["PENDING_RESOLVED", 1]);
  const corrected = { ...gradeBoardRow(r1, { boxscore: boxscore("fx-1", [{ id: 1, pts: 19 }]) }), date: "2026-11-01", edition: 1 };
  const c = appendGrades(b.ledger, [corrected], { gradedAt: "2026-11-03T10:00:00Z" });
  assert.deepEqual([c.appended[0].lineageReason, c.appended[0].supersedes, c.appended[0].seq], ["CORRECTION", 2, 3]);
  assert.deepEqual(ledgerAppendOnlyViolations({ before: b.ledger, after: c.ledger }), []);
  assert.equal(a.ledger.entries.length, 1, "inputs are never mutated");
  const edited = JSON.parse(JSON.stringify(c.ledger)); edited.entries[0].settlement.status = "LOSS";
  assert.match(ledgerAppendOnlyViolations({ before: c.ledger, after: edited }).join(), /entry seq 1 was edited/);
  assert.match(ledgerAppendOnlyViolations({ before: c.ledger, after: { entries: c.ledger.entries.slice(1) } }).join(), /entries removed/);
});

test("daily report: 15 sections; W/L/P 0 with the reason; VOID out of denominators; PENDING not a miss; calibration below prereg n is descriptive only", () => {
  const box = boxscore("fx-1", [
    { id: 1, minutes: 34, pts: 30, reb: 6, ast: 4, threePm: 2 },
    { id: 2, didNotPlay: true, dnpReason: "COACH'S DECISION" },
    { id: 3, minutes: 28, pts: 4, reb: 6, ast: 4, threePm: 2 },
    { id: 4, minutes: 30, pts: 8, reb: 6, ast: 4, threePm: 2, team: "18" },
    { id: 77, minutes: 31, pts: 12, team: "18" }, // played big minutes, never simulated
  ]);
  const grades = boardRows(doc).map((r) => ({ ...gradeBoardRow(r, { boxscore: box }), date: doc.date, edition: r.edition }));
  const { ledger } = appendGrades(emptyGradesLedger({ family: "v0.1" }), grades, { gradedAt: "2026-11-02T08:00:00Z" });
  const fa = artifact([game("fx-1", { home: [player(1), player(2), player(3)], away: [player(4)] })]);
  const rep = buildDailyReport({ date: "2026-11-01", family: "v0.1", generatedAt: "2026-11-02T09:00:00Z", boardDoc: doc, ledger, forecastArtifact: fa, boxscoreOf: () => box });
  const sections = Object.keys(rep).filter((k) => /^s\d\d_/.test(k));
  assert.equal(sections.length, 15);
  assert.deepEqual([rep.s05_settlement.counts.WIN, rep.s05_settlement.counts.LOSS, rep.s05_settlement.counts.PUSH], [0, 0, 0]);
  assert.match(rep.s05_settlement.note, /no line is recorded/);
  assert.equal(rep.s05_settlement.counts.VOID, 7, "player 2 on seven boards (four marginal + PRA, P+R, P+A)");
  const pts = rep.s08_accuracy.points.day;
  assert.equal(pts.graded, 3, "VOID excluded from the denominator");
  assert.equal(pts.maeP50, 5.333, "(|20-30| + |10-4| + |8-8|) / 3");
  assert.equal(rep.s09_largestMisses[0].player, "Fixture Player 3");
  assert.equal(rep.s10_largestPositiveDeviations[0].player, "Fixture Player 1");
  assert.equal(rep.s11_availabilitySurprises.predictedButVoid.length, 7);
  assert.deepEqual(rep.s11_availabilitySurprises.playedButUnpredicted.map((p) => p.player), ["Fixture Player 77"]);
  assert.equal(rep.s14_calibration.points.cumulative.state, "DESCRIPTIVE_ONLY");
  assert.match(rep.s14_calibration.points.cumulative.warning, /below the preregistered minimum 1500/);
  assert.equal(rep.s14_calibration.threes.cumulative.preregMinN, 800);
  // joint boards: graded on the component sum; no preregistered bar → its own state, never a claim
  assert.equal(rep.s08_accuracy.pra.day.graded, 3);
  assert.equal(rep.s14_calibration.pra.cumulative.state, "NO_PREREGISTERED_BAR");
  assert.equal(rep.s14_calibration.pra.cumulative.preregMinN, null);
  assert.match(rep.s14_calibration.ptsAst.cumulative.warning, /no preregistered sample size or coverage band/);
  const md = reportMarkdown(rep);
  for (let i = 1; i <= 15; i += 1) assert.match(md, new RegExp(`^## ${i}\\. `, "m"), `markdown section ${i}`);
  assert.doesNotMatch(md, /hit rate/i);
});

test("daily report on a day with no frozen board says so (never back-filled)", () => {
  const rep = buildDailyReport({ date: "2026-11-05", family: "v0.1", generatedAt: "2026-11-06T09:00:00Z", boardDoc: null, ledger: emptyGradesLedger({ family: "v0.1" }) });
  assert.equal(rep.s03_rowsPublishedPrivate.total, 0);
  assert.equal(rep.s13_dataQuality[0].issue, "NO_BOARD_FROZEN");
});
