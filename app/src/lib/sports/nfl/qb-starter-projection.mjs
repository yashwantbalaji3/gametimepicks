/**
 * NFL STARTING-QB PROJECTION · evidence tier (b) (founder decision 2026-11-11, docs: ~/gtp-evidence/nov11-founder-nfl-qb-starter-redesign.md).
 * PURE: rows in, numbers out; no fs, no clock.
 *
 * The verified starter of a team whose passing history WITH THAT CLUB is not a starter's (traded, or a backup now
 * starting) is projected from his own verified NFL passing across every club, in the current team's context:
 *
 *   attempts   STARTER_SHARE × the team's pass-attempt form           (team context: the P300 teamFormVolume model)
 *   completion his shrunk completion rate, all clubs                  (P300 rate model: half-life, prior trials)
 *   yards      his shrunk yards per completion, all clubs
 *   spread     the P300 passing dispersion, scaled by the second look's dev scale for player_pass_yds
 *
 * Every constant is the committed P300 preregistration's (`frozen`), the second look's dispersion scale, or
 * STARTER_SHARE, which is DERIVED from committed data (the mean share of team pass attempts thrown by the game's
 * leading passer, regular season 2013–2017 — seasons the backtest never scores) and recomputed by a test.
 * The engine below is verbatim P300 (scripts/research/nfl/forward-player-props-share-level.mjs), with the share
 * replaced by STARTER_SHARE: nothing is refit.
 */

