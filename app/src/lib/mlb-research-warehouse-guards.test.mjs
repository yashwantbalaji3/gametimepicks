/**
 * MLB RESEARCH WAREHOUSE — guards (2026-07-22).
 *
 * Pins the research-warehouse foundation: the ResearchObservation assembler (build-mlb-research-observations.mjs)
 * and the data-quality monitor (monitor-mlb-research-quality.mjs). NO modeling — these only ASSEMBLE settled
 * observations and CHECK data quality. Leakage-safe; only settled rows become observations; official-only.
 *
 * Run: npx tsx --test src/lib/mlb-research-warehouse-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { buildObservation } from "../../scripts/build-mlb-research-observations.mjs";
import { auditQuality } from "../../scripts/monitor-mlb-research-quality.mjs";

const app = process.cwd();

// Integration gate — the "REAL local archive" assertions depend on gitignored payloads (research-observations
// jsonl + market snapshots) being present AND the newest slate's post-first-pitch eligibility being reconciled.
// On a fresh/partial checkout those payloads are absent/inconsistent, so these run ONLY when explicitly opted in.
// The MONITOR LOGIC itself is always tested against deterministic synthetic fixtures below.
const RUN_INTEGRATION = process.env.RESEARCH_ARCHIVE_INTEGRATION === "1";
const SKIP_REASON =
  "requires RESEARCH_ARCHIVE_INTEGRATION=1 + a verified-clean local archive (gitignored research-observations/" +
  "market-snapshot payloads present, newest-slate post-first-pitch eligibility reconciled). See docs/TEST_FIXTURE_AND_INTEGRATION_POLICY.md.";

function synthJoin(over = {}) {
  return {
    gamePk: 100, freezeHash: "abc123", createdAt: "2026-07-22T00:00:00Z", eventStartTime: "2026-07-22T23:00:00Z",
    sourceSnapshotIds: ["100-x"], officialSource: { endpoint: "https://statsapi.mlb.com/api/v1.1/game/100/feed/live" },
    gameFinalStatus: { isFinal: true, detailedState: "Final" },
    teamOutcome: { homeTeam: "Home Nine", awayTeam: "Away Nine", homeRuns: 5, awayRuns: 3 },
    marketRows: [
      { market: "pitcher_strikeouts", gamePk: 100, playerId: 11, player: "Sandy Starter", selection: "Over", line: 6.5, researchEligible: true, noVigProbability: 0.55, capturedAt: "2026-07-22T20:00:00Z", actual: 7, settlementStatus: "win", countsAsSettledEligible: true },
      { market: "batter_hits", gamePk: 100, playerId: 22, player: "Bobby Bat", selection: "Over", line: 1.5, researchEligible: true, noVigProbability: 0.48, capturedAt: "2026-07-22T20:00:00Z", actual: 1, settlementStatus: "loss", countsAsSettledEligible: true },
      { market: "batter_hits", gamePk: 100, playerId: 33, player: "Pending Pat", selection: "Over", line: 0.5, researchEligible: true, noVigProbability: 0.6, capturedAt: "2026-07-22T20:00:00Z", actual: null, settlementStatus: "pending", countsAsSettledEligible: false },
    ],
    contextualRows: [{ family: "environment", researchEligible: true, outcomeStatus: "linked", capturedAt: "2026-07-22T20:00:00Z" }],
    ...over,
  };
}
const synthFreeze = { gamePk: 100, boardDateEt: "2026-07-22", coverageSummary: { eligibleFamilies: ["pitcher_status", "environment", "umpire"] }, featureEligibility: { pitcher_status: { snapshotId: "100-x" } } };
const pf = { feats: { pitcher_status: { homeProbable: "Sandy Starter" }, environment: { roof: "open" }, umpire: { hp: "Ump" } }, eligibleFamilies: ["pitcher_status", "environment", "umpire"] };

test("1 · ResearchObservation carries the full training-row shape + is leakage-safe", () => {
  const join = synthJoin();
  const obs = buildObservation("2026-07-22", join, synthFreeze, join.marketRows[0], pf);
  for (const k of ["game", "player", "market", "pregame_features", "market_probability", "model_inputs_available", "actual_outcome", "settlement_result", "provenance"]) assert.ok(k in obs, `has ${k}`);
  assert.equal(obs.public, false);
  assert.equal(obs.market.key, "pitcher_strikeouts");
  assert.equal(obs.settlement_result.status, "win");
  assert.equal(obs.settlement_result.countsAsSettledEligible, true);
  assert.equal(obs.actual_outcome.actual, 7);
  assert.match(obs.actual_outcome.source, /MLB Stats API/);
  // pregame_features contain ONLY the freeze-eligible families (no postgame leakage)
  assert.deepEqual(Object.keys(obs.pregame_features).sort(), ["environment", "pitcher_status", "umpire"]);
  assert.equal(obs.market_probability.noVigProbability, 0.55, "stores the captured DE-VIG market probability, not a model prob");
  assert.ok(obs.model_inputs_available.missingFamilies.includes("confirmed_lineup"), "flags missing families as modeling gaps");
});

test("2 · team-market observation has player=null + team outcome", () => {
  const join = synthJoin({ marketRows: [{ market: "h2h", gamePk: 100, selection: "Home Nine", line: null, researchEligible: true, noVigProbability: 0.6, capturedAt: "2026-07-22T20:00:00Z", actual: 2, settlementStatus: "win", countsAsSettledEligible: true }] });
  const obs = buildObservation("2026-07-22", join, synthFreeze, join.marketRows[0], pf);
  assert.equal(obs.player, null);
  assert.equal(obs.market.kind, "team");
  assert.equal(obs.actual_outcome.teamOutcome.homeRuns, 5);
});

// ── data-quality monitor: build a synthetic archive in a temp dir and inject defects ──
function writeArchive(root, join, freeze = synthFreeze) {
  const d = "2026-07-22";
  fs.mkdirSync(path.join(root, "joins", d), { recursive: true });
  fs.mkdirSync(path.join(root, "freezes", d), { recursive: true });
  fs.writeFileSync(path.join(root, "joins", d, `${join.gamePk}.json`), JSON.stringify(join));
  fs.writeFileSync(path.join(root, "freezes", d, `${freeze.gamePk}.json`), JSON.stringify(freeze));
  return { joinDir: path.join(root, "joins"), freezeDir: path.join(root, "freezes") };
}

test("3 · quality monitor PASSES clean settled data (all rows graded on a final game)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rq-"));
  const clean = synthJoin();
  clean.marketRows = clean.marketRows.filter((r) => r.settlementStatus !== "pending"); // a FINAL game with every row graded
  const { joinDir, freezeDir } = writeArchive(root, clean);
  // ISOLATE the feature scan too: auditQuality's featureDir defaults to the REAL archive, so a truly-synthetic
  // "clean" check must point it at an isolated (empty) temp feature dir — otherwise real feature families leak in.
  const featureDir = path.join(root, "pregame-features");
  fs.mkdirSync(featureDir, { recursive: true });
  const r = auditQuality(joinDir, freezeDir, featureDir);
  assert.equal(r.overall, "PASS");
  assert.equal(r.checks.duplicateRows.verdict, "PASS");
  assert.equal(r.checks.missingOutcomes.verdict, "PASS");
  assert.equal(r.scanned.settledRows, 2);
});

test("4b · impossibleStats treats spreads as a SIGNED margin (negative OK) but flags a negative count market", () => {
  // a spreads row settling on a negative run margin is legitimate; a negative batter_hits count is impossible.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rq-"));
  const j = synthJoin();
  j.marketRows = [
    { market: "spreads", gamePk: 100, selection: "Away Nine", line: -1.5, researchEligible: true, noVigProbability: 0.5, capturedAt: "2026-07-22T20:00:00Z", actual: -2, settlementStatus: "loss", countsAsSettledEligible: true },
    { market: "batter_hits", gamePk: 100, playerId: 22, player: "Bad Row", selection: "Over", line: 1.5, researchEligible: true, noVigProbability: 0.5, capturedAt: "2026-07-22T20:00:00Z", actual: -1, settlementStatus: "loss", countsAsSettledEligible: true },
  ];
  const featureDir = path.join(root, "pregame-features"); fs.mkdirSync(featureDir, { recursive: true });
  const { joinDir, freezeDir } = writeArchive(root, j);
  const r = auditQuality(joinDir, freezeDir, featureDir);
  assert.equal(r.checks.impossibleStats.verdict, "FAIL", "the negative batter_hits count IS impossible");
  assert.equal(r.details.impossibleStats.length, 1, "only ONE impossible row (the count market), NOT the signed spread");
  assert.equal(r.details.impossibleStats[0].market, "batter_hits");
});

test("4 · quality monitor FAILS on injected defects", () => {
  // duplicate row
  let root = fs.mkdtempSync(path.join(os.tmpdir(), "rq-"));
  let j = synthJoin();
  j.marketRows.push({ ...j.marketRows[0] }); // exact duplicate
  assert.equal(auditQuality(writeArchive(root, j).joinDir, writeArchive(root, j).freezeDir).checks.duplicateRows.verdict, "FAIL");

  // missing outcome: final game, pending row already present (row #3 is pending) → FAIL because isFinal
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rq-"));
  let a = writeArchive(root, synthJoin());
  assert.equal(auditQuality(a.joinDir, a.freezeDir).checks.missingOutcomes.verdict, "FAIL");

  // impossible stat
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rq-"));
  j = synthJoin(); j.marketRows[0].actual = 999;
  a = writeArchive(root, j);
  assert.equal(auditQuality(a.joinDir, a.freezeDir).checks.impossibleStats.verdict, "FAIL");

  // timestamp violation (leakage): researchEligible captured AFTER first pitch
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rq-"));
  j = synthJoin(); j.marketRows[0].capturedAt = "2026-07-23T02:00:00Z"; // after 23:00 first pitch
  a = writeArchive(root, j);
  assert.equal(auditQuality(a.joinDir, a.freezeDir).checks.timestampViolations.verdict, "FAIL");
});

test("5 · multi-cadence families (lineup / pitcher-workload) dedup by capturedAt, not naively by gamePk", () => {
  // Fixture proof of the monitor fix: two captures of the SAME game at DIFFERENT capturedAt are distinct windows
  // (never a duplicate); two at the SAME capturedAt are a true double-write (a duplicate). Isolated temp archive.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rq-"));
  const featureDir = path.join(root, "pregame-features", "pitcher-workload", "2026-07-22");
  fs.mkdirSync(featureDir, { recursive: true });
  const rec = (capturedAt) => ({ gamePk: 100, capturedAt, eventStartTime: "2026-07-22T23:00:00Z", researchEligible: true, pitchers: {} });
  fs.writeFileSync(path.join(featureDir, "100.json"), JSON.stringify(rec("2026-07-22T20:00:00Z")));
  fs.writeFileSync(path.join(featureDir, "100-late.json"), JSON.stringify(rec("2026-07-22T21:30:00Z")));
  const { joinDir, freezeDir } = writeArchive(root, synthJoin());
  let r = auditQuality(joinDir, freezeDir, path.join(root, "pregame-features"));
  assert.equal(r.checks.duplicateFeatures.verdict, "PASS", "distinct capture windows are NOT duplicates");
  // now inject a true double-write at the same capturedAt → must FAIL
  fs.writeFileSync(path.join(featureDir, "100-dup.json"), JSON.stringify(rec("2026-07-22T20:00:00Z")));
  r = auditQuality(joinDir, freezeDir, path.join(root, "pregame-features"));
  assert.equal(r.checks.duplicateFeatures.verdict, "FAIL", "same-capturedAt double-write IS a duplicate");
});

test("6 · the research gate is NOT force-promoted (30 dates / 500 obs collection gate intact)", () => {
  const latest = JSON.parse(fs.readFileSync(path.join(app, "..", "data/internal/mlb/pregame-archive/status/latest.json"), "utf8"));
  assert.equal(latest.gateMet, false, "gate is NOT promoted (30 dates / 500 obs not met)");
  assert.equal(latest.collectionGate.minSettledEligibleObs, 500);
  assert.equal(latest.collectionGate.minDistinctDates, 30);
});

test("7 · [integration] the REAL local archive has no FAIL-level quality defect", { skip: RUN_INTEGRATION ? false : SKIP_REASON }, () => {
  assert.notEqual(auditQuality().overall, "FAIL", "live archive has no FAIL-level quality defect");
});

test("8 · warehouse artifacts are internal only (not web-served); money md5 unchanged", () => {
  const out = path.join(app, "out");
  if (fs.existsSync(out)) {
    const hit = fs.readdirSync(out, { recursive: true }).filter((p) => String(p).includes("research-observations") || String(p).includes("research-quality") || String(p).includes("pregame-archive"));
    assert.equal(hit.length, 0, "no warehouse artifacts under out/");
  }
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
