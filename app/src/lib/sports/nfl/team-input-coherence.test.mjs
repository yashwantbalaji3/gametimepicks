/**
 * TEAM-INPUT COHERENCE + the two Week 5 truth rules that ride on it (NFL World Model V2, 2026-10-08).
 *
 *   1. A team forecast blind to its own QB1's absence is never compared with a price that knows it
 *      (team-input-coherence.mjs → output-state.mjs: no EXPERIMENTAL_LEAN).
 *   2. A published passer must carry a starter's share (board-roster-integrity.mjs applyPasserShareFloor).
 *
 * Fixtures are the measured TB @ DAL case (Mayfield Out, depth-chart QB1; Daniels share 0.58) plus the
 * non-material control (a backup on IR whose team's QB1 plays).
 *
 * Run: npx tsx --test src/lib/sports/nfl/team-input-coherence.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { teamInputCoherence } from "./team-input-coherence.mjs";
import { classifyTeamOutput } from "./output-state.mjs";
import { applyPasserShareFloor, PASSER_STARTER_SHARE_FLOOR } from "./board-roster-integrity.mjs";

const mayfield = { playerId: "nfl-athlete-3052587", name: "Baker Mayfield", team: "TB", market: "passAttempts", status: "Out", statedAt: "2026-10-05T19:07Z" };
const chart = (team, id, name) => ({ state: "RESOLVED", starter: { playerId: id, name }, snapshotAt: "2026-10-07T14:25:15Z" });
const qb1 = { TB: chart("TB", "3052587", "Baker Mayfield"), DAL: chart("DAL", "2577417", "Dak Prescott"), CLE: chart("CLE", "3122840", "Deshaun Watson"), NYJ: chart("NYJ", "13494", "Geno Smith") };

test("a depth-chart QB1 who is Out makes the team forecast BLIND and withholds the comparison", () => {
  const r = teamInputCoherence({ participation: { excludedIneligible: [mayfield, { ...mayfield, market: "rushAttempts" }], injuriesAsOf: "2026-10-08T00:43:59Z" }, teams: ["TB", "DAL"], qb1Of: (t) => qb1[t] });
  assert.equal(r.state, "BLIND_TO_STARTING_QB_ABSENCE");
  assert.equal(r.comparisonWithheld, true);
  assert.equal(r.consumedByModel, false, "this module never feeds a head");
  assert.equal(r.absences.length, 1, "one player, however many families he was excluded from");
  assert.match(r.note, /Baker Mayfield \(TB, Out\)/);
});

test("a backup on IR is not material: the team's QB1 plays, so nothing is withheld", () => {
  const gabriel = { playerId: "nfl-athlete-4427238", name: "Dillon Gabriel", team: "CLE", market: "passAttempts", status: "Injured Reserve" };
  const r = teamInputCoherence({ participation: { excludedIneligible: [gabriel] }, teams: ["CLE", "NYJ"], qb1Of: (t) => qb1[t] });
  assert.equal(r.state, "NO_STARTING_QB_ABSENCE");
  assert.equal(r.comparisonWithheld, false);
});

test("missing evidence is UNKNOWN and withholds nothing — never a guessed absence", () => {
  assert.equal(teamInputCoherence({ participation: null, teams: ["TB", "DAL"], qb1Of: () => null }).state, "UNKNOWN");
  const r = teamInputCoherence({ participation: { excludedIneligible: [mayfield] }, teams: ["TB", "DAL"], qb1Of: () => ({ state: "STALE" }) });
  assert.equal(r.state, "UNKNOWN");
  assert.equal(r.comparisonWithheld, false);
  // a non-passing exclusion is never material
  const wr = { playerId: "nfl-athlete-1", name: "A Receiver", team: "TB", market: "targets", status: "Out" };
  assert.equal(teamInputCoherence({ participation: { excludedIneligible: [wr] }, teams: ["TB", "DAL"], qb1Of: (t) => qb1[t] }).state, "NO_STARTING_QB_ABSENCE");
  // an exclusion for a team not in this game is ignored
  assert.equal(teamInputCoherence({ participation: { excludedIneligible: [mayfield] }, teams: ["CLE", "NYJ"], qb1Of: (t) => qb1[t] }).state, "NO_STARTING_QB_ABSENCE");
});

test("output state: a withheld comparison can never become an EXPERIMENTAL_LEAN, however large the gap", () => {
  const base = {
    kickoffUtc: "2026-10-09T00:15:00Z", home: { abbr: "DAL" }, away: { abbr: "TB" },
    forecastSummary: { winProbability: { home: 0.6181, away: 0.355 } },
  };
  const market = { consensus: { homeWinProbNoVig: 0.784 } };
  const now = "2026-10-08T16:00:00Z";
  // control: without the block the 16.6pp gap IS a lean (proves the guard, not the data, decides)
  assert.equal(classifyTeamOutput({ forecast: base, market, nowIso: now }).state, "EXPERIMENTAL_LEAN");
  const blind = { ...base, teamInputs: { comparisonWithheld: true, note: "This forecast does not account for Baker Mayfield (TB, Out)." } };
  const c = classifyTeamOutput({ forecast: blind, market, nowIso: now });
  assert.equal(c.state, "PUBLIC_EXPERIMENTAL");
  assert.equal(c.comparisonWithheld, true);
  assert.equal(c.gapPp, undefined);
  const viaComparison = { ...base, marketComparison: { state: "WITHHELD_TEAM_INPUTS", note: "x" } };
  assert.equal(classifyTeamOutput({ forecast: viaComparison, market, nowIso: now }).state, "PUBLIC_EXPERIMENTAL");
  // after kickoff the lock still wins
  assert.equal(classifyTeamOutput({ forecast: blind, market, nowIso: "2026-10-09T01:00:00Z" }).state, "STARTED");
});

const nflverseTeam = (t) => t;
const board = () => [
  { playerId: "nfl-athlete-4596472", name: "Jalon Daniels", team: "TB", markets: { player_pass_yds: { mean: 116.35 }, anytime_td: { probability: 0.1 } } },
  { playerId: "nfl-athlete-2577417", name: "Dak Prescott", team: "DAL", markets: { player_pass_yds: { mean: 250.39 } } },
  { playerId: "nfl-athlete-9", name: "Unjoined Passer", team: "NYJ", markets: { player_pass_yds: { mean: 200 } } },
];
const shares = new Map([["4596472|TB|player_pass_yds", 0.58], ["2577417|DAL|player_pass_yds", 0.98]]);
const shareOf = (id, t, m) => shares.get(`${id}|${t}|${m}`);

test("passer floor: a relief-sized share is withheld with its reason; the other families on the row are untouched", () => {
  const players = board();
  const r = applyPasserShareFloor({ players, team: "TB", shareOf, nflverseTeam });
  assert.equal(r.withheld.length, 1);
  assert.equal(r.withheld[0].share, 0.58);
  assert.match(r.withheld[0].reason, /^withheld for Jalon Daniels \(TB\)/);
  assert.equal(players[0].markets.player_pass_yds, undefined, "no number survives — not zeroed, not rescaled");
  assert.ok(players[0].markets.anytime_td, "only the passing projection is withheld");
});

test("passer floor: a starter's share is kept byte-identical; an unjoinable share is left as it was and named", () => {
  const players = board();
  const before = JSON.stringify(players[1]);
  assert.equal(applyPasserShareFloor({ players, team: "DAL", shareOf, nflverseTeam }).withheld.length, 0);
  assert.equal(JSON.stringify(players[1]), before);
  const r = applyPasserShareFloor({ players, team: "NYJ", shareOf, nflverseTeam });
  assert.deepEqual(r.unjoined, ["nfl-athlete-9"]);
  assert.ok(players[2].markets.player_pass_yds);
});

test("the floor sits below every Week 5 starter's measured share (lowest: Darnold 0.806) and above the relief shares it withholds", () => {
  assert.ok(PASSER_STARTER_SHARE_FLOOR < 0.806);
  assert.ok(PASSER_STARTER_SHARE_FLOOR > 0.58 && PASSER_STARTER_SHARE_FLOOR > 0.522);
});

/* ── Week 5 venue identity: PHI vs JAX (Tottenham Hotspur Stadium) was published with Jacksonville home field. ── */
import { neutralSiteOf } from "./win-margin-heads.mjs";
import { simulateNflGame } from "./game-sim.mjs";

