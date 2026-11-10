/**
 * NBA ELO HOME-ADVANTAGE WALK-FORWARD CHALLENGER — `nba-elo-ha-walkforward@1` (founder decision 2 of 2026-11-10: a
 * calibrated challenger to the published Elo, without touching frozen history). PURE, deterministic, no I/O.
 * dataClass PRIVATE_RESEARCH · productEligible: false · feeds no public surface.
 *
 * DEFINITION (mechanical; pre-registered in docs/NBA_ELO_HA_WALKFORWARD_PREREGISTRATION_V1.md):
 *   - Ratings: the OFFICIAL ones. For a game, the challenger reads the frozen official forecast's home and away ratings
 *     (forecast.elo.home.rating / away.rating) and refuses unless the official formula (HOME_ADVANTAGE 70) reproduces the
 *     frozen forecast.elo.pHome to 4 decimals. K, scale, season regression and the rating trajectory are untouched.
 *   - Home advantage: h re-fit by maximum likelihood for each game, on every game strictly before BOTH the official
 *     forecast's inputAsOf AND the game's ET date, not at a neutral site, each entering as (the OFFICIAL pre-game rating
 *     difference home − away, home won):
 *       · corpus seasons (2023-24 → 2025-26): the regular-population games (phase ≠ 1) of the official fold, with the
 *         fold's pre-game ratings (historySamples);
 *       · the current season: the regular-season games of the frozen official forecasts with an official FINAL in the
 *         finals record (a final under review is left out), with that forecast's own frozen ratings (seasonSamples).
 *         The official v0.1 Elo does not fold the current season (data rule corpus-v1), so those frozen ratings ARE the
 *         official pre-game difference of each such game.
 *     The likelihood is the official logistic on the official 400 scale; h is the root of its monotone score, found by
 *     bisection on [−SCALE, SCALE] (NBA_ELO_PARAMS.SCALE; a boundary hit is reported).
 *   - Probability: pHome = 1 / (1 + 10^(−(ratingHome − ratingAway + h) / SCALE)); at a neutral site h = 0, so the
 *     challenger equals the official exactly, as the official suppresses home advantage there.
 *   No other input, no window, no shrinkage, no tuning.
 *
 * BLIND: `challengerForecast` may run for any game. `scoreChallenger` — the only function that reads real outcomes
 * against the challenger — REFUSES unless the pre-registration file's sha256 is in APPROVED_PREREG_SHA256 (empty until the
 * founder approves it in writing) with a timestamp in PREREG_APPROVED_AT, and it scores only games tipping strictly after
 * that timestamp. Every earlier 2026-27 game is exploratory forever: it is counted, never scored. Tests use synthetic
 * fixtures and a synthetic approval only.
 */
import { NBA_ELO_PARAMS, buildTeamRatings, winProbability } from "./team-rating.mjs";
import { PREREG } from "./grader-metrics.mjs";
import { BOOTSTRAP_DEFAULTS, clusterBootstrap } from "./bootstrap.mjs";
import { etDateOf as recordEtDateOf, finalFor } from "./finals-record.mjs";
import { LABELS } from "./experimental-forecast.mjs";

export const CHALLENGER_ID = "nba-elo-ha-walkforward@1";
export const PREREG_DOC = "docs/NBA_ELO_HA_WALKFORWARD_PREREGISTRATION_V1.md";
/** sha256 of the FROZEN draft above; elo-ha-walkforward.test.mjs pins the file's bytes to it (any edit is a new draft). */
export const PREREG_DRAFT_SHA256 = "5b9c4e481edce7940e7a5dd731eea424d328c2857914679b6a4cfe08d748a76f";
/** sha256 of each pre-registration file the founder has APPROVED in writing. Empty: not approved. */
export const APPROVED_PREREG_SHA256 = Object.freeze([]);
/** sha256 → the founder's written approval timestamp (ISO). The confirmatory window opens strictly after it. */
export const PREREG_APPROVED_AT = Object.freeze({});
/** The minimum paired n: §7's winner bar (n ≥ 300), verbatim. */
export const MIN_PAIRED_N = PREREG.winner.minN;
export const VERDICT = Object.freeze({
  INSUFFICIENT_N: "INSUFFICIENT_N",
  CHALLENGER_BETTER: "CHALLENGER_BETTER",
  CHALLENGER_WORSE: "CHALLENGER_WORSE",
  INCONCLUSIVE: "INCONCLUSIVE",
});

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));
const clamp = (p) => Math.min(1 - 1e-12, Math.max(1e-12, p));
const logLoss = (p, y) => -(y ? Math.log(clamp(p)) : Math.log(1 - clamp(p)));
const pFromDiff = (d, h) => 1 / (1 + Math.pow(10, -(d + h) / NBA_ELO_PARAMS.SCALE));
const etCache = new Map();
/** The official record's ET calendar date (America/New_York), memoised: thousands of history rows share few dates. */
const etDateOf = (iso) => { if (!etCache.has(iso)) etCache.set(iso, recordEtDateOf(iso)); return etCache.get(iso); };
const BISECTION_STEPS = 100; // numerical only: the bracket width shrinks to 800 / 2^100

