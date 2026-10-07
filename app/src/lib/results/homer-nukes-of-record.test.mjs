/**
 * HN-1 pins (founder Q1-RULE, 2026-10-07): Homer Nukes picks of record. Synthetic fixtures for the rules; the committed
 * correction log is checked only for consistency with the committed settled files (never a live total).
 * Runs from app/: npx tsx --test src/lib/results/homer-nukes-of-record.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HN_CORRECTION_SCHEMA, HN_EXCLUSION, homerNukesDayOfRecord, homerNukesRecord, indexHomerNukesCorrections } from "./homer-nukes-of-record.mjs";
import { readHomerNukesCorrections } from "./homer-nukes-of-record-io.mjs";
import { homerNukesRows, homerNukesRestatedIds } from "../forecast-ledger/adapters/mlb.mjs";
import { compareLedgers } from "../forecast-ledger/append-only.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..");

const pick = (playerId, probability, result, gamePk = 1) => ({ playerId, player: `P${playerId}`, gamePk, probability, result, homeRuns: result === "hit" ? 1 : 0, source: "mlb_stats_api" });
const settled = (date, picks) => ({ date, settledAt: `${date}T12:00:00Z`, modelId: "m", picks });
const log = (entries) => ({ schema: HN_CORRECTION_SCHEMA, id: "test-log", decision: { ref: "x" }, entries });
const asGraded = (picks) => ({ picks: picks.map((p) => ({ playerId: p.playerId, probability: p.probability, result: p.result })) });

const CLEAN = settled("2026-09-01", [pick(1, 0.25, "hit"), pick(2, 0.2, "miss")]);
const NO_LIST = settled("2026-09-02", [pick(3, 0.3, "hit"), pick(4, 0.2, "miss")]);
const SWAPPED = settled("2026-09-03", [pick(5, 0.2567, "miss"), pick(6, 0.23, "miss")]);
const C = indexHomerNukesCorrections([log([
  { date: "2026-09-02", action: "EXCLUDE_DAY", reason: HN_EXCLUSION.NO_PREGAME_LIST, gradedAsPublished: asGraded(NO_LIST.picks) },
  { date: "2026-09-03", action: "GRADE_ON_LIST_OF_RECORD", reason: "POST_START_REWRITE", gradedAsPublished: asGraded(SWAPPED.picks),
    evidence: { listOfRecord: { commit: "abc123" } },
    ofRecord: [{ playerId: 5, player: "P5", gamePk: 1, probability: 0.2596, probabilityAsGraded: 0.2567, result: "miss", homeRuns: 0 },
               { playerId: 7, player: "P7", gamePk: 1, probability: 0.2288, result: "hit", homeRuns: 1 }] },
])]);

test("a day with no pregame list is EXCLUDED and disclosed, never a miss; a clean day is untouched", () => {
  const clean = homerNukesDayOfRecord(CLEAN, C);
  assert.deepEqual(clean.picks, CLEAN.picks);
  assert.equal(clean.excluded, null);
  const ex = homerNukesDayOfRecord(NO_LIST, C);
  assert.equal(ex.picks.length, 0);
  assert.equal(ex.excluded.reason, HN_EXCLUSION.NO_PREGAME_LIST);
  assert.equal(ex.excluded.picks.length, 2);
});

test("a post-start rewrite: graded on the last pre-first-pitch list, its numbers, the late addition excluded", () => {
  const d = homerNukesDayOfRecord(SWAPPED, C);
  assert.deepEqual(d.picks.map((p) => [p.playerId, p.probability, p.result]), [[5, 0.2596, "miss"], [7, 0.2288, "hit"]]);
  assert.deepEqual(d.excluded.picks.map((p) => p.playerId), [6]);
  const rec = homerNukesRecord([CLEAN, NO_LIST, SWAPPED].map((s) => homerNukesDayOfRecord(s, C)));
  assert.equal(rec.gradedPicks, 4);
  assert.equal(rec.actual, 2);
  assert.deepEqual(rec.excluded.days, [{ date: "2026-09-02", reason: HN_EXCLUSION.NO_PREGAME_LIST }]);
  assert.equal(rec.excluded.picks, 3);
  assert.deepEqual(rec.excluded.correctedDays, ["2026-09-03"]);
});

test("a stale log (the settled file no longer holds the graded list it corrects) and a double restatement throw", () => {
  assert.throws(() => homerNukesDayOfRecord(settled("2026-09-02", [pick(9, 0.2, "miss")]), C), /does not hold/);
  assert.throws(() => indexHomerNukesCorrections([log([{ date: "d", action: "EXCLUDE_DAY", gradedAsPublished: { picks: [] } }]),
    { ...log([{ date: "d", action: "EXCLUDE_DAY", reason: "other", gradedAsPublished: { picks: [] } }]), id: "b" }]), /restated twice/);
});

test("ledger: excluded rows stay as NO_MEASUREMENT with a recorded correction; the restated probability passes only when named", () => {
  const files = [{ file: "f2", doc: NO_LIST }, { file: "f3", doc: SWAPPED }];
  const before = homerNukesRows(files);
  const after = homerNukesRows(files, C);
  assert.equal(after.length, before.length + 1, "the list-of-record member the settler never graded gets its own row");
  const added = after.find((r) => r.subjectId === "mlb-player-7");
  assert.equal(added.receiptId, "mlb/homer-nukes/2026-09-03.json@abc123");
  assert.equal(after.filter((r) => r.settlement.state === "NO_MEASUREMENT").length, 3);
  assert.deepEqual(compareLedgers(before, after, { probabilityRestated: homerNukesRestatedIds(after) }), []);
  const refused = compareLedgers(before, after).map((v) => v.kind);
  assert.deepEqual(refused, ["IMMUTABLE_CHANGED"], "without the committed restatement, the probability change is refused");
});

test("the committed HN-1 log is consistent with the committed settled files (it corrects exactly what they hold)", () => {
  const corrections = readHomerNukesCorrections(path.resolve(APP, ".."));
  const dir = path.join(APP, "public/data/mlb/homer-nukes");
  for (const date of corrections.keys()) {
    const f = path.join(dir, `settled-${date}.json`);
    assert.ok(fs.existsSync(f), `${date} is corrected but has no settled file`);
    assert.doesNotThrow(() => homerNukesDayOfRecord(JSON.parse(fs.readFileSync(f, "utf8")), corrections));
  }
});
