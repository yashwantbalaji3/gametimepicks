/**
 * NBA experimental game-sim guards (N3): seed reproducibility, seed sensitivity, recorded
 * provenance, OUT exclusion, minutes rescale, both win probabilities reported and never blended.
 * NBA PRESEASON — EXPERIMENTAL · PRIVATE_RESEARCH.
 *
 * Run: npx tsx --test src/lib/sports/nba/game-sim.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { simulateGame, prepareRoster, seedForGame, fnv1a32, mulberry32, NBA_SIM_MODEL_VERSION, SEED_POLICY, TEAM_MINUTES } from "./game-sim.mjs";

const row = (id, mins, over = {}) => ({ providerAthleteId: id, name: `P${id}`, expectedMinutes: mins, minutesSd: 4, starterRate: 1, gamesUsed: 10, dnpCount: 0, nullMinutesCount: 0, basis: "trailing10", availability: "active", injuryStatus: null, rates: { pts: 0.5, reb: 0.2, ast: 0.1, threePm: 0.06 }, rateSd: { pts: 0.1, reb: 0.05, ast: 0.03, threePm: 0.02 }, lastSeenDateUtc: "2026-04-01T00:00Z", ...over });
const roster = (rows) => ({ modelVersion: "nba-minutes-model-v0", population: "regular", seasonUsed: 2026, teamGamesInWindow: 10, windowFromDateUtc: "2026-03-20T00:00Z", windowToDateUtc: "2026-04-10T00:00Z", injuriesProvided: true, rows });
const HOME = { name: "Toronto Raptors", providerTeamId: "28", rating: { rating: 1520, games: 82, basis: "regular" }, minutes: roster([row("h1", 34), row("h2", 32), row("h3", 30), row("h4", 28), row("h5", 26), row("h6", 20), row("h7", 18), row("h8", 14)]) };
const AWAY = { name: "Miami Heat", providerTeamId: "14", rating: { rating: 1480, games: 82, basis: "regular" }, minutes: roster([row("a1", 34), row("a2", 32), row("a3", 30), row("a4", 28), row("a5", 26), row("a6", 20), row("a7", 18), row("a8", 14), row("a9", 8)]) };
const base = { providerEventId: "401902644", inputAsOf: "2026-09-22T12:00:00Z", home: HOME, away: AWAY, eloWinProbability: 0.65, simulations: 2000 };

test("reproducible: same seed → byte-identical artifact; a different seed → different sample", () => {
  const a = simulateGame(base);
  const b = simulateGame(base);
  assert.deepEqual(a, b);
  assert.equal(a.seed, fnv1a32("401902644"));
  assert.equal(a.seedPolicy, SEED_POLICY);
  const c = simulateGame({ ...base, seed: "deadbeef" });
  assert.equal(c.seedPolicy, "explicit");
  assert.notDeepEqual(a.sim, c.sim, "another seed must move the sample");
  const other = simulateGame({ ...base, providerEventId: "401902645" });
  assert.notEqual(other.seed, a.seed);
  assert.notDeepEqual(other.sim.home, a.sim.home);
});

test("provenance recorded: modelVersion, inputAsOf, simulations, seed, seedPolicy, availability + minutes assumptions", () => {
  const out = simulateGame(base);
  assert.equal(out.modelVersion, NBA_SIM_MODEL_VERSION);
  assert.equal(out.modelVersion, "nba-preseason-experimental-v0");
  assert.equal(out.inputAsOf, "2026-09-22T12:00:00Z");
  assert.equal(out.simulations, 2000);
  assert.equal(out.seedPolicy, "fixed-per-game: hash(providerEventId)");
  for (const side of ["home", "away"]) {
    assert.ok(out.assumptions.availability[side].rule.includes("Out"));
    assert.equal(out.assumptions.minutes[side].targetTeamMinutes, TEAM_MINUTES);
    assert.ok(Number.isFinite(out.assumptions.minutes[side].rescaleFactor));
    assert.equal(out.assumptions.minutes[side].population, "regular");
  }
});

test("both winner probabilities are reported side by side (Elo analytic, sim sampled) and never blended", () => {
  const out = simulateGame(base);
  assert.equal(out.elo.pHome, 0.65);
  assert.equal(out.elo.pAway, 0.35);
  assert.ok(out.sim.pHome > 0 && out.sim.pHome < 1);
  assert.ok(Math.abs(out.sim.pHome + out.sim.pAway - 1) < 1e-9);
  assert.ok(Math.abs(out.eloVsSimGap - (out.sim.pHome - out.elo.pHome)) < 1e-9);
  assert.ok(out.sim.home.p10 <= out.sim.home.p50 && out.sim.home.p50 <= out.sim.home.p90);
  assert.ok(out.sim.total.mean > 150 && out.sim.total.mean < 300, `total ${out.sim.total.mean}`);
  assert.equal(out.players.home.length, 8);
  const p = out.players.home[0];
  for (const k of ["minutes", "pts", "reb", "ast", "threePm"]) assert.ok(p[k].p10 <= p[k].p50 && p[k].p50 <= p[k].p90, k);
  assert.equal(p.ratesBasis, "player-window");
});

test("OUT players and null-minute players are excluded (listed, never simulated at 0); survivors rescale toward 240", () => {
  const rows = [row("h1", 34, { availability: "out", expectedMinutes: null, minutesSd: null, injuryStatus: "Out" }), row("h2", 30, { expectedMinutes: null, basis: "insufficient", dnpCount: 5 }), row("h3", 30), row("h4", 30), row("h5", 30, { rates: null, rateSd: null, gamesUsed: 2, basis: "insufficient", minutesSd: null })];
  const r = prepareRoster(roster(rows));
  assert.equal(r.players.length, 3);
  assert.deepEqual(r.assumptions.availability.excludedOut.map((x) => x.providerAthleteId), ["h1"]);
  assert.deepEqual(r.assumptions.availability.excludedNoMinutes.map((x) => x.providerAthleteId), ["h2"]);
  assert.equal(r.assumptions.minutes.rawPoolMinutes, 90);
  assert.equal(r.assumptions.minutes.rescaleFactor, 1.5, "bounded at 1.5 (240/90 = 2.67 would be a lie)");
  assert.equal(r.assumptions.minutes.poolRateSubstitutions, 1);
  assert.equal(r.assumptions.minutes.defaultSdSubstitutions, 1);
  const h5 = r.players.find((p) => p.providerAthleteId === "h5");
  assert.equal(h5.ratesBasis, "team-pool-fallback");
  assert.equal(h5.rates.pts, 0.5);
  assert.ok(r.players.every((p) => p.expectedMinutes <= 48));
  const full = prepareRoster(HOME.minutes);
  assert.ok(Math.abs(full.assumptions.minutes.scaledPoolMinutes - 240) < 0.05, "a normal pool lands on 240");
});

test("fnv1a32 + mulberry32 are stable primitives", () => {
  assert.equal(fnv1a32("401902644"), seedForGame("401902644").seed);
  assert.match(fnv1a32("x"), /^[0-9a-f]{8}$/);
  const r1 = mulberry32("af519e45"), r2 = mulberry32("af519e45");
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
  assert.notEqual(mulberry32("00000001")(), mulberry32("00000002")());
  assert.throws(() => simulateGame({ ...base, simulations: 0 }), /simulations/);
  assert.throws(() => simulateGame({ ...base, providerEventId: null }), /providerEventId/);
});
