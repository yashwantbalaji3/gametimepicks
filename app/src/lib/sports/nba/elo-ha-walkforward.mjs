/**
 * NBA ELO WALK-FORWARD CHALLENGERS (founder decision 2 of 2026-11-10: calibrated challengers to the published Elo, without
 * touching frozen history). PURE, deterministic, no I/O. dataClass PRIVATE_RESEARCH · productEligible: false · feeds no
 * public surface. Pre-registered in docs/NBA_ELO_WALKFORWARD_PREREGISTRATION_V2.md (ONE primary comparison: the in-season
 * challenger vs the official; the home-advantage-only challenger is a reported secondary, never a verdict).
 *
 * `nba-elo-ha-walkforward@1` (challengerForecast) — the official ratings, home advantage re-fit:
 *   - Ratings: the OFFICIAL ones. For a game, the challenger reads the frozen official forecast's home and away ratings
 *     (forecast.elo.home.rating / away.rating) and refuses unless the official formula (HOME_ADVANTAGE 70) reproduces the
 *     frozen forecast.elo.pHome to 4 decimals. K, scale, season regression and the rating trajectory are untouched.
 *   - Home advantage: h re-fit by maximum likelihood for each game, on every game strictly before BOTH the official
 *     forecast's inputAsOf AND the game's ET date, not at a neutral site, each entering as (the model's own pre-game
 *     rating difference home − away, home won):
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
 *
 * `nba-elo-inseason-walkforward@1` (inseasonForecast) — the model as documented, actually updated:
 *   - Start: the official preseason ratings, i.e. the frozen official ratings every 2026-27 forecast carries (constant per
 *     team; officialPreseasonRatings refuses if they are not).
 *   - Update: after each official FINAL (finals record state FINAL; not preseason, not an exhibition) strictly before the
 *     forecast instant and the game's ET date, in tip order, both teams move by the model card's own rule
 *     (data/internal/research/nba/model-card-v1.json line 11: "K=20, HA=+70 (neutral suppressed) …", win/loss with no
 *     margin of victory), implemented by team-rating.mjs fold(): r ← r ± K·(s − E), E = winProbability(home, away,
 *     neutral) with HOME_ADVANTAGE 70.
 *   - Home advantage: re-fit exactly as above, the current season entering with THIS model's own pre-game differences.
 *   No other input, window, shrinkage or tuning in either challenger.
 *
 * BLIND: the forecast functions may run for any game. `scoreChallengers` — the only function that reads real outcomes
 * against a challenger — REFUSES unless the pre-registration file's sha256 is in APPROVED_PREREG_SHA256 (empty until the
 * founder approves it in writing) with a timestamp in PREREG_APPROVED_AT, and it scores only games tipping strictly after
 * that timestamp. Every earlier 2026-27 game is exploratory forever: it is counted, never scored. Tests use synthetic
 * fixtures and a synthetic approval only.
 */
import { NBA_ELO_PARAMS, buildTeamRatings, winProbability } from "./team-rating.mjs";
import { PREREG, reliability } from "./grader-metrics.mjs";
import { BOOTSTRAP_DEFAULTS, clusterBootstrap, bootstrapStatistic } from "./bootstrap.mjs";
import { etDateOf as recordEtDateOf, finalFor } from "./finals-record.mjs";
import { LABELS } from "./experimental-forecast.mjs";

export const CHALLENGER_ID = "nba-elo-ha-walkforward@1";
export const INSEASON_CHALLENGER_ID = "nba-elo-inseason-walkforward@1";
export const PREREG_DOC = "docs/NBA_ELO_WALKFORWARD_PREREGISTRATION_V2.md";
/** sha256 of the FROZEN draft above; elo-ha-walkforward.test.mjs pins the file's bytes to it (any edit is a new draft). */
export const PREREG_DRAFT_SHA256 = "4c370915828facd787ca41d1dc816721ea8c6cf915866aca0894cae45510d0d7";
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

/**
 * The official preseason ratings by ESPN team id: the frozen official ratings of the current season's regular-season
 * forecasts. They are constant per team (the official Elo does not fold the season); a team with two different frozen
 * ratings refuses the whole map, as the definition would no longer hold.
 */
