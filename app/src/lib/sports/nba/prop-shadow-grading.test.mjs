/**
 * NBA player SHADOW grading + the append-only prop-grade ledger (PR 1169): frozen rows from the official snapshot,
 * every state (GRADED, NO_MEASUREMENT, PENDING_FINAL, PENDING_BOXSCORE), the holds (finals-record conflict, the explicit
 * 401901822 HOLD, team-id mismatch, box-score points disagreement), the append-only rules end to end through the ONE
 * writer (identical re-run appends 0; a changed actual appends a CORRECTION with lineage), and a real-data run that
 * passes with or without the 2026-10-20 box scores committed.
 *
 * Fixture players, games and box scores are invented ("fx-" ids, plus 401901822 used only as an id to prove the hold).
 * The fixture repo lives under os.tmpdir(); the repository's own ledger is never written by these tests.
 * No odds data is read and no line here is a sportsbook line: the only line is the frozen median (SYNTHETIC_MEDIAN_LINE).
 *
 * Run: npx tsx --test src/lib/sports/nba/prop-shadow-grading.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HOLD, LINEAGE, CORRECTION_CAUSE, NBA_PROP_GRADE_HOLDS, PROP_SHADOW_SCHEMA, SHADOW_STATE, SYNTHETIC_MEDIAN_LINE,
  appendPropShadowGrades, frozenShadowRows, gradeShadowRow, parsePropLedger, propGradeHolds, propLedgerAppendOnlyViolations,
  propLedgerLines, currentShadowGrades, summariseShadowGrades,
} from "./prop-shadow-grading.mjs";
import { PROP_FAMILIES } from "./prop-settlement.mjs";
import { nbaBoxscoreLocator, nbaPropResult, readNbaFinalsRecords } from "./prop-settlement-source.mjs";
import { nbaOfficialSnapshot } from "../../consistency/official-snapshot.mjs";
import { stampReceipt } from "./forecast-receipt.mjs";
import { FIXTURE_NOTE, artifact, boxscore, player } from "./__fixtures__/top-board-fixtures.mjs";
import { propLedgerPath, runPropShadowGrading } from "../../../../scripts/nba/grade-nba-player-props.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const NOW = "2026-11-02T12:00:00Z";
const DATE = "2026-11-01";
const FAMS = Object.keys(PROP_FAMILIES);

/** A v0.1 game with an Elo head and a valid pre-tip receipt (the official snapshot needs both). */
function fxGame(id, { home, away, tip = "2026-11-01T23:30Z", generatedAt = "2026-11-01T15:00:00Z", homeTeam = "2", awayTeam = "18" }) {
  return stampReceipt({
    providerEventId: String(id), seasonType: 2, dateUtc: tip, etDate: DATE,
    home: { name: "Fixture Home", abbr: "BOS", providerTeamId: homeTeam },
    away: { name: "Fixture Away", abbr: "NY", providerTeamId: awayTeam },
    forecast: { modelVersion: "nba-sim-fixture", inputAsOf: generatedAt, publishedSide: "HOME", sideRule: { id: "nba-winner-side@1", head: "elo" }, elo: { pHome: 0.6, pAway: 0.4 }, players: { home, away } },
  }, { family: "v0.1", modelVersion: "nba-preseason-experimental-v0.1", now: generatedAt, inputs: { fixture: FIXTURE_NOTE } });
}
const finalRow = (id, ftHome, ftAway, { homeTeam = "2", awayTeam = "18" } = {}) => ({
  providerEventId: String(id), statusRaw: "STATUS_FINAL", ftHome, ftAway, winnerSide: ftHome > ftAway ? "home" : "away",
  home: { tricode: "BOS", providerTeamId: homeTeam }, away: { tricode: "NY", providerTeamId: awayTeam },
});

const EV = "fx-shadow-1";
const HOME = [player(1, { pts: 20, reb: 6, ast: 4 }), player(2, { pts: 10 }), player(3, { pts: 8 })];
const AWAY = [player(11, { pts: 18 }), player(12, { pts: 6 })];
// Player 3 is a DNP, player 12 is not in the box score. Points: home 24 + 9 = 33, away 15.
const BOX_PLAYERS = [
  { id: 1, team: "2", minutes: 34, pts: 24, reb: 7, ast: 3, threePm: 2 },
  { id: 2, team: "2", minutes: 22, pts: 9, reb: 2, ast: 1, threePm: 1 },
  { id: 3, team: "2", didNotPlay: true, dnpReason: "COACH'S DECISION" },
  { id: 11, team: "18", minutes: 30, pts: 15, reb: 4, ast: 5, threePm: 3 },
];

