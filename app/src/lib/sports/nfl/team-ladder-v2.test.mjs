/**
 * NFL-002 team ladder (team-ladder-v2.mjs) — the properties its evaluation rests on.
 *
 *   · walk-forward: a game's features never see that date's (or any later) result;
 *   · coherence: win, margin, spread and the projected score come from ONE distribution;
 *   · signed lines: home −3.5 and away +3.5 are the same event; integer lines carry push mass;
 *   · the committed receipt reproduces from the committed inputs (parity with the evaluation file).
 *
 * Run: npx tsx --test src/lib/sports/nfl/team-ladder-v2.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { foldTeamLadder, fitStack, predictStack, phi, ols, spreadProbabilities, totalProbabilities, crpsNormal } from "./team-ladder-v2.mjs";

const params = { eloK: 20, eloHome: 36, gE: 0.12, carryE: 0.8, gP: 0.08, carryP: 0.5 };
const frozen = { franchiseMap: {} };
const g = (id, season, date, home, away, hs, as, neutral = 0) => ({ gameId: id, season, date, home, away, homeScore: hs, awayScore: as, neutral });
const eff = (id, team, oPlays, oEpa) => ({ gameId: id, team, oPlays, oEpa });

const games = [
  g("a", 2024, "2024-09-08", "AAA", "BBB", 30, 10),
  g("b", 2024, "2024-09-08", "CCC", "DDD", 17, 20),
  g("c", 2024, "2024-09-15", "AAA", "CCC", 24, 21),
  g("d", 2024, "2024-09-15", "BBB", "DDD", 13, 27),
  g("e", 2024, "2024-09-22", "DDD", "AAA", 20, 23),
];
const effRows = games.flatMap((x) => [eff(x.gameId, x.home, 60, (x.homeScore - 20) / 4), eff(x.gameId, x.away, 60, (x.awayScore - 20) / 4)]);

const featuresByGame = (gs) => {
  const out = new Map();
  foldTeamLadder({ games: gs, efficiencyRows: effRows, frozen, params, onDay: (day, f) => { for (const x of day) out.set(x.gameId, f(x)); } });
  return out;
};

test("walk-forward: changing a game's own result (or any later one) never changes its features", () => {
  const base = featuresByGame(games);
  const altered = games.map((x) => (x.gameId === "c" ? { ...x, homeScore: 3, awayScore: 45 } : x.gameId === "e" ? { ...x, homeScore: 50, awayScore: 0 } : x));
  const alt = featuresByGame(altered);
  for (const id of ["a", "b", "c", "d"]) assert.deepEqual(alt.get(id), base.get(id), `${id} saw a result from its own date or later`);
  // and the game AFTER the altered one does move — the fold is not inert
  assert.notDeepEqual(alt.get("e"), base.get("e"));
  // same-date games are predicted from the same state: "d" cannot see "c" (both 2024-09-15)
  const alt2 = featuresByGame(games.map((x) => (x.gameId === "c" ? { ...x, homeScore: 0, awayScore: 60 } : x)));
  assert.deepEqual(alt2.get("d"), base.get("d"));
});

test("unplayed (score-less) games fold nothing — a schedule row cannot move a rating", () => {
  const withFuture = [...games, g("f", 2024, "2024-09-29", "AAA", "BBB", null, null), g("h", 2024, "2024-10-06", "AAA", "BBB", 20, 17)];
  const without = [...games, g("h", 2024, "2024-10-06", "AAA", "BBB", 20, 17)];
  assert.deepEqual(featuresByGame(withFuture).get("h"), featuresByGame(without).get("h"));
});

test("coherence: P(home win) is exactly Phi(mu/sigma) of the published margin distribution", () => {
  const obs = [];
  for (let i = 0; i < 400; i += 1) {
    const f = { hInd: i % 7 ? 1 : 0, eloD: Math.sin(i), epaEdge: Math.cos(i) / 10, ptsEdge: Math.sin(i * 1.3) * 5, restDiff: (i % 3) / 7, ptsTotal: 44 + Math.cos(i), epaSum: Math.sin(i * 0.7) / 10 };
    obs.push({ features: f, margin: 2 * f.hInd + 3 * f.eloD + 0.5 * f.ptsEdge + ((i * 7919) % 27) - 13, total: 44 + ((i * 104729) % 25) - 12 });
  }
  const fit = fitStack(obs);
  for (const o of obs.slice(0, 50)) {
    const p = predictStack(fit, o.features);
    assert.equal(p.pHome, phi(p.muM / p.sigmaM));
    // P(home win) = P(M > 0) splits the tie window [-0.5, 0.5]; it must sit between home -0.5 (wins by 1+) and
    // home +0.5 (does not lose) on the SAME distribution — a separately derived number could land anywhere.
    const lo = spreadProbabilities(p, -0.5).homeCover;
    const hi = spreadProbabilities(p, 0.5).homeCover;
    assert.ok(lo < p.pHome && p.pHome < hi, "the win chance and the spread probabilities come from one distribution");
  }
});

test("signed lines: home -3.5 cover + away +3.5 cover = 1; integer lines carry an explicit push", () => {
  const d = { muM: 4.2, sigmaM: 13 };
  const half = spreadProbabilities(d, -3.5);
  assert.ok(Math.abs(half.homeCover + half.awayCover - 1) < 1e-12);
  assert.equal(half.push, 0);
  const awayView = spreadProbabilities({ muM: -4.2, sigmaM: 13 }, 3.5); // the same game seen from the other side
  assert.ok(Math.abs(awayView.awayCover - half.homeCover) < 1e-9, "+3.5 can never populate a -3.5 comparison with a different number");
  const whole = spreadProbabilities(d, -3);
  assert.ok(whole.push > 0 && Math.abs(whole.homeCover + whole.awayCover + whole.push - 1) < 1e-12);
  const t = totalProbabilities({ muT: 47, sigmaT: 13.3 }, 47);
  assert.ok(t.push > 0 && Math.abs(t.over - t.under) < 1e-12 && Math.abs(t.over + t.under + t.push - 1) < 1e-12);
});

test("numerics: phi, OLS and the Normal CRPS against known values", () => {
  assert.ok(Math.abs(phi(0) - 0.5) < 1e-9);
  assert.ok(Math.abs(phi(1.959963985) - 0.975) < 2e-7);
  assert.ok(Math.abs(phi(-1.2815515655) - 0.1) < 2e-7);
  const c = ols([[1, 0], [1, 1], [1, 2], [1, 3]], [1, 3, 5, 7]);
  assert.ok(Math.abs(c[0] - 1) < 1e-9 && Math.abs(c[1] - 2) < 1e-9);
  // CRPS of N(0,1) at 0 is (sqrt(2) - 1)/sqrt(pi)
  assert.ok(Math.abs(crpsNormal(0, 1, 0) - (Math.SQRT2 - 1) / Math.sqrt(Math.PI)) < 1e-9);
});

test("the committed held-out receipt carries the frozen verdicts and the incumbent parity checks", () => {
  const p = path.resolve(process.cwd(), "..", "data/internal/research/nfl/reports/nfl-002-team-ladder-evaluation.json");
  const e = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(e.preregistration, "data/internal/research/nfl/reports/nfl-002-team-ladder-preregistration.json");
  assert.ok(Object.values(e.implementationChecks).every((c) => c.pass), "the incumbent and v3 must reproduce their own receipts");
  const v = e.verdicts["nfl-team-stack-v1"];
  // the receipt is evidence, not a switch: nothing here may read ELIGIBLE where the bars failed
  assert.equal(v.win, Object.values(e.bars.win).every((b) => b.pass) ? "ELIGIBLE" : "REJECTED");
  assert.equal(v.coherentPair === "ELIGIBLE", v.win === "ELIGIBLE" && v.margin !== "REJECTED");
});
