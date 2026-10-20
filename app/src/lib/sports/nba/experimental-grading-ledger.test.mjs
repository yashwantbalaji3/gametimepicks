/**
 * Grader v2 — finals source, overtime, stat corrections, APPEND-ONLY ledger (SYNTHETIC fixtures, clearly marked) plus
 * guards over the COMMITTED data (historical OT agreement; every committed experimental ledger's lineage).
 *
 * Run (from app/): npx tsx --test src/lib/sports/nba/experimental-grading-ledger.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  finalLookup, overtimeFromBoxscore, resolveOvertime, periodsFromSummary, boxscoreContentHash, diffBoxscores, recheckDue,
  emptyExperimentalLedger, upgradeLedger, appendGameResults, appendBoxscoreCheck, latestCorrection, currentGrades, currentGradeEntries,
  experimentalLedgerAppendOnlyViolations, restDaysFor, boxscorePointsCheck, LINEAGE, CORRECTION_CAUSE, GRADER_VERSION, currentEntriesAnySchema, ledgerText, gradeKey,
} from "./experimental-grading-ledger.mjs";
import { FAMILIES } from "./experimental-forecast.mjs";
import { FIXTURE_NOTE, finalsRecord, boxDoc, boxRow, graded, HOME, AWAY } from "./__fixtures__/nba-grading-fixtures.mjs";

const REPO = path.resolve(process.cwd(), "..");
const NBA = path.join(REPO, "data", "internal", "research", "nba");
const spec = FAMILIES["v0.1"];

test("fixtures are labelled synthetic", () => { assert.match(FIXTURE_NOTE, /SYNTHETIC FIXTURE/); assert.equal(boxDoc("x").fixture, FIXTURE_NOTE); });

/* ── 1. rolling-window defect ── */
test("finals: the write-once season record is read FIRST — a final that has rolled out of the 9-day window is still graded", () => {
  const rec = finalsRecord("2029-30", [["g1", 110, 100]]);
  const lookup = finalLookup({ finalsRecords: { "2029-30": rec }, resultsRows: [], corpusRows: [] });
  const f = lookup("g1", { dateUtc: "2030-01-11T00:00Z" });
  assert.deepEqual([f.state, f.ftHome, f.ftAway, f.source], ["FINAL", 110, 100, "finals-record:2029-30"]);
  assert.equal(lookup("nope").state, "PENDING", "absent everywhere → PENDING, never a loss");
});

test("finals: record beats the rolling window; window is the same-night fallback; corpus carries its overtime flag", () => {
  const rec = finalsRecord("2029-30", [["g1", 117, 98]]);
  const lookup = finalLookup({
    finalsRecords: { "2029-30": rec },
    resultsRows: [{ providerEventId: "g1", statusRaw: "STATUS_FINAL", ftHome: 116, ftAway: 98 }, { providerEventId: "g2", statusRaw: "STATUS_FINAL", ftHome: 90, ftAway: 95 }, { providerEventId: "g3", statusRaw: "STATUS_IN_PROGRESS", ftHome: 50, ftAway: 40 }],
    corpusRows: [{ providerEventId: "h1", ftHome: 100, ftAway: 99, overtime: true }],
  });
  assert.equal(lookup("g1").ftHome, 117, "the record's recorded score, not the window's");
  assert.equal(lookup("g2").source, "results-capture");
  assert.equal(lookup("g3").state, "PENDING", "an in-progress row is not a final");
  assert.deepEqual([lookup("h1").overtime, lookup("h1").overtimeSource], [true, "corpus-v1"]);
});

test("finals: a record final under review (conflicts) grades with the RECORDED score and is flagged", () => {
  const rec = finalsRecord("2029-30", [["g1", 117, 98]], [{ providerEventId: "g1", recorded: { ftHome: 117, ftAway: 98 }, observed: { ftHome: 116, ftAway: 98 } }]);
  const f = finalLookup({ finalsRecords: { "2029-30": rec } })("g1");
  assert.deepEqual([f.state, f.ftHome, f.underReview], ["FINAL_UNDER_REVIEW", 117, true]);
});

