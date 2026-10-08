/**
 * NFL-002 TEAM LADDER (NFL World Model V2) — RESEARCH / SHADOW. Nothing here publishes on its own.
 *
 * Executes the candidate definitions frozen in
 * data/internal/research/nfl/reports/nfl-002-team-ladder-preregistration.json:
 *
 *   L2  nfl-epa-adj-v1          online opponent-adjusted offense/defense ratings on offensive EPA per play
 *   L3  nfl-dyn-od-points-v1    the same filter on points scored
 *   L6  nfl-team-stack-v1       ONE margin distribution M ~ Normal(mu_m, sigma_m) from
 *                               [home, eloMov diff, L2 edge, L3 edge, rest diff], and one totals
 *                               distribution T ~ Normal(mu_t, sigma_t) from [1, L3 total, L2 EPA sum].
 *                               P(home win) = Phi(mu_m / sigma_m): the win chance, margin, spread
 *                               probabilities and projected score come from the SAME distribution.
 *
 * Walk-forward discipline (same as win-margin-heads.mjs / totals-play-efficiency.mjs): games are
 * processed by date then gameId; every game on a date is featurised from the state after all strictly
 * earlier dates; that date's results fold in afterwards. Before the first date of a new season the
 * team ratings shrink by the candidate's carry and the eloMov ratings regress one third to the mean.
 *
 * Inputs are scores, per team-game offensive EPA/plays and schedule rest only. No market price, no
 * starting-QB identity and no same-game statistic can reach a feature.
 */

export const NFL_TEAM_LADDER_VERSION = 1;
export const L2_ID = "nfl-epa-adj-v1";
export const L3_ID = "nfl-dyn-od-points-v1";
export const L6_ID = "nfl-team-stack-v1";
export const LADDER_PREREG = "data/internal/research/nfl/reports/nfl-002-team-ladder-preregistration.json";

const ELO = Object.freeze({ MEAN: 1505, REG: 1 / 3 });
const INIT = Object.freeze({ muE: 0, hE: 0, muP: 21, hP: 1.5 });
const G_MU = 0.002;
const G_H = 0.002;

const byDateThenId = (a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0);

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf; |error| < 1.5e-7). */
export function phi(x) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** One online offense/defense filter: value(t vs u) = mu + O_t - D_u + h*home. */
function odFilter({ gain, carry, mu, h }) {
  const O = new Map();
  const D = new Map();
  const st = { mu, h };
  const o = (t) => O.get(t) ?? 0;
  const d = (t) => D.get(t) ?? 0;
  return {
    has: (t) => O.has(t),
    /** Edge without the home or league terms: (O_t - D_u). */
    edge: (t, u) => o(t) - d(u),
    predict: (t, u, home) => st.mu + o(t) - d(u) + st.h * home,
    get mu() { return st.mu; },
    get h() { return st.h; },
    update(t, u, home, obs) {
      const r = obs - (st.mu + o(t) - d(u) + st.h * home);
      O.set(t, o(t) + gain * r);
      D.set(u, d(u) - gain * r);
      st.mu += G_MU * r;
      st.h += G_H * r * home;
    },
    newSeason() {
      for (const [k, v] of O) O.set(k, v * carry);
      for (const [k, v] of D) D.set(k, v * carry);
    },
  };
}

/**
 * Walk every date; call `onDay(day, featuresFor)` BEFORE the date's results fold in.
 * `featuresFor(game)` returns the pregame feature vector for a game on that date (or a game later than
 * every folded date — the forward capture path uses `final.featuresFor`).
 *
 * @param {object} a
 * @param {Array<{gameId: string, season: number, date: string, home: string, away: string, homeScore: number|null, awayScore: number|null, neutral: number|boolean}>} a.games
 * @param {Array<{gameId: string, team: string, oPlays: number, oEpa: number}>} a.efficiencyRows
 * @param {{franchiseMap: Record<string,string>}} a.frozen
 * @param {{eloK: number, eloHome: number, gE: number, carryE: number, gP: number, carryP: number}} a.params
 * @param {Map<string, {homeRest: number|null, awayRest: number|null}>} [a.rest] by gameId
 * @param {number} [a.restCap]
 * @param {string|null} [a.beforeDate] only dates strictly earlier fold
 * @param {(day: object[], featuresFor: (g: object) => object) => void} [a.onDay]
 */
