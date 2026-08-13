/**
 * Player-prop head guards (Program 171 · Release B): determinism, per-iteration reconciliation,
 * zero-inflation, refusal paths, the price-independence pin (identical distributions at wildly
 * different lines), team-stream compatibility with the committed game-sim, and the committed
 * evaluation receipt's promotion honesty.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { simulatePlayerProps, loadPlayerPropsFit, allocateOpportunities, binomialDraw, gammaDraw, summarize, shrunkRate, PROP_MARKETS } from "./player-props-v1.mjs";
import { mulberry32, simulateNflGame } from "./game-sim.mjs";

const ROOT = path.join(process.cwd(), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const fit = loadPlayerPropsFit({ fs, path, cwd: process.cwd() });
const strengthState = { ratingFor: (t) => (t === "CIN" ? 1540 : 1505) };
const EVENT = { providerEventId: "401873272", home: { abbr: "CIN" }, away: { abbr: "DET" }, seasonType: 2 };
const ROLE_RATES = {
  players: [
    { playerId: "qb1", name: "QB One", families: new Set(["passAttempts"]), qbShare: 0.92, carryShare: 0, targetShare: 0, share: 0.92, compRate: 0.66, ypcmp: 11.2, catchRate: 0, ypr: 0, ypc: 0, intRate: 0.02, shareBasis: "test" },
    { playerId: "rb1", name: "Back One", families: new Set(["rushAttempts", "targets"]), qbShare: 0, carryShare: 0.55, targetShare: 0.12, share: 0.55, compRate: 0, ypcmp: 0, catchRate: 0.78, ypr: 7.4, ypc: 4.3, intRate: 0, shareBasis: "test" },
    { playerId: "wr1", name: "Wide One", families: new Set(["targets"]), qbShare: 0, carryShare: 0, targetShare: 0.26, share: 0.26, compRate: 0, ypcmp: 0, catchRate: 0.64, ypr: 12.1, ypc: 0, intRate: 0, shareBasis: "test" },
    { playerId: "wr4", name: "Depth Four", families: new Set(["targets"]), qbShare: 0, carryShare: 0, targetShare: 0.015, share: 0.015, compRate: 0, ypcmp: 0, catchRate: 0.6, ypr: 9.0, ypc: 0, intRate: 0, shareBasis: "test" },
  ],
};
const run = (over = {}) => simulatePlayerProps({ event: EVENT, teamAbbr: "CIN", fit, strengthState, roleRates: ROLE_RATES, artifactDate: "2026-08-13", runs: 2000, ...over });

test("committed fit receipt loads and pins the game-sim heads verbatim", () => {
  assert.ok(fit?.receipt, "loadPlayerPropsFit must return the committed fit");
  const model = read("data/internal/research/nfl/reports/model-v1-evaluation.json");
  assert.equal(fit.gamesim.marginSlope, model.fitParams.marginSlope);
  assert.equal(fit.gamesim.sigmaMargin, model.fitParams.sigmaMargin);
  assert.equal(fit.gamesim.muTotal, model.fitParams.muTotal);
  assert.equal(fit.gamesim.sigmaTotal, model.fitParams.sigmaTotal);
});

test("refusals: no fit, wrong team, missing artifactDate", () => {
  assert.equal(simulatePlayerProps({ event: EVENT, teamAbbr: "CIN", fit: null, strengthState, roleRates: ROLE_RATES, artifactDate: "2026-08-13" }).state, "REFUSED");
  assert.equal(run({ teamAbbr: "KC" }).state, "REFUSED", "a team on neither side must refuse, never silently read a side");
  assert.equal(run({ artifactDate: null }).state, "ABSTAIN");
});

test("determinism: identical inputs produce identical outputs, twice", () => {
  const a = run();
  const b = run();
  assert.deepEqual(a, b);
  assert.equal(a.state, "SIMULATED");
});

test("reconciliation counters prove per-iteration coherence (multinomial construction)", () => {
  const sim = run();
  assert.equal(sim.reconciliation.passOverflow, 0);
  assert.equal(sim.reconciliation.rushOverflow, 0);
  assert.equal(sim.reconciliation.receptionsOverTargets, 0);
});

test("zero-inflation flows through the opportunity chain: a 1.5%-target depth receiver has a zero p10", () => {
  const sim = run();
  const depth = sim.players.find((p) => p.playerId === "wr4");
  assert.equal(depth.markets.player_receptions.p10, 0);
  assert.equal(depth.markets.player_reception_yds.p10, 0);
});

test("PRICE-INDEPENDENCE PIN: radically different lines leave every distribution byte-identical", () => {
  const noLines = run();
  const low = run({ lines: { wr1: { player_reception_yds: 5.5 }, qb1: { player_pass_yds: 25.5 } } });
  const high = run({ lines: { wr1: { player_reception_yds: 500.5 }, qb1: { player_pass_yds: 5000.5 } } });
  for (const sim of [low, high]) {
    for (let i = 0; i < sim.players.length; i += 1) {
      for (const [mkt, dist] of Object.entries(sim.players[i].markets)) {
        const base = noLines.players[i].markets[mkt];
        for (const k of ["mean", "p10", "p25", "median", "p75", "p90", "samples"]) {
          assert.equal(dist[k], base[k], `${sim.players[i].playerId}/${mkt}/${k} must not move with the offered line`);
        }
      }
    }
  }
  const wr1 = (sim) => sim.players.find((p) => p.playerId === "wr1").markets.player_reception_yds;
  assert.equal(wr1(high).probOverLine, 0, "a 500-yard line is never cleared");
  assert.ok(wr1(low).probOverLine > 0.5, "a 5.5-yard line is usually cleared");
  assert.ok(wr1(noLines).probOverLine === undefined, "no line, no read-out");
});

test("team-stream compatibility: replayed scores equal the committed game-sim's means bit-for-bit", () => {
  const sim = run();
  const gs = simulateNflGame({
    fit: { params: fit.gamesim },
    strengthState,
    event: EVENT,
    artifactDate: "2026-08-13",
    runs: 2000,
  });
  assert.equal(gs.state, "SIMULATED");
  // game-sim rounds its reported means to 2dp; the pin is sample identity, so 2dp equality is exact
  assert.equal(Number(sim.teamScoreCheck.ownMean.toFixed(2)), gs.scores.home.mean, "home/own mean must replay exactly");
  assert.equal(Number(sim.teamScoreCheck.oppMean.toFixed(2)), gs.scores.away.mean, "away/opp mean must replay exactly");
});

test("structural market independence: no odds/price/bookmaker identifier exists in the engine source", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nfl/player-props-v1.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /\b(odds|price|prices|bookmaker|vig)\b/i, "the engine cannot even name a price — lines are a post-sampling read-out only");
});

test("samplers: binomial bounds, gamma positivity, allocation never overflows", () => {
  const rng = mulberry32("deadbeef");
  for (let i = 0; i < 50; i += 1) {
    const k = binomialDraw(rng, 20, 0.3);
    assert.ok(k >= 0 && k <= 20);
    assert.ok(gammaDraw(rng, 0.6, 2) >= 0, "sub-1 shape boosts must stay non-negative");
  }
  const alloc = allocateOpportunities(rng, 30, [{ playerId: "a", share: 0.7 }, { playerId: "b", share: 0.6 }]);
  const sum = [...alloc.allocated.values()].reduce((s, v) => s + v, 0);
  assert.ok(sum + alloc.other === 30, "every opportunity lands somewhere, none is minted");
});

test("shrunkRate pulls toward the league prior exactly as the pseudo-trials say", () => {
  const { rate } = shrunkRate({ observations: [{ success: 10, trials: 10, season: 2025 }], predictSeason: 2025, halfLifeGames: Infinity, boundaryDecay: 1, priorTrials: 10, leagueRate: 0.5 });
  assert.ok(Math.abs(rate - 0.75) < 1e-9);
});

test("committed evaluation receipt: baselines beaten on MAE everywhere; promotion states honest per policy", () => {
  const r = read("data/internal/research/nfl/reports/player-props-v1-evaluation.json");
  for (const mkt of PROP_MARKETS) {
    const t = r.heldOut2025.table[mkt];
    assert.ok(t.n >= 300, `${mkt} n=${t.n}`);
    assert.ok(t.mae < t.baselines.rolling4Mae, `${mkt} must beat rolling-4 on MAE`);
    assert.ok(t.mae < t.baselines.shareVolMae, `${mkt} must beat share×volume on MAE`);
    assert.ok(t.mae < t.baselines.roleTierMae, `${mkt} must beat the naive role tier on MAE`);
    assert.ok(t.pinball < t.baselines.trailing8Pinball, `${mkt} distribution must beat the trailing-8 empirical on pinball`);
    assert.ok(["PUBLIC_ELIGIBLE", "SHADOW_ELIGIBLE", "RESEARCH_ONLY"].includes(r.promotion[mkt].state));
  }
  // the honest under-coverage stays recorded, never smoothed over: passing intervals are too
  // narrow (QB mid-game exits are unmodeled in v1) so player_pass_yds must NOT be public-eligible.
  assert.ok(r.heldOut2025.table.player_pass_yds.interval80Coverage < 0.72);
  assert.equal(r.promotion.player_pass_yds.state, "RESEARCH_ONLY");
  assert.equal(r.promotion.player_pass_int.state, "RESEARCH_ONLY", "unevaluated components can never promote");
  assert.match(r.promotionPolicy.join(" "), /preseason events: every player market ABSTAINS/);
  const shares = read("data/internal/research/nfl/reports/role-shares-v1.json");
  for (const [i, s] of r.corpusAccounting.entries()) assert.equal(s.contentHash, shares.corpusAccounting[i].contentHash, "both receipts must pin the same corpus bytes");
});
