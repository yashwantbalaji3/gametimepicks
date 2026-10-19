/**
 * NBA game simulation v1 — "nba-sim-v1-coherent". PURE, seeded, deterministic. No I/O.
 * NBA REGULAR SEASON — SHADOW CANDIDATE · dataClass PRIVATE_RESEARCH · productEligible: false.
 * v0 (game-sim.mjs) is untouched and keeps its own family, ledger and model-version string; v1 is a separate
 * candidate (family "v1", CANDIDATE_SHADOW) and is never claimed validated by anything in this file.
 *
 * ONE DRAW, TOP DOWN (every quantity of a draw is derived from the same random path, so game-level and player-level
 * outputs come from the SAME draws):
 *   1. EXPECTATIONS (fixed per game): expected regulation margin  μm = HCA_POINTS·home + ELO_TO_MARGIN·(Elo_h − Elo_a)
 *      (the opponent and Elo enter here); expected regulation total μt = L + TOTAL_OFFSET + TOTAL_WEIGHT·(T_raw − L), where L is
 *      the as-of league total (final scores), TOTAL_OFFSET converts it to regulation, and T_raw = (O_h + D_a + O_a + D_h)/2 from the two rosters' pools (O = minutes-weighted
 *      points per 240 minutes) and each opponent's points allowed (D). Team expectations E_h = (μt+μm)/2,
 *      E_a = (μt−μm)/2.
 *   2. SHARED PACE g ~ N(1, PACE_SD²) multiplies BOTH teams' expectations; each team adds its own N(0, TEAM_NOISE_SD²)
 *      and rounds to an integer regulation score. Var(total) − Var(margin) = ((E_h+E_a)² − (E_h−E_a)²)·PACE_SD² > 0,
 *      so the total SD exceeds the margin SD by construction.
 *   3. QUARTERS: each team's regulation points are split into Q1–Q4 by a Dirichlet(α·s)-multinomial (shares s and
 *      concentration α fitted on 2023-24 linescores) — integers that sum to the regulation score.
 *   4. OVERTIME: a regulation tie plays 5-minute OT periods, each team scoring Poisson(E·g·5/48·OT_SCALE), until the
 *      score is untied. CAP RULE: at most OT_CAP (8) periods; if the 8th period would end tied it is redrawn until it
 *      does not (rejection; the expected count of such draws is < 1e-7 per game and is recorded).
 *   5. MINUTES: each player plays with probability playRate; a playing player's raw minutes ~ N(mean, sd) clipped to
 *      [0, 48]; then WATER-FILLING scales raw^MINUTES_POWER to exactly 240 + 25·OT with every player capped at
 *      48 + 5·OT (a power > 1 takes the excess of an over-full pool mostly from the short-minutes players, as real
 *      rotations do, instead of shaving every starter proportionally). If
 *      fewer than 5 players drew positive minutes (cannot fill the floor), the highest expected-minutes non-players
 *      are added at their mean minutes (counted as minutesTopUps).
 *   6. SCORING DECOMPOSITION: 3PA_i ~ Poisson(rate3PA_i × minutes_i × g); 3PM_i ~ Binomial(3PA_i, p3_i) (shrunk 3P%).
 *      The remaining R = team points − 3·Σ3PM is split into free throws and twos: FTM_T ~ Binomial(R, q) with q the
 *      pool's FT share of non-three points; if R − FTM_T is odd, FTM_T moves ±1 by a fair coin (forced +1 at 0), so
 *      the parity fix is symmetric; 2PM_T = (R − FTM_T)/2. 2PM_T and FTM_T are allocated multinomially across the
 *      players by minutes × their own 2PM / FTM rates. Hence Σ player points = team points EXACTLY and
 *      pts = 3·3PM + 2·2PM + FTM for every player.
 *      EDGE CASE 3·Σ3PM > team points: the whole three-point vector is redrawn (up to 20 times — conditioning on
 *      feasibility, which is the true constraint, not a bias); if still infeasible, made threes are converted to
 *      misses one at a time, each chosen uniformly among the made threes (thinning), until feasible. Both counts are
 *      recorded per game; neither occurred in the 2024-25 evaluation runs.
 *   7. REBOUNDS: one team total ~ Poisson(Σ minutes×reb_rate × M / M_exp) where M is the draw's missed field goals
 *      of BOTH teams (3PA − 3PM, plus 2P misses ~ Poisson(2PM_T·(1−p2)/p2)) and M_exp the misses the pools' rates
 *      imply at those minutes — more misses, more rebounds. Allocated multinomially by minutes × rebound rate.
 *   8. ASSISTS: team assists ~ Binomial(team FGM, a) with a the pool's assists per made field goal, so assists ≤ FGM;
 *      allocated multinomially by minutes × assist rate.
 * Every draw is checked against the seven contract invariants (checkDraw); any violation THROWS.
 *
 * WHAT IS NOT MODELLED: possessions, individual shots/passes/rebounds as events, shot locations, player stats by
 * quarter, possession arrow, foul trouble, blowout rest (minutes do not react to the margin), offensive vs defensive
 * rebound split, steals/blocks/turnovers, the late-game fouling that makes real regulation ties more common than a
 * smooth margin distribution implies (see the OT rate in the evaluation), injuries beyond the feed's "Out".
 *
 * DETERMINISM: draw i uses its own PRNG mulberry32(fnv1a32(`${seed}:${i}`)) with seed = fnv1a32(providerEventId)
 * ("fixed-per-game", v0's policy), so any draw can be replayed from (seed, runIndex) alone — that is how the
 * representative samples are produced and how the tests prove they are real draws.
 *
 * SIMULATION COUNT — 10,000 draws, from the benchmark (scripts/nba/evaluate-sim-v1.mjs --benchmark → data/internal/
 * research/nba/reports/sim-v1-simcount-benchmark.json): 10 games of 2024-25 (no outcome read), 5 seeds each, seed-to-seed
 * SD of pHome and of each rotation player's (expected ≥ 20 min) p50 points, and wall time per game on the dev machine:
 *
 *     draws    pHome SD mean / max    analytic SE at p=.5    p50-pts SD mean / max    ms per game
 *      1,000      0.0149 / 0.0211           0.0158               0.319 / 0.894             97
 *      2,000      0.0131 / 0.0173           0.0112               0.208 / 0.548            107
 *      5,000      0.0083 / 0.0122           0.0071               0.107 / 0.548            328
 *     10,000      0.0055 / 0.0074           0.0050               0.095 / 0.548            767
 *     20,000      0.0035 / 0.0042           0.0035               0.056 / 0.548           1111
 *
 * (the 0.548 max is a median sitting on an integer boundary, flipping between two integers at any N.) 10,000 keeps the
 * pHome Monte-Carlo SD ≤ 0.0075 — below the 0.01 granularity anyone reads — and p50s stable to ~0.1 point, at < 1 s per
 * game (an opening-night slate in seconds); 20,000 buys 0.002 of pHome for 45 % more time. V1_DEFAULT_SIMULATIONS = 10,000
 * (v0's count too, so the families' draw counts match).
 */
