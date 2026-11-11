/**
 * NFL QB props · frozen baselines and scores (qb-props-scores.mjs) — hand-computed values on synthetic inputs only.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/qb-props-scores.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  COUNT_CALIBRATION_LINES, COUNT_TOP, ECE_BINS, OWN_GAMES, PASS_YDS_LINES, PROB_FLOOR, TEAM_GAMES,
  countLogLoss, crps, ece, empirical, fromCountPmf, interval80, intervalScore, leagueBaseline, lineLogLoss, normal,
  ownPriorGames, ownTrailingBaseline, pOver, poisson, quantile, scoreRow, teamPoissonBaseline, truncatedNormal,
} from "./qb-props-scores.mjs";

const close = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ""} ${a} vs ${b}`);

test("frozen constants: 8 own games, 8 team games, the founder's example lines, count calibration lines", () => {
  assert.equal(OWN_GAMES, 8);
  assert.equal(TEAM_GAMES, 8);
  assert.deepEqual([...PASS_YDS_LINES], [199.5, 224.5, 249.5]);
  assert.equal(ECE_BINS, 10);
  assert.equal(PROB_FLOOR, 1e-6);
  assert.equal(COUNT_TOP, 6);
  assert.deepEqual(JSON.parse(JSON.stringify(COUNT_CALIBRATION_LINES)), { passTd: [0.5, 1.5, 2.5], passInt: [0.5, 1.5] });
});

test("distributions: exact counts, count PMF, normal on the integer grid, Poisson", () => {
  const e = empirical({ 190: 2, 230: 5, 260: 3 });
  assert.equal(e.cdf(189), 0); assert.equal(e.cdf(190), 0.2); assert.equal(e.cdf(259), 0.7); assert.equal(e.cdf(260), 1);
  assert.equal(pOver(e, 224.5), 0.8); assert.equal(pOver(e, 249.5), 0.3);
  assert.deepEqual([quantile(e, 0.1), quantile(e, 0.5), quantile(e, 0.9)], [190, 230, 260]);
  const c = fromCountPmf([0.5, 0.3, 0.1, 0.05, 0.03, 0.01, 0.01]);
  close(c.cdf(1), 0.8); assert.equal(c.cdf(6), 1); assert.equal(c.pmf(9), 0.01, "6+ bucket");
  const n = normal(250, 40);
  close(n.cdf(249), 1 - n.cdf(250), 1e-7, "symmetric about 250 on the half-integer grid");
  close(pOver(n, 249.5), 1 - n.cdf(249), 0);
  close(pOver(normal(249.5, 40), 249.5), 0.5, 1e-7, "P(over the mean) on a half-yard line");
  close(pOver(normal(249.5, 40), 329.5), 0.0227501, 1e-6, "z = 2");
  assert.equal(normal(250, 0), null, "zero spread ⇒ no baseline");
  const p = poisson(1.5);
  close(p.pmf(0), Math.exp(-1.5)); close(p.pmf(2), Math.exp(-1.5) * 1.125);
  let s = 0; for (let k = 0; k <= 40; k++) s += p.pmf(k); close(s, 1, 1e-12);
});

test("scores, by hand: line log loss, CRPS, interval score, count log loss (6+ pooled), ECE", () => {
  const e = empirical({ 190: 2, 230: 5, 260: 3 });
  close(lineLogLoss(e, 240), (-2 * Math.log(0.8) - Math.log(0.7)) / 3);
  close(lineLogLoss(empirical({ 300: 1 }), 100), -Math.log(PROB_FLOOR), 1e-9, "P(under) = 0 is floored, not infinite");
  assert.equal(crps(empirical({ 0: 1, 1: 1 }), 0), 0.25);
  assert.equal(crps(empirical({ 20: 1 }), 20), 0, "a point mass on the outcome scores 0");
  assert.equal(crps(empirical({ 20: 1 }), 23), 3, "a point mass 3 off scores 3 on the integer grid");
  assert.deepEqual(interval80(e), [190, 260]);
  assert.equal(intervalScore([190, 260], 240), 70);
  assert.equal(intervalScore([190, 260], 180), 70 + 10 * 10);
  assert.equal(intervalScore([190, 260], 265), 70 + 10 * 5);
  const td = empirical({ 0: 2, 1: 4, 2: 3, 7: 1 });
  close(countLogLoss(td, 1), -Math.log(0.4));
  close(countLogLoss(td, 9), -Math.log(0.1), 1e-12, "9 and 7 share the 6+ bucket");
  close(countLogLoss(poisson(1), 6), -Math.log(1 - poisson(1).cdf(5)));
  // ECE: two bins — p 0.15 (y 0,1 → 0.5) and p 0.85 (y 1,1 → 1)
  close(ece([{ p: 0.15, y: 0 }, { p: 0.15, y: 1 }, { p: 0.85, y: 1 }, { p: 0.85, y: 1 }]), 0.5 * 0.35 + 0.5 * 0.15);
  assert.equal(ece([]), null);
  const row = scoreRow(e, 240, "yds");
  assert.deepEqual([row.median, row.q10, row.q90, row.width, row.covered80, row.error], [230, 190, 260, 70, true, 10]);
});

/* walk-forward fixtures */
const game = (id, season, dateUtc, ps) => ({ providerEventId: id, season, dateUtc, players: ps });
const qb = (pid, team, passAtt, passYds, passTd = 1, passInt = 0) => ({ playerId: pid, teamAbbr: team, passAtt, passCmp: Math.round(passAtt * 0.65), passYds, passTd, passInt });
const G = [
  ...Array.from({ length: 9 }, (_, i) => game(`a${i}`, 2025, `2025-10-${String(1 + i).padStart(2, "0")}T17:00Z`, [qb("Q", "AAA", 30, 200 + i, i % 2, 1), qb("R", "BBB", 30, 300, 2, 0)])),
  game("dnp", 2026, "2026-09-10T17:00Z", [qb("Q", "AAA", 0, 0, 0, 0), qb("Q2", "AAA", 35, 999, 3, 3), qb("R", "BBB", 30, 300, 2, 0)]),
  game("same", 2026, "2026-09-20T17:00Z", [qb("Q", "AAA", 30, 5000, 9, 9), qb("R", "BBB", 30, 300, 2, 0)]),
];

