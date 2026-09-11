/**
 * Dixon-Coles v2 soccer match model — PRIVATE research, forward shadow only
 * (data/internal/research/soccer/preregistration-dixon-coles-v2.json). Pure: no I/O, no clock, no network.
 *
 * WHY IT EXISTS: epl-model-v1-split-poisson (lib/sports/epl/strength-state.mjs) was REJECTED_V1 for LaLiga,
 * Serie A and Bundesliga on the preregistered draw-calibration bar (v1.2 L2: 10-bin draw ECE over all scored
 * seasons ≤ 0.030). Independent Poisson has no way to move probability between the low-score cells where most
 * draws live. v2 changes exactly two things, both frozen before any forward match is scored:
 *
 *   1. Dixon & Coles (1997) low-score dependence: the cells 0-0, 1-0, 0-1 and 1-1 are reweighted by
 *      tau(x, y; λ_home, λ_away, ρ). Every other cell is independent Poisson, exactly.
 *   2. Exponential time decay: a match d days before the fit cutoff weighs exp(−ξ·d), ξ fixed at the value
 *      Dixon & Coles published (0.0065 per half-week) — taken from the paper, not tuned on any league here.
 *
 * MODEL (log-linear, one league-wide home term; x = home goals, y = away goals):
 *   log λ_home = μ + home + att[h] + def[a]          def > 0 means "concedes more than average"
 *   log λ_away = μ        + att[a] + def[h]
 *   P(x, y) ∝ Pois(x; λ_home) · Pois(y; λ_away) · τ(x, y)
 *   τ(0,0) = 1 − λ_home·λ_away·ρ   τ(0,1) = 1 + λ_home·ρ   τ(1,0) = 1 + λ_away·ρ   τ(1,1) = 1 − ρ   τ = 1 otherwise
 * This is the same τ as strength-state.mjs's optional `dixonColesRho` path; the tests pin the two together.
 *
 * FIT: maximise Σ w·log P(x, y) − ½κ·Σ(att² + def²). The ridge κ is fixed in advance: it keeps a promoted
 * club's three results from reading as a strength estimate, and it removes the two directions along which the
 * unpenalised model is flat (att+c with μ−c; att+c with def−c). Block coordinate ascent:
 *   · one Newton step per strength parameter (Poisson curvature), halved until the objective does not fall;
 *   · then re-centre att and def to mean zero, absorbing the means into μ — λ is unchanged and the penalty can
 *     only fall, so this is the exact optimum along both flat directions;
 *   · then maximise ρ exactly in one dimension. The ρ objective is concave (each τ is linear in ρ), and it is
 *     searched only inside the interval where every observed low-score cell keeps τ > 0.
 *
 * NO LOOKAHEAD, structural: a fit at cutoff T folds only rows with dateUtc < T, and forecastFixtures refuses a
 * fixture that kicks off before its cutoff, so a forecast's information set is always strictly pre-kickoff.
 * A club with no folded row enters at att = def = 0 (league average) and is flagged coldStart, as v1 does.
 */

export const DC_V2_MODEL_ID = "soccer-dixon-coles-v2";

/** Every tunable number, frozen. The preregistration repeats these verbatim and the tests assert equality. */
export const DC_V2_PARAMS = Object.freeze({
  xiPerDay: 0.00186, // Dixon & Coles (1997): 0.0065 per half-week ÷ 3.5 days; half-life ≈ 373 days
  ridgePrecision: 2, // κ on att/def (log scale); μ, home and ρ are unpenalised
  maxGoals: 10, // exact-score grid 0..10 per side, renormalised — v1's grid
  rhoBounds: Object.freeze([-0.5, 0.5]), // hard outer bounds for ρ, intersected with the τ > 0 interval
  tolerance: 1e-8, // converged when no parameter moves more than this in a full sweep
  maxSweeps: 5000,
});

const DAY_MS = 86_400_000;

/** Weight of a match `ageDays` before the cutoff. */
export function decayWeight(ageDays, xiPerDay = DC_V2_PARAMS.xiPerDay) {
  if (!(ageDays >= 0)) throw new Error("decayWeight: ageDays must be ≥ 0 — a match after the cutoff is never folded");
  return Math.exp(-xiPerDay * ageDays);
}

/** Poisson pmf by the recurrence p(k) = p(k−1)·λ/k (no factorial table, no overflow inside the grid). */
export function poissonPmf(lambda, k) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p = (p * lambda) / i;
  return p;
}