import { fnv1a32, mulberry32, SEED_POLICY } from "./game-sim.mjs";
import { PROFILE_VERSION, PROFILE_PARAMS } from "./sim-v1-profile.mjs";

export const NBA_SIM_V1_MODEL_VERSION = "nba-sim-v1-coherent";
export const V1_DEFAULT_SIMULATIONS = 10000;
export const V1_SEED_POLICY = `${SEED_POLICY}; draw i uses mulberry32(fnv1a32(seed + ':' + i))`;
export const REGULATION_MINUTES = 240;
export const OT_MINUTES_PER_TEAM = 25;
export const PLAYER_CAP_REGULATION = 48;
export const OT_PERIOD_MINUTES = 5;
export const OT_CAP = 8;
export const MIN_SIMULABLE_PLAYERS = 5;
/**
 * The scalar parameters, fitted on the 2023-24 regular season ONLY (corpus season 2024, games ≥ 30 days in, as-of
 * inputs): app/scripts/nba/calibrate-sim-v1.mjs → data/internal/research/nba/reports/sim-v1-calibration-2024.json.
 * Frozen before any 2024-25 (dev) number was computed with them; 2025-26 outcomes never read.
 */
export const V1_PARAMS = Object.freeze({
  HCA_POINTS: 1.982,          // regulation points of home court (Elo diff below excludes Elo's own +70)
  ELO_TO_MARGIN: 0.05115,     // regulation points per Elo point of (Elo_h − Elo_a)
  TOTAL_WEIGHT: 1.956,        // slope of (regulation total − L) on (T_raw − L); > 1 because the shrunk pools compress T_raw
  TOTAL_OFFSET: -2.947,       // L is a final-score league mean (OT included); the engine's expectation is regulation
  TEAM_NOISE_SD: 10.152,      // per-team independent noise (points)
  PACE_SD: 0.0446,            // shared pace factor SD (multiplies both teams)
  QUARTER_SHARES: Object.freeze([0.2513, 0.2518, 0.2534, 0.2435]),
  QUARTER_DIRICHLET_ALPHA: 432.2,
  OT_SCALE: 0.917,            // OT period points ÷ (expected team points × 5/48)
  MINUTES_POWER: 1.25,        // water-filling weights are raw minutes^MINUTES_POWER (fitted: calibrate-sim-v1.mjs grid)
  PACE_FLOOR: 0.7,
  MIN_REGULATION_POINTS: 50,
  THREE_FEASIBILITY_RESAMPLES: 20,
});

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/* ─────────────── random variates (all on the per-draw deterministic path) ─────────────── */
function normal(rng) {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function poisson(rng, lambda) {
  if (!(lambda > 0)) return 0;
  if (lambda > 400) return poisson(rng, lambda / 2) + poisson(rng, lambda / 2); // additivity keeps it exact
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k += 1; p *= rng(); } while (p > L);
  return k - 1;
}
function binomial(rng, n, p) {
  if (n <= 0 || !(p > 0)) return 0;
  if (p >= 1) return n;
  let k = 0;
  for (let i = 0; i < n; i += 1) if (rng() < p) k += 1;
  return k;
}
function gamma(rng, shape) {
  // Marsaglia–Tsang (shape ≥ 1 here: α·share ≫ 1)
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
/** n units to categories by weights (one uniform per unit). Zero-weight categories never receive a unit. */
function allocate(rng, n, weights) {
  const out = new Array(weights.length).fill(0);
  if (n <= 0) return out;
  let tot = 0;
  for (const w of weights) tot += w > 0 ? w : 0;
  if (!(tot > 0)) throw new Error("allocate: no positive weight to receive units");
  for (let u = 0; u < n; u += 1) {
    let x = rng() * tot, j = 0;
    for (; j < weights.length; j += 1) { const w = weights[j] > 0 ? weights[j] : 0; if (x < w) break; x -= w; }
    if (j === weights.length) { j = weights.length - 1; while (!(weights[j] > 0)) j -= 1; } // float edge
    out[j] += 1;
  }
  return out;
}
/** Scale positive raw minutes to sum exactly `target` with every player ≤ cap (iterative water-filling). */
export function waterFill(raw, target, cap) {
  const out = raw.map(() => 0);
  const capped = new Set();
  for (let iter = 0; iter <= raw.length; iter += 1) {
    let free = 0;
    for (let i = 0; i < raw.length; i += 1) if (!capped.has(i) && raw[i] > 0) free += raw[i];
    const room = target - cap * capped.size;
    const f = free > 0 ? room / free : 0;
    let changed = false;
    for (let i = 0; i < raw.length; i += 1) {
      if (capped.has(i) || !(raw[i] > 0)) continue;
      if (f * raw[i] > cap) { capped.add(i); changed = true; }
    }
    if (!changed) {
      for (let i = 0; i < raw.length; i += 1) out[i] = capped.has(i) ? cap : raw[i] > 0 ? f * raw[i] : 0;
      return out;
    }
  }
  throw new Error("waterFill: did not converge");
}

/* ─────────────── expectations ─────────────── */
/** A side's pool offence: minutes-weighted points per 240 minutes (expected minutes = mean × play rate). */
export function expectedSidePoints(sideProfile) {
  const ps = sideProfile?.players ?? [];
  let e = 0, pts = 0;
  for (const p of ps) { const m = p.minutesMean * p.playRate; e += m; pts += m * p.rates.pts; }
  return { offence: e > 0 ? (REGULATION_MINUTES * pts) / e : null, poolExpectedMinutes: e };
}

export function gameExpectations({ home, away, neutralSite = false, league, params = V1_PARAMS }) {
  const L = 2 * league.pointsPerTeamGame;
  const oh = expectedSidePoints(home.profile).offence, oa = expectedSidePoints(away.profile).offence;
  if (!Number.isFinite(oh) || !Number.isFinite(oa)) throw new Error("REFUSED: a side has no simulable pool offence");
  const Traw = (oh + away.profile.defence.ptsAllowed + oa + home.profile.defence.ptsAllowed) / 2;
  const eloH = Number.isFinite(home.rating?.rating) ? home.rating.rating : 1500, eloA = Number.isFinite(away.rating?.rating) ? away.rating.rating : 1500;
  const muMargin = (neutralSite ? 0 : params.HCA_POINTS) + params.ELO_TO_MARGIN * (eloH - eloA);
  const muTotal = L + params.TOTAL_OFFSET + params.TOTAL_WEIGHT * (Traw - L);
  return { L, offenceHome: oh, offenceAway: oa, defenceHome: home.profile.defence.ptsAllowed, defenceAway: away.profile.defence.ptsAllowed, Traw, muMargin, muTotal, home: (muTotal + muMargin) / 2, away: (muTotal - muMargin) / 2 };
}

/** Prepare everything a draw needs (pure, fixed per game). Throws REFUSED when a side cannot fill the floor. */
export function prepareGame({ providerEventId, seed = null, neutralSite = false, home, away, league, params = V1_PARAMS }) {
  for (const [k, s] of [["home", home], ["away", away]]) {
    const n = (s.profile?.players ?? []).length;
    if (n < MIN_SIMULABLE_PLAYERS) throw new Error(`REFUSED: ${k} side has ${n} simulable players (< ${MIN_SIMULABLE_PLAYERS}) — cannot fill 240 minutes under the 48-minute cap`);
  }
  const seeded = seed != null ? { seed: String(seed), seedPolicy: "explicit" } : { seed: fnv1a32(String(providerEventId)), seedPolicy: V1_SEED_POLICY };
  const exp = gameExpectations({ home, away, neutralSite, league, params });
  const side = (s) => ({
    players: s.profile.players.map((p) => ({ id: p.providerAthleteId, mean: p.minutesMean, sd: p.minutesSd, play: p.playRate, r: p.rates, p3: p.p3, p2: p.p2 })),
  });
  return { ...seeded, params, expected: [exp.home, exp.away], expectations: exp, sides: [side(home), side(away)] };
}

/* ─────────────── one draw ─────────────── */
function sideScoring(rng, sp, minutes, points, g, P, notes) {
  const n = sp.players.length;
  const threePa = new Array(n).fill(0), threePm = new Array(n).fill(0);
  const drawThrees = () => {
    let s = 0;
    for (let j = 0; j < n; j += 1) {
      const m = minutes[j];
      threePa[j] = m > 0 ? poisson(rng, sp.players[j].r.threePa * m * g) : 0;
      threePm[j] = binomial(rng, threePa[j], sp.players[j].p3);
      s += threePm[j];
    }
    return s;
  };
  let s3 = drawThrees();
  for (let k = 0; 3 * s3 > points && k < P.THREE_FEASIBILITY_RESAMPLES; k += 1) { notes.threeFeasibilityResamples += 1; s3 = drawThrees(); }
  while (3 * s3 > points) { // thinning: a uniformly chosen made three becomes a miss
    const j = allocate(rng, 1, threePm).indexOf(1);
    threePm[j] -= 1; s3 -= 1; notes.threeThinned += 1;
  }
  const R = points - 3 * s3;
  let wFt = 0, wNon3 = 0, w2a = 0, w2m = 0, wReb = 0, wAst = 0, wFgm = 0;
  const w2 = new Array(n), wf = new Array(n), wr = new Array(n), wa = new Array(n);
  for (let j = 0; j < n; j += 1) {
    const m = minutes[j], r = sp.players[j].r;
    w2[j] = m * r.twoPm; wf[j] = m * r.ftm; wr[j] = m * r.reb; wa[j] = m * r.ast;
    wFt += wf[j]; wNon3 += m * (2 * r.twoPm + r.ftm); w2a += m * r.twoPa; w2m += w2[j]; wReb += wr[j]; wAst += wa[j]; wFgm += m * (r.threePm + r.twoPm);
  }
  const q = wNon3 > 0 ? wFt / wNon3 : 0.25;
  let ftmT = binomial(rng, R, q);
  if ((R - ftmT) % 2 !== 0) ftmT = ftmT === 0 ? 1 : ftmT + (rng() < 0.5 ? -1 : 1);
  if ((R - ftmT) % 2 !== 0 || ftmT < 0 || ftmT > R) throw new Error("parity fix failed"); // unreachable; guards the arithmetic
  const twoPmT = (R - ftmT) / 2;
  const twoPm = allocate(rng, twoPmT, w2);
  const ftm = allocate(rng, ftmT, wf);
  const p2 = w2a > 0 ? clamp(w2m / w2a, 0.3, 0.75) : 0.54;
  const twoMiss = poisson(rng, twoPmT * (1 - p2) / p2);
  let threeMiss = 0; for (let j = 0; j < n; j += 1) threeMiss += threePa[j] - threePm[j];
  let expMiss = 0;
  for (let j = 0; j < n; j += 1) { const m = minutes[j], r = sp.players[j].r; expMiss += m * ((r.threePa - r.threePm) + (r.twoPa - r.twoPm)); }
  return { threePa, threePm, twoPm, ftm, s3, twoPmT, ftmT, misses: threeMiss + twoMiss, expMiss, wReb, wr, wAst, wa, wFgm };
}

/**
 * Simulate draw `runIndex` of a prepared game. Pure function of (prep, runIndex): replaying it reproduces the draw.
 */
export function simulateOneDraw(prep, runIndex) {
  const P = prep.params;
  const rng = mulberry32(fnv1a32(`${prep.seed}:${runIndex}`));
  const notes = { threeFeasibilityResamples: 0, threeThinned: 0, minutesTopUps: 0, otCapRedraws: 0 };
  const g = Math.max(P.PACE_FLOOR, 1 + P.PACE_SD * normal(rng));
  const reg = [0, 1].map((t) => Math.max(P.MIN_REGULATION_POINTS, Math.round(prep.expected[t] * g + P.TEAM_NOISE_SD * normal(rng))));
  // quarters
  const periods = [[], []];
  for (let t = 0; t < 2; t += 1) {
    let shares = P.QUARTER_SHARES;
    if (Number.isFinite(P.QUARTER_DIRICHLET_ALPHA)) {
      const gs = P.QUARTER_SHARES.map((s) => gamma(rng, P.QUARTER_DIRICHLET_ALPHA * s));
      const tot = gs.reduce((a, b) => a + b, 0);
      shares = gs.map((x) => x / tot);
    }
    let left = reg[t], rem = 1;
    for (let q = 0; q < 3; q += 1) { const k = binomial(rng, left, shares[q] / rem); periods[t].push(k); left -= k; rem -= shares[q]; }
    periods[t].push(left);
  }
  // overtime
  let ot = 0;
  const final = [reg[0], reg[1]];
  while (final[0] === final[1]) {
    ot += 1;
    const lam = [0, 1].map((t) => prep.expected[t] * g * (OT_PERIOD_MINUTES / 48) * P.OT_SCALE);
    let a = poisson(rng, lam[0]), b = poisson(rng, lam[1]);
    if (ot === OT_CAP) { let guard = 0; while (final[0] + a === final[1] + b) { notes.otCapRedraws += 1; a = poisson(rng, lam[0]); b = poisson(rng, lam[1]); if ((guard += 1) > 10000) throw new Error("OT cap redraw did not resolve"); } }
    periods[0].push(a); periods[1].push(b);
    final[0] += a; final[1] += b;
  }
  // minutes
  const target = REGULATION_MINUTES + OT_MINUTES_PER_TEAM * ot;
  const cap = PLAYER_CAP_REGULATION + OT_PERIOD_MINUTES * ot;
  const sideOut = [];
  for (let t = 0; t < 2; t += 1) {
    const sp = prep.sides[t];
    const raw = sp.players.map((p) => { const plays = rng() < p.play; const m = clamp(p.mean + p.sd * normal(rng), 0, PLAYER_CAP_REGULATION); return plays ? m ** P.MINUTES_POWER : 0; });
    let positive = raw.filter((m) => m > 0).length;
    if (positive < MIN_SIMULABLE_PLAYERS) {
      const order = sp.players.map((p, j) => j).filter((j) => !(raw[j] > 0)).sort((x, y) => sp.players[y].mean * sp.players[y].play - sp.players[x].mean * sp.players[x].play || x - y);
      for (const j of order) { if (positive >= MIN_SIMULABLE_PLAYERS) break; raw[j] = Math.max(1, sp.players[j].mean) ** P.MINUTES_POWER; positive += 1; notes.minutesTopUps += 1; }
    }
    const minutes = waterFill(raw, target, cap);
    const sc = sideScoring(rng, sp, minutes, final[t], g, P, notes);
    sideOut.push({ minutes, sc });
  }
  // rebounds (both teams' misses) and assists
  const M = sideOut[0].sc.misses + sideOut[1].sc.misses;
  const Mexp = sideOut[0].sc.expMiss + sideOut[1].sc.expMiss;
  const keys = ["home", "away"];
  const draw = { runIndex, pace: r4(g), overtimePeriods: ot, regulation: { home: reg[0], away: reg[1] }, final: { home: final[0], away: final[1] }, periods: {}, team: {}, players: {}, notes };
  for (let t = 0; t < 2; t += 1) {
    const { minutes, sc } = sideOut[t];
    const rebT = poisson(rng, Mexp > 0 ? sc.wReb * (M / Mexp) : sc.wReb);
    const reb = allocate(rng, rebT, sc.wr);
    const fgmT = sc.s3 + sc.twoPmT;
    const a = sc.wFgm > 0 ? clamp(sc.wAst / sc.wFgm, 0, 0.95) : 0.6;
    const astT = binomial(rng, fgmT, a);
    const ast = allocate(rng, astT, sc.wa);
    const ids = prep.sides[t].players.map((p) => p.id);
    const players = ids.map((id, j) => ({
      providerAthleteId: id, minutes: minutes[j],
      pts: 3 * sc.threePm[j] + 2 * sc.twoPm[j] + sc.ftm[j], reb: reb[j], ast: ast[j],
      threePa: sc.threePa[j], threePm: sc.threePm[j], twoPm: sc.twoPm[j], ftm: sc.ftm[j],
    }));
    draw.players[keys[t]] = players;
    draw.team[keys[t]] = { pts: final[t], reb: rebT, ast: astT, threePa: sc.threePa.reduce((s, x) => s + x, 0), threePm: sc.s3, twoPm: sc.twoPmT, ftm: sc.ftmT, fgm: fgmT };
    draw.periods[keys[t]] = periods[t];
  }
  return draw;
}

/* ─────────────── invariants (the contract's seven, every draw) ─────────────── */
const isNonNegInt = (x) => Number.isInteger(x) && x >= 0;
export function checkDraw(draw) {
  const v = [];
  const ot = draw.overtimePeriods;
  if (!isNonNegInt(ot)) v.push("I5: overtimePeriods not a non-negative integer");
  for (const side of ["home", "away"]) {
    const team = draw.team?.[side], players = draw.players?.[side] ?? [], periods = draw.periods?.[side] ?? [];
    const final = draw.final?.[side];
    // I1
    if (!isNonNegInt(final)) v.push(`I1: ${side} final not a non-negative integer`);
    if (periods.length !== 4 + ot) v.push(`I1: ${side} has ${periods.length} periods for ${ot} OT`);
    if (!periods.every(isNonNegInt)) v.push(`I1: ${side} period score not a non-negative integer`);
    if (periods.reduce((s, x) => s + x, 0) !== final) v.push(`I1: ${side} Σ periods ≠ final`);
    if (team?.pts !== final) v.push(`I1: ${side} team pts ≠ final`);
    if (players.reduce((s, p) => s + p.pts, 0) !== final) v.push(`I1: ${side} Σ player pts ≠ final`);
    // I2 / I7
    let mins = 0, s3a = 0, s3 = 0, s2 = 0, sft = 0, sreb = 0, sast = 0;
    for (const p of players) {
      for (const k of ["pts", "reb", "ast", "threePa", "threePm", "twoPm", "ftm"]) if (!isNonNegInt(p[k])) v.push(`I2: ${side} ${p.providerAthleteId} ${k} not a non-negative integer`);
      if (p.pts !== 3 * p.threePm + 2 * p.twoPm + p.ftm) v.push(`I2: ${side} ${p.providerAthleteId} pts ≠ 3·3PM + 2·2PM + FTM`);
      if (p.threePm > p.threePa) v.push(`I2: ${side} ${p.providerAthleteId} 3PM > 3PA`);
      if (!(Number.isFinite(p.minutes) && p.minutes >= 0 && p.minutes <= PLAYER_CAP_REGULATION + OT_PERIOD_MINUTES * ot + 1e-9)) v.push(`I3: ${side} ${p.providerAthleteId} minutes ${p.minutes} outside [0, ${PLAYER_CAP_REGULATION + OT_PERIOD_MINUTES * ot}]`);
      if (p.minutes === 0 && (p.pts || p.reb || p.ast || p.threePa || p.threePm || p.twoPm || p.ftm)) v.push(`I7: ${side} ${p.providerAthleteId} has 0 minutes but a non-zero stat`);
      mins += p.minutes; s3a += p.threePa; s3 += p.threePm; s2 += p.twoPm; sft += p.ftm; sreb += p.reb; sast += p.ast;
    }
    // I3
    if (Math.abs(mins - (REGULATION_MINUTES + OT_MINUTES_PER_TEAM * ot)) > 1e-6) v.push(`I3: ${side} team minutes ${mins} ≠ ${REGULATION_MINUTES + OT_MINUTES_PER_TEAM * ot}`);
    // I4
    if (team?.fgm !== team?.threePm + team?.twoPm || team?.threePm !== s3 || team?.twoPm !== s2 || team?.ftm !== sft || team?.threePa !== s3a) v.push(`I4: ${side} team shooting ≠ Σ players`);
    if (!(team?.ast <= team?.fgm)) v.push(`I4: ${side} team assists ${team?.ast} > FGM ${team?.fgm}`);
    if (sast !== team?.ast) v.push(`I4: ${side} Σ player assists ≠ team assists`);
    // I6
    if (sreb !== team?.reb) v.push(`I6: ${side} Σ player rebounds ≠ team rebounds`);
  }
  // I5
  if (draw.final?.home === draw.final?.away) v.push("I5: draw ended tied");
  return v;
}

/* ─────────────── summaries ─────────────── */
function quantiles(arr, n = arr.length) {
  if (!n) return { mean: null, sd: null, p10: null, p25: null, p50: null, p75: null, p90: null };
  const s = Float64Array.from(arr.subarray ? arr.subarray(0, n) : arr.slice(0, n)).sort();
  const at = (q) => s[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))];
  let m = 0; for (let i = 0; i < n; i += 1) m += s[i]; m /= n;
  let ss = 0; for (let i = 0; i < n; i += 1) ss += (s[i] - m) ** 2;
  return { mean: r2(m), sd: n > 1 ? r2(Math.sqrt(ss / (n - 1))) : null, p10: r2(at(0.1)), p25: r2(at(0.25)), p50: r2(at(0.5)), p75: r2(at(0.75)), p90: r2(at(0.9)) };
}
function histogram(arr) {
  const c = new Map();
  for (const x of arr) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => a[0] - b[0]).map(([value, k]) => ({ value, probability: Number((k / arr.length).toFixed(5)) }));
}
const STAT_OUT = ["pts", "reb", "ast", "threePm", "threePa", "twoPm", "ftm"];
const COMBO_KEYS = Object.freeze({ pra: ["pts", "reb", "ast"], ptsAst: ["pts", "ast"], ptsReb: ["pts", "reb"] });