/** A throwaway repo root under os.tmpdir() holding only what the writer reads. */
function fixtureRepo({ games = [fxGame(EV, { home: HOME, away: AWAY })], finals = [finalRow(EV, 33, 15)], conflicts = [], boxes = { [EV]: boxscore(EV, BOX_PLAYERS) } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-prop-shadow-"));
  const put = (rel, doc) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(doc)); };
  put("app/public/data/nba/results/finals-2026-27.json", { schemaVersion: 1, season: "2026-27", finals, conflicts, refused: [] });
  put(`data/internal/research/nba/experimental-v0.1/forecasts/${DATE}.json`, artifact(games, { date: DATE }));
  for (const [id, doc] of Object.entries(boxes)) put(`data/internal/research/nba/experimental-v0.1/boxscores/${id}.json`, doc);
  return {
    root,
    setBox: (id, doc) => put(`data/internal/research/nba/experimental-v0.1/boxscores/${id}.json`, doc),
    dropBox: (id) => fs.rmSync(path.join(root, `data/internal/research/nba/experimental-v0.1/boxscores/${id}.json`)),
    ledger: () => { const f = propLedgerPath(root); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null; },
  };
}
const run = (repo, over = {}) => runPropShadowGrading({ repoRoot: repo.root, date: DATE, now: NOW, ...over });
const snapshotOf = (game) => nbaOfficialSnapshot(game.providerEventId, { official: { doc: artifact([game], { date: DATE }), path: "fx" } });

// ── Frozen rows ──────────────────────────────────────────────────────────────────────────────────────

test("frozen rows: every official v0.1 player × the seven families, median = frozen p50, p10/p90 carried, no minutes", () => {
  const g = fxGame(EV, { home: HOME, away: AWAY });
  const rows = frozenShadowRows(snapshotOf(g), { date: DATE });
  assert.equal(rows.length, (HOME.length + AWAY.length) * FAMS.length);
  assert.ok(!rows.some((r) => r.family === "minutes"));
  const r = rows.find((x) => x.playerId === "1" && x.family === "pts");
  assert.equal(r.frozen.median, HOME[0].pts.p50);
  assert.equal(r.frozen.p10, HOME[0].pts.p10);
  assert.equal(r.frozen.p90, HOME[0].pts.p90);
  assert.equal(r.frozen.receiptPayloadSha256, g.receipt.payloadSha256);
  assert.equal(r.key, `${DATE}|${EV}|1|pts`);
});

// ── States ───────────────────────────────────────────────────────────────────────────────────────────

const finalsRec = (over = {}) => ({ finals: [finalRow(EV, 33, 15)], conflicts: [], ...over });
const rowsFor = () => frozenShadowRows(snapshotOf(fxGame(EV, { home: HOME, away: AWAY })), { date: DATE });
const resultFor = (row, { record = finalsRec(), box = boxscore(EV, BOX_PLAYERS) } = {}) => nbaPropResult({ finalsRecord: record, boxscore: box, providerEventId: EV, providerAthleteId: row.playerId });

