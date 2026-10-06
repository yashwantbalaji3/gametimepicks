/**
 * Stage 3B pins — lib/results/mlb-leans-of-record.mjs (MLB lean adapter onto the forecast-of-record contract) and the
 * MLB readers migrated onto it: graded-pick owners (→ graded-picks.json, Results V2 overview), the Results V2 day view
 * and the model results index builder.
 *
 * The postponed case is a frozen fixture (__fixtures__/mlb-leans-of-record/postponed-824785.json): every settled-lean
 * row for gamePk 824785 as committed on 2026-10-06, trimmed. Its `expect` block was computed independently ("latest
 * board per game · player · market"). No live count is read or pinned.
 *
 * Runs from app/: npx tsx --test src/lib/results/mlb-leans-of-record.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  START_SOURCE, mlbLeanToCanonical, mlbCanonicalStarts, mlbFirstPitches, mlbLeansOfRecord, mlbOfRecordDisclosure,
} from "./mlb-leans-of-record.mjs";
import { selectForecastOfRecord, OUTCOME, outcomeOf } from "./forecast-of-record.mjs";
import { makeGradedPickOwners } from "../sports/graded-pick-owners.mjs";
import { buildGradedRecord } from "../sports/graded-picks.mjs";
import { population, outcomeFromHit } from "./v2/populations.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..");
const F = JSON.parse(fs.readFileSync(path.join(HERE, "__fixtures__/mlb-leans-of-record/postponed-824785.json"), "utf8"));
const E = F.expect;
const question = (r) => `${r.gamePk}|${r.playerId}|${r.marketKey}`;
const count = (rows, word) => rows.filter((r) => r.outcome === word).length;
const fresh = () => F.leans.map((r) => ({ ...r }));

/* ── 1 · the 824785 postponed game counts once ────────────────────────────────────────────────── */

test("824785: the fixture is the case it claims to be (both boards, both copies graded)", () => {
  assert.equal(F.leans.length, E.rows);
  assert.deepEqual(Object.fromEntries(Object.entries(E.byDate)), Object.fromEntries(
    Object.entries(F.leans.reduce((a, r) => ({ ...a, [r.date]: (a[r.date] ?? 0) + 1 }), {}))));
  assert.equal(E.superseded.sameLineReissued, 16, "16 same-line leans appear on both boards");
  assert.equal(E.superseded.lineRevised, 2, "2 more were re-issued at a revised line");
  assert.ok(F.leans.every((r) => r.gamePk === 824785 && r.graded === true));
});

test("824785: each game · player · market lean counts ONCE, on the board of record", () => {
  const leans = fresh();
  const sel = mlbLeansOfRecord(leans, { firstPitches: mlbFirstPitches(F.gameGrader) });
  assert.equal(sel.record.length, E.record.rows);
  assert.equal(new Set(sel.record.map(question)).size, sel.record.length, "no question is counted twice");
  assert.equal(new Set(leans.map(question)).size, sel.record.length, "every question still has its one row of record");
  assert.equal(count(sel.record, "Win"), E.record.win);
  assert.equal(count(sel.record, "Loss"), E.record.loss);
  assert.equal(count(sel.record, "Void"), E.record.void);
  assert.equal(sel.tally.win, E.record.win);
  assert.equal(sel.tally.loss, E.record.loss);
  assert.equal(sel.tally.void, E.record.void);
  assert.equal(sel.tally.decided, E.record.win + E.record.loss);
  // the delta is exactly the earlier-board copies, and only decided rows move
  assert.equal(sel.excluded.superseded, E.superseded.rows);
  assert.equal(E.naive.win - sel.tally.win, E.superseded.win);
  assert.equal(E.naive.loss - sel.tally.loss, E.superseded.loss);
  assert.deepEqual({ late: sel.excluded.late, conflictRows: sel.excluded.conflictRows, unkeyed: sel.excluded.unkeyed },
    { late: 0, conflictRows: 0, unkeyed: 0 });
  // the re-issued board holds every one of its leans of record; the original board keeps only leans never re-issued
  const byDate = sel.record.reduce((a, r) => ({ ...a, [r.date]: (a[r.date] ?? 0) + 1 }), {});
  assert.deepEqual(byDate, E.record.byDate);
  const reissued = new Set(leans.filter((r) => r.date === "2026-09-23").map(question));
  assert.ok(sel.record.filter((r) => r.date === "2026-09-22").every((r) => !reissued.has(question(r))));
});