/* ── the P300 distribution helpers (verbatim) ────────────────────────────────────────────────────────── */
function logGamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015;
  for (const c of g) { y += 1; s += c / y; }
  return -t + Math.log(2.5066282746310005 * s / x);
}
function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 1000; n += 1) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; }
    return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - logGamma(a)));
  }
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.max(0, 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h);
}
function countDist(mean, variance) {
  if (!(mean > 0)) return { kind: "zero" };
  if (variance <= mean * (1 + 1e-9)) return { kind: "poisson", mean };
  return { kind: "nb", mean, size: (mean * mean) / (variance - mean) };
}
function countPmf(d, k) {
  if (d.kind === "zero") return k === 0 ? 1 : 0;
  if (d.kind === "poisson") return Math.exp(-d.mean + k * Math.log(d.mean) - logGamma(k + 1));
  const p = d.size / (d.size + d.mean);
  return Math.exp(logGamma(k + d.size) - logGamma(d.size) - logGamma(k + 1) + d.size * Math.log(p) + k * Math.log(1 - p));
}
function zeroGamma(mean, variance, p0) {
  if (!(mean > 0) || p0 >= 1) return { p0: 1, shape: 0, scale: 0 };
  const posMean = mean / (1 - p0);
  const posSecond = (variance + mean * mean) / (1 - p0);
  const posVar = Math.max(posSecond - posMean * posMean, 1e-9);
  return { p0, shape: (posMean * posMean) / posVar, scale: posVar / posMean };
}
const zgCdf = (d, y) => (y < 0 ? 0 : d.p0 + (1 - d.p0) * (d.scale > 0 ? gammaP(d.shape, y / d.scale) : 1));
function zgQuantile(d, q) {
  if (q <= d.p0 || d.scale <= 0) return 0;
  let lo = 0;
  let hi = Math.max(1, d.shape * d.scale * 20);
  while (zgCdf(d, hi) < q) hi *= 2;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (zgCdf(d, mid) < q) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
export const QUANTILES = Object.freeze([0.1, 0.25, 0.5, 0.75, 0.9]);

/* ── the walk-forward state (P300 fold, passing only) ────────────────────────────────────────────────── */
const weight = (idxNow, idx, seasonNow, season, hl, bd) => 0.5 ** ((idxNow - idx) / hl) * bd ** Math.max(0, seasonNow - season);

/**
 * A folding state over player-game rows (player-games-v1 column layout). `fold(row, totals)` must be called in date
 * order, once per row; the state then answers for any later instant.
 * @param {object} F the preregistration's `frozen` block
 */
export function createQbState(F) {
  const players = new Map();
  const teamForm = new Map();
  const ST = (id) => {
    if (!players.has(id)) players.set(id, { team: null, games: 0, clubObs: [], rates: { comp: [], ypcmp: [] }, careerAtt: 0, name: null });
    return players.get(id);
  };
  const intercept = F.intercepts.passAttempts;
  const teamVolume = (team, season) => {
    const t = teamForm.get(team);
    if (!t) return intercept;
    return intercept + (t.passAtt - intercept) * F.teamForm.boundaryDecay ** Math.max(0, season - t.season);
  };
  const folded = new Set();
  return {
    players,
    teamVolume,
    /** @param {{ id:string, name:string, team:string, season:number, gameKey:string, passAtt:number, passCmp:number, passYds:number }} r @param {number} teamPassAtt */
    fold(r, teamPassAtt) {
      const st = ST(r.id);
      if (st.team !== r.team) { st.clubObs = []; st.team = r.team; }
      const idx = st.games + 1;
      st.clubObs.push({ share: teamPassAtt > 0 ? r.passAtt / teamPassAtt : 0, idx, season: r.season });
      if (r.passAtt > 0) st.rates.comp.push({ num: r.passCmp, den: r.passAtt, idx, season: r.season });
      if (r.passCmp > 0) st.rates.ypcmp.push({ num: r.passYds, den: r.passCmp, idx, season: r.season });
      st.careerAtt += r.passAtt;
      st.games = idx;
      st.name = r.name;
      if (!folded.has(r.gameKey)) {
        folded.add(r.gameKey);
        const alpha = 1 - 0.5 ** (1 / F.teamForm.halfLifeGames);
        const cur = teamVolume(r.team, r.season);
        teamForm.set(r.team, { passAtt: cur + alpha * (teamPassAtt - cur), season: r.season });
      }
    },
  };
}

/** The P300 share with this club (shrinkK 0: the candidate's own rule). */
export function clubShare(st, season, F) {
  let n = 0;
  let d = 0;
  for (const o of st?.clubObs ?? []) { const w = weight(st.games, o.idx, season, o.season, F.share.halfLifeGames, F.share.boundaryDecay); n += w * o.share; d += w; }
  return d > 0 ? n / (d + F.share.shrinkK) : 0;
}
function shrunkRate(st, key, league, season, F) {
  let n = 0;
  let den = 0;
  for (const o of st?.rates?.[key] ?? []) { const w = weight(st.games, o.idx, season, o.season, F.rate.halfLifeGames, F.rate.boundaryDecay); n += w * o.num; den += w * o.den; }
  return (n + F.rate.priorTrials * league) / (den + F.rate.priorTrials);
}

/**
 * Passing-yards quantiles for a STARTER: `share` of the team's pass-attempt form, with the given completion and
 * per-completion rates (the player's, or the league's for the baseline). P300 moments + zero-gamma, verbatim.
 */
export function passYardsQuantiles({ share, volume, comp, ypcmp, F, scale }) {
  const D = F.dispersion;
  const att = { mean: share * volume, variance: share * volume + share * share * D.volumeSigmaPass * D.volumeSigmaPass };
  const cmp = { mean: att.mean * comp, variance: att.mean * comp * (1 - comp) + comp * comp * att.variance };
  const mean = cmp.mean * ypcmp;
  const variance = (cmp.mean * ypcmp * ypcmp) / D.passingShape + cmp.variance * ypcmp * ypcmp;
  const p0 = countPmf(countDist(cmp.mean, cmp.variance), 0);
  const d = zeroGamma(mean, scale * variance, p0);
  return { mean, q: Object.fromEntries(QUANTILES.map((p) => [p, zgQuantile(d, p)])) };
}

/** Tier (b): the starter's own all-club rates in the team's context. */
export function tierBProjection({ st, team, season, state, F, scale, starterShare }) {
  const L = F.league;
  return passYardsQuantiles({
    share: starterShare, volume: state.teamVolume(team, season),
    comp: shrunkRate(st, "comp", L.completionRate, season, F), ypcmp: shrunkRate(st, "ypcmp", L.yardsPerCompletion, season, F), F, scale,
  });
}

/** Baseline: a league-average starter in the same team context (no individual history). */
export function leagueStarterProjection({ team, season, state, F, scale, starterShare }) {
  return passYardsQuantiles({ share: starterShare, volume: state.teamVolume(team, season), comp: F.league.completionRate, ypcmp: F.league.yardsPerCompletion, F, scale });
}

/** The existing model: the player's club share (what the board shows before any starter rule). */
export function clubShareProjection({ st, team, season, state, F, scale }) {
  const L = F.league;
  return passYardsQuantiles({
    share: clubShare(st, season, F), volume: state.teamVolume(team, season),
    comp: shrunkRate(st, "comp", L.completionRate, season, F), ypcmp: shrunkRate(st, "ypcmp", L.yardsPerCompletion, season, F), F, scale,
  });
}

/** Mean pinball loss over QUANTILES (a CRPS proxy; lower is better). */
export function pinball(q, y) {
  let s = 0;
  for (const p of QUANTILES) { const u = y - q[p]; s += u >= 0 ? p * u : (p - 1) * u; }
  return s / QUANTILES.length;
}