test("GRADED: frozen median vs actual, absolute error, at/below vs above, p10–p90 coverage, synthetic median line (not a price)", () => {
  const rows = rowsFor();
  const pts = rows.find((x) => x.playerId === "1" && x.family === "pts");
  const g = gradeShadowRow(pts, resultFor(pts));
  assert.equal(g.state, SHADOW_STATE.GRADED);
  assert.equal(g.measurement.actual, 24);
  assert.equal(g.measurement.absError, Math.abs(24 - 20));
  assert.equal(g.measurement.vsMedian, "ABOVE_MEDIAN");
  assert.deepEqual(g.measurement.band80, { p10: pts.frozen.p10, p90: pts.frozen.p90, covered: 24 >= pts.frozen.p10 && 24 <= pts.frozen.p90 });
  assert.deepEqual(g.measurement.syntheticMedianLine, { label: SYNTHETIC_MEDIAN_LINE, line: 20, side: "OVER", outcome: "WIN", notAPrice: true });
  const ast = rows.find((x) => x.playerId === "1" && x.family === "ast");
  assert.equal(gradeShadowRow(ast, resultFor(ast)).measurement.vsMedian, "AT_OR_BELOW_MEDIAN"); // 3 vs 4
  const pra = rows.find((x) => x.playerId === "1" && x.family === "pra");
  const gp = gradeShadowRow(pra, resultFor(pra));
  assert.equal(gp.measurement.actual, 24 + 7 + 3);
  assert.deepEqual(gp.measurement.components, { pts: 24, reb: 7, ast: 3 });
  // An integer median the actual lands on exactly is at/below, and the synthetic line PUSHes.
  const exact = gradeShadowRow({ ...pts, frozen: { ...pts.frozen, median: 24 } }, resultFor(pts));
  assert.deepEqual([exact.measurement.vsMedian, exact.measurement.syntheticMedianLine.outcome, exact.measurement.absError], ["AT_OR_BELOW_MEDIAN", "PUSH", 0]);
  // No band when the receipt carries none.
  assert.equal(gradeShadowRow({ ...pts, frozen: { ...pts.frozen, p10: null } }, resultFor(pts)).measurement.band80, null);
});

test("NO_MEASUREMENT for a DNP, a player missing from the box score and a 0-minute row — the actual is null, never 0", () => {
  const rows = rowsFor();
  for (const [pid, code] of [["3", "DNP"], ["12", "NOT_IN_BOXSCORE"]]) {
    for (const family of FAMS) {
      const row = rows.find((x) => x.playerId === pid && x.family === family);
      const g = gradeShadowRow(row, resultFor(row));
      assert.deepEqual([g.state, g.code, g.measurement.actual], [SHADOW_STATE.NO_MEASUREMENT, code, null], `${pid} ${family}`);
      assert.notEqual(g.measurement.actual, 0);
    }
  }
  const zero = rows.find((x) => x.playerId === "2" && x.family === "pts");
  const box = boxscore(EV, BOX_PLAYERS.map((p) => (p.id === 2 ? { ...p, minutes: 0, pts: 0, reb: 0, ast: 0, threePm: 0 } : p)));
  assert.deepEqual([gradeShadowRow(zero, resultFor(zero, { box })).state, gradeShadowRow(zero, resultFor(zero, { box })).measurement.actual], [SHADOW_STATE.NO_MEASUREMENT, null]);
});

test("PENDING_BOXSCORE without a final box score; PENDING_FINAL without a final; a non-integer stat is VOID, never 0", () => {
  const row = rowsFor().find((x) => x.playerId === "1" && x.family === "pts");
  assert.equal(gradeShadowRow(row, resultFor(row, { box: null })).state, SHADOW_STATE.PENDING_BOXSCORE);
  assert.equal(gradeShadowRow(row, resultFor(row, { box: boxscore(EV, BOX_PLAYERS, { status: "STATUS_IN_PROGRESS" }) })).state, SHADOW_STATE.PENDING_BOXSCORE);
  assert.equal(gradeShadowRow(row, resultFor(row, { record: finalsRec({ finals: [] }) })).state, SHADOW_STATE.PENDING_FINAL);
  const bad = boxscore(EV, BOX_PLAYERS);
  bad.players[0].pts = null;
  const g = gradeShadowRow(row, resultFor(row, { box: bad }));
  assert.deepEqual([g.state, g.measurement], [SHADOW_STATE.VOID_PENDING_REVIEW, null]);
});

// ── Holds ────────────────────────────────────────────────────────────────────────────────────────────