test("824785: raw rows are preserved — every row is either of record or disclosed, none dropped, none edited", () => {
  const leans = fresh();
  const before = JSON.stringify(leans);
  const sel = mlbLeansOfRecord(leans, { firstPitches: mlbFirstPitches(F.gameGrader) });
  assert.equal(JSON.stringify(leans), before, "the owner rows are not mutated");
  assert.equal(sel.recordIds.size + sel.notOfRecordIds.size, leans.length);
  for (const r of leans) assert.ok(sel.recordIds.has(r.id) !== sel.notOfRecordIds.has(r.id), `${r.id} is in exactly one set`);
  assert.deepEqual(mlbOfRecordDisclosure(sel), { rule: mlbOfRecordDisclosure(sel).rule, superseded: E.superseded.rows, late: 0, conflictRows: 0, unkeyed: 0 });
});

/* ── 2 · the canonical start is the rescheduled one (3A review point a) ───────────────────────── */

test("canonical start: StatsAPI first pitch of the make-up game, else the re-issued board's start — never the original", () => {
  const withGrader = mlbCanonicalStarts(F.leans, { firstPitches: mlbFirstPitches(F.gameGrader) }).get("824785");
  assert.deepEqual(withGrader, { at: new Date(E.canonicalStart).toISOString(), source: START_SOURCE.STATSAPI_FIRST_PITCH });
  const boardOnly = mlbCanonicalStarts(F.leans).get("824785");
  assert.deepEqual(boardOnly, { at: new Date(E.rescheduledBoardStart).toISOString(), source: START_SOURCE.LATEST_BOARD });
  for (const s of [withGrader, boardOnly]) assert.notEqual(s.at, new Date(E.originalStart).toISOString());
  // both sources give the same forecast of record
  const a = mlbLeansOfRecord(fresh(), { firstPitches: mlbFirstPitches(F.gameGrader) });
  const b = mlbLeansOfRecord(fresh());
  assert.deepEqual([...a.recordIds].sort(), [...b.recordIds].sort());
});

test("mutation pin: cutting off at the ORIGINAL start would drop the make-up board and keep the stale copies", () => {
  const rows = fresh().map(mlbLeanToCanonical);
  const stale = selectForecastOfRecord(rows, { canonicalStarts: { "MLB|824785": E.originalStart } });
  assert.equal(stale.late.length, E.byDate["2026-09-23"], "every make-up-board copy would be called late");
  assert.ok(stale.record.every((f) => f.raw.date === "2026-09-22"));
  const good = mlbLeansOfRecord(fresh());
  assert.notDeepEqual(new Set(stale.record.map((f) => f.receiptId)), good.recordIds);
});

test("a copy's own board start is never a fallback cut-off: with no start known, the latest board wins (disclosed)", () => {
  const leans = fresh().map((r) => (r.date === "2026-09-23" ? { ...r, eventStartTime: undefined } : r));
  assert.equal(mlbCanonicalStarts(leans).get("824785").source, START_SOURCE.NONE);
  const sel = mlbLeansOfRecord(leans);
  assert.equal(sel.excluded.late, 0, "the 09-22 board's start (the original) is not used to call the make-up board late");
  assert.equal(sel.record.length, E.record.rows);
  assert.equal(sel.timingUnverified, E.record.rows, "every record without a cut-off is disclosed");
});

/* ── 3 · mapping and the other contract rules on MLB rows ─────────────────────────────────────── */

const lean = (o) => ({ id: o.id, date: "2026-07-01", gamePk: 900001, playerId: 1, marketKey: "batter_hits", line: 0.5, lean: "Over", outcome: "Win", graded: true, ...o });

test("Q2 TWO: two lines on the same board are two claims; a later board's revised line supersedes both", () => {
  const sameBoard = [lean({ id: "a", line: 0.5 }), lean({ id: "b", line: 1.5, lean: "Under", outcome: "Loss" })];
  assert.equal(mlbLeansOfRecord(sameBoard).record.length, 2);
  const revised = [...sameBoard, lean({ id: "c", date: "2026-07-02", line: 2.5 })];
  const sel = mlbLeansOfRecord(revised);
  assert.deepEqual(sel.record.map((r) => r.id), ["c"]);
  assert.equal(sel.excluded.superseded, 2);
});

test("a board published after first pitch is late, never of record; a row without player id is unkeyed (Q5)", () => {
  const rows = [lean({ id: "pre" }), lean({ id: "post", date: "2026-07-02" }), lean({ id: "nokey", playerId: null })];
  const sel = mlbLeansOfRecord(rows, { firstPitches: { 900001: "2026-07-01T23:05:00Z" } });
  assert.deepEqual(sel.record.map((r) => r.id), ["pre"]);
  assert.equal(sel.excluded.late, 1);
  assert.equal(sel.excluded.unkeyed, 1);
  assert.equal(sel.tally.loss, 0, "an unkeyed or late row is never a loss");
});

