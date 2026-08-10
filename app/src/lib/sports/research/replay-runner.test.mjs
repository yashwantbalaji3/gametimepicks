/**
 * Replay-runner + artifact-mode guards, metamorphic style (Program 149 · Release 1).
 *
 * Each test is one of the charter's named invariants: closed modes, public-consumer refusal,
 * same-inputs-same-bytes, side-swap correctness, impossible-probability rejection, and the
 * future-cannot-help rule. The EPL Poisson adapter doubles as the reference sport adapter.
 *
 * Run: npx tsx --test src/lib/sports/research/replay-runner.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ARTIFACT_MODES, validateResearchArtifact, publicConsumerAccepts } from "./artifact-modes.mjs";
import { runReplay, fnv1a } from "./replay-runner.mjs";
import { fitPoisson, predictFixture } from "../../soccer/epl-poisson.mjs";

/** Synthetic corpus with an unmistakable strength gradient: Alpha ≫ Beta ≫ Gamma. */
const ROWS = [];
let day = 1;
for (let rep = 0; rep < 6; rep++) {
  const D = () => `2025-0${1 + Math.floor(day / 28)}-${String((day++ % 28) + 1).padStart(2, "0")}T12:00:00Z`;
  ROWS.push(
    { eventKey: `r${rep}a`, dateUtc: D(), home: "Alpha", away: "Beta", ftHome: 3, ftAway: 0 },
    { eventKey: `r${rep}b`, dateUtc: D(), home: "Beta", away: "Alpha", ftHome: 0, ftAway: 2 },
    { eventKey: `r${rep}c`, dateUtc: D(), home: "Beta", away: "Gamma", ftHome: 2, ftAway: 0 },
    { eventKey: `r${rep}d`, dateUtc: D(), home: "Gamma", away: "Alpha", ftHome: 0, ftAway: 3 },
  );
}
const CUTOFF = "2025-06-01T00:00:00Z";
const NOW = "2026-08-09T22:30:00Z";

const adapter = (slate) => ({
  sport: "test",
  trainingRows: () => ROWS,
  slate: () => slate,
  fit: (rows) => fitPoisson(rows),
  predict: (fit, ev) => { const p = predictFixture(fit, ev.home, ev.away); return { probs: p.threeWay }; },
});

test("the mode set is CLOSED — an unknown mode is refused, never coerced", () => {
  assert.deepEqual([...ARTIFACT_MODES], ["CURRENT_PRE_EVENT", "HISTORICAL_REPLAY", "SYNTHETIC_TEST"]);
  const bad = validateResearchArtifact({ schemaVersion: 1, artifact: "x", sport: "epl", mode: "LIVE_GUESS", generatedAt: NOW, deterministicId: "d", provenance: "p" });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /closed/.test(e)));
  const poison = validateResearchArtifact({ schemaVersion: 1, artifact: "x", sport: "epl", mode: "SYNTHETIC_TEST", generatedAt: NOW, deterministicId: "d", provenance: "p", evaluationEligible: true });
  assert.ok(poison.errors.some((e) => /poison metrics/.test(e)), "synthetic rows can never be evaluation-eligible");
});

test("PUBLIC CONSUMERS refuse everything except gated, activated CURRENT_PRE_EVENT", () => {
  const base = { schemaVersion: 1, artifact: "x", sport: "epl", generatedAt: NOW, deterministicId: "d", provenance: "p" };
  const replay = { ...base, mode: "HISTORICAL_REPLAY", sourceCutoffIso: CUTOFF };
  assert.equal(publicConsumerAccepts(replay, { gateState: "LIVE_ELIGIBLE", founderActivated: true }).ok, false,
    "a replay is research even with every gate open");
  const current = { ...base, mode: "CURRENT_PRE_EVENT" };
  assert.equal(publicConsumerAccepts(current, { gateState: "SCAFFOLDED", founderActivated: true }).ok, false);
  assert.equal(publicConsumerAccepts(current, { gateState: "LIVE_ELIGIBLE", founderActivated: false }).ok, false);
  assert.equal(publicConsumerAccepts(current, { gateState: "LIVE_ELIGIBLE", founderActivated: true }).ok, true);
});

test("SAME INPUTS, SAME BYTES — the replay is deterministic including its id", () => {
  const slate = [{ eventKey: "s1", dateUtc: "2025-06-02T12:00:00Z", home: "Alpha", away: "Gamma" }];
  const a = runReplay({ sportAdapter: adapter(slate), cutoffIso: CUTOFF, targetMarket: "m", nowIso: NOW });
  const b = runReplay({ sportAdapter: adapter(slate), cutoffIso: CUTOFF, targetMarket: "m", nowIso: NOW });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.deterministicId, fnv1a(["test", "HISTORICAL_REPLAY", CUTOFF, "m", ROWS.map((r) => r.eventKey).join(","), "s1"].join("::")));
});

