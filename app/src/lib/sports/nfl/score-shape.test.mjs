/**
 * P251-F6 — THE SHAPE AND THE CENTRE ARE ONE ANSWER.
 *
 * The published regular-season forecast draws a margin and a total from normals, and its own
 * simulator documents the consequence in code: "key-number clustering (3/7) NOT modeled". A second
 * artifact nonetheless reported key numbers for the live slate by ROUNDING that Gaussian — 3 →
 * 6.1%, 7 → 5.4%, 10 → 4.3%, 14 → 3.8%. That smooth decay is what a rounded normal produces; it is
 * not what football does, and publishing it would have dressed the absence of clustering as a
 * measurement of it.
 *
 * The event-based engine can produce clustering, and the risk it introduces is the one this
 * repository has closed twice: two models of the same game disagreeing about it. So the engine is
 * solved onto the published forecast's own median margin and total, and this guard holds that
 * solve — plus the two distributional bars the parameter fit had to clear.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { simulateFullGame, REGULAR_SCORING, PRESEASON_SCORING } from "../../../../scripts/nfl/lib/nfl-score-engine.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const CORPUS = read(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json"));
const SHAPE = read(path.join(APP, "public/data/nfl/score-shape/latest.json"));
const FORECASTS = read(path.join(APP, "public/data/nfl/forecasts/latest.json"));

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const pmf = (a) => { const m = new Map(); for (const v of a) m.set(v, (m.get(v) ?? 0) + 1); for (const [k, c] of m) m.set(k, c / a.length); return m; };
const tvdMaps = (A, B) => { let d = 0; for (const k of new Set([...A.keys(), ...B.keys()])) d += Math.abs((A.get(k) ?? 0) - (B.get(k) ?? 0)); return d / 2; };
/** The distance the sample has to ITSELF — a TVD means nothing without it. */
function splitHalfFloor(values, seed0, resamples = 120) {
  let seed = seed0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let acc = 0;
  for (let i = 0; i < resamples; i += 1) {
    const a = []; const b = [];
    for (const v of values) (rnd() < 0.5 ? a : b).push(v);
    acc += tvdMaps(pmf(a), pmf(b));
  }
  return acc / resamples;
}

const regularRows = (CORPUS?.rows ?? []).filter((r) => r.phase === 2 && Number.isFinite(r.ftHome) && Number.isFinite(r.ftAway));
const hasCorpus = regularRows.length >= 400;

test("CALIBRATION · the regular-season parameters reproduce the measured moments", { skip: !hasCorpus && "corpus-v1.json absent (internal research data)" }, () => {
  const teamPts = [...regularRows.map((r) => r.ftHome), ...regularRows.map((r) => r.ftAway)];
  const totals = regularRows.map((r) => r.ftHome + r.ftAway);
  const margins = regularRows.map((r) => r.ftHome - r.ftAway);

  const sim = simulateFullGame({ gameId: "regular-calibration", awayTeam: "AAA", homeTeam: "BBB", runs: 40000, params: REGULAR_SCORING });
  const flat = (bins) => bins.flatMap((b) => Array(Math.round(b.probability * 20000)).fill(b.value));
  const simTotals = flat(sim.totalScore.distribution);
  const simMargins = flat(sim.scoreDifferential.distribution);
  const simTeamMean = (sim.teamScore.away.mean + sim.teamScore.home.mean) / 2;

  const within = (got, want, tol, what) =>
    assert.ok(Math.abs(got - want) / Math.abs(want) <= tol,
      `${what}: simulated ${got.toFixed(2)} vs measured ${want.toFixed(2)} — outside ${(tol * 100).toFixed(0)}%`);

  within(simTeamMean, mean(teamPts), 0.03, "mean team points");
  within(sd(simTotals), sd(totals), 0.06, "total dispersion");
  within(sd(simMargins), sd(margins), 0.06, "margin dispersion");
});

test("SHAPE · the fit clears both distributional bars — it fits the finals closer than they fit themselves", { skip: !hasCorpus && "corpus absent" }, () => {
  /*
   * These are the two constraints the parameter search had to satisfy, re-derived here rather than
   * trusted from a comment. A moment-only fit passed the test above and got the SHAPE wrong (2.7
   * touchdowns and 1.1 field goals per team per game), which is exactly the failure that would have
   * put mass on the wrong key numbers.
   */
  const teamPts = [...regularRows.map((r) => r.ftHome), ...regularRows.map((r) => r.ftAway)];
  const margins = regularRows.map((r) => r.ftHome - r.ftAway);
  const sim = simulateFullGame({ gameId: "regular-shape", awayTeam: "AAA", homeTeam: "BBB", runs: 40000, params: REGULAR_SCORING });

  const marginFloor = splitHalfFloor(margins, 20260909);
  const teamFloor = splitHalfFloor(teamPts, 424242);
  const marginTvd = tvdMaps(pmf(margins), new Map(sim.scoreDifferential.distribution.map((b) => [b.value, b.probability])));
  const teamTvd = tvdMaps(pmf(teamPts), new Map(sim.teamPointsDistribution.map((b) => [b.value, b.probability])));

  assert.ok(marginTvd < marginFloor, `margin TVD ${marginTvd.toFixed(4)} must stay under the ${marginFloor.toFixed(4)} noise floor`);
  assert.ok(teamTvd < teamFloor, `team-points TVD ${teamTvd.toFixed(4)} must stay under the ${teamFloor.toFixed(4)} noise floor`);
});

