/**
 * FIT THE SCORE ENGINE TO A LEAGUE (P251 · F6).
 *
 * The engine's constants are latent: SCORING_CHANCES is not a measured drive count and P_TD is not
 * a measured conversion rate. They are chosen so the simulated final-score distribution reproduces
 * the moments that ARE measured, from real finals. This script does the choosing, so the fit is
 * reproducible and the numbers frozen in the engine can be re-derived rather than trusted.
 *
 *   node scripts/nfl/fit-nfl-score-engine.mjs --phase 2     # regular season
 *   node scripts/nfl/fit-nfl-score-engine.mjs --phase 1     # preseason (re-derives the P184 fit)
 *
 * Targets, all measured from data/internal/research/nfl/corpus-v1.json:
 *   mean team points · sd team points · sd total · sd margin
 * Home advantage is NOT a target: the engine is symmetric on purpose and the published forecast's
 * Elo head owns that term (see REGULAR_SCORING's header).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { simulateFullGame, PRESEASON_SCORING } from "./lib/nfl-score-engine.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PHASE = Number(arg("--phase", "2"));
const RUNS = Number(arg("--runs", "60000"));

const rows = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json"), "utf8"))
  .rows.filter((r) => r.phase === PHASE && Number.isFinite(r.ftHome) && Number.isFinite(r.ftAway));
if (rows.length < 100) { console.error(`REFUSED: only ${rows.length} finals for phase ${PHASE}`); process.exit(1); }

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

const teamPts = [...rows.map((r) => r.ftHome), ...rows.map((r) => r.ftAway)];
const totals = rows.map((r) => r.ftHome + r.ftAway);
const margins = rows.map((r) => r.ftHome - r.ftAway);
const TARGET = { teamMean: mean(teamPts), teamSd: sd(teamPts), totalSd: sd(totals), marginSd: sd(margins) };

/**
 * THE MOMENTS ARE NOT ENOUGH, AND THE FIRST FIT PROVED IT.
 *
 * Fitting the four moments alone landed on 10 chances at P_TD 0.274 / P_FG 0.112 — 2.74 touchdowns
 * and 1.1 field goals per team per game. The mean and all three dispersions were within 0.7%, and
 * the SHAPE was wrong: real NFL teams score about 2.4 touchdowns and 1.8 field goals, so that fit
 * builds the same average out of too many 7s and too few 3s. Shape is exactly what key numbers
 * read off, so a moment-only fit would have produced a confident-looking margin distribution that
 * clusters on the wrong numbers.
 *
 * So the empirical MARGIN distribution is a fit target too, as total-variation distance — the same
 * statistic the preseason engine was validated on.
 */
const empiricalMargin = (() => {
  const m = new Map();
  for (const v of margins) m.set(v, (m.get(v) ?? 0) + 1);
  for (const [k, c] of m) m.set(k, c / margins.length);
  return m;
})();
/**
 * THE NOISE FLOOR: how far the empirical margin sample is from ITSELF.
 *
 * A total-variation distance means nothing without it — 0.18 sounds close or far depending on how
 * lumpy a sample of this size is. Split the finals in half at random, measure the distance between
 * the halves, repeat. A model closer than this fits the measured distribution more tightly than
 * the sample fits itself, which is the same standard the preseason engine was held to.
 */
function marginNoiseFloor(resamples = 200) {
  let seed = 20260909;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pmf = (a) => { const m = new Map(); for (const v of a) m.set(v, (m.get(v) ?? 0) + 1); for (const [k, c] of m) m.set(k, c / a.length); return m; };
  let acc = 0;
  for (let i = 0; i < resamples; i += 1) {
    const a = []; const b = [];
    for (const m of margins) (rnd() < 0.5 ? a : b).push(m);
    const A = pmf(a); const B = pmf(b);
    let d = 0;
    for (const k of new Set([...A.keys(), ...B.keys()])) d += Math.abs((A.get(k) ?? 0) - (B.get(k) ?? 0));
    acc += d / 2;
  }
  return acc / resamples;
}
const MARGIN_FLOOR = marginNoiseFloor();

