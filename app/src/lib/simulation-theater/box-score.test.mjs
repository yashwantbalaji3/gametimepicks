/**
 * Simulation Theater V2 · the projected box score is run-bound, exact where it says so, and fails closed.
 *
 * Run: npx tsx --test src/lib/simulation-theater/box-score.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { adaptReceipt } from "./adapter-nfl-sim-v2.mjs";
import { adaptAllReceipts, loadTheater } from "./loader.mjs";
import { packTheater, unpackTheater } from "./theater-pack.mjs";
import {
  BOX_SCORE_VERSION, BOX_SCORE_WATERMARK, BoxScoreInvariantError, NOT_MODELED_TEXT, PLAYER_NOT_MODELED_REASON, STATUS,
  nflBoxScore, safeNflBoxScore,
} from "./box-score.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
/** The write-once reference receipt (run #428, the shell test's pin). */
const REF_FILE = "data/internal/research/nfl/sim-v2/shadow/2026-10-17/401873008-6da012510c023181.json";
const adaptFile = (rel) => {
  const a = adaptReceipt(JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8")), { file: rel });
  assert.ok(a.ok, `${rel} adapts`);
  return a.manifest;
};
const cat = (box, id) => box.categories.find((c) => c.id === id);
const sides = ["away", "home"];

test("run of record for 401873008: header, provenance and run binding", () => {
  const t = loadTheater(REPO, "401873008");
  assert.ok(t.ok, "the record loads");
  const m = t.manifest;
  for (const s of m.samples) {
    const box = nflBoxScore(s, m);
    assert.equal(box.version, BOX_SCORE_VERSION);
    assert.equal(box.watermark, BOX_SCORE_WATERMARK);
    assert.equal(box.header.label, "SIMULATED FINAL");
    assert.equal(box.header.matchup, `${m.teams.away.abbr} @ ${m.teams.home.abbr}`);
    assert.equal(box.header.runIndex, s.runIndex);
    assert.equal(box.header.engine, "nfl-drive-sim-v2");
    assert.equal(box.header.engineVersion, m.engineVersion);
    assert.equal(box.header.receiptId, m.receiptId);
    assert.equal(box.header.receiptFile, t.file);
    assert.equal(box.header.receiptHash, m.receiptHash);
    assert.equal(box.header.generatedAt, m.generatedAt);
    assert.deepEqual(box.header.final, { away: s.finalScore.away, home: s.finalScore.home });
    assert.equal(box.header.overtime, s.finalScore.overtime);
    assert.match(box.provenance, new RegExp(`^Run #${s.runIndex.toLocaleString("en-US")} of `));
    assert.ok(box.provenance.includes(m.receiptId) && box.provenance.includes(m.receiptHash));
    assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(box.provenance), "no raw ISO stamp in the visible line (pages print it through EtTime)");
  }
});

/** A write-once receipt whose OVERTIME representative is WSH 38–35 SF (OT). Pinned: the receipt OF RECORD moves as new
 *  pre-kickoff receipts are committed, and its OT run (if any) moves with it. */
const OT_FILE = "data/internal/research/nfl/sim-v2/shadow/2026-10-19/401873008-93e33ba709b93f85.json";

test("the Overtime representative of a pinned 401873008 receipt: WSH 38–35 SF in OT, with an OT column", () => {
  const m = adaptFile(OT_FILE);
  const ot = m.samples.find((s) => s.kind === "OVERTIME");
  assert.ok(ot, "an OVERTIME representative exists");
  const box = nflBoxScore(ot, m);
  assert.equal(box.header.scoreLine, "WSH 38–35 SF (OT)");
  assert.equal(box.header.overtime, true);
  assert.equal(box.header.winner, "away");
  assert.deepEqual(box.periods.columns, ["Q1", "Q2", "Q3", "Q4", "OT"]);
  assert.deepEqual(box.periods.away, [0, 14, 8, 13, 3]);
  assert.deepEqual(box.periods.home, [10, 10, 0, 15, 0]);
  assert.match(cat(box, "top").note, /overtime included/);
  const otSecs = ot.events.filter((e) => e.inOT).reduce((a, e) => a + e.seconds, 0);
  assert.equal(cat(box, "top").away.value + cat(box, "top").home.value, 3600 + otSecs, "possession = 60:00 + overtime clock");
});