/**
 * Minutes to 0.01 for a published sample WITHOUT breaking invariant 3: independent toFixed(2) rounding let a side sum to
 * 239.98–240.02 (found by the theater's validator on the 2026-10-20 build). Largest-remainder rounding in hundredths:
 * floor every player, then hand the missing hundredths to the largest remainders (ties → lower index). The side then sums
 * to exactly 240 + 25·OT, a 0-minute player stays 0 (remainder 0), and no player rises by more than 0.01.
 */
export function roundMinutesPreservingTotal(minutes, overtimePeriods) {
  const target = Math.round((240 + 25 * overtimePeriods) * 100);
  const hundredths = minutes.map((m) => m * 100);
  const floors = hundredths.map((h) => Math.floor(h + 1e-7));
  let missing = target - floors.reduce((a, b) => a + b, 0);
  if (missing < 0 || missing > minutes.length) throw new Error(`invariant 3: minutes sum ${minutes.reduce((a, b) => a + b, 0)} is not ${target / 100}`);
  const order = hundredths.map((h, i) => [h - floors[i], i]).filter(([rem]) => rem > 1e-7).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  if (order.length < missing) throw new Error("invariant 3: not enough fractional minutes to distribute");
  for (let k = 0; k < missing; k += 1) floors[order[k][1]] += 1;
  return floors.map((f) => f / 100);
}

