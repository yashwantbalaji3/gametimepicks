/**
 * EPL MATCH MODEL v2 — Elo-Poisson (P304). Pure.
 *
 * Cleared every preregistered bar on a blind walk-forward replay of 2013-14 to 2021-22 (3,420 matches):
 * log loss 0.9735 against 0.9938 for the live split-Poisson rule and 0.9830 for plain Elo
 * (data/internal/research/epl/reports/epl-history-replay-evaluation.json). This module is that model for live
 * use, with the replay's arithmetic unchanged (scripts/research/soccer/replay-epl-history.mjs) and its constants
 * read from the registration's frozen block — a parity test re-scores a dev season through this module.
 *
 *   ratings    Elo from 2010-11: K 20 × a goal-difference multiplier, home advantage 60; at each season start
 *              every club regresses 20% toward 1500 and a club absent last season enters at the mean
 *              end-of-season rating of last season's bottom three
 *   supremacy  expected goal difference = slope × (home rating + 60 − away rating) / 100, the slope fit by least
 *              squares on the warm-up seasons only
 *   total      the league's goals per match over the previous 380 matches
 *   goals      λ_home = (total + supremacy) / 2, λ_away = (total − supremacy) / 2, floored — then the SAME score
 *              matrix the live product already publishes (strength-state.mjs scoreMatrix), via `lambdasFor`
 *
 * The returned state has the shape strength-state.mjs consumers already use (modelId, cutoffIso, matchesFitted,
 * knownClubs, displayName, stats) plus `lambdasFor`, which scoreMatrix delegates to. `stats` is empty, so the
 * split-Poisson sparse-split flag (which does not apply to ratings) is never raised.
 */
import { normalizeClubName } from "./strength-state.mjs";

export const EPL_ELO_POISSON_MODEL_ID = "epl-model-v2-elo-poisson";

const seasonStart = (s) => Number(String(s).slice(0, 4));
const seasonLabel = (y) => `${y}-${String(y + 1).slice(2)}`;
/** The season a date belongs to: July rolls over (matches openfootball.mjs seasonOfDate). */
const seasonOfIso = (iso) => { const y = Number(iso.slice(0, 4)); const m = Number(iso.slice(5, 7)); return seasonLabel(m >= 7 ? y : y - 1); };
const gdMultiplier = (gd) => (gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8);

/**
 * @param {{ rows: Array<{season:string,dateUtc:string,home:string,away:string,ftHome:number,ftAway:number}>,
 *           cutoffIso: string, frozen: object, seasonClubs?: string[], aliases?: Record<string,string> }} input
 *   rows         openfootball history rows in corpus club names (history-openfootball-v1.json)
 *   frozen       the P304 registration's frozen block
 *   seasonClubs  the current season's clubs (fixture names are fine — aliases resolve them), so a season that has
 *                not kicked off yet still begins with its full club list, exactly as the replay began each season
 *   aliases      display name → corpus name (leagues.mjs EPL aliases)
 */
