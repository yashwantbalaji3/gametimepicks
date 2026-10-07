/**
 * Stage 3E pins — remaining Results reader parity.
 *   - The record parity check (lib/results/record-parity.mjs): equal readers agree; any difference or missing reader fails.
 *   - Owners never re-grade and never relabel an unreadable stored grade a void (inventory R8): EPL, UFC, MLB rows
 *     carry `unknown`, counted apart by buildGradedRecord.
 *   - One NFL copy-of-record rule (lib/results/nfl-settlement-of-record.mjs) across the settler lifetime, the NFL
 *     index, the ledger adapter and graded-picks.
 * Fixtures only; no live total is read or pinned. Runs from app/: npx tsx --test src/lib/results/reader-parity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PARITY, parityReport, winsFromAccuracy, ledgerDirectional } from "./record-parity.mjs";
import { nflGameKey, nflSettlementSelection } from "./nfl-settlement-of-record.mjs";
import { makeGradedPickOwners } from "../sports/graded-pick-owners.mjs";
import { buildGradedRecord } from "../sports/graded-picks.mjs";

/* ── parity ───────────────────────────────────────────────────────────────────────────────────── */

test("parity: readers with equal counts agree; a one-row difference fails; a missing reader fails (missing is not zero)", () => {
  const ok = parityReport([{ record: "NFL", readers: [{ name: "a", win: 61, loss: 44 }, { name: "b", win: 61, loss: 44 }] }]);
  assert.equal(ok.ok, true);
  const off = parityReport([{ record: "NFL", readers: [{ name: "a", win: 61, loss: 44 }, { name: "b", win: 62, loss: 43 }] }]);
  assert.equal(off.ok, false);
  assert.equal(off.rows[0].state, PARITY.DISAGREE);
  const gone = parityReport([{ record: "MLB", readers: [{ name: "a", win: 5, loss: 4 }, { name: "b", win: null, loss: null }] }]);
  assert.equal(gone.rows[0].state, PARITY.MISSING);
  assert.equal(gone.ok, false);
  assert.equal(parityReport([]).ok, false, "checking nothing is not a pass");
});

test("parity helpers: settler cohorts → wins; ledger directional counts one family, pushes are neither", () => {
  assert.deepEqual(winsFromAccuracy({ pre: { decisive: 41, winnerAccuracy: 22 / 41 }, reg: { decisive: 64, winnerAccuracy: 39 / 64 } }), { win: 61, loss: 44 });
  const rows = [
    { family: "nfl_game_winner", measurement: { directionalResult: "WIN" } },
    { family: "nfl_game_winner", measurement: { directionalResult: "LOSS" } },
    { family: "nfl_game_winner", measurement: { directionalResult: "PUSH" } },
    { family: "player_rush_yds", measurement: { directionalResult: "WIN" } },
  ];
  assert.deepEqual(ledgerDirectional(rows, "nfl_game_winner"), { win: 1, loss: 1 });
  assert.deepEqual(ledgerDirectional(rows, "absent"), { win: null, loss: null });
});

/* ── owners: no re-grade, unknown is not void ─────────────────────────────────────────────────── */

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-3e-"));
  const app = path.join(root, "app");
  for (const [rel, rows] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
  return makeGradedPickOwners({ appDir: app, rootDir: root });
}

test("EPL: the grader's hit is the grade; a row without one is UNKNOWN, never re-graded from predicted vs actual", () => {
  const owners = tree({ "app/public/data/soccer/epl/results/graded-forecasts.jsonl": [
    { eventId: "e1", date: "2026-09-20", kickoffUtc: "2026-09-20T14:00:00Z", matchup: "A v B", actual: { outcome: "H", homeGoalsFT: 2, awayGoalsFT: 0 }, scores: { predictedOutcome: "H", hit: true } },
    { eventId: "e2", date: "2026-09-20", kickoffUtc: "2026-09-20T16:30:00Z", matchup: "C v D", actual: { outcome: "A", homeGoalsFT: 0, awayGoalsFT: 1 }, scores: { predictedOutcome: "A" } },
  ] });
  const picks = owners.eplPicks();
  const e2 = picks.find((p) => p.eventId === "e2");
  assert.equal(e2.hit, null, "predicted A and actual A is NOT re-graded a hit by the reader");
  assert.equal(e2.unknown, true);
  const rec = buildGradedRecord({ sport: "epl", label: "EPL", picks, what: "x" });
  assert.deepEqual([rec.counts.counted, rec.counts.hits, rec.counts.voided, rec.counts.unknown], [1, 1, 0, 1]);
});