/* ── 3. overtime ── */
test("overtime from box-score minutes: 240/240 regulation, 265/265 one OT, sides that disagree or a missing side → null", () => {
  assert.deepEqual([overtimeFromBoxscore(boxDoc("a")).overtime, overtimeFromBoxscore(boxDoc("a")).periods], [false, 4]);
  assert.deepEqual([overtimeFromBoxscore(boxDoc("b", { teamMinutes: 265 })).overtime, overtimeFromBoxscore(boxDoc("b", { teamMinutes: 265 })).periods], [true, 5]);
  assert.equal(overtimeFromBoxscore(boxDoc("c", { teamMinutes: 241 })).overtime, false, "ESPN rounding (±a few minutes) is tolerated");
  const lopsided = boxDoc("d", { homeRows: boxDoc("x", { teamMinutes: 265 }).players.filter((p) => p.providerTeamId === HOME) });
  assert.equal(overtimeFromBoxscore(lopsided), null, "home implies OT, away does not → undetermined, never guessed");
  assert.equal(overtimeFromBoxscore({ ...boxDoc("e"), players: boxDoc("e").players.filter((p) => p.providerTeamId === HOME) }), null);
  assert.equal(overtimeFromBoxscore({ boxscoreAvailable: false }), null);
});

test("overtime priority: summary periods → box-score minutes → corpus flag → null (NOT_MEASURED)", () => {
  assert.deepEqual(resolveOvertime({ final: {}, boxscore: boxDoc("a", { periods: { count: 6, source: "espn-summary-period" } }) }), { overtime: true, periods: 6, overtimeSource: "espn-summary-period" });
  assert.equal(resolveOvertime({ final: { overtime: true, overtimeSource: "corpus-v1" }, boxscore: boxDoc("a") }).overtime, false, "the box score outranks the corpus flag");
  assert.equal(resolveOvertime({ final: { overtime: true, overtimeSource: "corpus-v1" }, boxscore: null }).overtimeSource, "corpus-v1");
  assert.deepEqual(resolveOvertime({ final: {}, boxscore: null }), { overtime: null, periods: null, overtimeSource: null });
  assert.equal(periodsFromSummary({ header: { competitions: [{ status: { period: 5 } }] } }), 5);
  assert.equal(periodsFromSummary({ header: { competitions: [{ competitors: [{ linescores: [1, 2, 3, 4] }, { linescores: [1, 2, 3, 4] }] }] } }), 4);
  assert.equal(periodsFromSummary({}), null);
});

test("overtime is graded: the fact and the sim's P(OT) land on the grade", () => {
  const g = graded("ot1", { overtimeRate: 0.06, box: null });
  assert.equal(g.overtime.pOvertime, 0.06);
  assert.equal(g.overtime.pOvertimeSource, "sim.overtimeRate");
  const g2 = graded("ot2");
  assert.equal(g2.overtime.pOvertime, 0.04, "v0-family: regulation tie mass is the sim's P(OT)");
});

test("COMMITTED DATA: the box-score minutes rule agrees with corpus-v1's period-derived OT flag on every historical game", () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(NBA, "corpus-v1.json"), "utf8"));
  const truth = new Map(corpus.rows.map((r) => [String(r.providerEventId), r.overtime]));
  let n = 0, agree = 0, undetermined = 0;
  for (const f of fs.readdirSync(path.join(NBA, "boxscores")).filter((x) => /^\d+\.json$/.test(x))) {
    const doc = JSON.parse(fs.readFileSync(path.join(NBA, "boxscores", f), "utf8"));
    if (!truth.has(doc.providerEventId)) continue;
    n += 1;
    const ot = overtimeFromBoxscore(doc);
    if (!ot) { undetermined += 1; continue; }
    if (ot.overtime === truth.get(doc.providerEventId)) agree += 1;
  }
  assert.ok(n >= 4000, `expected the full corpus (got ${n})`);
  assert.equal(agree + undetermined, n, `every determined game agrees (n ${n}, agree ${agree}, undetermined ${undetermined})`);
  // Measured 2026-10-20: 4,167 agree, 12 undetermined — each has one side short of 240 (missing / null-minute rows),
  // which the rule refuses to read as "no overtime". Undetermined must stay rare, never become a wrong answer.
  assert.ok(undetermined / n < 0.01, `undetermined ${undetermined} of ${n}`);
});