function sampleView(prep, draw, label, selectionRule, names) {
  const periods = draw.periods.home.map((h, i) => ({ period: i + 1, label: i < 4 ? `Q${i + 1}` : `OT${i - 3}`, home: h, away: draw.periods.away[i] }));
  const pl = (side) => {
    const mins = roundMinutesPreservingTotal(draw.players[side].map((p) => p.minutes), draw.overtimePeriods);
    return draw.players[side].map((p, i) => ({ providerAthleteId: p.providerAthleteId, name: names.get(p.providerAthleteId) ?? null, minutes: mins[i], pts: p.pts, reb: p.reb, ast: p.ast, threePa: p.threePa, threePm: p.threePm, twoPm: p.twoPm, ftm: p.ftm }));
  };
  return { runIndex: draw.runIndex, label, selectionRule, final: { ...draw.final }, periods, overtimePeriods: draw.overtimePeriods, team: { home: { ...draw.team.home }, away: { ...draw.team.away } }, players: { home: pl("home"), away: pl("away") } };
}

/**
 * Simulate one game.
 * @param home/away  { name, providerTeamId, rating: { rating, games, basis }, profile: buildSideProfile() result }
 * @param league     leagueMeans() result (as of the same instant)
 */
export function simulateGameV1({ providerEventId, inputAsOf, neutralSite = false, home, away, league, eloWinProbability, simulations = V1_DEFAULT_SIMULATIONS, seed = null, params = V1_PARAMS, __testMutateDraw = null }) {
  if (!providerEventId) throw new Error("simulateGameV1: providerEventId required");
  if (!Number.isInteger(simulations) || simulations < 1) throw new Error("simulateGameV1: simulations must be a positive integer");
  const prep = prepareGame({ providerEventId, seed, neutralSite, home, away, league, params });
  const N = simulations;
  const fH = new Int32Array(N), fA = new Int32Array(N), ots = new Int32Array(N);
  const pStats = prep.sides.map((s) => s.players.map(() => ({ minutes: new Float64Array(N), ...Object.fromEntries(STAT_OUT.map((k) => [k, new Float64Array(N)])) })));
  const notes = { threeFeasibilityResamples: 0, threeThinned: 0, minutesTopUps: 0, otCapRedraws: 0 };
  let checked = 0;
  for (let i = 0; i < N; i += 1) {
    const d = simulateOneDraw(prep, i);
    if (__testMutateDraw) __testMutateDraw(d, i); // TEST SEAM ONLY: proves a violating draw throws (never passed by the build)
    const v = checkDraw(d);
    if (v.length) throw new Error(`INVARIANT VIOLATION in ${providerEventId} draw ${i}: ${v.join("; ")}`);
    checked += 1;
    fH[i] = d.final.home; fA[i] = d.final.away; ots[i] = d.overtimePeriods;
    for (const k of Object.keys(notes)) notes[k] += d.notes[k];
    ["home", "away"].forEach((side, t) => d.players[side].forEach((p, j) => { const ps = pStats[t][j]; ps.minutes[i] = p.minutes; for (const k of STAT_OUT) ps[k][i] = p[k]; }));
  }
  const margin = new Float64Array(N), total = new Float64Array(N);
  let homeWins = 0, otDraws = 0;
  for (let i = 0; i < N; i += 1) { margin[i] = fH[i] - fA[i]; total[i] = fH[i] + fA[i]; if (fH[i] > fA[i]) homeWins += 1; if (ots[i] > 0) otDraws += 1; }
  const qm = quantiles(margin), qt = quantiles(total);
  const pHome = homeWins / N;

  // representative samples — real draws, selected by exact rules, replayed from (seed, runIndex)
  const sorted = Float64Array.from(total).sort();
  const tq = (q) => sorted[Math.min(N - 1, Math.max(0, Math.ceil(q * N) - 1))];
  const argmin = (score, filter = () => true) => { let best = -1, bs = Infinity; for (let i = 0; i < N; i += 1) { if (!filter(i)) continue; const s = score(i); if (s < bs) { bs = s; best = i; } } return best; };
  const sdm = qm.sd || 1, sdt = qt.sd || 1;
  const picks = [];
  picks.push(["typical", argmin((i) => ((margin[i] - qm.p50) / sdm) ** 2 + ((total[i] - qt.p50) / sdt) ** 2), "draw minimising ((margin−p50 margin)/sd margin)² + ((total−p50 total)/sd total)²; ties → lowest runIndex"]);
  let minAbs = Infinity; for (let i = 0; i < N; i += 1) minAbs = Math.min(minAbs, Math.abs(margin[i]));
  picks.push(["close", argmin((i) => Math.abs(total[i] - qt.p50), (i) => Math.abs(margin[i]) === minAbs), `among draws with the smallest |final margin| (${minAbs}), the one whose total is nearest p50 total; ties → lowest runIndex`]);
  const hi = tq(0.95), lo = tq(0.05);
  picks.push(["high", argmin((i) => Math.abs(total[i] - hi) * 1000 + Math.abs(margin[i] - qm.p50)), `draw whose total is nearest the 95th-percentile total (${hi}), then margin nearest p50 margin; ties → lowest runIndex`]);
  picks.push(["low", argmin((i) => Math.abs(total[i] - lo) * 1000 + Math.abs(margin[i] - qm.p50)), `draw whose total is nearest the 5th-percentile total (${lo}), then margin nearest p50 margin; ties → lowest runIndex`]);
  const underdogHome = pHome < 0.5;
  const upsetFilter = (i) => (underdogHome ? margin[i] > 0 : margin[i] < 0);
  let upsetN = 0; const um = [], ut = [];
  for (let i = 0; i < N; i += 1) if (upsetFilter(i)) { upsetN += 1; um.push(margin[i]); ut.push(total[i]); }
  if (upsetN > 0) {
    const uq = quantiles(Float64Array.from(um)), uqt = quantiles(Float64Array.from(ut));
    picks.push(["upset", argmin((i) => ((margin[i] - uq.p50) / (uq.sd || 1)) ** 2 + ((total[i] - uqt.p50) / (uqt.sd || 1)) ** 2, upsetFilter), `the sim underdog (${underdogHome ? "home" : "away"}, pHome ${r4(pHome)}) wins in ${upsetN} draws; among them, the draw nearest their median (margin, total) in sd units; ties → lowest runIndex`]);
  }
  const names = new Map([...home.profile.players, ...away.profile.players].map((p) => [p.providerAthleteId, p.name ?? null]));
  const representativeSamples = picks.map(([label, idx, rule]) => {
    const d = simulateOneDraw(prep, idx);
    if (d.final.home !== fH[idx] || d.final.away !== fA[idx]) throw new Error(`representative sample ${label} did not replay draw ${idx}`);
    return sampleView(prep, d, label, rule, names);
  });

  const playerOut = (t, profile) => profile.players.map((p, j) => {
    const ps = pStats[t][j];
    const playedIdx = []; for (let i = 0; i < N; i += 1) if (ps.minutes[i] > 0) playedIdx.push(i);
    const cond = (arr) => Float64Array.from(playedIdx, (i) => arr[i]);
    const condStats = Object.fromEntries(["minutes", ...STAT_OUT].map((k) => [k, cond(ps[k])]));
    const combo = (parts) => { const out = new Float64Array(playedIdx.length); for (const k of parts) { const a = condStats[k]; for (let i = 0; i < out.length; i += 1) out[i] += a[i]; } return out; };
    const mq = quantiles(condStats.minutes);
    return {
      providerAthleteId: p.providerAthleteId, name: p.name ?? null,
      expectedMinutes: mq.mean, minutesSd: mq.sd, starterRate: p.starterRate, basis: "v1-blended-history", gamesUsed: p.gamesUsed,
      gamesThisSeason: p.gamesThisSeason, gamesPriorSeason: p.gamesPriorSeason, historyBasis: p.historyBasis ?? null, shrinkWeight: p.shrinkWeight,
      availability: p.availability ?? "unknown", injuryStatus: p.injuryStatus ?? null,
      ratesBasis: "v1-shrunk-to-league", rates: { pts: p.rates.pts, reb: p.rates.reb, ast: p.rates.ast, threePm: p.rates.threePm, threePa: p.rates.threePa, twoPm: p.rates.twoPm, ftm: p.rates.ftm }, p3: p.p3,
      playRate: r4(playedIdx.length / N), playRateInput: p.playRate,
      conditioning: "quantiles over the draws in which the player played (minutes > 0); playRate is that share of all draws",
      minutes: mq,
      ...Object.fromEntries(STAT_OUT.map((k) => [k, quantiles(condStats[k])])),
      ...Object.fromEntries(Object.entries(COMBO_KEYS).map(([k, parts]) => [k, quantiles(combo(parts))])),
    };
  });

  const eloP = Number.isFinite(eloWinProbability) ? eloWinProbability : null;
  const avail = (s) => ({
    source: "roster rows (availability re-read from the injuries feed under the current team)",
    rule: "status contains 'Out' → excluded; Day-To-Day and unlisted → simulated (injuryStatus recorded per player so boards can exclude Day-To-Day)",
    excludedOut: s.profile.excludedOut, excludedInsufficientHistory: s.profile.insufficientHistory, excludedNoMinutes: s.profile.insufficientHistory,
    poolSize: s.profile.players.length,
  });
  const minutesAssumptions = (t, s) => ({
    model: PROFILE_VERSION, params: { ...PROFILE_PARAMS },
    rule: "per draw: Bernoulli(playRate) × N(mean, sd) clipped [0,48], water-filled to 240 + 25·OT with cap 48 + 5·OT",
    poolExpectedMinutes: r2(expectedSidePoints(s.profile).poolExpectedMinutes),
    targetTeamMinutes: REGULATION_MINUTES,
    defaultSdSubstitutions: 0, poolRateSubstitutions: 0,
    defence: s.profile.defence,
  });
  const E = prep.expectations;
  return {
    modelVersion: NBA_SIM_V1_MODEL_VERSION,
    providerEventId: String(providerEventId),
    inputAsOf: inputAsOf ?? null,
    simulations: N,
    seed: prep.seed,
    seedPolicy: prep.seedPolicy,
    neutralSite: neutralSite === true,
    engine: {
      structure: "shared-pace team scoring → quarter split → overtime → player allocation",
      simulations: N, seed: prep.seed, seedPolicy: prep.seedPolicy, params: { ...params, QUARTER_SHARES: [...params.QUARTER_SHARES] }, otCap: OT_CAP,
      otCapRule: `at most ${OT_CAP} OT periods; a tied ${OT_CAP}th period is redrawn until untied (rejection, counted in notes.otCapRedraws)`,
      expectations: { leagueTotal: r2(E.L), offenceHome: r2(E.offenceHome), offenceAway: r2(E.offenceAway), defenceHome: r2(E.defenceHome), defenceAway: r2(E.defenceAway), rawTotal: r2(E.Traw), muMargin: r2(E.muMargin), muTotal: r2(E.muTotal), home: r2(E.home), away: r2(E.away) },
      league: { basis: league.basis, games: league.games, fromUtc: league.fromUtc ?? null, toUtc: league.toUtc ?? null, pointsPerTeamGame: r2(league.pointsPerTeamGame), p3: r4(league.p3), p2: r4(league.p2) },
      notes,
    },
    elo: { home: home.rating ?? null, away: away.rating ?? null, pHome: r4(eloP), pAway: eloP == null ? null : r4(1 - eloP) },
    sim: {
      pHome: r4(pHome), pAway: r4(1 - pHome),
      tieMass: 0, tieRule: "overtime resolves every regulation tie (5-minute periods until untied; cap rule in engine.otCapRule)",
      overtimeRate: r4(otDraws / N),
      home: quantiles(Float64Array.from(fH)), away: quantiles(Float64Array.from(fA)), margin: qm, total: qt,
      totalHistogram: histogram(total), marginHistogram: histogram(margin),
    },
    eloVsSimGap: eloP == null ? null : r4(pHome - eloP),
    representativeSamples,
    players: { home: playerOut(0, home.profile), away: playerOut(1, away.profile) },
    invariants: { checkedDraws: checked, violations: 0, checks: ["I1 team = Σ periods = Σ players", "I2 pts = 3·3PM + 2·2PM + FTM, non-negative integers, 3PM ≤ 3PA", "I3 minutes = 240 + 25·OT, 0 ≤ min ≤ 48 + 5·OT", "I4 assists ≤ FGM", "I5 untied", "I6 Σ player reb = team reb", "I7 0 minutes ⇒ 0 stats"] },
    assumptions: {
      availability: { home: avail(home), away: avail(away) },
      minutes: { home: minutesAssumptions(0, home), away: minutesAssumptions(1, away) },
    },
  };
}