test("UFC: a null hit beside a winner is UNKNOWN; a draw (no winner) stays a void", () => {
  const owners = tree({ "data/internal/research/ufc/model-vs-market/graded.jsonl": [
    { boutId: "b1", eventDate: "2026-10-04", pick: "X", opponent: "Y", winner: "X", hit: true },
    { boutId: "b2", eventDate: "2026-10-04", pick: "P", opponent: "Q", winner: "Q", hit: null },
    { boutId: "b3", eventDate: "2026-10-04", pick: "M", opponent: "N", winner: null, hit: null },
  ] });
  const picks = owners.ufcPicks();
  assert.equal(picks.find((p) => p.eventId === "b2").unknown, true);
  assert.equal(picks.find((p) => p.eventId === "b3").unknown, undefined);
  const rec = buildGradedRecord({ sport: "ufc", label: "UFC", picks, what: "x" });
  assert.deepEqual([rec.counts.counted, rec.counts.voided, rec.counts.unknown], [1, 1, 1]);
});

test("MLB: an outcome word the settler does not write is UNKNOWN; Push and Void stay voids", () => {
  const lean = (id, outcome) => ({ id, date: "2026-09-01", gamePk: 1, playerId: Number(id.slice(1)), marketKey: "hits", lean: "Over", line: 0.5, graded: true, outcome, playerName: "P", playerTeamAbbr: "AAA", opponentAbbr: "BBB", marketLabel: "Hits" });
  const owners = tree({
    "pipeline/validation/mlb_settled_leans.jsonl": [lean("p1", "Win"), lean("p2", "Push"), lean("p3", "Void"), lean("p4", "Graded?")],
    "app/public/data/mlb/results/game-predictions-graded.jsonl": [{ gamePk: 1, date: "2026-09-01", firstPitchUtc: "2026-09-01T23:05:00Z" }],
  });
  const picks = owners.mlbPicks();
  const by = Object.fromEntries(picks.map((p) => [p.eventId, p]));
  assert.equal(by.p4.unknown, true);
  assert.equal(by.p2.unknown, undefined);
  assert.equal(by.p3.unknown, undefined);
  const rec = buildGradedRecord({ sport: "mlb", label: "MLB", picks, what: "x" });
  assert.deepEqual([rec.counts.counted, rec.counts.voided, rec.counts.unknown], [1, 2, 1]);
});

/* ── NFL: one copy-of-record rule ─────────────────────────────────────────────────────────────── */

test("NFL: a game graded in two dated files counts once, as the copy from the later pre-kickoff receipt; unkeyed rows are excluded and counted", () => {
  const ev = (id, gen, correct) => ({ canonicalEventId: id, providerEventId: id.replace("nfl-", ""), kickoffUtc: "2026-10-05T00:15:00Z",
    lineage: { forecastGeneratedAt: gen }, grade: { winner: { correct } } });
  const early = ev("nfl-1", "2026-10-03T12:00:00Z", false);
  const late = ev("nfl-1", "2026-10-04T12:00:00Z", true);
  const after = ev("nfl-1", "2026-10-05T01:00:00Z", false);   // generated after kickoff: never of record
  const unkeyed = { kickoffUtc: "2026-10-05T17:00:00Z", lineage: { forecastGeneratedAt: "2026-10-05T12:00:00Z" }, grade: { winner: { correct: true } } };
  assert.equal(nflGameKey(unkeyed), null);
  const sel = nflSettlementSelection([early, after, late, unkeyed]);
  assert.deepEqual(sel.record, [late]);
  assert.equal(sel.unkeyed.length, 1);
  assert.ok(sel.superseded.length + sel.late.length >= 2);
});

/* ── 3D follow-up: the side-decision cutover file cannot silently disappear ───────────────────── */

test("3D cutover guard: if any committed NFL receipt froze a side, the write-once cutover file exists and pre-dates it", async () => {
  const { readNflSideCutover, NFL_SIDE_CUTOVER_FILE } = await import("./nfl-model-favored-io.mjs");
  const ROOT = path.resolve(process.cwd(), "..");
  const dir = path.join(ROOT, "data/internal/nfl/forecast-receipts");
  let earliestFrozen = null;
  for (const d of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const sub = path.join(dir, d);
    if (!fs.statSync(sub).isDirectory()) continue;
    for (const f of fs.readdirSync(sub)) {
      if (!f.endsWith(".json")) continue;
      let r; try { r = JSON.parse(fs.readFileSync(path.join(sub, f), "utf8")); } catch { continue; }
      const at = r?.sideDecision?.frozenAt ?? null;
      if (at && (!earliestFrozen || at < earliestFrozen)) earliestFrozen = at;
    }
  }
  if (!earliestFrozen) return;   // no receipt has frozen a side yet: nothing to guard
  const cutover = readNflSideCutover(ROOT);
  assert.ok(cutover, `${NFL_SIDE_CUTOVER_FILE} is missing while receipts carry sideDecision: forward rows would silently revert to the historical rule`);
  assert.ok(cutover <= earliestFrozen, "the cutover must not post-date the first frozen side");
});