/**
 * AND THE SAME QUESTION ASKED OF TEAM POINTS.
 *
 * The margin distribution constrains how far apart two teams finish; it says much less about what
 * a team's own score is made of. Two fits can match every margin moment and disagree completely on
 * whether 22 points is usually 3 TD + a FG or 2 TD + 3 FG — and that composition is exactly what
 * puts mass on 3-point and 7-point margins. The corpus carries final scores only, so drive data
 * cannot settle it; the team-score distribution can, because 7s and 3s leave their fingerprints in
 * which team totals are common (21 and 24 against 20 and 22).
 */
const empiricalTeam = (() => {
  const m = new Map();
  for (const v of teamPts) m.set(v, (m.get(v) ?? 0) + 1);
  for (const [k, c] of m) m.set(k, c / teamPts.length);
  return m;
})();
function teamNoiseFloor(resamples = 200) {
  let seed = 424242;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pmf = (a) => { const m = new Map(); for (const v of a) m.set(v, (m.get(v) ?? 0) + 1); for (const [k, c] of m) m.set(k, c / a.length); return m; };
  let acc = 0;
  for (let i = 0; i < resamples; i += 1) {
    const a = []; const b = [];
    for (const v of teamPts) (rnd() < 0.5 ? a : b).push(v);
    const A = pmf(a); const B = pmf(b);
    let d = 0;
    for (const k of new Set([...A.keys(), ...B.keys()])) d += Math.abs((A.get(k) ?? 0) - (B.get(k) ?? 0));
    acc += d / 2;
  }
  return acc / resamples;
}
const TEAM_FLOOR = teamNoiseFloor();
function teamTvd(bins) {
  const sim = new Map(bins.map((b) => [b.value, b.probability]));
  let d = 0;
  for (const k of new Set([...empiricalTeam.keys(), ...sim.keys()])) {
    d += Math.abs((empiricalTeam.get(k) ?? 0) - (sim.get(k) ?? 0));
  }
  return d / 2;
}

function marginTvd(bins) {
  const sim = new Map(bins.map((b) => [b.value, b.probability]));
  let d = 0;
  for (const k of new Set([...empiricalMargin.keys(), ...sim.keys()])) {
    d += Math.abs((empiricalMargin.get(k) ?? 0) - (sim.get(k) ?? 0));
  }
  return d / 2;
}
console.log(`phase ${PHASE}: ${rows.length} finals`);
console.log(`  measured  team ${TARGET.teamMean.toFixed(2)} ± ${TARGET.teamSd.toFixed(2)} · total sd ${TARGET.totalSd.toFixed(2)} · margin sd ${TARGET.marginSd.toFixed(2)}`);
console.log(`  home edge ${mean(margins).toFixed(2)} pts (NOT a fit target — the Elo head owns it)`);
console.log(`  noise floors — margin ${MARGIN_FLOOR.toFixed(4)} · team points ${TEAM_FLOOR.toFixed(4)} (split-half resampling of the same finals)`);

/** Simulated moments for one candidate parameter set, on a symmetric matchup. */
function moments(params) {
  const s = simulateFullGame({ gameId: `fit-${PHASE}`, awayTeam: "AAA", homeTeam: "BBB", runs: RUNS, params });
  const flat = (bins) => bins.flatMap((b) => Array(Math.round(b.probability * 20000)).fill(b.value));
  const totalsSim = flat(s.totalScore.distribution);
  const marginsSim = flat(s.scoreDifferential.distribution);
  const teamMean = (s.teamScore.away.mean + s.teamScore.home.mean) / 2;
  /* Team sd is recovered from the two published dispersions rather than re-sampled:
     Var(team) = (Var(total) + Var(margin)) / 4 holds for any two variables. */
  const teamSd = Math.sqrt((sd(totalsSim) ** 2 + sd(marginsSim) ** 2) / 4);
  return {
    teamMean, teamSd, totalSd: sd(totalsSim), marginSd: sd(marginsSim),
    marginTvd: marginTvd(s.scoreDifferential.distribution),
    teamTvd: teamTvd(s.teamPointsDistribution ?? []),
    td: (s.scoringRates.awayTouchdowns + s.scoringRates.homeTouchdowns) / 2,
    fg: (s.scoringRates.awayFieldGoals + s.scoringRates.homeFieldGoals) / 2,
  };
}