test("walk-forward: only games strictly before kickoff; own baseline skips games not played; 8 required", () => {
  const rows = ownPriorGames(G, "Q", "2026-09-20T17:00Z");
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map((r) => r.passYds), [208, 207, 206, 205, 204, 203, 202, 201], "the 0-attempt game and the game itself are skipped");
  const b = ownTrailingBaseline(G, "Q", "2026-09-20T17:00Z", "passYds");
  close(b.mu, 204.5);
  close(b.sigma, Math.sqrt(42 / 7));
  assert.equal(ownPriorGames(G, "Q", "2025-10-08T17:00Z"), null, "7 prior games < 8 ⇒ no baseline");
  // team Poisson: the team's previous 8 games, all passers summed (the dnp game counts for the team: Q2 threw 3 TD)
  const t = teamPoissonBaseline(G, "AAA", "2026-09-20T17:00Z", "passTd");
  close(t.lambda, (3 + [8, 7, 6, 5, 4, 3, 2].reduce((a, i) => a + (i % 2), 0)) / 8);
  const ti = teamPoissonBaseline(G, "AAA", "2026-09-20T17:00Z", "passInt");
  close(ti.lambda, (3 + 7) / 8);
  // the game itself never enters, whatever its numbers
  assert.ok(ownTrailingBaseline(G, "Q", "2026-09-20T17:00Z", "passYds").mu < 1000);
});

test("league baseline: same season only, before kickoff; counts are team totals, continuous the starting QB", () => {
  const l = leagueBaseline(G, 2026, "2026-09-20T17:00Z", "passYds", "continuous");
  close(l.mu, (999 + 300) / 2, 1e-9, "the 2026 dnp game: starters Q2 (999) and R (300)");
  const lc = leagueBaseline(G, 2026, "2026-09-20T17:00Z", "passTd", "count");
  close(lc.lambda, (3 + 2) / 2);
  assert.equal(leagueBaseline(G, 2026, "2026-09-10T17:00Z", "passYds", "continuous"), null, "no earlier 2026 game");
});