test("a disputed final HOLDS: a finals-record conflict is FINAL_UNDER_REVIEW, nothing is graded, nothing is written", () => {
  const repo = fixtureRepo({ conflicts: [{ providerEventId: EV, recorded: { ftHome: 33, ftAway: 15 }, observed: { ftHome: 32, ftAway: 15 }, observedAt: "2026-11-02T08:00:00Z" }] });
  const r = run(repo, { write: true });
  assert.deepEqual(r.held.map((h) => [h.eventId, h.hold]), [[EV, HOLD.FINAL_UNDER_REVIEW]]);
  assert.equal(r.appended, 0);
  assert.equal(repo.ledger(), null, "no ledger file for a run that graded nothing");
  // A game graded before its final became disputed: no new entry, and the summary leaves it out.
  const clean = fixtureRepo();
  run(clean, { write: true });
  const before = clean.ledger();
  fs.writeFileSync(path.join(clean.root, "app/public/data/nba/results/finals-2026-27.json"), JSON.stringify({ finals: [finalRow(EV, 33, 15)], conflicts: [{ providerEventId: EV, recorded: { ftHome: 33, ftAway: 15 }, observed: { ftHome: 30, ftAway: 15 } }], refused: [] }));
  const again = run(clean, { write: true });
  assert.equal(again.appended, 0);
  assert.equal(clean.ledger(), before);
  assert.ok(Object.values(again.summary).every((s) => s.graded === 0 && s.noMeasurement === 0), "a held game is not in the descriptive summary");
});

test("401901822 is HELD explicitly, even with a clean final and a box score", () => {
  assert.ok(NBA_PROP_GRADE_HOLDS.some((h) => h.providerEventId === "401901822"));
  const id = "401901822";
  const repo = fixtureRepo({ games: [fxGame(id, { home: HOME, away: AWAY })], finals: [finalRow(id, 33, 15)], boxes: { [id]: boxscore(id, BOX_PLAYERS) } });
  const r = run(repo, { write: true });
  assert.deepEqual(r.held.map((h) => [h.eventId, h.hold]), [[id, HOLD.HELD]]);
  assert.equal(r.appended, 0);
  assert.equal(repo.ledger(), null);
  // On the committed finals record it is both explicitly held and in `conflicts`.
  const real = propGradeHolds({ finalsRecord: readNbaFinalsRecords({ repoRoot: REPO }) }).get(id);
  assert.equal(real.hold, HOLD.HELD);
  assert.match(real.reason, /finals-record conflict/);
});

test("a final with other team ids, or a box score whose points disagree with the recorded final, holds too", () => {
  const swapped = run(fixtureRepo({ finals: [finalRow(EV, 33, 15, { homeTeam: "18", awayTeam: "2" })] }));
  assert.deepEqual(swapped.held.map((h) => h.hold), [HOLD.TEAM_ID_MISMATCH]);
  assert.equal(swapped.appended, 0);
  const off = run(fixtureRepo({ finals: [finalRow(EV, 34, 15)] }));
  assert.deepEqual(off.held.map((h) => h.hold), [HOLD.BOXSCORE_POINTS_DISAGREE]);
  assert.equal(off.appended, 0);
});

// ── Append-only, end to end through the one writer ───────────────────────────────────────────────────

test("APPEND-ONLY: a second identical run appends 0; a changed actual appends a CORRECTION with lineage; earlier lines never change", () => {
  const repo = fixtureRepo();
  const first = run(repo, { write: true });
  const rows = (HOME.length + AWAY.length) * FAMS.length;
  assert.equal(first.appended, rows);
  assert.deepEqual(first.lineage, { [LINEAGE.INITIAL]: rows });
  const t1 = repo.ledger();
  assert.equal(t1.split("\n").filter(Boolean).length, rows);

  const second = run(repo, { write: true, now: "2026-11-03T12:00:00Z" });
  assert.equal(second.appended, 0, "an identical re-grade appends nothing, whatever the clock says");
  assert.equal(repo.ledger(), t1);

  // A points correction the recorded final does not carry disputes the final: the game holds, nothing is appended.
  repo.setBox(EV, boxscore(EV, BOX_PLAYERS.map((p) => (p.id === 1 ? { ...p, pts: 26 } : p))));
  const disputed = run(repo, { write: true, now: "2026-11-04T06:00:00Z" });
  assert.deepEqual([disputed.appended, disputed.held.map((h) => h.hold)], [0, [HOLD.BOXSCORE_POINTS_DISAGREE]]);
  assert.equal(repo.ledger(), t1);

  // A stat correction: player 1 had 9 rebounds, not 7 → reb, pra, ptsReb change (pts, ast, threePm, ptsAst do not).
  repo.setBox(EV, boxscore(EV, BOX_PLAYERS.map((p) => (p.id === 1 ? { ...p, reb: 9 } : p))));
  const third = run(repo, { write: true, now: "2026-11-04T12:00:00Z" });
  assert.equal(third.appended, 3);
  const t3 = repo.ledger();
  assert.ok(t3.startsWith(t1), "the earlier ledger is an unchanged prefix");
  const { entries } = parsePropLedger(t3);
  const added = entries.slice(rows);
  assert.deepEqual(added.map((e) => e.family).sort(), ["pra", "ptsReb", "reb"]);
  for (const e of added) {
    const prev = entries.find((x) => x.key === e.key && x.seq < e.seq);
    assert.equal(e.lineageReason, LINEAGE.CORRECTION);
    assert.equal(e.cause, CORRECTION_CAUSE.BOXSCORE_CORRECTION);
    assert.equal(e.supersedes, prev.seq);
    assert.equal(e.correction.newActual - e.correction.oldActual, 2);
    assert.notEqual(e.correction.oldBoxscoreHash, e.correction.newBoxscoreHash);
  }
  assert.deepEqual(propLedgerAppendOnlyViolations({ beforeText: t1, afterText: t3 }), []);
  assert.equal(run(repo, { write: true }).appended, 0, "and the corrected view is stable");
});