const loss = (m) =>
  ((m.teamMean - TARGET.teamMean) / TARGET.teamMean) ** 2 * 4 +   /* the mean is weighted: a wrong
                                                                     centre is visible on every card */
  ((m.teamSd - TARGET.teamSd) / TARGET.teamSd) ** 2 +
  ((m.totalSd - TARGET.totalSd) / TARGET.totalSd) ** 2 +
  ((m.marginSd - TARGET.marginSd) / TARGET.marginSd) ** 2;

/*
 * SHAPE IS A CONSTRAINT, NOT A WEIGHT. Weighting TVD against the moments made the two trade off,
 * and the winner had the right shape with dispersions 6% narrow — a distribution that looks like
 * football and is too confident. A candidate must first fit the empirical margin distribution
 * closer than the sample fits itself; among those, the best MOMENT fit wins.
 */
const admissible = (m) => m.marginTvd < MARGIN_FLOOR && m.teamTvd < TEAM_FLOOR;

let best = null;
for (const chances of [6, 7, 8, 9, 10, 11]) {
  for (let pTd = 0.16; pTd <= 0.42; pTd += 0.006) {
    for (let pFg = 0.10; pFg <= 0.34; pFg += 0.006) {
      /* Analytic pre-screen on the mean, so the expensive simulation only runs on candidates that
         can possibly land near it. TD is worth 6 + E[conversion]; a safety adds 2·P_SAFETY. */
      const tdValue = 6 + PRESEASON_SCORING.P_XP_GOOD + 2 * PRESEASON_SCORING.P_TWO_POINT_GOOD;
      const approxMean = chances * (tdValue * pTd + 3 * pFg) + 2 * PRESEASON_SCORING.P_SAFETY;
      if (Math.abs(approxMean - TARGET.teamMean) > 0.35) continue;
      for (const kappa of [0.0, 0.04, 0.07, 0.09, 0.11, 0.14, 0.18, 0.22]) {
        const params = {
          ...PRESEASON_SCORING,
          SCORING_CHANCES: chances,
          P_TD: Number(pTd.toFixed(3)),
          P_FG: Number(pFg.toFixed(3)),
          GAME_FLOW_KAPPA: kappa,
          OT: PHASE === 1 ? PRESEASON_SCORING.OT : { homeFg: 0.47, awayFg: 0.47 },
          MODEL_VERSION: "fit-candidate",
        };
        const m = moments(params);
        if (!admissible(m)) continue;
        const l = loss(m);
        if (!best || l < best.loss) best = { loss: l, params, m };
      }
    }
  }
}

if (!best) { console.error(`REFUSED: no candidate fit BOTH the margin (floor ${MARGIN_FLOOR.toFixed(4)}) and team-points (floor ${TEAM_FLOOR.toFixed(4)}) distributions closer than the sample fits itself`); process.exit(2); }
const { params: p, m } = best;
console.log(`\nBEST FIT  loss ${best.loss.toFixed(6)}`);
console.log(`  SCORING_CHANCES: ${p.SCORING_CHANCES}`);
console.log(`  P_TD: ${p.P_TD}`);
console.log(`  P_FG: ${p.P_FG}`);
console.log(`  GAME_FLOW_KAPPA: ${p.GAME_FLOW_KAPPA}`);
console.log(`  simulated team ${m.teamMean.toFixed(2)} ± ${m.teamSd.toFixed(2)} · total sd ${m.totalSd.toFixed(2)} · margin sd ${m.marginSd.toFixed(2)}`);
console.log(`  scoring shape ${m.td.toFixed(2)} TD · ${m.fg.toFixed(2)} FG per team per game`);
console.log(`  margin TVD ${m.marginTvd.toFixed(4)} (floor ${MARGIN_FLOOR.toFixed(4)}) · team-points TVD ${m.teamTvd.toFixed(4)} (floor ${TEAM_FLOOR.toFixed(4)})`);
for (const [k, v] of Object.entries(TARGET)) {
  const got = m[k];
  console.log(`    ${k.padEnd(10)} ${got.toFixed(2)} vs ${v.toFixed(2)}  (${(((got - v) / v) * 100).toFixed(1)}%)`);
}