/** The Dixon-Coles correction. Exactly 1 for every cell outside {0-0, 0-1, 1-0, 1-1}, and exactly 1 everywhere at ρ = 0. */
export function tau(x, y, lamHome, lamAway, rho) {
  if (x === 0 && y === 0) return 1 - lamHome * lamAway * rho;
  if (x === 0 && y === 1) return 1 + lamHome * rho;
  if (x === 1 && y === 0) return 1 + lamAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/**
 * Normalised exact-score grid and what the shadow records from it. A τ below zero is clamped to 0 and COUNTED
 * (`tauClamped`), never absorbed silently — a negative probability is not a model output.
 */
export function scoreMatrix(lamHome, lamAway, rho = 0, { maxGoals = DC_V2_PARAMS.maxGoals } = {}) {
  if (!(lamHome > 0 && lamAway > 0 && Number.isFinite(lamHome) && Number.isFinite(lamAway))) throw new Error("scoreMatrix: both λ must be positive and finite");
  if (!Number.isFinite(rho)) throw new Error("scoreMatrix: ρ must be finite");
  const ph = [], pa = [];
  for (let k = 0; k <= maxGoals; k++) { ph.push(poissonPmf(lamHome, k)); pa.push(poissonPmf(lamAway, k)); }
  const grid = [];
  let z = 0, tauClamped = 0;
  for (let x = 0; x <= maxGoals; x++) {
    const row = [];
    for (let y = 0; y <= maxGoals; y++) {
      let t = tau(x, y, lamHome, lamAway, rho);
      if (t < 0) { t = 0; tauClamped += 1; }
      const p = ph[x] * pa[y] * t;
      row.push(p);
      z += p;
    }
    grid.push(row);
  }
  let home = 0, draw = 0, away = 0, over25 = 0, eh = 0, ea = 0;
  for (let x = 0; x <= maxGoals; x++) {
    for (let y = 0; y <= maxGoals; y++) {
      const p = (grid[x][y] /= z);
      if (x > y) home += p; else if (x === y) draw += p; else away += p;
      if (x + y >= 3) over25 += p;
      eh += x * p; ea += y * p;
    }
  }
  return {
    grid,
    oneXTwo: { home, draw, away },
    over25,
    under25: 1 - over25,
    expectedGoals: { home: eh, away: ea, total: eh + ea },
    tauClamped,
    unnormalisedMass: z, // Σ cells before renormalisation — the grid's truncation + τ mass, for the record
  };
}

function eligibleRows(rows, cutoff) {
  return (rows ?? [])
    .filter((m) => Number.isInteger(m.ftHome) && Number.isInteger(m.ftAway) && m.ftHome >= 0 && m.ftAway >= 0)
    .filter((m) => m.home && m.away && m.home !== m.away)
    .filter((m) => Number.isFinite(Date.parse(m.dateUtc ?? "")) && Date.parse(m.dateUtc) < cutoff)
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.home).localeCompare(String(b.home)));
}

/**
 * Time-decayed, ridge-penalised Dixon-Coles fit on rows with dateUtc strictly before `cutoffIso`.
 * Club names are used exactly as the corpus spells them (football-data.co.uk names).
 */
