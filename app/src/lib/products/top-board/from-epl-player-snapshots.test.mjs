/**
 * Stage 13 prep (Soccer): EPL anytime-goalscorer slot boards fit top-board-receipt@0. Reads only immutable,
 * committed snapshot files named below (never latest.json), so the expectations cannot drift as games are played.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { receiptsFromEplSnapshots } from "./from-epl-player-snapshots.mjs";
import { validateBoardReceipt, SELECTOR_STATUS } from "./top-board.mjs";

const D = path.join(process.cwd(), "public/data/soccer/epl/player-projections");
const FILES = fs.readdirSync(D).filter((f) => /^snapshot-2026082\d{5}\.json$/.test(f)).sort(); // the opening week only
const snaps = FILES.map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(D, f), "utf8")) }));

test("every EPL slot board is a valid SHADOW receipt frozen before its kickoff", () => {
  assert.ok(snaps.length > 0, "the opening-week snapshots are committed");
  for (const bt of ["TOP_5", "TOP_10"]) {
    const { receipts } = receiptsFromEplSnapshots(snaps, { boardType: bt });
    assert.ok(receipts.length > 0);
    for (const r of receipts) {
      assert.deepEqual(validateBoardReceipt(r), [], `${r.boardId}`);
      assert.equal(r.selectorStatus, SELECTOR_STATUS.SHADOW, "an experimental head never ranks publicly from here");
      for (const row of r.rows) assert.ok(Date.parse(r.frozenAt) < Date.parse(row.eventStartUtc));
    }
  }
});

test("the board is the latest snapshot before the slot, ranked by probability, and rebuilds identically", () => {
  const a = receiptsFromEplSnapshots(snaps).receipts, b = receiptsFromEplSnapshots([...snaps].reverse()).receipts;
  assert.deepEqual(a, b, "input order never changes a board");
  for (const r of a) {
    const later = snaps.filter((s) => Date.parse(s.generatedAt) > Date.parse(r.frozenAt) && Date.parse(s.generatedAt) < Date.parse(r.rows[0].eventStartUtc) && s.fixtures.some((f) => Date.parse(f.kickoffUtc) === Date.parse(r.rows[0].eventStartUtc)));
    assert.equal(later.length, 0, `${r.boardId} froze from ${r.source} though a later pre-kickoff snapshot exists`);
    for (let i = 1; i < r.rows.length; i++) assert.ok(r.rows[i - 1].metricValue >= r.rows[i].metricValue);
  }
});
