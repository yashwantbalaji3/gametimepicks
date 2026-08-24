/**
 * TWO OFFICIAL RECORDS ARE BETTER THAN ONE, AND MORE DANGEROUS.
 *
 * Run: npx tsx --test src/lib/sports/ufc/official-results.test.mjs
 *
 * We capture two independent records of what happened in a fight and every consumer read only the
 * slower one. On 2026-08-23 the settler and the model-vs-market grader both reported that the
 * 2026-08-22 card had no official result, while seven of its bouts sat on disk marked STATUS_FINAL
 * with named winners, captured by our own pipeline nine hours earlier.
 *
 * The temptation with two sources is to prefer whichever answers, which quietly makes the settled
 * record depend on which feed happened to be ahead. These pin the alternative.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadOfficialUfcResults, fighterIndexForDate, RESULT_SOURCE } from "./official-results.mjs";

const corpusDoc = (rows) => ({ results: rows });
const espnDoc = (rows) => ({ rows });

test("A MAIN-CARD BOUT PAST MIDNIGHT UTC KEYS TO ITS EVENT'S DATE, not the next calendar day", () => {
  /*
   * P196 · Release C. The 08-22 card started 21:00 UTC; its main card ran past midnight, so every
   * main-card bout carried dateUtc 2026-08-23 — and keying on the bout's own start day produced
   * 2026-08-23:… keys that could never meet the snapshot's slate-dated 2026-08-22:… boutIds. The
   * prelims graded; the ENTIRE main card, headliner included, was ungradeable by construction, and
   * the gap read as "results source lagging". eventDateUtc (the provider's own event date) now
   * keys the join; the bout date remains the fallback for captures that predate the field.
   */
  const { byBout } = loadOfficialUfcResults({
    corpus: corpusDoc([]),
    espn: espnDoc([{
      dateUtc: "2026-08-23T01:00Z",            // bout start: after midnight UTC
      eventDateUtc: "2026-08-22T21:00Z",       // the card it belongs to
      statusRaw: "STATUS_FINAL",
      red: { name: "Gregory Rodrigues" }, blue: { name: "Anthony Hernandez" },
      redWinner: true, blueWinner: false,
    }]),
  });
  const key = [...byBout.keys()][0];
  assert.match(key, /^2026-08-22:/, "the key carries the EVENT's date");
  assert.equal([...byBout.values()][0].winner, "Gregory Rodrigues");
});

test("a bout only ESPN has is usable — that is the entire point", () => {
  const { byBout } = loadOfficialUfcResults({
    corpus: corpusDoc([]),
    espn: espnDoc([{ dateUtc: "2026-08-22T21:30Z", statusRaw: "STATUS_FINAL", red: { name: "Stan Dorsainvil" }, blue: { name: "Gauge Young" }, redWinner: true, blueWinner: false }]),
  });
  const r = [...byBout.values()][0];
  assert.equal(r.winner, "Stan Dorsainvil");
  assert.equal(r.source, RESULT_SOURCE.ESPN);
});

test("when both sources agree the bout is marked as agreed, not as one source's", () => {
  const { byBout, conflicts } = loadOfficialUfcResults({
    corpus: corpusDoc([{ eventDate: "2026-08-22", fighterA: "Stan Dorsainvil", fighterB: "Gauge Young", winner: "Stan Dorsainvil", loser: "Gauge Young" }]),
    espn: espnDoc([{ dateUtc: "2026-08-22T21:30Z", statusRaw: "STATUS_FINAL", red: { name: "Stan Dorsainvil" }, blue: { name: "Gauge Young" }, redWinner: true, blueWinner: false }]),
  });
  assert.equal(conflicts.length, 0);
  assert.equal([...byBout.values()][0].source, RESULT_SOURCE.BOTH);
});

test("A DISAGREEMENT IS REFUSED, NEVER RESOLVED", () => {
  /*
   * Dropping the bout leaves it unsettled and visibly so, which is recoverable. Picking a side
   * would write a winner into an append-only ledger on the strength of a coin toss between two
   * records that contradict each other.
   */
  const { byBout, conflicts } = loadOfficialUfcResults({
    corpus: corpusDoc([{ eventDate: "2026-08-22", fighterA: "Stan Dorsainvil", fighterB: "Gauge Young", winner: "Gauge Young", loser: "Stan Dorsainvil" }]),
    espn: espnDoc([{ dateUtc: "2026-08-22T21:30Z", statusRaw: "STATUS_FINAL", red: { name: "Stan Dorsainvil" }, blue: { name: "Gauge Young" }, redWinner: true, blueWinner: false }]),
  });
  assert.equal(byBout.size, 0, "a contradicted bout must not be settleable at all");
  assert.equal(conflicts.length, 1);
  assert.ok(conflicts[0].corpus && conflicts[0].espn, "the conflict must name both claims so a human can adjudicate");
});

test("a bout still in progress is NOT a result", () => {
  const { byBout } = loadOfficialUfcResults({
    corpus: corpusDoc([]),
    espn: espnDoc([{ dateUtc: "2026-08-22T21:30Z", statusRaw: "STATUS_IN_PROGRESS", red: { name: "A" }, blue: { name: "B" }, redWinner: false, blueWinner: false }]),
  });
  assert.equal(byBout.size, 0);
});

test("a draw or no-contest is VOID, never a winner and never 'not fought yet'", () => {
  const { byBout } = loadOfficialUfcResults({
    corpus: corpusDoc([]),
    espn: espnDoc([{ dateUtc: "2026-08-22T21:30Z", statusRaw: "STATUS_FINAL", red: { name: "A" }, blue: { name: "B" }, redWinner: false, blueWinner: false }]),
  });
  const r = [...byBout.values()][0];
  assert.equal(r.void, true);
  assert.equal(r.winner, null);
  assert.equal(fighterIndexForDate(byBout, "2026-08-22").size, 0, "a void bout settles nobody");
});

test("the fighter index is confined to ONE card date — a rematch cannot borrow its original's result", () => {
  const { byBout } = loadOfficialUfcResults({
    corpus: corpusDoc([
      { eventDate: "2026-03-01", fighterA: "Gauge Young", fighterB: "Someone Else", winner: "Gauge Young", loser: "Someone Else" },
      { eventDate: "2026-08-22", fighterA: "Stan Dorsainvil", fighterB: "Gauge Young", winner: "Stan Dorsainvil", loser: "Gauge Young" },
    ]),
    espn: espnDoc([]),
  });
  const idx = fighterIndexForDate(byBout, "2026-08-22");
  assert.equal(idx.get("gauge young").won, false, "the March win must not settle an August bout");
  assert.equal(fighterIndexForDate(byBout, "2026-03-01").get("gauge young").won, true);
});

test("LIVE ARTIFACTS · the two sources we actually capture do not contradict each other", () => {
  const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), p), "utf8")); } catch { return null; } };
  const corpus = read("public/data/ufc/results-latest.json");
  const espn = read("public/data/ufc/results/latest.json");
  if (!corpus || !espn) return;
  const { byBout, conflicts } = loadOfficialUfcResults({ corpus, espn });
  assert.ok(byBout.size > 0, "the merge must produce something from two populated captures");
  assert.deepEqual(conflicts, [],
    `the two official records disagree on ${conflicts.length} bout(s) — adjudicate before either settles anything`);
});