export function fitDixonColes({ rows, cutoffIso, params = DC_V2_PARAMS }) {
  const cutoff = Date.parse(cutoffIso ?? "");
  if (!Number.isFinite(cutoff)) throw new Error("fitDixonColes: cutoffIso required");
  const { xiPerDay, ridgePrecision: kappa, rhoBounds, tolerance, maxSweeps } = params;
  const data = eligibleRows(rows, cutoff);
  const N = data.length;
  if (!N) throw new Error(`fitDixonColes: no scored rows before ${cutoffIso}`);

  const clubs = [];
  const index = new Map();
  const idOf = (name) => { if (!index.has(name)) { index.set(name, clubs.length); clubs.push(name); } return index.get(name); };
  const H = new Int32Array(N), A = new Int32Array(N), X = new Int32Array(N), Y = new Int32Array(N);
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const m = data[i];
    H[i] = idOf(m.home); A[i] = idOf(m.away); X[i] = m.ftHome; Y[i] = m.ftAway;
    w[i] = decayWeight((cutoff - Date.parse(m.dateUtc)) / DAY_MS, xiPerDay);
  }
  const C = clubs.length;
  const homeOf = Array.from({ length: C }, () => []), awayOf = Array.from({ length: C }, () => []);
  for (let i = 0; i < N; i++) { homeOf[H[i]].push(i); awayOf[A[i]].push(i); }

  let sw = 0, sx = 0, sy = 0;
  for (let i = 0; i < N; i++) { sw += w[i]; sx += w[i] * X[i]; sy += w[i] * Y[i]; }
  let mu = Math.log(Math.max(0.05, sy / sw));
  let home = Math.log(Math.max(0.05, sx / sw)) - mu;
  const att = new Float64Array(C), def = new Float64Array(C);
  let rho = 0;
  const lh = new Float64Array(N), la = new Float64Array(N);
  for (let i = 0; i < N; i++) { lh[i] = Math.exp(mu + home + att[H[i]] + def[A[i]]); la[i] = Math.exp(mu + att[A[i]] + def[H[i]]); }

  /** One match's weighted log-likelihood term (log x!/y! dropped — constant). −∞ when τ ≤ 0. */
  const term = (i, l1, l2) => {
    const x = X[i], y = Y[i];
    let t = 1;
    if (x <= 1 && y <= 1) { t = tau(x, y, l1, l2, rho); if (!(t > 0)) return -Infinity; }
    return w[i] * (x * Math.log(l1) - l1 + y * Math.log(l2) - l2 + Math.log(t));
  };
  /** d term / d log λ_home and d term / d log λ_away. */
  const grad = (i) => {
    const x = X[i], y = Y[i], l1 = lh[i], l2 = la[i];
    let gh = x - l1, ga = y - l2;
    if (x === 0 && y === 0) { const r = (-l1 * l2 * rho) / (1 - l1 * l2 * rho); gh += r; ga += r; }
    else if (x === 0 && y === 1) gh += (l1 * rho) / (1 + l1 * rho);
    else if (x === 1 && y === 0) ga += (l2 * rho) / (1 + l2 * rho);
    return [w[i] * gh, w[i] * ga];
  };

  /**
   * Newton step on one parameter. `touches` lists [matchIdx[], sh, sa]: the parameter enters log λ_home with
   * coefficient sh and log λ_away with coefficient sa on those matches. Returns |accepted step|.
   */
  const step1 = (touches, value, penalised, commit) => {
    let g = penalised ? -kappa * value : 0, h = penalised ? kappa : 0, before = penalised ? -0.5 * kappa * value * value : 0;
    for (const [idx, sh, sa] of touches) for (const i of idx) {
      const [gh, ga] = grad(i);
      g += sh * gh + sa * ga;
      h += w[i] * (sh * lh[i] + sa * la[i]);
      before += term(i, lh[i], la[i]);
    }
    if (!(h > 0) || !Number.isFinite(g)) return 0;
    let s = g / h;
    for (let tries = 0; tries < 60 && s !== 0; tries++) {
      const nv = value + s, e = Math.exp(s);
      let after = penalised ? -0.5 * kappa * nv * nv : 0;
      for (const [idx, sh, sa] of touches) for (const i of idx) after += term(i, sh ? lh[i] * e : lh[i], sa ? la[i] * e : la[i]);
      if (after >= before - 1e-12 * Math.abs(before)) {
        for (const [idx, sh, sa] of touches) for (const i of idx) { if (sh) lh[i] *= e; if (sa) la[i] *= e; }
        commit(nv);
        return Math.abs(s);
      }
      s /= 2;
    }
    return 0;
  };

  const all = Array.from({ length: N }, (_, i) => i);
  /** Exact 1-D maximisation of ρ inside the τ > 0 interval. Returns |move|. */
  const rhoStep = () => {
    let lo = rhoBounds[0], hi = rhoBounds[1];
    const cs = [], ws = [];
    for (let i = 0; i < N; i++) {
      const x = X[i], y = Y[i];
      if (x > 1 || y > 1) continue;
      const c = x === 0 && y === 0 ? -lh[i] * la[i] : x === 0 ? lh[i] : y === 0 ? la[i] : -1;
      cs.push(c); ws.push(w[i]);
      if (c > 0) lo = Math.max(lo, -1 / c); else if (c < 0) hi = Math.min(hi, -1 / c);
    }
    const a0 = lo + 1e-9, b0 = hi - 1e-9;
    if (!(b0 > a0)) return 0;
    const d = (r) => { let s = 0; for (let k = 0; k < cs.length; k++) s += (ws[k] * cs[k]) / (1 + cs[k] * r); return s; };
    let r;
    if (d(a0) <= 0) r = a0;
    else if (d(b0) >= 0) r = b0;
    else {
      let a = a0, b = b0;
      for (let it = 0; it < 200 && b - a > 1e-15; it++) { const m = (a + b) / 2; if (d(m) > 0) a = m; else b = m; }
      r = (a + b) / 2;
    }
    const moved = Math.abs(r - rho);
    rho = r;
    return moved;
  };

  let sweeps = 0, converged = false;
  while (sweeps < maxSweeps) {
    sweeps += 1;
    let moved = 0;
    moved = Math.max(moved, step1([[all, 1, 1]], mu, false, (v) => { mu = v; }));
    moved = Math.max(moved, step1([[all, 1, 0]], home, false, (v) => { home = v; }));
    for (let c = 0; c < C; c++) {
      moved = Math.max(moved, step1([[homeOf[c], 1, 0], [awayOf[c], 0, 1]], att[c], true, (v) => { att[c] = v; }));
      moved = Math.max(moved, step1([[homeOf[c], 0, 1], [awayOf[c], 1, 0]], def[c], true, (v) => { def[c] = v; }));
    }
    /* Re-centre: λ-preserving, penalty-reducing — the exact optimum along the model's two flat directions. */
    let ma = 0, md = 0;
    for (let c = 0; c < C; c++) { ma += att[c]; md += def[c]; }
    ma /= C; md /= C;
    for (let c = 0; c < C; c++) { att[c] -= ma; def[c] -= md; }
    mu += ma + md;
    moved = Math.max(moved, rhoStep());
    if (moved < tolerance) { converged = true; break; }
  }

  let logLikelihood = 0;
  for (let i = 0; i < N; i++) logLikelihood += term(i, lh[i], la[i]);
  for (let c = 0; c < C; c++) logLikelihood -= 0.5 * kappa * (att[c] * att[c] + def[c] * def[c]);

  const clubStats = {};
  for (let c = 0; c < C; c++) {
    const idx = [...homeOf[c], ...awayOf[c]];
    clubStats[clubs[c]] = { att: att[c], def: def[c], matches: idx.length, weight: idx.reduce((s, i) => s + w[i], 0) };
  }
  return {
    modelId: DC_V2_MODEL_ID,
    params,
    cutoffIso,
    matchesFitted: N,
    firstFoldedUtc: data[0].dateUtc,
    lastFoldedUtc: data[N - 1].dateUtc,
    mu, home, rho,
    clubs: clubStats,
    converged, sweeps,
    logLikelihood,
  };
}

