/**
 * NFL QB PROPS v0 · FROZEN BASELINES AND SCORES (founder decisions 2026-11-10; pre-registration v1). PURE: no fs, no clock.
 *
 * Every predictive distribution here is built from inputs dated strictly BEFORE the game's kickoff (walk-forward), and the
 * model's comes only from the receipt's exact run counts (simulation-receipt@2.2) or count PMF — never a fitted curve.
 *
 *   PRIMARY BASELINE   passYds / cmp / passAtt: the QB's own previous 8 games played (passAtt ≥ 1, any season), as a
 *                      normal with their sample mean and sample SD (n − 1), read on the integer grid. cmp / passAtt use
 *                      the normal TRUNCATED at 0 (no mass on impossible negative counts); passYds stays untruncated
 *                      (negative passing yards are possible). The league-average secondary follows the same rule.
 *                      passTd / int: Poisson with λ = the team's mean over its previous 8 games.
 *   SECONDARY          league average: the same forms over every team-game of the same season before kickoff (starting
 *                      QB = most attempts, for the continuous families). Reported, never primary. A sportsbook-implied
 *                      baseline exists only where an authorized private capture exists; none is wired (nothing public).
 *   SCORES             passYds: binary log loss of P(over) averaged over PASS_YDS_LINES, and ECE per line.
 *                      cmp / passAtt: CRPS on the integer grid over the distribution's support plus the actual
 *                      (primary) and the 80% interval score.
 *                      passTd / int: count log loss −log P(y), y ≥ 6 pooled (the receipt's 6+ bucket).
 *                      All families: cov80, interval width, bias of the median.
 * A baseline without its full 8 prior games, or with zero spread, is null: that row leaves the paired comparison and is
 * counted, never filled in.
 */

export const QB_SCORES_SPEC = "qb-props-scores@2";
export const OWN_GAMES = 8;
export const TEAM_GAMES = 8;
/** The founder's example lines (decision 1, 2026-11-10), used verbatim. */
export const PASS_YDS_LINES = Object.freeze([199.5, 224.5, 249.5]);
export const ECE_BINS = 10;
export const PROB_FLOOR = 1e-6;
export const COUNT_TOP = 6; // y ≥ 6 pooled, as in the receipt's count PMF
/** Count-family lines at which calibration (ECE) and event frequencies are reported — reported only, never a bar. */
export const COUNT_CALIBRATION_LINES = Object.freeze({ passTd: Object.freeze([0.5, 1.5, 2.5]), passInt: Object.freeze([0.5, 1.5]) });

