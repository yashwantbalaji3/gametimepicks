/**
 * MLB PREGAME FEATURE FAMILIES — guards (2026-07-22).
 *
 * Pins the additive pregame families added to raise coverage: confirmed_lineup (multi-cadence), bullpen_availability,
 * and batter_matchup — all leakage-safe, internal, NO modeling. Also pins their wiring into the ResearchObservation
 * assembler and the extended data-quality checks (lineup/bullpen leakage, missing timestamps, duplicate features).
 *
 * Run: npx tsx --test src/lib/mlb-pregame-features-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { lineupWindow } from "../../scripts/capture-mlb-pregame-lineup.mjs";
import { platoon } from "../../scripts/capture-mlb-pregame-matchup.mjs";
import { buildObservation } from "../../scripts/build-mlb-research-observations.mjs";
import { auditQuality } from "../../scripts/monitor-mlb-research-quality.mjs";

const app = process.cwd();
const repo = path.dirname(app);

// The real-archive quality assertion depends on gitignored payloads + the newest slate's post-first-pitch
// eligibility being reconciled; it runs ONLY under RESEARCH_ARCHIVE_INTEGRATION=1. The always-on assertions
// (money md5, artifacts-internal) and the synthetic quality-monitor fixtures (tests 1–5) run everywhere.
const RUN_INTEGRATION = process.env.RESEARCH_ARCHIVE_INTEGRATION === "1";
const SKIP_REASON = "requires RESEARCH_ARCHIVE_INTEGRATION=1 + a verified-clean local archive; see docs/TEST_FIXTURE_AND_INTEGRATION_POLICY.md";
const FEAT = path.join(repo, "data/internal/mlb/pregame-archive/pregame-features");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

test("1 · lineupWindow buckets minutes-to-first-pitch into the target windows (pregame only)", () => {
  assert.equal(lineupWindow(1071), "T-24h");
  assert.equal(lineupWindow(300), "T-6h");
  assert.equal(lineupWindow(150), "T-3h");
  assert.equal(lineupWindow(90), "T-1h");
  assert.equal(lineupWindow(30), "T-30m");
  assert.equal(lineupWindow(10), "T-15m");
  assert.equal(lineupWindow(-5), "postgame");
});

test("2 · platoon relationship (research label, not a prediction)", () => {
  assert.equal(platoon("L", "R"), "platoon-advantage");
  assert.equal(platoon("R", "L"), "platoon-advantage");
  assert.equal(platoon("R", "R"), "same-hand");
  assert.equal(platoon("S", "R"), "switch-advantage");
  assert.equal(platoon(null, "R"), "unknown");
});

test("3 · buildObservation attaches lineup/bullpen/matchup ONLY when researchEligible", () => {
  const join = { gamePk: 1, eventStartTime: "2026-07-22T23:00:00Z", sourceSnapshotIds: [], officialSource: { endpoint: "statsapi" }, gameFinalStatus: { isFinal: true, detailedState: "Final" }, teamOutcome: {} };
  const row = { market: "batter_hits", gamePk: 1, playerId: 2, player: "B", selection: "Over", line: 1.5, researchEligible: true, noVigProbability: 0.5, capturedAt: "t", actual: 2, settlementStatus: "win", countsAsSettledEligible: true };
  const pf = { feats: {}, eligibleFamilies: [] };
  const features = {
    workload: { researchEligible: true, pitchers: {} },
    lineup: { researchEligible: true, home: { count: 9 }, away: { count: 9 }, window: "T-1h" },
    bullpen: { researchEligible: true, home: {}, away: {} },
    matchup: { researchEligible: false, homeStartingPitcher: {} }, // ineligible ⇒ excluded
  };
  const obs = buildObservation("2026-07-22", join, {}, row, pf, features);
  assert.ok(obs.pregame_features.confirmed_lineup, "eligible lineup attached");
  assert.ok(obs.pregame_features.bullpen_availability, "eligible bullpen attached");
  assert.ok(obs.pregame_features.pitcher_workload, "eligible workload attached");
  assert.equal(obs.pregame_features.batter_matchup, undefined, "ineligible matchup NOT attached");
  assert.equal(obs.model_inputs_available.hasLineup, true);
  assert.equal(obs.model_inputs_available.hasBullpen, true);
  assert.equal(obs.model_inputs_available.hasMatchup, false);
  assert.ok(obs.model_inputs_available.missingFamilies.includes("batter_matchup"));
});

test("4 · on-disk feature families are leakage-safe (eligible ⇒ captured pregame + source strictly earlier)", () => {
  for (const fam of ["lineup", "bullpen", "matchup", "pitcher-workload"]) {
    const base = path.join(FEAT, fam);
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
      for (const f of fs.readdirSync(path.join(base, d)).filter((x) => x.endsWith(".json"))) {
        const r = readJson(path.join(base, d, f));
        assert.ok(r.capturedAt, `${fam}/${f} has a timestamp`);
        if (r.researchEligible === true) {
          assert.ok(r.capturedAt < r.eventStartTime, `${fam}/${f} captured pregame`);
          if (fam === "lineup") assert.notEqual(r.window, "postgame");
          if (fam === "bullpen") for (const wd of r.windowDates || []) assert.ok(wd < d, `${fam} window date strictly earlier`);
        }
      }
    }
  }
});

test("5 · quality monitor FLAGS injected feature leakage / missing-timestamp / duplicate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feat-"));
  const write = (fam, d, name, obj) => { fs.mkdirSync(path.join(root, fam, d), { recursive: true }); fs.writeFileSync(path.join(root, fam, d, name), JSON.stringify(obj)); };
  const emptyJoin = fs.mkdtempSync(path.join(os.tmpdir(), "j-")), emptyFreeze = fs.mkdtempSync(path.join(os.tmpdir(), "fz-"));
  // postgame lineup marked eligible ⇒ timestampViolation
  write("lineup", "2026-07-22", "1-x.json", { gamePk: 1, capturedAt: "2026-07-22T23:30:00Z", eventStartTime: "2026-07-22T23:00:00Z", researchEligible: true, window: "postgame" });
  // bullpen using a same-day window date ⇒ timestampViolation
  write("bullpen", "2026-07-22", "2.json", { gamePk: 2, capturedAt: "2026-07-22T10:00:00Z", eventStartTime: "2026-07-22T23:00:00Z", researchEligible: true, windowDates: ["2026-07-22"] });
  // missing timestamp
  write("matchup", "2026-07-22", "3.json", { gamePk: 3, eventStartTime: "2026-07-22T23:00:00Z", researchEligible: false });
  // duplicate 1-per-game family
  write("bullpen", "2026-07-22", "2b.json", { gamePk: 2, capturedAt: "2026-07-22T10:00:00Z", eventStartTime: "2026-07-22T23:00:00Z", researchEligible: false, windowDates: [] });
  const r = auditQuality(emptyJoin, emptyFreeze, root);
  assert.equal(r.checks.timestampViolations.verdict, "FAIL");
  assert.equal(r.checks.missingTimestamps.verdict, "FAIL");
  assert.equal(r.checks.duplicateFeatures.verdict, "FAIL");
});

test("6 · pregame-feature artifacts are internal only (never web-served); money md5 unchanged", () => {
  const out = path.join(app, "out");
  if (fs.existsSync(out)) {
    const hit = fs.readdirSync(out, { recursive: true }).filter((p) => /pregame-features|bullpen|matchup|lineup\//.test(String(p)) && String(p).includes("internal"));
    assert.equal(hit.length, 0);
  }
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});

test("7 · [integration] REAL archive feature families pass quality (no FAIL)", { skip: RUN_INTEGRATION ? false : SKIP_REASON }, () => {
  assert.notEqual(auditQuality().overall, "FAIL");
});