test("PENDING_BOXSCORE resolves with lineage when the box score lands, and is never downgraded when it disappears", () => {
  const repo = fixtureRepo({ boxes: {} });
  const a = run(repo, { write: true });
  assert.deepEqual(a.perEvent[`${DATE}|${EV}`], { [SHADOW_STATE.PENDING_BOXSCORE]: a.appended });
  assert.equal(run(repo, { write: true }).appended, 0, "pending that stays pending appends nothing");
  repo.setBox(EV, boxscore(EV, BOX_PLAYERS));
  const b = run(repo, { write: true });
  assert.equal(b.appended, a.appended);
  assert.deepEqual(b.lineage, { [LINEAGE.PENDING_RESOLVED]: a.appended });
  const text = repo.ledger();
  repo.dropBox(EV);
  assert.equal(run(repo, { write: true }).appended, 0, "a recorded grade is never downgraded to pending");
  assert.equal(repo.ledger(), text);
});

test("dry run writes nothing; --out-dir never writes the repo ledger; a scratch --boxscore-dir needs --out-dir to write", () => {
  const repo = fixtureRepo();
  const dry = run(repo);
  assert.ok(dry.appended > 0);
  assert.equal(repo.ledger(), null);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-prop-shadow-out-"));
  const viaOut = run(repo, { write: true, outDir: out });
  assert.equal(viaOut.wrote, true);
  assert.equal(repo.ledger(), null, "the repo's ledger is untouched in --out-dir mode");
  assert.ok(fs.existsSync(propLedgerPath(out, { outDir: true })));
  assert.equal(run(repo, { write: true, outDir: out }).appended, 0, "--out-dir resumes from its own ledger");
  assert.throws(() => run(repo, { write: true, extraBoxscoreDirs: [out] }), /--out-dir/);
  assert.throws(() => runPropShadowGrading({ repoRoot: repo.root, now: NOW }), /exactly one of/);
  assert.throws(() => runPropShadowGrading({ repoRoot: repo.root, date: DATE, since: DATE, now: NOW }), /exactly one of/);
});

test("the writer refuses a ledger that was edited, and a frozen row that changed", () => {
  const repo = fixtureRepo();
  run(repo, { write: true });
  const f = propLedgerPath(repo.root);
  const text = fs.readFileSync(f, "utf8");
  const lines = text.split("\n");
  const e = JSON.parse(lines[0]);
  fs.writeFileSync(f, [JSON.stringify({ ...e, seq: 7 }), ...lines.slice(1)].join("\n"));
  assert.throws(() => run(repo, { write: true }), /append-only rules/);
  fs.writeFileSync(f, text);
  // Pure: a frozen row that moved under a recorded key is reported, never appended.
  const entries = parsePropLedger(text).entries;
  const moved = entries.map((x) => ({ ...x, frozen: { ...x.frozen, median: x.frozen.median + 1 } }));
  const r = appendPropShadowGrades(entries, moved, { gradedAt: NOW });
  assert.equal(r.appended.length, 0);
  assert.equal(r.frozenMismatches.length, entries.length);
});