export function officialPreseasonRatings(forecastGames) {
  const out = new Map();
  for (const g of forecastGames ?? []) {
    if (g?.label !== LABELS[2]) continue;
    for (const side of ["home", "away"]) {
      const id = g[side]?.providerTeamId, r = g.forecast?.elo?.[side]?.rating;
      if (id == null || !Number.isFinite(r)) continue;
      const k = String(id);
      if (out.has(k) && out.get(k) !== r) return { ok: false, reason: "OFFICIAL_RATINGS_NOT_CONSTANT", teamId: k };
      out.set(k, r);
    }
  }
  return { ok: true, ratings: out };
}

/** The current season's official FINALs eligible for an update, in tip order (preseason and exhibitions excluded). */
function updateFinals(finalsRecord) {
  const conflicted = new Set((finalsRecord?.conflicts ?? []).map((c) => String(c.providerEventId)));
  return (finalsRecord?.finals ?? [])
    .filter((f) => f.phase !== "PRESEASON" && f.exhibition !== true && !conflicted.has(String(f.providerEventId)))
    .filter((f) => Number.isInteger(f.ftHome) && Number.isInteger(f.ftAway) && f.ftHome !== f.ftAway && Number.isFinite(Date.parse(f.dateUtc)))
    .filter((f) => f.home?.providerTeamId != null && f.away?.providerTeamId != null)
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
}

/**
 * Walk the in-season updates for one forecast: start ratings, then every eligible FINAL strictly before `cutoffUtc` and
 * strictly before the ET date `gameEt`, with the model card's rule (team-rating.mjs fold). Returns the ratings and this
 * model's own pre-game samples (non-neutral games) for the home-advantage fit.
 */
export function inseasonState(startRatings, finalsRecord, { cutoffUtc, gameEt }) {
  const R = new Map(startRatings);
  const samples = [];
  const cutoff = Date.parse(cutoffUtc);
  let updates = 0;
  for (const f of updateFinals(finalsRecord)) {
    if (!(Date.parse(f.dateUtc) < cutoff) || !(etDateOf(f.dateUtc) < gameEt)) continue;
    const h = String(f.home.providerTeamId), a = String(f.away.providerTeamId);
    if (!R.has(h) || !R.has(a)) return { ok: false, reason: "NO_START_RATING", providerEventId: String(f.providerEventId) };
    const rh = R.get(h), ra = R.get(a);
    const neutralSite = f.neutralSite === true;
    const exp = winProbability(rh, ra, { neutralSite });
    const s = f.ftHome > f.ftAway ? 1 : 0;
    R.set(h, rh + NBA_ELO_PARAMS.K * (s - exp));
    R.set(a, ra + NBA_ELO_PARAMS.K * ((1 - s) - (1 - exp)));
    updates += 1;
    if (!neutralSite) samples.push({ providerEventId: String(f.providerEventId), dateUtc: f.dateUtc, etDate: etDateOf(f.dateUtc), diff: rh - ra, homeWon: s });
  }
  return { ok: true, ratings: R, samples, updates };
}

/**
 * The in-season challenger's pHome for one frozen official forecast game.
 * @param game  as challengerForecast, plus home/away providerTeamId
 * @param opts  { history: historySamples(corpus) (corpus seasons), startRatings: officialPreseasonRatings(...).ratings, finalsRecord }
 */