/* ── 2. stat corrections ── */
test("box-score content hash ignores capture time / provenance and moves with any stat; the diff names the field", () => {
  const a = boxDoc("s1");
  const b = { ...a, capturedAt: "2030-01-12T06:00:00Z", fixture: "other" };
  assert.equal(boxscoreContentHash(a), boxscoreContentHash(b));
  const c = { ...a, players: a.players.map((p, i) => (i === 0 ? { ...p, reb: p.reb + 1 } : p)) };
  assert.notEqual(boxscoreContentHash(a), boxscoreContentHash(c));
  const d = diffBoxscores(a, c);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].fields, [{ field: "reb", old: 6, new: 7 }]);
});

test("re-check window is bounded: only after tip, only within 72 h, at most every 6 h", () => {
  const tip = "2030-01-11T00:00:00Z";
  assert.equal(recheckDue({ tipUtc: tip, now: "2030-01-10T23:00:00Z" }).reason, "BEFORE_TIP");
  assert.equal(recheckDue({ tipUtc: tip, now: "2030-01-12T00:00:00Z", lastCheckedAt: "2030-01-11T20:00:00Z" }).due, false, "checked 4 h ago");
  assert.equal(recheckDue({ tipUtc: tip, now: "2030-01-12T00:00:00Z", lastCheckedAt: "2030-01-11T17:00:00Z" }).due, true);
  assert.equal(recheckDue({ tipUtc: tip, now: "2030-01-14T00:00:01Z" }).reason, "WINDOW_CLOSED");
});

/* ── 4. append-only ledger ── */
const item = (id, grade, inputs = {}) => ({ providerEventId: id, date: "2030-01-10", status: "GRADED", grade, inputs: { finalSource: "finals-record:2029-30", boxscoreHash: null, ...inputs } });

test("ledger: INITIAL once; an identical re-grade appends nothing; a source-label move (window → record) appends nothing", () => {
  const g = graded("L1");
  let { ledger, appended } = appendGameResults(emptyExperimentalLedger(spec), [item("L1", g)], { gradedAt: "t1" });
  assert.deepEqual(appended.map((e) => [e.seq, e.lineageReason, e.supersedes]), [[1, LINEAGE.INITIAL, null]]);
  ({ ledger, appended } = appendGameResults(ledger, [item("L1", { ...g, final: { ...g.final, source: "results-capture" } }, { finalSource: "results-capture" })], { gradedAt: "t2" }));
  assert.equal(appended.length, 0);
  ({ ledger, appended } = appendGameResults(ledger, [item("L1", { ...g, context: { restDays: { home: 1, away: 0 } } })], { gradedAt: "t3" }));
  assert.equal(appended.length, 0, "context (rest days, cross-checks) is not part of the grade");
});

test("ledger: PENDING → PENDING_RESOLVED; a decided grade is never downgraded to PENDING; pending→pending appends nothing", () => {
  let { ledger } = appendGameResults(emptyExperimentalLedger(spec), [{ providerEventId: "P1", date: "2030-01-10", status: "PENDING", pendingReason: "NO_FINAL" }], { gradedAt: "t1" });
  let r = appendGameResults(ledger, [{ providerEventId: "P1", date: "2030-01-10", status: "PENDING", pendingReason: "other" }], { gradedAt: "t2" });
  assert.equal(r.appended.length, 0);
  r = appendGameResults(ledger, [item("P1", graded("P1"))], { gradedAt: "t3" });
  assert.deepEqual(r.appended.map((e) => [e.lineageReason, e.supersedes]), [[LINEAGE.PENDING_RESOLVED, 1]]);
  const r2 = appendGameResults(r.ledger, [{ providerEventId: "P1", date: "2030-01-10", status: "PENDING", pendingReason: "window rolled" }], { gradedAt: "t4" });
  assert.equal(r2.appended.length, 0);
  assert.equal(currentGrades(r2.ledger).length, 1);
});