export function foldTeamLadder({ games, efficiencyRows, frozen, params, rest = new Map(), restCap = 7, beforeDate = null, onDay = null }) {
  const franchise = (t) => frozen.franchiseMap?.[t] ?? t;
  const effBy = new Map((efficiencyRows ?? []).map((r) => [`${r.gameId}|${franchise(r.team)}`, r]));
  const ordered = [...games].sort(byDateThenId);
  const elo = new Map();
  const eloOf = (t) => elo.get(t) ?? ELO.MEAN;
  const E = odFilter({ gain: params.gE, carry: params.carryE, mu: INIT.muE, h: INIT.hE });
  const P = odFilter({ gain: params.gP, carry: params.carryP, mu: INIT.muP, h: INIT.hP });
  let lastSeason = null;
  let lastDateFolded = null;
  let folded = 0;

  const seasonTurn = (season) => {
    if (lastSeason !== null && season > lastSeason) {
      for (const [t, r] of elo) elo.set(t, r + (ELO.MEAN - r) * ELO.REG);
      E.newSeason();
      P.newSeason();
    }
    lastSeason = season;
  };

  const featuresFor = (g) => {
    const home = franchise(g.home);
    const away = franchise(g.away);
    const hInd = g.neutral ? 0 : 1;
    const r = rest.get(g.gameId);
    const restDiff = r && Number.isFinite(r.homeRest) && Number.isFinite(r.awayRest)
      ? Math.max(-restCap, Math.min(restCap, r.homeRest - r.awayRest)) / restCap
      : 0;
    const pHomeStd = P.predict(home, away, hInd);
    const pAwayStd = P.predict(away, home, 0);
    return {
      gameId: g.gameId,
      home,
      away,
      rated: elo.has(home) && elo.has(away) && E.has(home) && E.has(away) && P.has(home) && P.has(away),
      hInd,
      eloD: (eloOf(home) - eloOf(away)) / 25,
      eloDWithHome: eloOf(home) + hInd * params.eloHome - eloOf(away),
      epaEdge: E.edge(home, away) - E.edge(away, home),
      epaSum: E.edge(home, away) + E.edge(away, home),
      ptsEdge: P.edge(home, away) - P.edge(away, home),
      ptsTotal: pHomeStd + pAwayStd,
      ptsHome: pHomeStd,
      ptsAway: pAwayStd,
      restDiff,
      restKnown: Boolean(r && Number.isFinite(r.homeRest) && Number.isFinite(r.awayRest)),
    };
  };

  for (let i = 0; i < ordered.length;) {
    let j = i;
    while (j < ordered.length && ordered[j].date === ordered[i].date) j += 1;
    const day = ordered.slice(i, j);
    if (beforeDate && day[0].date >= beforeDate) break;
    seasonTurn(day[0].season);
    if (onDay) onDay(day, featuresFor);
    // Elo pre-game numbers for the whole date first (matches the replay's day-at-once update order).
    const pre = day.map((g) => {
      const home = franchise(g.home);
      const away = franchise(g.away);
      const d = eloOf(home) + (g.neutral ? 0 : params.eloHome) - eloOf(away);
      return { g, home, away, d, p: 1 / (1 + 10 ** (-d / 400)) };
    });
    for (const { g, home, away, d, p } of pre) {
      if (!Number.isInteger(g.homeScore) || !Number.isInteger(g.awayScore)) continue;
      if (g.homeScore === g.awayScore) continue;
      const s = g.homeScore > g.awayScore ? 1 : 0;
      const step = params.eloK * Math.log(Math.abs(g.homeScore - g.awayScore) + 1) * (2.2 / ((s ? d : -d) * 0.001 + 2.2));
      elo.set(home, eloOf(home) + step * (s - p));
      elo.set(away, eloOf(away) + step * ((1 - s) - (1 - p)));
    }
    for (const g of day) {
      if (!Number.isInteger(g.homeScore) || !Number.isInteger(g.awayScore)) continue;
      const home = franchise(g.home);
      const away = franchise(g.away);
      const hInd = g.neutral ? 0 : 1;
      P.update(home, away, hInd, g.homeScore);
      P.update(away, home, 0, g.awayScore);
      const eh = effBy.get(`${g.gameId}|${home}`);
      const ea = effBy.get(`${g.gameId}|${away}`);
      if (eh?.oPlays > 0) E.update(home, away, hInd, eh.oEpa / eh.oPlays);
      if (ea?.oPlays > 0) E.update(away, home, 0, ea.oEpa / ea.oPlays);
      folded += 1;
    }
    lastDateFolded = day[0].date;
    i = j;
  }
  return {
    lastDateFolded,
    lastSeason,
    gamesFolded: folded,
    /** Features for a game after every folded date; regresses into `targetSeason` first if it is new. */
    featuresForward(g) {
      if (lastSeason !== null && g.season > lastSeason) seasonTurn(g.season);
      return featuresFor(g);
    },
  };
}

export const MARGIN_FEATURES = Object.freeze(["hInd", "eloD", "epaEdge", "ptsEdge", "restDiff"]);
export const TOTAL_FEATURES = Object.freeze(["one", "ptsTotal", "epaSum"]);

const vec = (f, names) => names.map((n) => (n === "one" ? 1 : f[n]));