/** λ pair for a fixture under a fitted state. Clubs with no folded row enter at league average, flagged. */
export function lambdasFor(state, homeClub, awayClub) {
  const has = (c) => Object.prototype.hasOwnProperty.call(state.clubs, c);
  const h = has(homeClub) ? state.clubs[homeClub] : null;
  const a = has(awayClub) ? state.clubs[awayClub] : null;
  return {
    lamHome: Math.exp(state.mu + state.home + (h?.att ?? 0) + (a?.def ?? 0)),
    lamAway: Math.exp(state.mu + (a?.att ?? 0) + (h?.def ?? 0)),
    coldStart: { home: !h, away: !a },
  };
}

/**
 * Forecast fixtures from ONE fit at `cutoffIso`. Throws if any fixture kicks off before the cutoff: every
 * forecast's information set is rows with dateUtc < cutoff ≤ kickoff. fixtures: [{ home, away, kickoffUtc }]
 * with corpus (football-data) club names.
 */
export function forecastFixtures({ rows, cutoffIso, fixtures, params = DC_V2_PARAMS }) {
  const cutoff = Date.parse(cutoffIso ?? "");
  if (!Number.isFinite(cutoff)) throw new Error("forecastFixtures: cutoffIso required");
  for (const f of fixtures ?? []) {
    if (!(Date.parse(f.kickoffUtc ?? "") >= cutoff)) throw new Error(`forecastFixtures: ${f.home} v ${f.away} kicks off ${f.kickoffUtc}, before the fit cutoff ${cutoffIso} — its own result could be in the fit`);
  }
  const state = fitDixonColes({ rows, cutoffIso, params });
  const forecasts = (fixtures ?? []).map((f) => {
    const l = lambdasFor(state, f.home, f.away);
    const m = scoreMatrix(l.lamHome, l.lamAway, state.rho, { maxGoals: params.maxGoals });
    return {
      ...f,
      lambdas: { home: l.lamHome, away: l.lamAway },
      coldStart: l.coldStart,
      rho: state.rho,
      oneXTwo: m.oneXTwo,
      over25: m.over25,
      under25: m.under25,
      expectedGoals: m.expectedGoals,
      tauClamped: m.tauClamped,
    };
  });
  return { state, forecasts };
}

/** Walk-forward single-match forecast: the information set is every row strictly before this kickoff. */
export function forecastMatch({ rows, home, away, kickoffUtc, params = DC_V2_PARAMS }) {
  const { state, forecasts } = forecastFixtures({ rows, cutoffIso: kickoffUtc, fixtures: [{ home, away, kickoffUtc }], params });
  return { state, forecast: forecasts[0] };
}
