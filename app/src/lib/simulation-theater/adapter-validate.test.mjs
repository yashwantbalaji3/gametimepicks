/**
 * Simulation Theater V2 · adapter + validation over EVERY receipt on disk (spec §4.2–4.3, ST2-01 / ST2-01b; review §6).
 * Iterates all receipts — never a hard-coded count — and reports the counts it found.
 *
 * Run: npx tsx --test src/lib/simulation-theater/adapter-validate.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { readShadowReceipts } from "../sports/nfl/sim-v2/public-receipt.mjs";
import { adaptReceipt } from "./adapter-nfl-sim-v2.mjs";
import { checkEngineIdentity, validateRun, isClockRunoff } from "./validate.mjs";
import { displayPeriodAtStart, fmtPeriodClock, periodAtEnd, transcriptSentence } from "./format.mjs";

const REPO = path.resolve(process.cwd(), "..");
const ENTRIES = readShadowReceipts(REPO);
const ADAPTED = ENTRIES.map((e) => ({ ...e, a: adaptReceipt(e.receipt, { file: e.file }) }));
const REF_FILE = "data/internal/research/nfl/sim-v2/shadow/2026-10-17/401873008-6da012510c023181.json";
const ref = () => ADAPTED.find((x) => x.file === REF_FILE);
const clone = (o) => JSON.parse(JSON.stringify(o));

test("every receipt on disk adapts and every representative validates (or fails with a reason) — counts reported", () => {
  assert.ok(ENTRIES.length > 0, "no receipts found — the scan would be vacuous");
  let runs = 0, ok = 0, failed = 0, drives = 0;
  const failures = [];
  for (const x of ADAPTED) {
    assert.ok(x.a.ok, `${x.file}: ${x.a.error?.code} ${x.a.error?.reason}`);
    for (const s of x.a.manifest.samples) {
      runs++;
      if (s.validation.ok) { ok++; drives += s.events.length; } else { failed++; failures.push(`${x.file} #${s.runIndex}: ${s.validation.errors.map((e) => e.code).join(",")}`); }
      if (!s.validation.ok) assert.ok(s.validation.errors.every((e) => e.code && e.detail), "a failure always carries a code and a readable reason");
    }
  }
  console.log(`# theater: ${ENTRIES.length} receipts · ${runs} representative runs · ${ok} valid · ${failed} failed · ${drives} drives`);
  assert.deepEqual(failures, [], "every representative run on main is expected to validate");
});

test("rule 2 · score reconciliation: last drive = final; quarter sums by END-instant period reconcile (840-style check over all runs)", () => {
  for (const x of ADAPTED) {
    for (const rep of x.receipt.representativeRuns) {
      const last = rep.drives.at(-1);
      assert.deepEqual(last.score, [rep.final.home, rep.final.away], `${x.file} #${rep.runIndex}`);
      const s = x.a.manifest.samples.find((y) => y.kind === rep.kind);
      for (const side of ["home", "away"]) {
        const byPeriod = [0, 0, 0, 0, 0];
        for (const ev of s.events) byPeriod[ev.scorePeriod - 1] += ev.delta[side];
        assert.deepEqual(byPeriod, rep.quarters[side].map((v) => v ?? 0), `${x.file} #${rep.runIndex} ${side}`);
      }
    }
  }
});

test("rule 4 · second-half receiver is 1 − opening receiver in every run", () => {
  let n = 0;
  for (const x of ADAPTED) for (const s of x.a.manifest.samples) {
    const opener = s.events.find((e, i) => i > 0 && !e.inOT && s.events[i - 1].clockStart > 1800 && s.events[i - 1].clockEnd === 1800);
    assert.ok(opener, `${x.file} #${s.runIndex}: no second-half opener`);
    assert.notEqual(opener.offense, s.events[0].offense);
    n++;
  }
  console.log(`# theater: second-half receiver correct in ${n}/${n} runs`);
});

test("S1 · displayed quarter comes from the clock: every second-half opener reads Q3 15:00; 2700/900 starts read Q2/Q4 15:00", () => {
  let openers = 0, at2700 = 0, at900 = 0;
  for (const x of ADAPTED) for (const s of x.a.manifest.samples) for (const e of s.events) {
    if (e.inOT) continue;
    if (e.clockStart === 1800) { openers++; assert.equal(e.engineQ, 2); assert.equal(fmtPeriodClock(e.period, e.periodClockStart), "Q3 15:00"); }
    if (e.clockStart === 2700) { at2700++; assert.equal(fmtPeriodClock(e.period, e.periodClockStart), "Q2 15:00"); }
    if (e.clockStart === 900) { at900++; assert.equal(fmtPeriodClock(e.period, e.periodClockStart), "Q4 15:00"); }
  }
  console.log(`# theater: boundary starts — 1800: ${openers}, 2700: ${at2700}, 900: ${at900}`);
  assert.equal(displayPeriodAtStart(3600), 1);
  assert.equal(periodAtEnd(1800), 2);
  assert.equal(periodAtEnd(2700), 1);
});

test("run #428 (reference receipt): drive 10 = Q3 15:00, drive 15 = Q4 15:00, drive 19 = end of regulation, drive 1 transcript", () => {
  const x = ref();
  assert.ok(x, "reference receipt present");
  const s = x.a.manifest.samples.find((y) => y.runIndex === 428);
  const teams = x.a.manifest.teams;
  const d10 = s.events[9];
  assert.equal(d10.engineQ, 2);
  assert.equal(d10.clockStart, 1800);
  assert.equal(fmtPeriodClock(d10.period, d10.periodClockStart), "Q3 15:00");
  const d15 = s.events[14];
  assert.equal(d15.engineQ, 3);
  assert.equal(d15.clockStart, 900);
  assert.equal(fmtPeriodClock(d15.period, d15.periodClockStart), "Q4 15:00");
  const d19 = s.events[18];
  assert.equal(d19.outcome, "END_HALF");
  assert.equal(d19.outcomeLabel, "end of regulation");
  assert.equal(transcriptSentence(s.events[0], teams), "Q1 15:00 · SF ball at own 30 · 11 plays, 28 yards, 2:45 · field goal · SF 3–0");
  // drive 9 ends the half at 1800: its end reads Q2 0:00
  assert.equal(fmtPeriodClock(s.events[8].periodEnd, s.events[8].periodClockEnd), "Q2 0:00");
});

test("S3 · END_HALF labels follow the end instant: half / regulation / overtime", () => {
  const counts = { "end of half": 0, "end of regulation": 0, "end of overtime": 0 };
  for (const x of ADAPTED) for (const s of x.a.manifest.samples) for (const e of s.events) {
    if (e.outcome !== "END_HALF") continue;
    counts[e.outcomeLabel]++;
    if (e.inOT) assert.equal(e.outcomeLabel, "end of overtime");
    else if (e.clockEnd === 1800) assert.equal(e.outcomeLabel, "end of half");
    else assert.equal(e.outcomeLabel, "end of regulation");
  }
  console.log(`# theater: END_HALF labels ${JSON.stringify(counts)}`);
  assert.ok(counts["end of half"] > 0 && counts["end of regulation"] > 0);
});

test("S4 · ENGINE_CLOCK_RUNOFF is a note (never a failure); the named example is flagged; counts reported", () => {
  let rule8 = 0, extreme = 0;
  for (const x of ADAPTED) for (const s of x.a.manifest.samples) {
    for (const n of s.validation.notes.filter((y) => y.code === "ENGINE_CLOCK_RUNOFF")) {
      rule8++;
      if (s.events[n.drive].seconds >= 900) extreme++;
      assert.ok(s.validation.ok, "a run-off note never fails a run");
      assert.ok(s.events[n.drive].notes.some((y) => y.code === "ENGINE_CLOCK_RUNOFF"), "the note is attached to the drive");
    }
  }
  console.log(`# theater: run-off notes — rule 8 wording: ${rule8} drives; of those ≥900 s: ${extreme}`);
  const ex = ADAPTED.find((x) => x.file.endsWith("401872996-dec4680410c2d908.json"));
  assert.ok(ex, "example receipt present");
  const low = ex.a.manifest.samples.find((s) => s.kind === "LOW_SCORING");
  const d = low.events.find((e) => e.seconds === 1674);
  assert.ok(d && d.plays === 1 && d.notes.some((n) => n.code === "ENGINE_CLOCK_RUNOFF"));
  assert.ok(rule8 >= extreme && extreme >= 1);
  assert.equal(isClockRunoff({ result: "END_HALF", seconds: 301, plays: 5 }), true);
  assert.equal(isClockRunoff({ result: "END_HALF", seconds: 300, plays: 1 }), false);
  assert.equal(isClockRunoff({ result: "PUNT", seconds: 1000, plays: 1 }), false);
});

test("S5 · shared runs: the 4 named receipts are detected and render ONE merged chip", () => {
  const named = {
    "401872999-48b22f9741b14789": ["MEDIAN_LIKE", "UPSET", 134],
    "401873005-dc8c9c8b13bf359d": ["HIGH_SCORING", "OVERTIME", 42],
    "401872997-bc61837dc9430351": ["MEDIAN_LIKE", "OVERTIME", 73],
    "401873006-00021db64663c940": ["MEDIAN_LIKE", "OVERTIME", 25],
  };
  let found = 0;
  for (const x of ADAPTED) {
    const m = x.a.manifest;
    const distinctRuns = new Set(m.samples.map((s) => s.runIndex)).size;
    assert.equal(m.chips.length, distinctRuns, `${x.file}: one chip per distinct run`);
    const key = Object.keys(named).find((k) => x.file.endsWith(`${k}.json`));
    if (!key) continue;
    found++;
    const [k1, k2, run] = named[key];
    assert.deepEqual(m.sharedRuns, [{ runIndex: run, kinds: [k1, k2] }]);
    const chip = m.chips.find((c) => c.runIndex === run);
    assert.deepEqual(chip.kinds, [k1, k2]);
    assert.equal(m.samples[chip.sampleIndex].selectionRules.length, 2, "the merged chip carries both rule texts");
  }
  assert.equal(found, 4, "all four named shared-run receipts are on disk");
  const total = ADAPTED.filter((x) => x.a.manifest.sharedRuns.length).length;
  console.log(`# theater: receipts with a shared run: ${total}`);
});

test("rule 1 · engine identity: a real World Model V2 artifact → ENGINE_MISMATCH; wrong schemas refused", () => {
  const dir = path.join(process.cwd(), "public/data/nfl/world-model-v2");
  const file = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort()[0];
  assert.ok(file, "a real WM2 artifact exists to test against");
  const wm2 = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  assert.equal(wm2.artifact, "nfl-world-model-v2-simulation");
  const r = adaptReceipt(wm2, { file: `app/public/data/nfl/world-model-v2/${file}` });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "ENGINE_MISMATCH");
  // Even stripped of its marker, the positive check refuses it.
  const { artifact, sampledWorlds, ...bare } = wm2;
  assert.equal(adaptReceipt(bare).error.code, "ENGINE_MISMATCH");
  const good = clone(ref().receipt);
  assert.equal(checkEngineIdentity(good), null);
  assert.equal(checkEngineIdentity({ ...good, schemaVersion: "simulation-receipt@3" }).code, "SCHEMA_UNSUPPORTED");
  assert.equal(checkEngineIdentity({ ...good, runSchemaVersion: "nfl-drive-run@9" }).code, "SCHEMA_UNSUPPORTED");
  assert.equal(checkEngineIdentity({ ...good, simulationEngine: "nfl-game-sim-v1" }).code, "ENGINE_MISMATCH");
});

test("mutated runs fail with the right code; nulls carry reasons", () => {
  const base = ref().receipt.representativeRuns[0];
  const codes = (run) => validateRun(run).errors.map((e) => e.code);
  { const r = clone(base); r.drives[2].score = [r.drives[2].score[1], r.drives[2].score[0]]; assert.ok(codes(r).includes("SCORE_DELTA_INVALID")); }
  { const r = clone(base); r.final.home += 3; assert.ok(codes(r).includes("SCORE_FINAL_MISMATCH")); }
  { const r = clone(base); r.drives[3].clockStart -= 10; assert.ok(codes(r).includes("CLOCK_GAP")); }
  { const r = clone(base); r.drives[4].offense = r.drives[3].offense; assert.ok(codes(r).includes("POSSESSION_REPEAT")); }
  { const r = clone(base); r.drives[1].result = "HAIL_MARY"; assert.ok(codes(r).includes("UNKNOWN_RESULT")); }
  { const r = clone(base); r.quarters.home[0] += 7; assert.ok(codes(r).includes("QUARTER_SUM_MISMATCH")); }
  { const r = clone(base); r.drives[0].startYardsToGoal = 0; assert.ok(codes(r).includes("FIELD_RANGE")); }
  { const r = clone(base); r.drives = []; assert.deepEqual(codes(r), ["NO_DRIVES"]); }
  const m = ref().a.manifest;
  assert.ok(m.unavailableFields.length >= 8 && m.unavailableFields.every((u) => u.field && u.reason));
  const s = m.samples[0];
  assert.equal(s.selectionDistance, null);
  assert.ok(s.events.every((e) => e.participants === null));
  // A receipt with an invalid run keeps the run's identity and reasons, with no events (unavailable, never guessed).
  const bad = clone(ref().receipt);
  bad.representativeRuns[1].drives[0].score = [9, 9];
  const ad = adaptReceipt(bad);
  assert.equal(ad.ok, true);
  const s1 = ad.manifest.samples.find((y) => y.kind === bad.representativeRuns[1].kind);
  assert.equal(s1.validation.ok, false);
  assert.deepEqual(s1.events, []);
  assert.equal(ad.manifest.chips.find((c) => c.runIndex === s1.runIndex).available, false);
});

test("rule 4 · possession precedence: resets first, then OPP_TD, then the postseason restart, then alternation", () => {
  const D = (q, clockStart, offense, result, seconds, score, extra = {}) => ({ q, clockStart, offense, startYardsToGoal: 75, result, plays: 6, netYards: result === "TD" ? 75 : 10, seconds, score, ...extra });
  const mk = (drives, final) => ({ final, quarters: { home: [0, 0, 0, 0, 0], away: [0, 0, 0, 0, 0] }, drives });
  const codes = (run) => validateRun(run).errors.map((e) => e.code).filter((c) => /POSSESSION|RECEIVER/.test(c));
  // A half-ending OPP_TD: the halftime reset (1 − opening receiver) wins over "same offense after OPP_TD".
  const halfOppTd = mk([
    D(1, 3600, 0, "PUNT", 1800, [0, 0]),
    D(2, 1800, 1, "OPP_TD", 900, [7, 0]), // wrong: the opener should be 1 (opening receiver was 0) → it IS 1; now OPP_TD by home defense…
    D(3, 900, 1, "PUNT", 900, [7, 0]),
  ], { home: 7, away: 0, overtime: false });
  // drive 2 (second-half opener) offense 1 = 1 − 0 ✓; drive 3 after OPP_TD: same offense (1) ✓
  assert.deepEqual(codes(halfOppTd), []);
  const halfEndingOppTd = mk([
    D(1, 3600, 0, "PUNT", 900, [0, 0]),
    D(1, 2700, 1, "OPP_TD", 900, [7, 0]), // ends the half at 1800 with an OPP_TD
    D(2, 1800, 1, "PUNT", 1800, [7, 0]), // reset: 1 − opening receiver (0) = 1 ✓ even though OPP_TD alone also says 1
  ], { home: 7, away: 0, overtime: false });
  assert.deepEqual(codes(halfEndingOppTd), []);
  // The reset and the OPP_TD rule DISAGREE here: OPP_TD alone would give the ball back to 0, the reset gives it to 1.
  const resetBeatsOppTd = (secondHalfOffense) => mk([
    D(1, 3600, 0, "PUNT", 900, [0, 0]),
    D(1, 2700, 1, "PUNT", 450, [0, 0]),
    D(1, 2250, 0, "OPP_TD", 450, [0, 7]), // half-ending defensive TD by the away defense
    D(2, 1800, secondHalfOffense, "PUNT", 1800, [0, 7]),
  ], { home: 0, away: 7, overtime: false });
  assert.deepEqual(codes(resetBeatsOppTd(1)), [], "the halftime reset wins over the OPP_TD rule");
  assert.deepEqual(codes(resetBeatsOppTd(0)), ["SECOND_HALF_RECEIVER"], "following the OPP_TD rule across halftime is wrong");
  const oppTdThenSame = mk([
    D(1, 3600, 0, "OPP_TD", 300, [0, 7]),
    D(1, 3300, 0, "PUNT", 1500, [0, 7]),
    D(2, 1800, 1, "PUNT", 1800, [0, 7]),
  ], { home: 0, away: 7, overtime: false });
  assert.deepEqual(codes(oppTdThenSame), []);
  const repeat = mk([
    D(1, 3600, 0, "PUNT", 300, [0, 0]),
    D(1, 3300, 0, "PUNT", 1500, [0, 0]),
    D(2, 1800, 1, "PUNT", 1800, [0, 0]),
  ], { home: 0, away: 0, overtime: false });
  assert.deepEqual(codes(repeat), ["POSSESSION_REPEAT"]);
  // First OT drive: a coin flip, either side is valid.
  const otFlip = mk([
    D(1, 3600, 0, "PUNT", 1800, [0, 0]),
    D(2, 1800, 1, "END_HALF", 1800, [0, 0]),
    D(5, 600, 1, "FG", 300, [0, 3]),
    D(5, 300, 0, "PUNT", 300, [0, 3]),
  ], { home: 0, away: 3, overtime: true });
  assert.deepEqual(codes(otFlip), []);
});

test("adapter output is plain JSON and identical across two adaptations (deterministic)", () => {
  const r = ref().receipt;
  const a = JSON.stringify(adaptReceipt(r, { file: REF_FILE }));
  const b = JSON.stringify(adaptReceipt(clone(r), { file: REF_FILE }));
  assert.equal(a, b);
  assert.deepEqual(JSON.parse(a), adaptReceipt(r, { file: REF_FILE }));
});