/**
 * Training samples from the official fold: one per regular-population, non-neutral final strictly before
 * `throughDateUtc`, with its PRE-GAME official ratings. Order and values are those of buildTeamRatings.
 */
export function historySamples(corpusRows, { throughDateUtc }) {
  const samples = [];
  buildTeamRatings(corpusRows, {
    throughDateUtc,
    onFold: (g) => {
      if (g.population !== "regular" || g.neutralSite) return;
      samples.push({ providerEventId: String(g.providerEventId), dateUtc: g.dateUtc, etDate: etDateOf(g.dateUtc), diff: g.ratingHome - g.ratingAway, homeWon: g.homeWon });
    },
  });
  return samples;
}

/**
 * Current-season training samples from the frozen official forecasts (see the header): one per regular-season game with
 * an official FINAL, not at a neutral site, carrying the frozen forecast's own official ratings. A game frozen in more
 * than one forecast keeps the latest frozen before its tip.
 * @param forecastGames  frozen official forecast games ({ providerEventId, label, dateUtc, neutralSite, forecast })
 * @param finalsRecord   the official finals record of the season (finals-record.mjs shape)
 */
export function seasonSamples(forecastGames, finalsRecord) {
  const best = new Map();
  for (const g of forecastGames ?? []) {
    const f = g?.forecast;
    if (g?.label !== LABELS[2] || g.neutralSite === true || !Number.isFinite(f?.elo?.home?.rating) || !Number.isFinite(f?.elo?.away?.rating)) continue;
    if (!(Date.parse(f.inputAsOf) < Date.parse(g.dateUtc))) continue;
    const id = String(g.providerEventId);
    const prev = best.get(id);
    if (!prev || Date.parse(f.inputAsOf) > Date.parse(prev.forecast.inputAsOf)) best.set(id, g);
  }
  const out = [];
  for (const [id, g] of best) {
    const fin = finalFor(finalsRecord, id);
    if (fin.state !== "FINAL" || !Number.isInteger(fin.ftHome) || !Number.isInteger(fin.ftAway) || fin.ftHome === fin.ftAway) continue;
    out.push({ providerEventId: id, dateUtc: g.dateUtc, etDate: etDateOf(g.dateUtc), diff: g.forecast.elo.home.rating - g.forecast.elo.away.rating, homeWon: fin.ftHome > fin.ftAway ? 1 : 0 });
  }
  return out.sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || a.providerEventId.localeCompare(b.providerEventId));
}

/** The full training pool: corpus history plus the current season, one sample per game (corpus first on a clash). */
export function trainingSamples({ corpusRows, throughDateUtc, forecastGames = [], finalsRecord = null }) {
  const hist = historySamples(corpusRows, { throughDateUtc });
  const ids = new Set(hist.map((s) => s.providerEventId));
  return [...hist, ...seasonSamples(forecastGames, finalsRecord).filter((s) => !ids.has(s.providerEventId))]
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || a.providerEventId.localeCompare(b.providerEventId));
}

/** MLE of the home advantage on `samples` ({ diff, homeWon }): the root of the score Σ (y − p(diff + h)). */
export function fitHomeAdvantage(samples) {
  const xs = (samples ?? []).filter((s) => Number.isFinite(s?.diff) && (s.homeWon === 0 || s.homeWon === 1));
  if (!xs.length) return { h: null, n: 0, boundary: null };
  const score = (h) => xs.reduce((a, s) => a + (s.homeWon - pFromDiff(s.diff, h)), 0);
  const L = -NBA_ELO_PARAMS.SCALE, U = NBA_ELO_PARAMS.SCALE;
  if (score(L) <= 0) return { h: L, n: xs.length, boundary: "lower" };
  if (score(U) >= 0) return { h: U, n: xs.length, boundary: "upper" };
  let lo = L, hi = U;
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    if (score(mid) > 0) lo = mid; else hi = mid;
  }
  return { h: (lo + hi) / 2, n: xs.length, boundary: null };
}

/**
 * The challenger's pHome for one frozen official forecast game.
 * @param game     { providerEventId, dateUtc, neutralSite, forecast: { inputAsOf, elo: { home: { rating }, away: { rating }, pHome } } }
 * @param samples  trainingSamples(...) (any later samples are ignored here: the cutoff rule is applied per game)
 * @returns { ok: true, ... } or { ok: false, reason }
 */