test("TEAM SWAP changes sides correctly — the stronger club stays favored from either venue", () => {
  const fit = fitPoisson(ROWS);
  const alphaHome = predictFixture(fit, "Alpha", "Gamma");
  const gammaHome = predictFixture(fit, "Gamma", "Alpha");
  assert.ok(alphaHome.threeWay.H > 0.5, "Alpha at home is a heavy favorite");
  assert.ok(gammaHome.threeWay.A > gammaHome.threeWay.H, "swapped venue: Alpha (now away) still outweighs Gamma");
  assert.notEqual(alphaHome.threeWay.H.toFixed(6), gammaHome.threeWay.A.toFixed(6),
    "swap is a real side change, not a mirrored copy — home context must matter");
});

test("IMPOSSIBLE PROBABILITIES are rejected, never renormalized", () => {
  const broken = {
    sport: "test",
    trainingRows: () => ROWS,
    slate: () => [{ eventKey: "bad", dateUtc: "2025-06-02T12:00:00Z" }],
    fit: () => null,
    predict: () => ({ probs: { H: 0.9, D: 0.4, A: 0.2 } }),
  };
  const out = runReplay({ sportAdapter: broken, cutoffIso: CUTOFF, targetMarket: "m", nowIso: NOW });
  assert.equal(out.predictions.length, 0);
  assert.match(out.quarantined[0].reason, /rejected, not renormalized/);
  assert.equal(out.evaluationEligible, false, "a defect quarantine makes the replay ineligible");
});

test("THE FUTURE CANNOT HELP — rows at/after the cutoff never reach the fit, and defects differ from design exclusions", () => {
  const withFuture = [...ROWS, { eventKey: "future", dateUtc: "2025-07-01T12:00:00Z", home: "Gamma", away: "Alpha", ftHome: 9, ftAway: 0 }];
  const ad = { ...adapter([{ eventKey: "s1", dateUtc: "2025-06-02T12:00:00Z", home: "Alpha", away: "Gamma" }]), trainingRows: () => withFuture };
  const out = runReplay({ sportAdapter: ad, cutoffIso: CUTOFF, targetMarket: "m", nowIso: NOW });
  assert.equal(out.trainingCount, ROWS.length, "the future row is excluded from the fit");
  assert.equal(out.excludedAtOrAfterCutoffCount, 1, "…as a design exclusion");
  assert.equal(out.quarantinedCount, 0, "…not a defect");
  assert.equal(out.evaluationEligible, true);
  // And the prediction is bytes-identical to a run that never saw the future row at all.
  const clean = runReplay({ sportAdapter: adapter([{ eventKey: "s1", dateUtc: "2025-06-02T12:00:00Z", home: "Alpha", away: "Gamma" }]), cutoffIso: CUTOFF, targetMarket: "m", nowIso: NOW });
  assert.deepEqual(out.predictions, clean.predictions, "future data changed a past prediction — leakage");
});

test("the research harness itself refuses to mint CURRENT_PRE_EVENT", () => {
  assert.throws(() => runReplay({ sportAdapter: adapter([]), cutoffIso: CUTOFF, targetMarket: "m", nowIso: NOW, mode: "CURRENT_PRE_EVENT" }),
    /never emits CURRENT_PRE_EVENT/);
});

test("MODE LEAK GUARD · no replay/synthetic artifact exists anywhere under the public data root", () => {
  const pub = path.join(process.cwd(), "public", "data");
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith(".json")) continue;
      const txt = fs.readFileSync(p, "utf8");
      if (/"mode":\s*"(HISTORICAL_REPLAY|SYNTHETIC_TEST)"/.test(txt)) offenders.push(p);
    }
  };
  walk(pub);
  assert.deepEqual(offenders, [], "research modes must never appear in the public export's source tree");
});

test("the committed EPL MD38 replay satisfies the mode contract and matches the standalone scoreline math", () => {
  const p = path.resolve(process.cwd(), "..", "data", "internal", "research", "epl", "replays", "replay-2025-26-md38.json");
  const replay = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(validateResearchArtifact(replay).ok, true);
  assert.equal(replay.mode, "HISTORICAL_REPLAY");
  assert.equal(replay.evaluationEligible, true);
  assert.equal(replay.predictions.length, 10);
  const sim = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data", "internal", "research", "epl", "simulations", "scoreline-sim-2025-26-md38.json"), "utf8"));
  for (const f of sim.fixtures) {
    const match = replay.predictions.find((x) => x.eventKey === f.fixture);
    assert.ok(match, `${f.fixture} present in both artifacts`);
    assert.ok(Math.abs(match.probs.H - f.threeWay.H) < 0.0005, "the harness path reproduces the standalone mathematics");
  }
});