export function fitEloPoissonState({ rows, cutoffIso, frozen, seasonClubs = [], aliases = {} }) {
  const cutoff = Date.parse(cutoffIso ?? "");
  if (!Number.isFinite(cutoff)) throw new Error("fitEloPoissonState: cutoffIso required");
  const E = frozen.elo;
  const aliasOf = new Map(Object.entries(aliases).map(([k, v]) => [normalizeClubName(k), v]));
  const resolve = (name) => aliasOf.get(normalizeClubName(name)) ?? name;

  const all = (rows ?? []).filter((m) => Number.isInteger(m.ftHome) && Number.isInteger(m.ftAway) && seasonStart(m.season) >= seasonStart(frozen.seasons.warmup[0]))
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.home.localeCompare(b.home));
  const eligible = all.filter((m) => Date.parse(m.dateUtc) < cutoff);
  const clubsBySeason = new Map();
  for (const m of all) (clubsBySeason.get(m.season) ?? clubsBySeason.set(m.season, new Set()).get(m.season)).add(m.home).add(m.away);
  const currentSeason = seasonOfIso(new Date(cutoff).toISOString());
  for (const c of seasonClubs) (clubsBySeason.get(currentSeason) ?? clubsBySeason.set(currentSeason, new Set()).get(currentSeason)).add(resolve(c));

  const elo = new Map();
  const lastSeasonOf = new Map();
  let promotedRating = E.start;
  const begun = new Set();
  const beginSeason = (season) => {
    begun.add(season);
    const prevSeason = seasonLabel(seasonStart(season) - 1);
    const prevClubs = [...lastSeasonOf].filter(([, s]) => s === prevSeason).map(([c]) => c);
    if (prevClubs.length >= 3) {
      const bottom = prevClubs.map((c) => elo.get(c)).sort((a, b) => a - b).slice(0, 3);
      promotedRating = bottom.reduce((a, b) => a + b, 0) / 3;
    }
    for (const c of clubsBySeason.get(season) ?? []) {
      if (lastSeasonOf.get(c) !== prevSeason && elo.has(c)) elo.set(c, promotedRating);
      if (!elo.has(c)) elo.set(c, lastSeasonOf.size ? promotedRating : E.start);
      elo.set(c, elo.get(c) + E.seasonRegression * (E.start - elo.get(c)));
    }
  };

  const inWarmup = (s) => seasonStart(s) <= seasonStart(frozen.seasons.warmup[1]);
  let sxy = 0;
  let sxx = 0;
  const goals = [];
  let i = 0;
  while (i < eligible.length) {
    const day = eligible[i].dateUtc.slice(0, 10);
    const slate = [];
    while (i < eligible.length && eligible[i].dateUtc.slice(0, 10) === day) slate.push(eligible[i++]);
    for (const s of new Set(slate.map((m) => m.season))) if (!begun.has(s)) beginSeason(s);
    for (const m of slate) {
      const gd = m.ftHome - m.ftAway;
      const score = gd > 0 ? 1 : gd === 0 ? 0.5 : 0;
      const eH = elo.get(m.home);
      const eA = elo.get(m.away);
      const dr = (eH + E.homeAdvantage - eA) / 100;
      if (inWarmup(m.season)) { sxy += dr * gd; sxx += dr * dr; }
      const exp = 1 / (1 + Math.pow(10, -dr * 100 / 400));
      const k = E.K * gdMultiplier(Math.abs(gd));
      elo.set(m.home, eH + k * (score - exp));
      elo.set(m.away, eA - k * (score - exp));
      lastSeasonOf.set(m.home, m.season);
      lastSeasonOf.set(m.away, m.season);
      goals.push(m.ftHome + m.ftAway);
    }
  }
  if (!begun.has(currentSeason) && clubsBySeason.has(currentSeason)) beginSeason(currentSeason);
  if (!(sxx > 0)) throw new Error("fitEloPoissonState: the warm-up seasons are missing — the supremacy slope cannot be fit");
  const supremacySlope = sxy / sxx;
  const recent = goals.slice(-frozen.totalWindowMatches);
  const totalGoals = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : frozen.totalPrior;

  const knownClubs = new Set();
  for (const c of elo.keys()) knownClubs.add(normalizeClubName(c));
  for (const [k, v] of aliasOf) if (elo.has(v)) knownClubs.add(k);

  return {
    version: 2,
    modelId: EPL_ELO_POISSON_MODEL_ID,
    cutoffIso,
    matchesFitted: eligible.length,
    supremacySlope,
    totalGoals,
    ratings: elo,
    knownClubs,
    stats: new Map(),
    displayName: (c) => c,
    /** λ pair for one fixture. A club with no rating enters at this season's promoted rating, stated as a cold start. */
    lambdasFor(homeClub, awayClub) {
      const h = elo.get(resolve(homeClub));
      const a = elo.get(resolve(awayClub));
      const dr = ((h ?? promotedRating) + E.homeAdvantage - (a ?? promotedRating)) / 100;
      const sup = supremacySlope * dr;
      return {
        lamHome: Math.max(frozen.lambdaFloor, (totalGoals + sup) / 2),
        lamAway: Math.max(frozen.lambdaFloor, (totalGoals - sup) / 2),
        coldStart: { home: h == null, away: a == null },
      };
    },
  };
}