test("ledger: a stat correction appends a CORRECTION that supersedes, with old/new box-score hashes; the INITIAL entry is untouched", () => {
  const box1 = boxDoc("C1", { homeRows: [boxRow("p1", HOME, { pts: 20 })] });
  const box2 = { ...box1, players: box1.players.map((p) => (p.providerAthleteId === "p1" ? { ...p, pts: 22 } : p)) };
  const g1 = graded("C1", { home: [], box: box1 }), g2 = { ...g1, score: { ...g1.score, marginErr: g1.score.marginErr + 0 }, players: { ...g1.players, rows: [{ fake: 1 }] } };
  const a = appendGameResults(emptyExperimentalLedger(spec), [item("C1", g1, { boxscoreHash: boxscoreContentHash(box1) })], { gradedAt: "t1" });
  const before = JSON.parse(JSON.stringify(a.ledger));
  const b = appendGameResults(a.ledger, [item("C1", g2, { boxscoreHash: boxscoreContentHash(box2) })], { gradedAt: "t2" });
  const e = b.appended[0];
  assert.deepEqual([e.lineageReason, e.supersedes, e.cause], [LINEAGE.CORRECTION, 1, CORRECTION_CAUSE.BOXSCORE_CORRECTION]);
  assert.deepEqual(e.correction, { oldBoxscoreHash: boxscoreContentHash(box1), newBoxscoreHash: boxscoreContentHash(box2) });
  assert.deepEqual(b.ledger.gradeEntries[0], before.gradeEntries[0], "the original grade is never overwritten");
  assert.deepEqual(experimentalLedgerAppendOnlyViolations({ before, after: b.ledger }), []);
  assert.equal(currentGradeEntries(b.ledger).get(gradeKey("2030-01-10", "C1")).seq, 2, "the current view is the correction");
});

test("ledger: a game first graded on the final alone, then with its box score, appends a CORRECTION with cause BOXSCORE_ADDED", () => {
  const box = boxDoc("BA");
  const a = appendGameResults(emptyExperimentalLedger(spec), [item("BA", graded("BA"))], { gradedAt: "t1" });
  const b = appendGameResults(a.ledger, [item("BA", graded("BA", { box }), { boxscoreHash: boxscoreContentHash(box) })], { gradedAt: "t2" });
  assert.deepEqual([b.appended[0].lineageReason, b.appended[0].cause, b.appended[0].supersedes], [LINEAGE.CORRECTION, CORRECTION_CAUSE.BOXSCORE_ADDED, 1]);
});

test("ledger: a box-score check log is append-only; a CORRECTION check writes a BOXSCORE_CORRECTION record with old/new hashes", () => {
  let l = emptyExperimentalLedger(spec);
  l = appendBoxscoreCheck(l, { providerEventId: "C1", checkedAt: "t1", outcome: "UNCHANGED", hash: "aaa" });
  l = appendBoxscoreCheck(l, { providerEventId: "C1", checkedAt: "t2", outcome: "CORRECTION", hash: "bbb", old: { hash: "aaa", file: "x/boxscores/C1.json" }, new: { hash: "bbb", file: "x/boxscores/corrections/C1.bbb.json" }, changes: [] });
  assert.deepEqual(l.boxscoreChecks.map((c) => c.seq), [1, 2]);
  assert.equal(l.boxscoreCorrections.length, 1);
  assert.deepEqual([latestCorrection(l, "C1").old.hash, latestCorrection(l, "C1").new.hash, latestCorrection(l, "C1").kind], ["aaa", "bbb", "BOXSCORE_CORRECTION"]);
});

test("GUARD: an edited, removed or re-ordered entry, a second INITIAL, a broken supersedes, or changed legacy entries are all violations", () => {
  const legacy = { schemaVersion: 1, artifact: "nba-experimental-ledger", family: "v0.1", modelVersion: spec.modelVersion, entries: [{ date: "2030-01-01", games: [] }] };
  const up = upgradeLedger(legacy);
  assert.deepEqual(up.entries, legacy.entries, "upgrade keeps the schema-1 entries unchanged");
  const { ledger } = appendGameResults(up, [item("A", graded("A")), item("B", graded("B"))], { gradedAt: "t1" });
  const before = JSON.parse(JSON.stringify(ledger));
  assert.deepEqual(experimentalLedgerAppendOnlyViolations({ before: legacy, after: ledger }), []);
  const edited = JSON.parse(JSON.stringify(ledger)); edited.gradeEntries[0].grade.score.marginErr = 99;
  assert.match(experimentalLedgerAppendOnlyViolations({ before, after: edited }).join(), /seq 1 was edited/);
  const removed = { ...ledger, gradeEntries: ledger.gradeEntries.slice(1) };
  assert.match(experimentalLedgerAppendOnlyViolations({ before, after: removed }).join(), /removed/);
  const legacyChanged = { ...ledger, entries: [] };
  assert.match(experimentalLedgerAppendOnlyViolations({ before, after: legacyChanged }).join(), /legacy `entries` changed/);
  const second = { ...ledger, gradeEntries: [...ledger.gradeEntries, { ...ledger.gradeEntries[0], seq: 3 }] };
  assert.match(experimentalLedgerAppendOnlyViolations({ before, after: second }).join(), /second INITIAL/);
  const broken = { ...ledger, gradeEntries: [...ledger.gradeEntries, { ...ledger.gradeEntries[0], seq: 3, lineageReason: LINEAGE.CORRECTION, supersedes: 2 }] };
  assert.match(experimentalLedgerAppendOnlyViolations({ before, after: broken }).join(), /does not supersede/);
});