test("owner words only: Win/Loss decide, Push and Void never do, an unreadable word is UNKNOWN (never a loss)", () => {
  const o = (outcome) => outcomeOf(mlbLeanToCanonical(lean({ id: outcome ?? "x", outcome })));
  assert.equal(o("Win"), OUTCOME.WIN);
  assert.equal(o("Loss"), OUTCOME.LOSS);
  assert.equal(o("Push"), OUTCOME.PUSH);
  assert.equal(o("Void"), OUTCOME.VOID);
  assert.equal(o(null), OUTCOME.UNKNOWN);
  // the side is the frozen lean, never the probabilities
  assert.equal(mlbLeanToCanonical(lean({ id: "s", lean: "Under", modelProbOver: 0.9 })).frozenSide, "UNDER");
  assert.equal(mlbLeanToCanonical(lean({ id: "s", lean: "" })).frozenSide, null);
});

/* ── 4 · reader parity: the migrated readers return the same record from the same fixture ─────── */

function scratchTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mlb-of-record-"));
  const app = path.join(root, "app");
  fs.mkdirSync(path.join(root, "pipeline/validation"), { recursive: true });
  fs.mkdirSync(path.join(app, "public/data/mlb/results"), { recursive: true });
  const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(path.join(root, "pipeline/validation/mlb_settled_leans.jsonl"), jsonl(F.leans));
  fs.writeFileSync(path.join(app, "public/data/mlb/results/settled_leans.jsonl"), jsonl(F.leans));
  fs.writeFileSync(path.join(app, "public/data/mlb/results/game-predictions-graded.jsonl"), jsonl(F.gameGrader));
  return { root, app };
}

test("parity: graded-pick owners (→ graded-picks.json) and the V2 overview population count the fixture once", () => {
  const { root, app } = scratchTree();
  try {
    const owners = makeGradedPickOwners({ appDir: app, rootDir: root });
    const picks = owners.mlbPicks();
    assert.equal(picks.length, E.record.rows);
    const rec = buildGradedRecord({ sport: "mlb", label: "MLB", picks, shown: 10, what: "fixture", caveat: null });
    assert.deepEqual([rec.counts.hits, rec.counts.misses, rec.counts.voided, rec.counts.total],
      [E.record.win, E.record.loss, E.record.void, E.record.rows]);
    const pop = population({ id: "mlb-props", sport: "mlb", label: "x", klass: "RESEARCH", kind: "PROP", owner: "o", today: "2099-01-01",
      rows: picks.map((r) => ({ date: r.when ?? null, outcome: outcomeFromHit(r.hit) })) });
    assert.deepEqual([pop.windows.all.won, pop.windows.all.lost], [E.record.win, E.record.loss]);
    assert.equal(owners.mlbLeanSelection().excluded.superseded, E.superseded.rows);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("parity: the Results V2 day view lists each 824785 lean once across 09-22 and 09-23", async () => {
  const { root, app } = scratchTree();
  const cwd = process.cwd();
  try {
    process.chdir(app);
    const { resultsDay } = await import("./v2/day.ts");
    const props = (d) => resultsDay(d).mlb.filter((e) => e.id === "mlb-824785").flatMap((e) => e.props);
    const d22 = props("2026-09-22");
    const d23 = props("2026-09-23");
    assert.deepEqual([d22.length, d23.length], [E.record.byDate["2026-09-22"], E.record.byDate["2026-09-23"]]);
    const keys = [...d22, ...d23].map((p) => `${p.player}|${p.market}`);
    assert.equal(new Set(keys).size, keys.length, "no lean is listed on both days");
    const decided = [...d22, ...d23].filter((p) => p.outcome === "WIN" || p.outcome === "LOSS");
    assert.equal(decided.filter((p) => p.outcome === "WIN").length, E.record.win);
    assert.equal(decided.filter((p) => p.outcome === "LOSS").length, E.record.loss);
  } finally { process.chdir(cwd); fs.rmSync(root, { recursive: true, force: true }); }
});

/* ── 5 · scope: every MLB lean reader goes through this one adapter ───────────────────────────── */

test("3B scope: the MLB lean readers ask the adapter; only the adapter imports the contract", () => {
  const src = (p) => fs.readFileSync(path.join(APP, p), "utf8");
  assert.match(src("src/lib/sports/graded-pick-owners.mjs"), /mlbLeansOfRecord\(/);
  assert.match(src("src/lib/sports/graded-pick-owners.mjs"), /return sel\.record\s*\n\s*\.filter\(\(r\) => r\.graded\)/);
  assert.match(src("src/lib/results/v2/day.ts"), /mlbLeansOfRecord\(readJsonl\(path\.join\(app, "public\/data\/mlb\/results\/settled_leans\.jsonl"\)\)/);
  assert.match(src("scripts/results/build-model-results-index.mjs"), /selection\?\.notOfRecordIds\.has\(r\.id\)/);
  assert.match(src("scripts/sports/build-graded-picks.mjs"), /mlbOfRecordDisclosure\(mlbLeanSelection\(\)\)/);
});