test("SHAPE · the engine actually clusters — 3 is the biggest margin, and a normal draw is not", () => {
  const sim = simulateFullGame({ gameId: "clustering", awayTeam: "AAA", homeTeam: "BBB", runs: 40000, params: REGULAR_SCORING });
  const by = Object.fromEntries(sim.keyNumbers.byNumber.map((k) => [k.number, k.probability]));
  assert.ok(by[3] > by[7] && by[7] > by[14], `key numbers must decay 3 > 7 > 14, got ${JSON.stringify(by)}`);
  /*
   * THE DISCRIMINATOR AGAINST THE THING THIS REPLACED. A rounded normal with the same dispersion
   * puts roughly equal, smoothly decaying mass on 3 and 4. Football does not: 3 stands well above
   * its neighbours. If this ratio ever collapses toward 1, the engine has stopped being lumpy and
   * the key-number section is publishing a Gaussian again.
   */
  const at = (m) => sim.scoreDifferential.distribution.find((b) => Math.abs(b.value) === m)?.probability ?? 0;
  const three = sim.scoreDifferential.distribution.filter((b) => Math.abs(b.value) === 3).reduce((s, b) => s + b.probability, 0);
  const four = sim.scoreDifferential.distribution.filter((b) => Math.abs(b.value) === 4).reduce((s, b) => s + b.probability, 0);
  void at;
  assert.ok(three > four * 1.6, `a 3-point margin must stand well above a 4-point one (got ${three.toFixed(4)} vs ${four.toFixed(4)})`);
});

test("PRESEASON IS UNTOUCHED — its frozen fit is a separate parameter set", () => {
  assert.notEqual(REGULAR_SCORING.MODEL_VERSION, PRESEASON_SCORING.MODEL_VERSION, "the two eras stamp different engines");
  assert.equal(PRESEASON_SCORING.SCORING_CHANCES, 7);
  assert.equal(PRESEASON_SCORING.P_TD, 0.294);
  assert.equal(PRESEASON_SCORING.GAME_FLOW_KAPPA, 0.2, "the preseason correlation term is the P184 fit, unchanged");
});

test("LIVE · every published shape is solved onto ITS OWN forecast's centre", { skip: !SHAPE && "no score-shape artifact yet" }, () => {
  assert.equal(SHAPE.dataClass, "PUBLIC_DERIVED");
  const byEvent = new Map((FORECASTS?.forecasts ?? []).map((f) => [f.providerEventId, f]));
  for (const g of SHAPE.games ?? []) {
    const f = byEvent.get(g.providerEventId);
    assert.ok(f, `${g.matchup} publishes a shape with no forecast behind it`);
    assert.equal(g.centre.marginMedian, f.forecastSummary.margin.median, `${g.matchup}: the recorded centre is not the published margin`);
    assert.equal(g.centre.totalMedian, f.forecastSummary.total.median, `${g.matchup}: the recorded centre is not the published total`);
    assert.ok(Math.abs(g.centre.simulatedMarginMedian - g.centre.marginMedian) <= 1,
      `${g.matchup}: the shape's median margin ${g.centre.simulatedMarginMedian} drifted from the published ${g.centre.marginMedian}`);
    assert.ok(Math.abs(g.centre.simulatedTotalMedian - g.centre.totalMedian) <= 1,
      `${g.matchup}: the shape's median total ${g.centre.simulatedTotalMedian} drifted from the published ${g.centre.totalMedian}`);
    assert.ok(g.finalScores.length > 0 && g.finalScores[0].probability < 0.05,
      `${g.matchup}: no single scoreline may be presented as likely`);
  }
});

test("LIVE · a game the solve could not reach publishes NOTHING and records why", { skip: !SHAPE && "no artifact" }, () => {
  for (const r of SHAPE.refused ?? []) {
    assert.ok(r.reason && r.reason.length > 30, `${r.matchup}: a refusal must explain itself`);
    assert.ok(!(SHAPE.games ?? []).some((g) => g.providerEventId === r.providerEventId),
      `${r.matchup} is both refused and published`);
  }
});

test("LIVE · the key-number claim ships with the receipt that measures it", { skip: !SHAPE && "no artifact" }, () => {
  const acc = SHAPE.keyNumberAccuracy;
  assert.ok(acc, "the artifact carries what actually happened, not only what the model says");
  assert.ok(acc.sampleGames >= 400, "measured on a real sample");
  assert.ok(acc.byNumber["3"] > acc.byNumber["7"], "the measured record itself clusters on 3");
  const page = fs.readFileSync(path.join(APP, "src/app/nfl/game/[eventId]/page.tsx"), "utf8");
  assert.match(page, /keyNumberAccuracy/, "the page renders the receipt beside the claim");
  assert.match(page, /Last 3 regular seasons/, "…as a column a reader can compare, not a footnote");
});