test("COMMITTED DATA: every experimental ledger is either schema 1 (pre-v2) or a schema-2 ledger whose lineage passes the guard", () => {
  for (const f of Object.values(FAMILIES)) {
    const file = path.join(NBA, f.dir, "ledger.json");
    if (!fs.existsSync(file)) continue;
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(doc.productEligible, false, `${f.dir}: productEligible must stay false`);
    if (doc.schemaVersion === 1) { assert.ok(Array.isArray(doc.entries), `${f.dir}: schema-1 entries`); continue; }
    assert.equal(doc.schemaVersion, 2, `${f.dir}: unknown schema`);
    assert.deepEqual(experimentalLedgerAppendOnlyViolations({ before: null, after: doc }), [], `${f.dir}: lineage`);
    assert.ok(doc.gradeEntries.every((e) => e.graderVersion), `${f.dir}: every entry names its grader version`);
  }
  assert.equal(GRADER_VERSION, "nba-experimental-grader-2");
});

test("current view works for either schema (schema-1 date entries → latest graded games)", () => {
  const legacy = { entries: [{ date: "d1", games: [{ providerEventId: "1", graded: true, v: 1 }] }, { date: "d1", games: [{ providerEventId: "1", graded: true, v: 2 }, { providerEventId: "2", graded: false }] }] };
  const cur = currentEntriesAnySchema(legacy);
  assert.deepEqual(cur.map((e) => [e.providerEventId, e.grade.v, e.legacy]), [["1", 2, true]]);
});

test("rest days (§9): back-to-back = 0, from the previous recorded tip of that team; unknown when none", () => {
  const prior = new Map([[HOME, ["2030-01-10T00:30Z", "2030-01-05T00:00Z"]], [AWAY, ["2030-01-08T00:00Z"]]]);
  // ET dates: 2030-01-10T00:30Z is 01-09 ET; the game 2030-01-11T00:00Z is 01-10 ET → back-to-back.
  assert.equal(restDaysFor({ teamId: HOME, tipUtc: "2030-01-11T00:00Z", priorTips: prior }), 0);
  assert.equal(restDaysFor({ teamId: AWAY, tipUtc: "2030-01-11T00:00Z", priorTips: prior }), 2);
  assert.equal(restDaysFor({ teamId: "999", tipUtc: "2030-01-11T00:00Z", priorTips: prior }), null);
});

test("box-score points cross-check reports, never changes, the final", () => {
  const doc = boxDoc("X", { homeRows: [boxRow("p1", HOME, { pts: 117 })], awayRows: [boxRow("p2", AWAY, { pts: 98 })] });
  assert.deepEqual(boxscorePointsCheck(doc, { homeTeamId: HOME, awayTeamId: AWAY, ftHome: 116, ftAway: 98 }), { home: 117, away: 98, agrees: false });
  assert.equal(boxscorePointsCheck(doc, { homeTeamId: HOME, awayTeamId: AWAY, ftHome: 117, ftAway: 98 }).agrees, true);
});

test("ledger text: one line per append-only element (an append is a one-line diff) and it round-trips", () => {
  const { ledger } = appendGameResults(upgradeLedger({ schemaVersion: 1, family: "v0.1", entries: [{ date: "d", games: [] }] }), [item("A", graded("A")), item("B", graded("B"))], { gradedAt: "t" });
  const text = ledgerText(ledger);
  assert.deepEqual(JSON.parse(text), ledger);
  const lines = text.split("\n");
  assert.equal(lines.filter((l) => l.startsWith('  {"seq":')).length, 2, "each grade entry is one line");
  const more = appendGameResults(ledger, [item("C", graded("C"))], { gradedAt: "t2" }).ledger;
  const added = ledgerText(more).split("\n").filter((l) => !lines.includes(l));
  assert.ok(added.some((l) => l.includes('"providerEventId":"C"')), "the new entry is a new line");
});
