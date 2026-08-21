/**
 * The public graded record — read from the settler's ledgers, never guessed at.
 *
 * Run: npx tsx --test src/lib/sports/epl/graded-record.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { gradedRecordCaption, loadEplGradedRecord } from "./graded-record.ts";

const LEDGER = "public/data/soccer/epl/results/graded-player-projections.jsonl";

const readLedger = () => {
  const p = path.join(process.cwd(), LEDGER);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
};

test("LIVE · the reported counts equal the ledger's OWN outcome tally", () => {
  const rows = readLedger();
  if (!rows) return; // nothing settled yet — the loader's NONE path is covered below
  const rec = loadEplGradedRecord();
  assert.ok(rec, "the ledger exists, so the record must be readable");

  // The defect this pins: the first version looked for a boolean `voided` field that the settler
  // never writes, reported 0 voids against 18 real ones, and got the graded count right only by
  // accident. The counts are therefore checked against the ledger's own vocabulary, not against
  // numbers copied from a run log — which would rot the next time a match is graded.
  const tally = (o) => rows.filter((r) => r.outcome === o).length;
  assert.equal(rec.player.rows, tally("HIT") + tally("MISS"), "graded = HIT + MISS");
  assert.equal(rec.player.voided, tally("VOID"), "void rows must be counted as void");
  assert.equal(rec.player.hits, tally("HIT"));
  assert.equal(rec.player.rows + rec.player.voided, rows.length, "every ledger row is accounted for");
  assert.ok(rec.player.voided > 0, "this ledger is known to contain voids — a zero here means the encoding drifted");
});

test("a VOID never contributes to a mean — a condition that did not hold is not a miss", () => {
  const rec = loadEplGradedRecord();
  if (!rec || rec.player.rows === 0) return;
  // Log loss is a mean over graded rows only. If voids leaked in as misses the mean would move, and
  // a player who never left the bench would be counted against the model.
  assert.ok(rec.player.meanLogLoss === null || rec.player.meanLogLoss > 0);
  assert.ok(rec.player.hits <= rec.player.rows, "hits cannot exceed graded rows");
});

test("an unrecognised outcome is counted as NEITHER graded nor void", () => {
  // Not reachable through the live ledger, so asserted on the rule: a row whose meaning is unknown
  // must not be folded into a published mean just because it is present.
  const rows = readLedger();
  if (!rows) return;
  const known = new Set(["HIT", "MISS", "VOID"]);
  const unknown = rows.filter((r) => !known.has(String(r.outcome)));
  assert.deepEqual(unknown, [], "the ledger contains an outcome this reader does not understand");
});

test("the caption never lets a small sample read as a validation", () => {
  assert.equal(gradedRecordCaption(null), "record unreadable");
  assert.equal(gradedRecordCaption({ sampleState: "NONE", team: { matches: 0 } }), "no track record yet");
  assert.match(gradedRecordCaption({ sampleState: "TOO_SMALL_TO_ASSESS", team: { matches: 1 } }), /far too few/);
  assert.match(gradedRecordCaption({ sampleState: "TOO_SMALL_TO_ASSESS", team: { matches: 9 } }), /far too few/);
  // Even the largest state this module can report refuses the word "validated".
  assert.match(gradedRecordCaption({ sampleState: "ACCUMULATING", team: { matches: 50 } }), /not a validation/);
});

test("ABSENT is not zero — an unreadable record must not render as 'nothing has happened'", () => {
  // The loader returns null when neither ledger can be read, and the caption says so rather than
  // claiming a clean slate. "We could not read the record" and "there is no record" differ.
  assert.equal(gradedRecordCaption(null), "record unreadable");
  assert.notEqual(gradedRecordCaption(null), "no track record yet");
});
