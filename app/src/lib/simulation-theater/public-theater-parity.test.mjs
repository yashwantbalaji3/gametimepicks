/**
 * Simulation Theater V2 · RENDERER PARITY for the public section: what the island decodes (the `theater-pack@1` the page
 * would serialize) and what the no-JS drive table prints are the receipt's own representative run — same final score,
 * same drive count and sequence, same possession on every drive, same points by quarter. Checked for the receipt of
 * record of every event the public page generates (public-receipt.mjs showableSimulationEvents), through the same
 * publicTheaterLoad the page uses, and for every other receipt on disk.
 *
 * Run: npx tsx --test src/lib/simulation-theater/public-theater-parity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { readShadowReceipts, showableSimulationEvents, simulationOfRecord } from "../sports/nfl/sim-v2/public-receipt.mjs";
import { adaptReceipt } from "./adapter-nfl-sim-v2.mjs";
import { packTheater, unpackTheater } from "./theater-pack.mjs";
import { defaultSample, driveTableRows, publicTheaterLoad } from "./public-theater.mjs";

const REPO = path.resolve(process.cwd(), "..");
const ENTRIES = readShadowReceipts(REPO);
const SIDE = (o) => (o === 0 ? "home" : "away");

/** Compare one decoded sample (and its drive-table rows) with the receipt's representative run. Returns drives checked. */
function assertParity(rep, s, teams, where) {
  const tag = `${where} run #${rep.runIndex}`;
  // final score
  assert.deepEqual(s.finalScore, { home: rep.final.home, away: rep.final.away, overtime: Boolean(rep.final.overtime) }, `${tag}: final`);
  // drive count and sequence, possession and score after every drive
  assert.equal(s.events.length, rep.drives.length, `${tag}: drive count`);
  rep.drives.forEach((d, i) => {
    const ev = s.events[i];
    assert.equal(ev.index, i, `${tag} drive ${i + 1}: order`);
    assert.equal(ev.offense, SIDE(d.offense), `${tag} drive ${i + 1}: possession`);
    assert.equal(ev.outcome, d.result, `${tag} drive ${i + 1}: result`);
    assert.equal(ev.clockStart, d.clockStart, `${tag} drive ${i + 1}: clock`);
    assert.equal(ev.fieldStart, d.startYardsToGoal, `${tag} drive ${i + 1}: start spot`);
    assert.deepEqual([ev.plays, ev.netYards, ev.seconds], [d.plays, d.netYards, d.seconds], `${tag} drive ${i + 1}: totals`);
    assert.deepEqual([ev.scoreAfter.home, ev.scoreAfter.away], d.score, `${tag} drive ${i + 1}: score`);
    assert.equal(ev.inOT, d.q === 5, `${tag} drive ${i + 1}: overtime`);
  });
  const last = s.events[s.events.length - 1];
  assert.deepEqual([last.scoreAfter.home, last.scoreAfter.away], [rep.final.home, rep.final.away], `${tag}: last drive = final`);
  // points by quarter (credited to the period in which the scoring drive ended), OT in slot 5
  for (const side of ["home", "away"]) {
    const by = [0, 0, 0, 0, 0];
    for (const ev of s.events) by[ev.scorePeriod - 1] += ev.delta[side];
    assert.deepEqual(by, rep.quarters[side].map((v) => v ?? 0), `${tag}: ${side} quarters`);
    assert.deepEqual(s.periodScores[side], rep.quarters[side], `${tag}: ${side} linescore`);
  }
  // the no-JS drive table prints the same run
  const rows = driveTableRows(s, teams);
  assert.equal(rows.length, rep.drives.length, `${tag}: table rows`);
  rows.forEach((r, i) => {
    assert.equal(r.n, i + 1);
    assert.equal(r.offenseSide, SIDE(rep.drives[i].offense), `${tag} row ${i + 1}: possession`);
    assert.equal(r.offense, teams[SIDE(rep.drives[i].offense)].abbr);
    assert.deepEqual([r.scoreAfter.home, r.scoreAfter.away], rep.drives[i].score, `${tag} row ${i + 1}: score`);
  });
  return rep.drives.length;
}

test("public section: the decoded pack and the drive table of every showable receipt of record equal the receipt's runs", () => {
  const ids = showableSimulationEvents(ENTRIES);
  assert.ok(ids.length > 0, "no showable event — the parity check would be vacuous");
  let samples = 0, drives = 0;
  for (const id of ids) {
    const rec = simulationOfRecord(ENTRIES, id);
    const load = publicTheaterLoad(rec);
    assert.ok(load.ok, `${id}: ${load.error?.code} ${load.error?.reason}`);
    assert.equal(load.file, rec.file, `${id}: the section shows the page's own receipt of record`);
    assert.equal(load.manifest.receiptId, rec.receipt.simulationReceiptId);
    const decoded = unpackTheater(JSON.parse(JSON.stringify(packTheater(load.manifest))));
    assert.equal(JSON.stringify(decoded), JSON.stringify(load.manifest), `${id}: lossless transport`);
    for (const s of decoded.samples) {
      if (!s.validation.ok) continue;
      const rep = rec.receipt.representativeRuns.find((r) => r.runIndex === s.runIndex && r.kind === s.kind);
      assert.ok(rep, `${id}: run #${s.runIndex} is one of the receipt's representative runs`);
      drives += assertParity(rep, s, decoded.teams, id);
      samples++;
    }
    // the default sample (island's opening run and the drive table's run) is the first available chip
    const d = defaultSample(decoded);
    assert.equal(d.runIndex, decoded.chips.find((c) => c.available).runIndex, `${id}: default run`);
  }
  console.log(`# public parity: ${ids.length} receipts of record, ${samples} samples, ${drives} drives`);
});

test("every receipt on disk: decoded samples equal their representative runs", () => {
  let n = 0;
  for (const { file, receipt } of ENTRIES) {
    const a = adaptReceipt(receipt, { file });
    if (!a.ok) continue;
    const decoded = unpackTheater(packTheater(a.manifest));
    for (const s of decoded.samples) {
      if (!s.validation.ok) continue;
      const rep = receipt.representativeRuns.find((r) => r.runIndex === s.runIndex && r.kind === s.kind);
      assertParity(rep, s, decoded.teams, file);
      n++;
    }
  }
  assert.ok(n > 50, `checked ${n} samples`);
});

test("parity is not vacuous: a pack whose drive sequence or score differs from the receipt fails", () => {
  const id = showableSimulationEvents(ENTRIES)[0];
  const rec = simulationOfRecord(ENTRIES, id);
  const m = publicTheaterLoad(rec).manifest;
  const s = defaultSample(m);
  const rep = rec.receipt.representativeRuns.find((r) => r.runIndex === s.runIndex && r.kind === s.kind);
  const swapped = structuredClone(s);
  swapped.events[1].offense = swapped.events[1].offense === "home" ? "away" : "home";
  assert.throws(() => assertParity(rep, swapped, m.teams, "mutant"), /possession/);
  const dropped = structuredClone(s);
  dropped.events.pop();
  assert.throws(() => assertParity(rep, dropped, m.teams, "mutant"), /drive count/);
  const rescored = structuredClone(s);
  rescored.finalScore.home += 3;
  assert.throws(() => assertParity(rep, rescored, m.teams, "mutant"), /final/);
});