const ms = (iso) => { const t = Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")); return Number.isFinite(t) ? t : null; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
const clampP = (p) => Math.min(1 - PROB_FLOOR, Math.max(PROB_FLOOR, p));

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf; |error| < 1.5e-7). */
function phi(z) {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/* ---------------- predictive distributions on the integer grid: cdf(k) = P(X ≤ k) ---------------- */

/** The model's exact distribution from a receipt's sparse run counts (value → runs). */
export function empirical(counts) {
  const vs = Object.entries(counts ?? {}).map(([v, c]) => [Number(v), c]).sort((a, b) => a[0] - b[0]);
  const n = vs.reduce((a, [, c]) => a + c, 0);
  if (!n) return null;
  const cdf = (k) => { let s = 0; for (const [v, c] of vs) { if (v > k) break; s += c; } return s / n; };
  // over(line): runs above the line / runs — the exact ratio, not 1 − cdf (no float residue)
  const over = (line) => vs.reduce((a, [v, c]) => a + (v > line ? c : 0), 0) / n;
  return { kind: "exact", cdf, over, pmf: (k) => (vs.find(([v]) => v === k)?.[1] ?? 0) / n, lo: vs[0][0], hi: vs[vs.length - 1][0] };
}
/** From a count PMF over 0..5, 6+ (receipts @2.1). */
export function fromCountPmf(pmf) {
  if (!Array.isArray(pmf)) return null;
  const cdf = (k) => (k < 0 ? 0 : k >= pmf.length - 1 ? 1 : pmf.slice(0, k + 1).reduce((a, b) => a + b, 0));
  return { kind: "countPmf", cdf, pmf: (k) => pmf[Math.min(pmf.length - 1, k)] ?? 0, lo: 0, hi: pmf.length - 1 };
}
export function normal(mu, sigma) {
  if (!(Number.isFinite(mu) && sigma > 0)) return null;
  const cdf = (k) => phi((k + 0.5 - mu) / sigma);
  return { kind: "normal", mu, sigma, cdf, pmf: (k) => cdf(k) - cdf(k - 1), lo: Math.floor(mu - 10 * sigma), hi: Math.ceil(mu + 10 * sigma) };
}
/**
 * The normal truncated at 0 on the integer grid, for counts that cannot be negative (completions, attempts):
 * P(X = k) = [Φ(k + .5) − Φ(k − .5)] / [1 − Φ(−.5)] for k ≥ 0, else 0 (Φ of the standardised value); cdf likewise.
 */
export function truncatedNormal(mu, sigma) {
  if (!(Number.isFinite(mu) && sigma > 0)) return null;
  const below = phi((-0.5 - mu) / sigma);
  const mass = 1 - below;
  if (!(mass > PROB_FLOOR)) return null;
  const cdf = (k) => (k < 0 ? 0 : Math.min(1, (phi((k + 0.5 - mu) / sigma) - below) / mass));
  return { kind: "truncatedNormal", mu, sigma, cdf, pmf: (k) => (k < 0 ? 0 : cdf(k) - cdf(k - 1)), lo: 0, hi: Math.max(0, Math.ceil(mu + 10 * sigma)) };
}
/** Negative values are possible only for passing yards; every other continuous family is a count truncated at 0. */
const continuousForm = (actual) => (actual === "passYds" ? normal : truncatedNormal);
export function poisson(lambda) {
  if (!(lambda >= 0)) return null;
  const pmf = (k) => { if (k < 0) return 0; let p = Math.exp(-lambda); for (let i = 1; i <= k; i++) p *= lambda / i; return p; };
  const cdf = (k) => { let s = 0; for (let i = 0; i <= k; i++) s += pmf(i); return Math.min(1, s); };
  return { kind: "poisson", lambda, cdf, pmf, lo: 0, hi: Math.max(COUNT_TOP, Math.ceil(lambda + 10 * Math.sqrt(lambda + 1))) };
}

/** Smallest integer k with P(X ≤ k) ≥ p. */
export function quantile(d, p) { for (let k = Math.min(d.lo, 0); k <= d.hi + 1; k++) if (d.cdf(k) >= p - 1e-12) return k; return d.hi; }
export const pOver = (d, line) => (d.over ? d.over(line) : 1 - d.cdf(Math.floor(line)));

/* ---------------- scores (lower is better) ---------------- */

/** Mean binary log loss of P(over) across the lines. */
export function lineLogLoss(d, y, lines = PASS_YDS_LINES) {
  return mean(lines.map((l) => { const p = clampP(pOver(d, l)); return y > l ? -Math.log(p) : -Math.log(1 - p); }));
}
/**
 * CRPS on the integer grid: Σ_k (F(k) − 1{y ≤ k})², summed over the distribution's support plus the actual only —
 * min(lo, y) … max(hi, y). Below that range every term is 0; nothing is scored on values the distribution rules out.
 */
export function crps(d, y) {
  let s = 0;
  for (let k = Math.min(d.lo, y); k <= Math.max(d.hi, y); k++) s += (d.cdf(k) - (y <= k ? 1 : 0)) ** 2;
  return s;
}
/** The 80% interval [q10, q90] and its interval score (α = 0.2). */
export function interval80(d) { return [quantile(d, 0.1), quantile(d, 0.9)]; }
export function intervalScore([l, u], y, alpha = 0.2) { return u - l + (2 / alpha) * Math.max(0, l - y) + (2 / alpha) * Math.max(0, y - u); }
/** −log P(min(y, 6+)). */
export function countLogLoss(d, y) {
  const p = y >= COUNT_TOP ? 1 - d.cdf(COUNT_TOP - 1) : d.pmf(y);
  return -Math.log(Math.max(PROB_FLOOR, p));
}
/** ECE over equal-width bins of predicted probability. */
export function ece(pairs, bins = ECE_BINS) {
  if (!pairs.length) return null;
  const b = Array.from({ length: bins }, () => ({ n: 0, p: 0, y: 0 }));
  for (const { p, y } of pairs) { const i = Math.min(bins - 1, Math.floor(p * bins)); b[i].n += 1; b[i].p += p; b[i].y += y; }
  return b.reduce((a, x) => a + (x.n ? (x.n / pairs.length) * Math.abs(x.p / x.n - x.y / x.n) : 0), 0);
}

/* ---------------- walk-forward baselines (inputs strictly before kickoff) ---------------- */

const before = (games, kickoff) => { const k = ms(kickoff); return games.filter((g) => ms(g.dateUtc) != null && ms(g.dateUtc) < k).sort((a, b) => ms(b.dateUtc) - ms(a.dateUtc) || String(b.providerEventId).localeCompare(String(a.providerEventId))); };
const teamTotals = (g, team) => {
  const ps = g.players.filter((p) => p.teamAbbr === team && p.passAtt != null);
  return ps.length ? { passTd: ps.reduce((a, p) => a + (p.passTd ?? 0), 0), passInt: ps.reduce((a, p) => a + (p.passInt ?? 0), 0) } : null;
};

/** The QB's own previous 8 games played (passAtt ≥ 1), most recent first, or null when fewer than 8 exist. */
export function ownPriorGames(games, playerId, kickoff) {
  const rows = [];
  for (const g of before(games, kickoff)) {
    const p = g.players.find((x) => x.playerId === playerId && (x.passAtt ?? 0) >= 1);
    if (p) rows.push(p);
    if (rows.length === OWN_GAMES) return rows;
  }
  return null;
}
/** Primary baseline for passYds / passCmp / passAtt (`actual` = the box-score field). */
export function ownTrailingBaseline(games, playerId, kickoff, actual) {
  const rows = ownPriorGames(games, playerId, kickoff);
  if (!rows) return null;
  const xs = rows.map((p) => p[actual] ?? 0);
  return continuousForm(actual)(mean(xs), sd(xs));
}
/** Primary baseline for passTd / passInt: Poisson with the team's mean over its previous 8 games. */
export function teamPoissonBaseline(games, team, kickoff, actual) {
  const xs = [];
  for (const g of before(games, kickoff)) {
    const t = teamTotals(g, team);
    if (t) xs.push(t[actual]);
    if (xs.length === TEAM_GAMES) return poisson(mean(xs));
  }
  return null;
}
/** Secondary: league average over the same season's earlier team-games (starting QB for the continuous families). */
export function leagueBaseline(games, season, kickoff, actual, kind) {
  const xs = [];
  for (const g of before(games, kickoff).filter((x) => x.season === season)) {
    for (const team of [...new Set(g.players.map((p) => p.teamAbbr))]) {
      if (kind === "count") { const t = teamTotals(g, team); if (t) xs.push(t[actual]); continue; }
      const st = g.players.filter((p) => p.teamAbbr === team && (p.passAtt ?? 0) >= 1).sort((a, b) => b.passAtt - a.passAtt || a.playerId.localeCompare(b.playerId))[0];
      if (st) xs.push(st[actual] ?? 0);
    }
  }
  if (xs.length < 2) return null;
  return kind === "count" ? poisson(mean(xs)) : continuousForm(actual)(mean(xs), sd(xs));
}

/** Every score for one distribution and one outcome. `kind`: "yds" | "continuous" | "count". */
export function scoreRow(d, y, kind, countLines = []) {
  if (!d) return null;
  const iv = interval80(d);
  const med = quantile(d, 0.5);
  const out = { median: med, q10: iv[0], q90: iv[1], width: iv[1] - iv[0], covered80: y >= iv[0] && y <= iv[1], error: y - med, intervalScore: intervalScore(iv, y) };
  if (kind === "yds") Object.assign(out, { primary: lineLogLoss(d, y), pOver: Object.fromEntries(PASS_YDS_LINES.map((l) => [l, pOver(d, l)])) });
  else if (kind === "continuous") Object.assign(out, { primary: crps(d, y) });
  else Object.assign(out, { primary: countLogLoss(d, y), pOver: Object.fromEntries(countLines.map((l) => [l, pOver(d, l)])) });
  return out;
}
