/**
 * MLB TEAM-SCORING MONTE CARLO ENGINE (2026-07-09) — determinism, sanity, market anchoring, honesty.
 *
 * Pins: same (seed, inputs) reproduce the same artifact; probabilities are well-formed (win sums to 1,
 * O/U/push sums to 1, distributions sum to ~1); the simulation is ANCHORED to the market (sim total ≈
 * market total, sim win prob ≈ market win prob, favourite scores more); missing inputs degrade honestly
 * (no total ⇒ BLOCKED, not fabricated); every emitted artifact passes the schema validator and is
 * labelled hybrid_shadow (never a bare "simulation"); and the engine imports no money/product code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildExpectedRuns, simulateMlbGame, buildFullGameSimArtifact, DEFAULT_SIM_OPTIONS, selectEngineMode, applyIndependentAdjustments, ADJUSTMENT_BOUNDS } from "./index.ts";
import { validateFullGameSimArtifact } from "../schema.ts";

const app = process.cwd();
const opts = { ...DEFAULT_SIM_OPTIONS, runCount: 4000 };
const market = { total: 8.5, homeWinProb: 0.6, awayWinProb: 0.4, runLine: { line: -1.5, favorite: "home" } };
const input = { gameId: "g1", gamePk: 1, date: "2026-07-09", teams: { away: { name: "AWY" }, home: { name: "HME" } }, market };

test("1 · deterministic — same seed + inputs reproduce the same artifact", () => {
  const a = buildFullGameSimArtifact(input, opts);
  const b = buildFullGameSimArtifact(input, opts);
  assert.deepEqual(a, b, "identical (seeded)");
  // A different seed changes the sampled result.
  const c = buildFullGameSimArtifact(input, { ...opts, seed: opts.seed + 1 });
  assert.notDeepEqual(a.distributions, c.distributions, "different seed ⇒ different draws");
});

test("2 · probability sanity — win sums to 1, O/U+push sums to 1, distributions sum to ~1", () => {
  const a = buildFullGameSimArtifact(input, opts);
  assert.ok(Math.abs(a.winProbability.home + a.winProbability.away - 1) < 1e-9, "win prob sums to 1");
  const t = a.marketCoverage.total;
  assert.ok(Math.abs(t.overProbability + t.underProbability + t.pushProbability - 1) < 0.02, "O/U/push sum to ~1");
  for (const dist of [a.distributions.totalRuns, a.distributions.margin]) {
    const s = dist.reduce((x, b) => x + b.probability, 0);
    assert.ok(Math.abs(s - 1) < 0.02, `distribution sums to ~1 (got ${s.toFixed(3)})`);
    for (const b of dist) assert.ok(b.probability >= 0 && b.probability <= 1, "bucket in [0,1]");
  }
});

test("3 · market anchoring — sim total ≈ market total, sim win prob ≈ market, favourite scores more", () => {
  const a = buildFullGameSimArtifact(input, opts);
  assert.ok(Math.abs(a.projectedScore.totalMean - market.total) < 0.3, `sim total ${a.projectedScore.totalMean} ≈ market ${market.total}`);
  assert.ok(Math.abs(a.winProbability.home - market.homeWinProb) < 0.05, `sim home win ${a.winProbability.home} ≈ market ${market.homeWinProb}`);
  const er = buildExpectedRuns(market, opts.vmr);
  assert.ok(er.homeExp > er.awayExp, "market favourite (home) has higher expected runs");
});

test("4 · edge cases — missing total ⇒ BLOCKED (no fabrication); missing moneyline ⇒ even split + warning", () => {
  const noTotal = buildFullGameSimArtifact({ ...input, market: { homeWinProb: 0.55 } }, opts);
  assert.equal(noTotal.dataQuality.status, "blocked");
  assert.equal(noTotal.model.status, "not_ready");
  assert.ok(!noTotal.distributions, "no fabricated distributions when blocked");
  assert.ok(!noTotal.winProbability, "no simulated win prob when blocked");
  const noMl = buildExpectedRuns({ total: 9 }, opts.vmr);
  assert.equal(noMl.homeExp, noMl.awayExp, "no moneyline ⇒ even split");
  assert.ok(noMl.warnings.some((w) => /no market moneyline/i.test(w)));
  // Missing run line ⇒ no run-line coverage (never invented).
  const noRl = buildFullGameSimArtifact({ ...input, market: { total: 8.5, homeWinProb: 0.6 } }, opts);
  assert.ok(!noRl.marketCoverage.runLine, "no run-line coverage without a line");
});

test("5 · artifact validity — passes the schema validator + honest labels; blocked stays blocked", () => {
  const a = buildFullGameSimArtifact(input, opts);
  assert.equal(validateFullGameSimArtifact(a).valid, true, validateFullGameSimArtifact(a).errors.join("; "));
  assert.equal(a.public, false);
  assert.equal(a.winProbability.source, "hybrid_shadow", "market-anchored ⇒ hybrid_shadow, never a bare 'simulation'");
  assert.equal(a.model.source, "market_anchored_simulation");
  assert.equal(a.marketCoverage.moneyline.source, "market_implied", "the market moneyline is kept market-implied");
  assert.equal(a.guardrails.activeProductCard, false);
});

test("6 · the engine imports no money / product-card code", () => {
  const dir = path.join(app, "src/lib/full-game-sim/mlb");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const s = fs.readFileSync(path.join(dir, f), "utf8");
    assert.doesNotMatch(s, /portfolio|mr-dub|bankroll|daily-portfolio|bank-builder|moonshot/i, `${f} imports no money/product code`);
    assert.doesNotMatch(s, /require\(|readFileSync|writeFileSync|fetch\(/, `${f} is pure (no io/network)`);
  }
});

test("7 · engine mode selection — market-anchored by default; blocked without a total; adjusts only on a real input", () => {
  // No market total ⇒ can't anchor AND independent inputs can't stand alone ⇒ blocked.
  assert.equal(selectEngineMode({ homeWinProb: 0.55 }, undefined), "independent_simulation_blocked");
  // Total but no usable independent input ⇒ pure market-anchored.
  assert.equal(selectEngineMode(market, undefined), "market_anchored_simulation");
  // A neutral_default park factor must NOT trigger adjustments (honest: neutral is not a signal).
  assert.equal(selectEngineMode(market, { parkRunFactor: 1.0, parkConfidence: "neutral_default" }), "market_anchored_simulation");
  // A real non-neutral park factor ⇒ adjustments mode.
  assert.equal(selectEngineMode(market, { parkRunFactor: 1.15, parkConfidence: "established_extreme" }), "market_anchored_with_independent_adjustments");
});

test("8 · independent adjustments are bounded, shadow-only, and NEVER change the default artifact", () => {
  // Default artifact (no independent inputs) is untouched: mode market_anchored_simulation, no adjustments.
  const base = buildFullGameSimArtifact(input, opts);
  assert.equal(base.model.mode, "market_anchored_simulation");
  assert.equal(base.model.adjustments.applied, false);
  // Passing independent inputs must not move the total by more than the park bound, nor the margin beyond ±0.3.
  const er = buildExpectedRuns(market, opts.vmr);
  const { expected: adj, adjustments } = applyIndependentAdjustments(er, { parkRunFactor: 1.15, parkConfidence: "established_extreme", awayRunRate: 3.0, homeRunRate: 6.0, runRateSampleGames: { away: 5, home: 5 } }, market);
  assert.ok(Math.abs(adjustments.parkTotalNudge) <= ADJUSTMENT_BOUNDS.maxTotalNudgePct * market.total + 1e-9, "park nudge within ±3% of total");
  assert.ok(Math.abs(adjustments.runRateMarginNudge) <= ADJUSTMENT_BOUNDS.maxMarginNudge + 1e-9, "run-rate margin nudge within ±0.3");
  assert.ok(adj.homeExp >= 0 && adj.awayExp >= 0, "adjusted expected runs stay non-negative");
  // A neutral/empty input is an identity — the anchor is preserved exactly.
  const { expected: noop, adjustments: none } = applyIndependentAdjustments(er, undefined, market);
  assert.equal(none.applied, false);
  assert.deepEqual({ h: noop.homeExp, a: noop.awayExp }, { h: er.homeExp, a: er.awayExp }, "no inputs ⇒ market anchor preserved exactly");
});