test("neutral site: ESPN's 'VS' form OR the nflverse list makes a game neutral; neither known ⇒ null, never a guess", () => {
  const nflverse = new Set(["401872965"]);
  assert.equal(neutralSiteOf({ providerEventId: "401872981", shortName: "PHI VS JAX" }, nflverse), true, "London, missing from the nflverse list");
  assert.equal(neutralSiteOf({ providerEventId: "401872965", shortName: "IND @ WSH" }, nflverse), true, "listed by nflverse");
  assert.equal(neutralSiteOf({ providerEventId: "401872980", shortName: "TB @ DAL" }, nflverse), false);
  assert.equal(neutralSiteOf({ providerEventId: "401872980", shortName: "TB @ DAL" }, null), null, "no venue list: unknown");
  assert.equal(neutralSiteOf({ providerEventId: "1", shortName: "JAX VS PHI" }, null), true);
  assert.equal(neutralSiteOf({ providerEventId: "1", shortName: "NAVSEA @ X" }, new Set()), false, "a team name containing 'VS' is not the VS form");
});

test("game-sim: event.neutral === true zeroes the home term; absent, the simulation is byte-identical", () => {
  const fit = { params: { marginSlope: 0.069322, sigmaMargin: 13.7007, muTotal: 45, sigmaTotal: 13.5 } };
  const ratings = { PHI: 1560, JAX: 1540 };
  const strengthState = { ratingFor: (t) => ratings[t], cutoffIso: "2026-10-08T00:00:00Z" };
  const ev = { providerEventId: "401872981", home: "JAX", away: "PHI", seasonType: 2 };
  const a = simulateNflGame({ fit, strengthState, event: ev, artifactDate: "2026-10-08", runs: 2000 });
  const b = simulateNflGame({ fit, strengthState, event: { ...ev, neutral: false }, artifactDate: "2026-10-08", runs: 2000 });
  assert.deepEqual(a, b, "neutral:false and absent are the same game");
  const n = simulateNflGame({ fit, strengthState, event: { ...ev, neutral: true }, artifactDate: "2026-10-08", runs: 2000 });
  assert.equal(a.features.eloDiffEffective, 1540 + 48 - 1560);
  assert.equal(n.features.eloDiffEffective, 1540 - 1560, "no home field at a neutral site");
  assert.ok(n.winProbability.home < 0.5 && a.winProbability.home > 0.5, "the better team is favoured once JAX loses a home field it does not have");
});