test("pure module: no clock, no fs, no network", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nfl/qb-props-scores.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(src, /Date\.now\(|new Date\(|from "node:|fetch\(/);
});

/* v1.3 (founder condition c): impossible negative counts */
const stdPhi = (z) => { let s = 0, t = z; for (let k = 0; k < 120; k++) { s += t; t *= (-z * z) / 2 * (2 * k + 1) / ((k + 1) * (2 * k + 3)); } return 0.5 + s / Math.sqrt(2 * Math.PI); };

test("cmp/att baseline: the normal truncated at 0 — pmf sums to 1, zero mass below 0, the founder's formula", () => {
  for (const [mu, sigma] of [[2, 3], [0.5, 4], [22, 5], [35, 8]]) {
    const d = truncatedNormal(mu, sigma);
    assert.equal(d.lo, 0);
    for (const k of [-1, -2, -10]) { assert.equal(d.pmf(k), 0); assert.equal(d.cdf(k), 0); }
    let s = 0; for (let k = 0; k <= d.hi + 50; k++) s += d.pmf(k);
    close(s, 1, 1e-9, `mass on k ≥ 0 for N(${mu}, ${sigma})`);
    const den = 1 - stdPhi((-0.5 - mu) / sigma);
    for (const k of [0, 1, Math.round(mu)]) close(d.pmf(k), (stdPhi((k + 0.5 - mu) / sigma) - stdPhi((k - 0.5 - mu) / sigma)) / den, 1e-6, `P(X=${k})`);
  }
  assert.equal(truncatedNormal(5, 0), null, "zero spread ⇒ no baseline");
  // the untruncated normal keeps its mass below 0 — the reason cmp/att no longer use it
  assert.ok(normal(2, 3).cdf(-1) > 0.15);
});

test("baseline forms: cmp/att (own-8 and league) are truncated at 0; passing yards stay untruncated", () => {
  const low = [0, 1, 2, 3, 1, 0, 2, 4];
  const gs = low.map((c, i) => game(`t${i}`, 2026, `2026-09-${String(1 + i).padStart(2, "0")}T17:00Z`, [{ playerId: "T", teamAbbr: "TTT", passAtt: c + 1, passCmp: c, passYds: c * 3 - 4, passTd: 0, passInt: 0 }]));
  const k = "2026-10-01T17:00Z";
  for (const a of ["passCmp", "passAtt"]) {
    assert.equal(ownTrailingBaseline(gs, "T", k, a).kind, "truncatedNormal", a);
    assert.equal(leagueBaseline(gs, 2026, k, a, "continuous").kind, "truncatedNormal", `league ${a}`);
  }
  assert.equal(ownTrailingBaseline(gs, "T", k, "passYds").kind, "normal");
  assert.equal(leagueBaseline(gs, 2026, k, "passYds", "continuous").kind, "normal");
  assert.ok(ownTrailingBaseline(gs, "T", k, "passYds").cdf(-1) > 0, "negative passing yards keep their mass");
});

test("CRPS regression: summed over the support plus the actual only; no penalty from impossible negatives", () => {
  // brute force over a wide grid equals the support-only sum for a distribution with no mass below 0
  const d = truncatedNormal(2, 3);
  const brute = (dist, y) => { let s = 0; for (let k = -200; k <= 400; k++) s += ((k < dist.lo ? 0 : dist.cdf(k)) - (y <= k ? 1 : 0)) ** 2; return s; };
  for (const y of [0, 1, 3, 9]) close(crps(d, y), brute(d, y), 1e-9, `y=${y}`);
  // pinned regression value: N(2, 3) truncated at 0, actual 0 (independent sum over k ≥ 0 with the series Φ)
  const den = 1 - stdPhi(-2.5 / 3);
  // k ≤ 14 (z ≤ 4.2): the series Φ is exact there and the tail terms are below 1e-9
  let pin = 0; for (let k = 0; k <= 14; k++) pin += ((stdPhi((k + 0.5 - 2) / 3) - stdPhi(-2.5 / 3)) / den - 1) ** 2;
  close(crps(d, 0), pin, 1e-6, "truncated CRPS at y = 0");
  // the old scoring (untruncated normal, grid from min(0, lo) − 1) put score on impossible k < 0: Σ_{k<0} F(k)² > 0
  const n = normal(2, 3);
  let negTerms = 0; for (let k = n.lo - 1; k < 0; k++) negTerms += n.cdf(k) ** 2;
  assert.ok(negTerms > 0.05, `old impossible-outcome terms ${negTerms}`);
  let newNeg = 0; for (let k = d.lo - 50; k < 0; k++) newNeg += d.cdf(k) ** 2;
  assert.equal(newNeg, 0, "the truncated baseline has no term below 0");
  // a point mass far from 0 is scored only from its support to the actual (no terms from 0 upward)
  assert.equal(crps(empirical({ 300: 1 }), 297), 3);
  assert.equal(crps(empirical({ 20: 1 }), 23), 3);
});