test("reference receipt run #428 (SF 29–21 WSH): every derived number recomputed independently from the raw drives", () => {
  const rel = REF_FILE;
  const raw = JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));
  const m = adaptFile(rel);
  const s = m.samples.find((x) => x.runIndex === 428);
  const box = nflBoxScore(s, m);
  assert.equal(box.header.scoreLine, "WSH 21–29 SF");
  assert.deepEqual(box.periods.columns, ["Q1", "Q2", "Q3", "Q4"]);
  assert.deepEqual(box.periods.home, [13, 7, 3, 6]);
  assert.deepEqual(box.periods.away, [0, 7, 14, 0]);
  const drives = raw.representativeRuns.find((r) => r.runIndex === 428).drives;
  for (const [side, o] of [["home", 0], ["away", 1]]) {
    const off = drives.filter((d) => d.offense === o);
    const sum = (k) => off.reduce((a, d) => a + d[k], 0);
    const n = (r) => off.filter((d) => d.result === r).length;
    assert.equal(cat(box, "drives")[side].value, off.length);
    assert.equal(cat(box, "plays")[side].value, sum("plays"));
    assert.equal(cat(box, "yards")[side].value, sum("netYards"));
    assert.equal(cat(box, "top")[side].value, sum("seconds"));
    assert.equal(cat(box, "td")[side].value, n("TD"));
    assert.equal(cat(box, "fg")[side].value, n("FG"));
    assert.equal(cat(box, "fgMiss")[side].value, n("FG_MISS"));
    assert.equal(cat(box, "punts")[side].value, n("PUNT"));
    assert.equal(cat(box, "giveaways")[side].value, n("TURNOVER") + n("OPP_TD"));
    assert.equal(cat(box, "downs")[side].value, n("DOWNS"));
    assert.equal(cat(box, "endHalf")[side].value, n("END_HALF"));
    assert.equal(cat(box, "scoringDrives")[side].value, n("TD") + n("FG"));
    assert.equal(cat(box, "ypp")[side].value, Math.round((sum("netYards") / sum("plays")) * 10) / 10);
    assert.equal(cat(box, "points")[side].value, raw.representativeRuns.find((r) => r.runIndex === 428).final[side]);
  }
  assert.match(box.composition.home, /^\d+ TD × 6 .*= 29$/);
  assert.match(box.composition.away, /= 21$/);
});

test("EVERY representative run on disk: invariants hold and the numbers reconcile (and the reference receipt's runs)", () => {
  let receipts = 0;
  let runs = 0;
  let otRuns = 0;
  for (const a of adaptAllReceipts(REPO)) {
    if (!a.ok || !Array.isArray(a.manifest?.samples)) continue;
    receipts++;
    for (const s of a.manifest.samples) {
      if (!s.validation.ok) {
        assert.equal(safeNflBoxScore(s, a.manifest).ok, false, `${a.file} run #${s.runIndex}: an invalid run never gets a box score`);
        continue;
      }
      const box = nflBoxScore(s, a.manifest);
      runs++;
      if (box.header.overtime) otRuns++;
      const ids = box.invariants.map((x) => x.id);
      for (const id of ["FINAL_MATCHES_LAST_DRIVE", "OT_FLAG", "PERIODS_SUM_TO_FINAL", "PERIODS_MATCH_DRIVES", "FIELD_SPOTS", "CLOCK_TOTAL", "POINTS_COMPOSITION", "POINTS_ATTRIBUTED", "DRIVE_COUNT", "TOP_TOTAL"]) {
        assert.ok(ids.includes(id), `${a.file} run #${s.runIndex}: invariant ${id}`);
      }
      assert.ok(box.invariants.every((x) => x.ok));
      for (const side of sides) {
        const v = (id) => cat(box, id)[side].value;
        assert.equal(box.periods[side].reduce((x, y) => x + y, 0), box.header.final[side], "periods sum to final");
        assert.equal(6 * (v("td") + v("defTd")) + v("tryPts") + 3 * v("fg") + 2 * v("safeties"), v("points"), "composition");
        assert.equal(v("tryPts"), v("xpMade") + 2 * v("twoMade"), "try points = kicks + 2 × two-point tries");
        assert.equal(v("xpMade") + v("twoMade") + v("tryFailed"), v("td") + v("defTd"), "one try per touchdown");
      }
      assert.equal(cat(box, "drives").away.value + cat(box, "drives").home.value, s.events.length);
      assert.equal(box.periods.columns.length, box.header.overtime ? 5 : 4);
    }
  }
  assert.ok(receipts >= 100, `exercised ${receipts} receipts`);
  assert.ok(otRuns > 0, "overtime runs exercised");
  console.log(`# box score: ${runs} runs over ${receipts} receipts reconcile (${otRuns} in overtime)`);
});