export function inseasonForecast(game, { history, startRatings, finalsRecord }) {
  const f = game?.forecast;
  const cutoffUtc = f?.inputAsOf;
  if (typeof cutoffUtc !== "string" || !Number.isFinite(Date.parse(cutoffUtc))) return { ok: false, reason: "NO_FORECAST_INSTANT" };
  if (typeof game.dateUtc !== "string" || !(Date.parse(cutoffUtc) < Date.parse(game.dateUtc))) return { ok: false, reason: "FORECAST_NOT_BEFORE_TIP" };
  const hid = String(game.home?.providerTeamId), aid = String(game.away?.providerTeamId);
  if (!(startRatings instanceof Map) || !startRatings.has(hid) || !startRatings.has(aid)) return { ok: false, reason: "NO_START_RATING" };
  const gameEt = etDateOf(game.dateUtc);
  const st = inseasonState(startRatings, finalsRecord, { cutoffUtc, gameEt });
  if (!st.ok) return st;
  const cutoff = Date.parse(cutoffUtc);
  const train = [...(history ?? []).filter((x) => Date.parse(x.dateUtc) < cutoff && x.etDate < gameEt), ...st.samples];
  const fit = fitHomeAdvantage(train);
  if (fit.h == null) return { ok: false, reason: "NO_HISTORY" };
  const neutralSite = game.neutralSite === true;
  const h = neutralSite ? 0 : fit.h;
  const rh = st.ratings.get(hid), ra = st.ratings.get(aid);
  return {
    ok: true,
    challenger: INSEASON_CHALLENGER_ID,
    providerEventId: String(game.providerEventId),
    cutoffUtc,
    neutralSite,
    ratingHome: rh,
    ratingAway: ra,
    officialPHome: f?.elo?.pHome ?? null,
    updates: st.updates,
    homeAdvantage: r4(h),
    fit: { n: fit.n, boundary: fit.boundary },
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
 * The pre-registered analysis (v2): ONE primary comparison and reported secondaries. Rows, one per game, all values frozen
 * before tip: { providerEventId, tipUtc, homeWon, official, inseason, haOnly } (haOnly optional). Only games tipping
 * strictly after the approval instant are scored.
 */
export function scoreChallengers(rows, { preregSha256, approvals = APPROVED_PREREG_SHA256, approvedAt = PREREG_APPROVED_AT, bootstrap = {} } = {}) {
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
    .filter((r) => (r.homeWon === 0 || r.homeWon === 1) && Number.isFinite(r.official) && Number.isFinite(r.inseason));
  const bs = { ...BOOTSTRAP_DEFAULTS, ...bootstrap };
  const ci = (b) => (b.lo == null ? null : [b.lo, b.hi]);
  const paired = (xs, key) => clusterBootstrap(xs.map((r) => [logLoss(r[key], r.homeWon) - logLoss(r.official, r.homeWon)]), bs);
  const primary = paired(conf, "inseason");
  const n = conf.length;
  let verdict;
  if (n < MIN_PAIRED_N) verdict = VERDICT.INSUFFICIENT_N;
  else if (primary.hi != null && primary.hi < 0) verdict = VERDICT.CHALLENGER_BETTER;
  else if (primary.lo != null && primary.lo > 0) verdict = VERDICT.CHALLENGER_WORSE;
  else verdict = VERDICT.INCONCLUSIVE;
  const ha = conf.filter((r) => Number.isFinite(r.haOnly));
  const haDiff = paired(ha, "haOnly");
  const calibration = (key) => {
    const xs = conf.filter((r) => Number.isFinite(r[key])).map((r) => ({ p: r[key], y: r.homeWon }));
    const bias = clusterBootstrap(xs.map(({ p, y }) => [p - y]), bs);
    const ece = bootstrapStatistic(xs, (v) => reliability(v).ece, bs);
    return { n: xs.length, ece: ece.value, eceCi95: ci(ece), homeBias: bias.mean, homeBiasCi95: ci(bias) };
  };
  return {
    preregistration: { doc: PREREG_DOC, sha256: preregSha256, approvedAt: approvedAt[preregSha256] },
    window: { confirmatoryFromExclusive: approvedAt[preregSha256], exploratoryCountedNotScored: exploratory },
    n,
    minN: MIN_PAIRED_N,
    primary: { challenger: INSEASON_CHALLENGER_ID, score: "paired log loss, challenger − official (lower is better)", mean: primary.mean, ci95: ci(primary), verdict },
    secondary: {
      note: "reported, never a verdict",
      haOnly: { challenger: CHALLENGER_ID, n: ha.length, pairedLogLoss: { mean: haDiff.mean, ci95: ci(haDiff) } },
      calibration: { official: calibration("official"), inseason: calibration("inseason"), haOnly: calibration("haOnly") },
    },
    bootstrap: { method: "game-clustered percentile bootstrap (one cluster per game)", B: bs.B, seed: bs.seed, alpha: bs.alpha },
    promotes: false,
    rule: "CHALLENGER_BETTER needs n ≥ 300 and the primary interval's upper bound < 0; it is an input to a founder decision, never a promotion",
  };
}
