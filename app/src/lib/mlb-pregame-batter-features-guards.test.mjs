/**
 * MLB PREGAME BATTER FEATURES — guards (2026-07-22).
 *
 * Pins the batter-level pregame families: batter_splits (vs R/L season + prev), batter_form (last 7/30 strictly-
 * earlier games), and park_factors (factual venue + honestly-neutral factor slots). All leakage-safe, internal,
 * NO modeling / NO prediction. Also pins their wiring into the assembler + the extended quality checks.
 *
 * Run: npx tsx --test src/lib/mlb-pregame-batter-features-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { windowForm } from "../../scripts/capture-mlb-pregame-batter-form.mjs";
import { runEnvironmentSignal } from "../../scripts/capture-mlb-pregame-park-factors.mjs";
import { buildObservation } from "../../scripts/build-mlb-research-observations.mjs";
import { auditQuality } from "../../scripts/monitor-mlb-research-quality.mjs";

const app = process.cwd();
const repo = path.dirname(app);
const FEAT = path.join(repo, "data/internal/mlb/pregame-archive/pregame-features");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const gameLog = [
  { date: "2026-06-01", stat: { plateAppearances: 4, hits: 2, totalBases: 5, homeRuns: 1, rbi: 2, runs: 1, strikeOuts: 0 } },
  { date: "2026-07-19", stat: { plateAppearances: 5, hits: 1, totalBases: 1, homeRuns: 0, rbi: 0, runs: 0, strikeOuts: 2 } },
  { date: "2026-07-21", stat: { plateAppearances: 4, hits: 3, totalBases: 6, homeRuns: 1, rbi: 3, runs: 2, strikeOuts: 1 } },
  { date: "2026-07-22", stat: { plateAppearances: 4, hits: 4, totalBases: 8, homeRuns: 2, rbi: 4, runs: 2, strikeOuts: 0 } }, // SLATE DAY — must be excluded
];

test("1 · windowForm aggregates ONLY games strictly earlier than the slate (no same-day/later leakage)", () => {
  const w = windowForm(gameLog, "2026-07-22", 30);
  assert.equal(w.games, 3, "the 2026-07-22 game is excluded");
  assert.equal(w.lastDate, "2026-07-21");
  assert.equal(w.h, 2 + 1 + 3, "hits summed from strictly-earlier games only");
  assert.equal(w.hr, 1 + 0 + 1);
  const w2 = windowForm(gameLog, "2026-07-22", 2);
  assert.equal(w2.games, 2, "last-2 window");
  assert.equal(w2.firstDate, "2026-07-19");
});

test("2 · runEnvironmentSignal is a FACTUAL elevation label (not a fabricated number)", () => {
  assert.match(runEnvironmentSignal(5200), /high-elevation/);
  assert.match(runEnvironmentSignal(270), /sea-level-ish/);
  assert.equal(runEnvironmentSignal(null), "unknown");
});

test("3 · buildObservation attaches batter_splits/form ONLY for the matching playerId + eligible", () => {
  const join = { gamePk: 1, eventStartTime: "2026-07-22T23:00:00Z", sourceSnapshotIds: [], officialSource: { endpoint: "s" }, gameFinalStatus: { isFinal: true, detailedState: "Final" }, teamOutcome: {} };
  const row = { market: "batter_hits", gamePk: 1, playerId: 99, player: "B", selection: "Over", line: 1.5, researchEligible: true, noVigProbability: 0.5, capturedAt: "t", actual: 2, settlementStatus: "win", countsAsSettledEligible: true };
  const pf = { feats: {}, eligibleFamilies: [] };
  const features = {
    splits: { researchEligible: true, playerId: 99, seasonSplits: { vsRHP: { ops: 0.8 } }, previousSeason: null },
    form: { researchEligible: true, playerId: 99, last7: { h: 6 }, last30: { h: 26 } },
    park: { researchEligible: true, venue: { name: "V" }, factors: { runFactor: 100 } },
  };
  const obs = buildObservation("2026-07-22", join, {}, row, pf, features);
  assert.ok(obs.pregame_features.batter_splits, "splits attached for matching player");
  assert.ok(obs.pregame_features.batter_form, "form attached");
  assert.ok(obs.pregame_features.park_factors, "park attached");
  assert.equal(obs.model_inputs_available.hasBatterSplits, true);
  assert.equal(obs.model_inputs_available.hasParkFactors, true);
  // WRONG player ⇒ splits/form NOT attached (never mismatched to another batter)
  const mismatch = buildObservation("2026-07-22", join, {}, { ...row, playerId: 77 }, pf, features);
  assert.equal(mismatch.pregame_features.batter_splits, undefined);
  assert.equal(mismatch.model_inputs_available.hasBatterSplits, false);
  assert.ok(mismatch.model_inputs_available.missingFamilies.includes("batter_splits"));
});

test("4 · on-disk batter families are leakage-safe (eligible ⇒ captured pregame + form strictly earlier)", () => {
  for (const fam of ["batter-splits", "batter-form", "park-factors"]) {
    const base = path.join(FEAT, fam);
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
      for (const f of fs.readdirSync(path.join(base, d)).filter((x) => x.endsWith(".json"))) {
        const r = readJson(path.join(base, d, f));
        assert.ok(r.capturedAt, `${fam}/${f} timestamped`);
        if (r.researchEligible === true) {
          assert.ok(r.capturedAt < r.eventStartTime, `${fam}/${f} captured pregame`);
          if (fam === "batter-form" && r.last30?.lastDate) assert.ok(r.last30.lastDate < d, "form last game strictly earlier");
        }
        if (fam === "park-factors") assert.equal(r.factors.handednessEffect, null, "no fabricated handedness factor");
      }
    }
  }
});

test("5 · quality monitor FLAGS injected impossible split + form leakage; per-player dedup is correct", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bf-"));
  const w = (fam, name, obj) => { fs.mkdirSync(path.join(root, fam, "2026-07-22"), { recursive: true }); fs.writeFileSync(path.join(root, fam, "2026-07-22", name), JSON.stringify(obj)); };
  const ej = fs.mkdtempSync(path.join(os.tmpdir(), "j-")), efz = fs.mkdtempSync(path.join(os.tmpdir(), "fz-"));
  // impossible split (AVG 5) ⇒ impossibleStats FAIL
  w("batter-splits", "1.json", { playerId: 1, gamePk: 9, capturedAt: "2026-07-22T10:00:00Z", eventStartTime: "2026-07-22T23:00:00Z", researchEligible: true, seasonSplits: { vsRHP: { avg: 5, obp: 0.3, slg: 0.4, ops: 0.7, kPct: 20, bbPct: 8 }, vsLHP: null } });
  // form leakage (last30 lastDate on slate day) ⇒ timestampViolations FAIL
  w("batter-form", "2.json", { playerId: 2, gamePk: 9, capturedAt: "2026-07-22T10:00:00Z", eventStartTime: "2026-07-22T23:00:00Z", researchEligible: true, last7: { pa: 10, h: 3, tb: 5, k: 2 }, last30: { pa: 40, h: 12, tb: 20, k: 8, lastDate: "2026-07-22" } });
  // two DIFFERENT batters for the same game are NOT duplicates (per-player family)
  w("batter-splits", "3.json", { playerId: 3, gamePk: 9, capturedAt: "2026-07-22T10:00:00Z", eventStartTime: "2026-07-22T23:00:00Z", researchEligible: false, seasonSplits: { vsRHP: null, vsLHP: null } });
  const r = auditQuality(ej, efz, root);
  assert.equal(r.checks.impossibleStats.verdict, "FAIL");
  assert.equal(r.checks.timestampViolations.verdict, "FAIL");
  assert.equal(r.checks.duplicateFeatures.verdict, "PASS", "different batters in one game are not duplicates");
});

test("6 · REAL archive passes quality (no FAIL); families internal; money md5 unchanged", () => {
  assert.notEqual(auditQuality().overall, "FAIL");
  const out = path.join(app, "out");
  if (fs.existsSync(out)) {
    const hit = fs.readdirSync(out, { recursive: true }).filter((p) => /batter-splits|batter-form|park-factors/.test(String(p)) && String(p).includes("internal"));
    assert.equal(hit.length, 0);
  }
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