test("NOT_MODELED is never a number: player sections and unsupported team categories carry text and a reason", () => {
  const m = loadTheater(REPO, "401873008").manifest;
  const box = nflBoxScore(m.samples[0], m);
  assert.deepEqual(box.players.map((p) => p.id), ["passing", "rushing", "receiving", "kicking", "defense"]);
  for (const p of box.players) {
    assert.equal(p.status, STATUS.NOT_MODELED);
    assert.equal(p.reason, PLAYER_NOT_MODELED_REASON);
    assert.equal(p.reason, "this engine records drives, not plays or players");
    assert.ok(!("value" in p) && !("rows" in p), "no player numbers at all");
  }
  const nm = box.categories.filter((c) => c.status === STATUS.NOT_MODELED);
  assert.ok(nm.some((c) => c.id === "redZoneTrips"), "red-zone trips are not exactly computable from start/end spots");
  for (const c of nm) {
    for (const side of sides) {
      assert.equal(c[side].value, null, `${c.id}: null, never 0`);
      assert.equal(c[side].display, NOT_MODELED_TEXT);
      assert.ok(!/\d/.test(c[side].display));
    }
    assert.ok(c.reason && c.reason.length > 10, `${c.id}: a reason`);
  }
  for (const c of box.categories.filter((x) => x.status !== STATUS.NOT_MODELED)) {
    for (const side of sides) assert.notEqual(c[side].value, null, `${c.id}: a modeled/derived value is present`);
  }
  // nothing from World Model V2 or the batch distributions is spliced in
  const json = JSON.stringify(box);
  assert.ok(!/allocV1|world-model|sampledWorlds|playerStatDistributions|teamStatDistributions/.test(json));
});

test("statuses: only the final score and points by period are MODELED; everything computed is DERIVED", () => {
  const m = loadTheater(REPO, "401873008").manifest;
  const box = nflBoxScore(m.samples[0], m);
  assert.equal(box.periods.status, STATUS.MODELED);
  assert.deepEqual(box.categories.filter((c) => c.status === STATUS.MODELED).map((c) => c.id), ["points"]);
  assert.ok(box.categories.every((c) => Object.values(STATUS).includes(c.status)));
});

test("determinism, and the client path (unpacked theater-pack@1) yields a byte-identical box score", () => {
  const m = loadTheater(REPO, "401873008").manifest;
  const client = unpackTheater(JSON.parse(JSON.stringify(packTheater(m))));
  m.samples.forEach((s, i) => {
    const a = JSON.stringify(nflBoxScore(s, m));
    assert.equal(JSON.stringify(nflBoxScore(s, m)), a, "same input, same output");
    assert.equal(JSON.stringify(nflBoxScore(client.samples[i], client)), a, `sample ${i}: client = server`);
  });
});

test("fails closed: every broken reconciliation throws (and safeNflBoxScore reports it), never a partial table", () => {
  const m = adaptFile(REF_FILE);
  const base = m.samples.find((x) => x.runIndex === 428);
  const mut = (f) => { const s = structuredClone(base); f(s); return s; };
  const firstTd = base.events.findIndex((e) => e.outcome === "TD");
  const firstPunt = base.events.findIndex((e) => e.outcome === "PUNT");
  const cases = [
    ["SAMPLE_INVALID", mut((s) => { s.validation.ok = false; })],
    ["RUN_BINDING", mut((s) => { s.receiptId = "nfl-sim-v2:other:0"; })],
    ["NO_DRIVES", mut((s) => { s.events = []; })],
    ["FINAL_MISMATCH", mut((s) => { s.finalScore.home += 1; })],
    ["PERIOD_CREDIT", mut((s) => { s.periodScores.home[0] += 3; s.periodScores.home[1] -= 3; })],
    ["OT_FLAG", mut((s) => { s.finalScore.overtime = true; })],
    ["FIELD", mut((s) => { s.events[firstPunt].fieldEnd += 1; })],
    ["CLOCK_TOTAL", mut((s) => { s.events[firstPunt].seconds += 1; })],
    ["SCORE_CHAIN", mut((s) => { s.events[1].scoreBefore.home += 1; })],
  ];
  // a touchdown recorded as worth 5 (score-after edited consistently through the run, periods and final too)
  cases.push(["TD_POINTS", mut((s) => {
    const side = s.events[firstTd].offense;
    for (let i = firstTd; i < s.events.length; i++) {
      s.events[i].scoreAfter[side] -= 2;
      if (i > firstTd) s.events[i].scoreBefore[side] -= 2;
    }
    s.events[firstTd].delta[side] -= 2;
    s.finalScore[side] -= 2;
    s.periodScores[side][s.events[firstTd].scorePeriod - 1] -= 2;
  })]);
  // points on a punt (consistently threaded): unattributed
  cases.push(["UNATTRIBUTED_POINTS", mut((s) => {
    const p = firstPunt;
    for (let i = p; i < s.events.length; i++) {
      s.events[i].scoreAfter.away += 1;
      if (i > p) s.events[i].scoreBefore.away += 1;
    }
    s.events[p].delta.away += 1;
    s.finalScore.away += 1;
    s.periodScores.away[s.events[p].scorePeriod - 1] += 1;
  })]);
  for (const [code, s] of cases) {
    assert.throws(() => nflBoxScore(s, m), (e) => e instanceof BoxScoreInvariantError && e.code === code, `expected ${code}`);
    const r = safeNflBoxScore(s, m);
    assert.equal(r.ok, false);
    assert.equal(r.box, null, "no partial box score");
    assert.equal(r.error.code, code);
  }
});