test("guard: prefix, seq order, one INITIAL per key, supersedes, no pending after a recorded state", () => {
  const rows = rowsFor().slice(0, 2);
  const items = rows.map((row) => ({ ...row, ...gradeShadowRow(row, resultFor(row)), inputs: { boxscoreHash: "h1" } }));
  const { appended } = appendPropShadowGrades([], items, { gradedAt: NOW });
  const text = propLedgerLines(appended);
  assert.deepEqual(propLedgerAppendOnlyViolations({ beforeText: "", afterText: text }), []);
  assert.ok(appended.every((e) => e.schema === PROP_SHADOW_SCHEMA && e.productEligible === false && e.notAPrice === true && e.dataClass === "PRIVATE_RESEARCH"));
  const [a, b] = appended;
  assert.ok(propLedgerAppendOnlyViolations({ beforeText: text, afterText: propLedgerLines([b, a]) }).length > 0, "reordered");
  assert.ok(propLedgerAppendOnlyViolations({ beforeText: "", afterText: propLedgerLines([a, { ...a, seq: 2 }]) }).some((v) => /second INITIAL/.test(v)));
  const pend = { ...a, seq: 3, state: SHADOW_STATE.PENDING_BOXSCORE, lineageReason: LINEAGE.CORRECTION, supersedes: 1 };
  assert.ok(propLedgerAppendOnlyViolations({ beforeText: text, afterText: text + propLedgerLines([pend]) }).some((v) => /went back to/.test(v)));
  assert.ok(propLedgerAppendOnlyViolations({ beforeText: "", afterText: propLedgerLines([{ ...a, productEligible: true }]) }).some((v) => /productEligible/.test(v)));
});

test("summary is descriptive: NO_MEASUREMENT and VOID rows are counted beside the graded ones, never inside a rate", () => {
  const repo = fixtureRepo();
  const r = run(repo);
  assert.equal(r.summary.pts.graded, 3);
  assert.equal(r.summary.pts.noMeasurement, 2);
  assert.equal(r.summary.pts.mae, (4 + 1 + 3) / 3);
  const cur = currentShadowGrades([], {});
  assert.deepEqual(summariseShadowGrades(cur).pts, { graded: 0, noMeasurement: 0, voids: 0, atOrBelowMedian: 0, band80N: 0, band80Covered: 0, mae: null });
});

// ── Real data: 2026-10-20 with or without the box scores committed ───────────────────────────────────

test("real data 2026-10-20: PENDING_BOXSCORE without the box scores, graded states with them; rows reconcile", () => {
  const r = runPropShadowGrading({ repoRoot: REPO, date: "2026-10-20", now: "2026-10-21T12:00:00Z" });
  assert.equal(r.wrote, false);
  assert.deepEqual(r.held, []);
  assert.deepEqual(r.refused, []);
  const forecasts = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nba/experimental-v0.1/forecasts/2026-10-20.json"), "utf8"));
  const find = nbaBoxscoreLocator({ repoRoot: REPO });
  let total = 0;
  for (const g of forecasts.games) {
    const id = String(g.providerEventId);
    const counts = r.perEvent[`2026-10-20|${id}`];
    assert.ok(counts, id);
    const n = Object.values(counts).reduce((s, x) => s + x, 0);
    assert.ok(n >= 20 * FAMS.length && n % FAMS.length === 0, `${id}: ${n} rows`);
    total += n;
    if (!find(id)) assert.deepEqual(counts, { [SHADOW_STATE.PENDING_BOXSCORE]: n }, `${id}: no box score yet, every row waits`);
    else {
      assert.ok(!counts[SHADOW_STATE.PENDING_BOXSCORE] && !counts[SHADOW_STATE.PENDING_FINAL], `${id}: box + final → nothing pending`);
      assert.ok((counts[SHADOW_STATE.GRADED] ?? 0) > 0, `${id}: graded rows`);
    }
  }
  assert.equal(total, Object.values(r.perDate[0].counts).reduce((s, x) => s + x, 0));
});

test("real data: 401901822 (forecast 2026-10-16) is held and never reaches the ledger plan", () => {
  const r = runPropShadowGrading({ repoRoot: REPO, date: "2026-10-16", now: "2026-10-21T12:00:00Z" });
  assert.ok(r.held.some((h) => h.eventId === "401901822" && h.hold === HOLD.HELD));
  assert.ok(!Object.keys(r.perEvent).some((k) => k.endsWith("|401901822")));
});
