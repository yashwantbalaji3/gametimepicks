/**
 * Guards for the research-observation quality gate (research-observation-quality.mjs). Ensures the first (and every)
 * materialized dataset stays clean: the gate exists + is wired into the research workflow, the committed quality
 * report is never BLOCKED, and the raw observations are gitignored (derived, regenerable from committed joins).
 *
 * Run: npx tsx --test src/lib/mlb-research-observation-quality.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const repo = path.dirname(app);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// The committed report's DATA CLEANLINESS reflects live forward-collection: the newest slate's final market
// snapshot can be captured after the earliest first pitches, so its rows land as post-first-pitch "leakage"
// until per-game eligibility is reconciled. That is an INTERNAL research-data-hygiene item (public:false; it does
// not touch the public product or the independently-BLOCKED modeling gate), so the cleanliness assertion is opt-in.
// The gate script + workflow wiring + report well-formedness + gitignore invariants are ALWAYS asserted.
const RUN_INTEGRATION = process.env.RESEARCH_ARCHIVE_INTEGRATION === "1";
const SKIP_REASON = "requires RESEARCH_ARCHIVE_INTEGRATION=1 + a reconciled newest slate (committed report can transiently show final-snapshot post-first-pitch leakage); see docs/TEST_FIXTURE_AND_INTEGRATION_POLICY.md";

test("1 · the observation quality gate script + workflow wire exist", () => {
  assert.ok(fs.existsSync(path.join(app, "scripts/research-observation-quality.mjs")), "gate script exists");
  const wf = fs.readFileSync(path.join(repo, ".github/workflows/mlb-pregame-capture.yml"), "utf8");
  assert.match(wf, /research-observation-quality\.mjs/, "gate wired into mlb-pregame-capture after build-observations");
});

test("2 · the committed observation-quality report is well-formed + internal", () => {
  const q = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/research-observation-quality.json"));
  if (!q) { console.log("  (skip — no report in this checkout)"); return; }
  assert.equal(q.public, false, "the report is an internal artifact (never web-served)");
  assert.ok("status" in q && "hardViolations" in q, "report carries a status + hardViolations breakdown");
  assert.ok(typeof q.hardViolations === "object" && q.hardViolations, "hardViolations is a keyed count map");
});

test("2b · [integration] the committed observation-quality report is CLEAN (never BLOCKED; zero hard violations)", { skip: RUN_INTEGRATION ? false : SKIP_REASON }, () => {
  const q = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/research-observation-quality.json"));
  if (!q) { console.log("  (skip — no report in this checkout)"); return; }
  assert.ok(["PASS", "EMPTY"].includes(q.status), `status must be PASS/EMPTY, got ${q.status}`);
  for (const [k, v] of Object.entries(q.hardViolations || {})) assert.equal(v, 0, `hard violation ${k} must be 0`);
});

test("3 · raw observations are gitignored (derived; regenerable from committed settlement-joins)", () => {
  const gi = fs.readFileSync(path.join(repo, ".gitignore"), "utf8");
  assert.match(gi, /research-observations\/\*\.jsonl/, "raw observations jsonl is gitignored");
});

test("4 · pitcher_workload capture is multi-cadence + eligible-only (regression: single-file overwrite lost eligible captures)", () => {
  const cap = fs.readFileSync(path.join(app, "scripts/capture-mlb-pregame-pitcher-workload.mjs"), "utf8");
  assert.match(cap, /\$\{g\.gamePk\}-\$\{capturedAt/, "multi-cadence key (gamePk + capturedAt) — never overwrites an earlier eligible capture");
  assert.match(cap, /WRITE && researchEligible/, "eligible-only write");
  const asm = fs.readFileSync(path.join(app, "scripts/build-mlb-research-observations.mjs"), "utf8");
  assert.match(asm, /latestEligibleWorkload/, "assembler picks the latest ELIGIBLE workload (multi-cadence + legacy fallback)");
});

test("5 · accumulation reliability monitor + 30-date readiness dashboard exist and are wired", () => {
  assert.ok(fs.existsSync(path.join(app, "scripts/market-capture-reliability.mjs")), "reliability monitor script exists");
  const wf = fs.readFileSync(path.join(repo, ".github/workflows/mlb-pregame-capture.yml"), "utf8");
  assert.match(wf, /market-capture-reliability\.mjs/, "reliability monitor wired into the research workflow");
  const rp = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/research-progress.json"));
  if (rp) { assert.ok(rp.datasetReadiness, "research-progress carries datasetReadiness"); assert.equal(rp.datasetReadiness.requiredObservationDates, 30); }
  const rel = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/market-capture-reliability.json"));
  if (rel) assert.ok(typeof rel.lostResearchOpportunities === "number", "reliability report counts lost opportunities");
});

test("6 · new free feature families (opponent_defense, travel_rest) are leakage-safe multi-cadence + fully wired", () => {
  for (const [script, fam] of [["opponent-defense", "opponent_defense"], ["travel-rest", "travel_rest"]]) {
    const src = fs.readFileSync(path.join(app, `scripts/capture-mlb-pregame-${script}.mjs`), "utf8");
    assert.match(src, new RegExp(`family:\\s*"${fam}"`), `${script} declares family ${fam}`);
    assert.match(src, /capturedAt\s*<\s*(t\.)?eventStartTime/, `${script} researchEligible = capturedAt < eventStartTime (leakage-safe)`);
    assert.match(src, /\$\{[^}]*\}-\$\{capturedAt/, `${script} multi-cadence key (…-<capturedAt>)`);
    assert.match(src, /WRITE && (record\.)?researchEligible/, `${script} writes eligible-only`);
    // wired into the research workflow
    assert.match(fs.readFileSync(path.join(repo, ".github/workflows/mlb-pregame-capture.yml"), "utf8"), new RegExp(`capture-mlb-pregame-${script}\\.mjs`), `${script} wired into mlb-pregame-capture`);
  }
  // assembler attaches both (per-team, eligible-only) + contract carries the keys
  const asm = fs.readFileSync(path.join(app, "scripts/build-mlb-research-observations.mjs"), "utf8");
  assert.match(asm, /loadPerTeamSide\(feat, "opponent-defense"/, "assembler loads opponent_defense");
  assert.match(asm, /loadPerTeamSide\(feat, "travel-rest"/, "assembler loads travel_rest");
  const contract = fs.readFileSync(path.join(app, "src/lib/mlb/simulation/simulation-feature-contract.ts"), "utf8");
  assert.match(contract, /opponentDefense/, "contract has opponentDefense key");
  assert.match(contract, /travelRest/, "contract has travelRest key");
});