export function challengerForecast(game, samples) {
  const f = game?.forecast;
  const cutoffUtc = f?.inputAsOf;
  const rh = f?.elo?.home?.rating, ra = f?.elo?.away?.rating;
  if (typeof cutoffUtc !== "string" || !Number.isFinite(Date.parse(cutoffUtc))) return { ok: false, reason: "NO_FORECAST_INSTANT" };
  if (typeof game.dateUtc !== "string" || !(Date.parse(cutoffUtc) < Date.parse(game.dateUtc))) return { ok: false, reason: "FORECAST_NOT_BEFORE_TIP" };
  if (!Number.isFinite(rh) || !Number.isFinite(ra) || !Number.isFinite(f.elo.pHome)) return { ok: false, reason: "NO_OFFICIAL_RATINGS" };
  const neutralSite = game.neutralSite === true;
  if (r4(winProbability(rh, ra, { neutralSite })) !== r4(f.elo.pHome)) return { ok: false, reason: "OFFICIAL_PHOME_NOT_REPRODUCED" };
  const gameEt = etDateOf(game.dateUtc);
  const cutoff = Date.parse(cutoffUtc);
  const train = (samples ?? []).filter((s) => Date.parse(s.dateUtc) < cutoff && s.etDate < gameEt);
  const fit = fitHomeAdvantage(train);
  if (fit.h == null) return { ok: false, reason: "NO_HISTORY" };
  const h = neutralSite ? 0 : fit.h;
  return {
    ok: true,
    challenger: CHALLENGER_ID,
    providerEventId: String(game.providerEventId),
    cutoffUtc,
    neutralSite,
    ratingHome: rh,
    ratingAway: ra,
    officialPHome: f.elo.pHome,
    homeAdvantage: r4(h),
    fit: { n: fit.n, boundary: fit.boundary, lastTrainingDateUtc: train.length ? train[train.length - 1].dateUtc : null },
    pHome: r4(pFromDiff(rh - ra, h)),
  };
}

/** May scoring run with this pre-registration file? Only when its sha256 is approved and has an approval instant. */
export function scoringRefusal(preregSha256, approvals = APPROVED_PREREG_SHA256, approvedAt = PREREG_APPROVED_AT) {
  if (typeof preregSha256 !== "string" || !approvals.includes(preregSha256)) return "no approved pre-registration";
  if (!approvedAt[preregSha256] || !Number.isFinite(Date.parse(approvedAt[preregSha256]))) return "the approved pre-registration has no approval timestamp";
  return null;
}

/**
 * The pre-registered primary analysis. Rows: { providerEventId, tipUtc, homeWon, official, challenger } — one per game,
 * both values frozen before tip. Only games tipping strictly after the approval instant are scored.
 */
export function scoreChallenger(rows, { preregSha256, approvals = APPROVED_PREREG_SHA256, approvedAt = PREREG_APPROVED_AT, bootstrap = {} } = {}) {
  const refusal = scoringRefusal(preregSha256, approvals, approvedAt);
  if (refusal) throw new Error(`REFUSED: ${refusal} (${PREREG_DOC})`);
  const opens = Date.parse(approvedAt[preregSha256]);
  const ids = new Set();
  for (const r of rows ?? []) {
    const id = String(r?.providerEventId);
    if (ids.has(id)) throw new Error(`REFUSED: duplicate game ${id}`);
    ids.add(id);
  }
  const all = (rows ?? []).filter((r) => Number.isFinite(Date.parse(r?.tipUtc)));
  const exploratory = all.filter((r) => Date.parse(r.tipUtc) <= opens).length;
  const conf = all
    .filter((r) => Date.parse(r.tipUtc) > opens)
    .filter((r) => (r.homeWon === 0 || r.homeWon === 1) && Number.isFinite(r.official) && Number.isFinite(r.challenger));
  const bs = { ...BOOTSTRAP_DEFAULTS, ...bootstrap };
  const primary = clusterBootstrap(conf.map((r) => [logLoss(r.challenger, r.homeWon) - logLoss(r.official, r.homeWon)]), bs);
  const brier = clusterBootstrap(conf.map((r) => [(r.challenger - r.homeWon) ** 2 - (r.official - r.homeWon) ** 2]), bs);
  const n = conf.length;
  let verdict;
  if (n < MIN_PAIRED_N) verdict = VERDICT.INSUFFICIENT_N;
  else if (primary.hi != null && primary.hi < 0) verdict = VERDICT.CHALLENGER_BETTER;
  else if (primary.lo != null && primary.lo > 0) verdict = VERDICT.CHALLENGER_WORSE;
  else verdict = VERDICT.INCONCLUSIVE;
  return {
    challenger: CHALLENGER_ID,
    preregistration: { doc: PREREG_DOC, sha256: preregSha256, approvedAt: approvedAt[preregSha256] },
    window: { confirmatoryFromExclusive: approvedAt[preregSha256], exploratoryCountedNotScored: exploratory },
    n,
    minN: MIN_PAIRED_N,
    primary: { score: "paired log loss, challenger − official (lower is better)", mean: primary.mean, ci95: primary.lo == null ? null : [primary.lo, primary.hi] },
    secondary: { brierDiff: { mean: brier.mean, ci95: brier.lo == null ? null : [brier.lo, brier.hi] } },
    bootstrap: { method: "game-clustered percentile bootstrap (one cluster per game)", B: bs.B, seed: bs.seed, alpha: bs.alpha },
    verdict,
    promotes: false,
    rule: "CHALLENGER_BETTER needs n ≥ 300 and the interval's upper bound < 0; it is an input to a founder decision, never a promotion",
  };
}