/** Ordinary least squares via normal equations (small p). Returns coefficients. */
export function ols(X, y) {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < X.length; i += 1) {
    for (let r = 0; r < p; r += 1) {
      b[r] += X[i][r] * y[i];
      for (let c = 0; c < p; c += 1) A[r][c] += X[i][r] * X[i][c];
    }
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < p; col += 1) {
    let piv = col;
    for (let r = col + 1; r < p; r += 1) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    if (Math.abs(A[col][col]) < 1e-12) throw new Error("ols: singular design");
    for (let r = 0; r < p; r += 1) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < p; c += 1) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

const sd = (res, k) => Math.sqrt(res.reduce((s, r) => s + r * r, 0) / (res.length - k));

/**
 * Fit the L6 stack on dev observations ({features, margin, total}). Also returns the residual
 * correlation of (margin, total), used only by the joint score sampler.
 */
export function fitStack(obs) {
  const Xm = obs.map((o) => vec(o.features, MARGIN_FEATURES));
  const cm = ols(Xm, obs.map((o) => o.margin));
  const rm = obs.map((o, i) => o.margin - Xm[i].reduce((s, x, k) => s + x * cm[k], 0));
  const Xt = obs.map((o) => vec(o.features, TOTAL_FEATURES));
  const ct = ols(Xt, obs.map((o) => o.total));
  const rt = obs.map((o, i) => o.total - Xt[i].reduce((s, x, k) => s + x * ct[k], 0));
  const sm = sd(rm, cm.length);
  const st = sd(rt, ct.length);
  const rho = rm.reduce((s, r, i) => s + r * rt[i], 0) / ((rm.length - 1) * sm * st);
  return {
    modelId: L6_ID,
    margin: { features: [...MARGIN_FEATURES], coef: cm, sigma: sm },
    total: { features: [...TOTAL_FEATURES], coef: ct, sigma: st },
    rho,
    n: obs.length,
  };
}

/** Fit a single-edge margin head (L2 or L3 alone): margin = a*edge + b*hInd. */
export function fitEdgeHead(obs, edgeKey) {
  const X = obs.map((o) => [o.features[edgeKey], o.features.hInd]);
  const c = ols(X, obs.map((o) => o.margin));
  const res = obs.map((o, i) => o.margin - (X[i][0] * c[0] + X[i][1] * c[1]));
  return { edgeKey, a: c[0], b: c[1], sigma: sd(res, 2) };
}

export function predictEdgeHead(head, f) {
  const mu = head.a * f[head.edgeKey] + head.b * f.hInd;
  return { muM: mu, sigmaM: head.sigma, pHome: phi(mu / head.sigma) };
}

/** The coherent L6 forecast for one game. */
export function predictStack(fit, f) {
  const muM = vec(f, fit.margin.features).reduce((s, x, k) => s + x * fit.margin.coef[k], 0);
  const muT = vec(f, fit.total.features).reduce((s, x, k) => s + x * fit.total.coef[k], 0);
  return { muM, sigmaM: fit.margin.sigma, muT, sigmaT: fit.total.sigma, pHome: phi(muM / fit.margin.sigma) };
}

/**
 * Probability helpers on the ONE margin/total distribution. Lines follow the bettor's signed convention
 * for the HOME side: home -3.5 means home must win by 4+. Integer lines carry an explicit push mass using
 * the continuity window [k-0.5, k+0.5] — the Normal is continuous and NFL scores are not, which is why
 * these are labelled approximations, never exact counts.
 */
export function spreadProbabilities({ muM, sigmaM }, homeLine) {
  const need = -homeLine; // home covers if margin > need
  if (Number.isInteger(need)) {
    const pPush = phi((need + 0.5 - muM) / sigmaM) - phi((need - 0.5 - muM) / sigmaM);
    const pHomeCover = 1 - phi((need + 0.5 - muM) / sigmaM);
    return { homeCover: pHomeCover, awayCover: 1 - pHomeCover - pPush, push: pPush };
  }
  const pHomeCover = 1 - phi((need - muM) / sigmaM);
  return { homeCover: pHomeCover, awayCover: 1 - pHomeCover, push: 0 };
}

export function totalProbabilities({ muT, sigmaT }, line) {
  if (Number.isInteger(line)) {
    const pPush = phi((line + 0.5 - muT) / sigmaT) - phi((line - 0.5 - muT) / sigmaT);
    const over = 1 - phi((line + 0.5 - muT) / sigmaT);
    return { over, under: 1 - over - pPush, push: pPush };
  }
  const over = 1 - phi((line - muT) / sigmaT);
  return { over, under: 1 - over, push: 0 };
}

/** Closed-form CRPS of Normal(mu, sigma) at x. */
export function crpsNormal(mu, sigma, x) {
  const z = (x - mu) / sigma;
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  return sigma * (z * (2 * phi(z) - 1) + 2 * pdf - 1 / Math.sqrt(Math.PI));
}
