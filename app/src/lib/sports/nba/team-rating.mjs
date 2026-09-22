/**
 * NBA team rating (NBA readiness track N2) — PURE Elo over corpus-v1 finals. No I/O.
 * NBA PRESEASON — EXPERIMENTAL · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * Parameters mirror model-card-v1 (K=20, home advantage +70 suppressed at neutral sites) with the
 * program's 25% regression toward 1500 at every season boundary (the boundary is the `season`
 * field of the corpus row, never a calendar guess).
 *
 * TWO POPULATIONS, FOLDED SEPARATELY — the charter rule:
 *   - `ratings`          regular season + cup final + play-in + playoffs (phase !== 1)
 *   - `preseasonRatings` phase === 1 only
 * A preseason final NEVER touches `ratings`; a regular-season final never touches
 * `preseasonRatings`. Each stream keeps its own season-boundary tracker.
 *
 * Leakage rule: only rows with dateUtc strictly earlier than `throughDateUtc` are folded.
 */

export const NBA_ELO_PARAMS = Object.freeze({
  K: 20,
  HOME_ADVANTAGE: 70,
  MEAN: 1500,
  SEASON_REGRESSION: 0.25,
  SCALE: 400,
});

export const DEFAULT_RATING = NBA_ELO_PARAMS.MEAN;

/** Corpus-style season label for a UTC date: Sept→June seasons are labelled by the year they END in. */
export function seasonOfDate(dateUtc) {
  const d = new Date(dateUtc);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return d.getUTCMonth() >= 8 ? y + 1 : y; // months are 0-indexed: 8 = September
}

/** P(home win) — logistic on a 400 scale, home advantage suppressed at neutral sites. */
export function winProbability(ratingHome, ratingAway, { neutralSite = false } = {}) {
  const h = Number.isFinite(ratingHome) ? ratingHome : DEFAULT_RATING;
  const a = Number.isFinite(ratingAway) ? ratingAway : DEFAULT_RATING;
  const ha = neutralSite ? 0 : NBA_ELO_PARAMS.HOME_ADVANTAGE;
  return 1 / (1 + Math.pow(10, (a - (h + ha)) / NBA_ELO_PARAMS.SCALE));
}

const isFinalRow = (r) =>
  r && typeof r.home === "string" && typeof r.away === "string"
  && Number.isInteger(r.ftHome) && Number.isInteger(r.ftAway) && r.ftHome !== r.ftAway
  && typeof r.dateUtc === "string" && Number.isFinite(Date.parse(r.dateUtc))
  && Number.isInteger(r.season);

function makeStream() {
  return { ratings: new Map(), counts: new Map(), curSeason: null, folded: 0, lastDateUtc: null, seasons: new Set() };
}

function regress(stream) {
  const { MEAN, SEASON_REGRESSION } = NBA_ELO_PARAMS;
  for (const [t, r] of stream.ratings) stream.ratings.set(t, r + (MEAN - r) * SEASON_REGRESSION);
}

function fold(stream, g) {
  if (stream.curSeason != null && g.season !== stream.curSeason) regress(stream);
  stream.curSeason = g.season;
  stream.seasons.add(g.season);
  const rh = stream.ratings.get(g.home) ?? DEFAULT_RATING;
  const ra = stream.ratings.get(g.away) ?? DEFAULT_RATING;
  const exp = winProbability(rh, ra, { neutralSite: g.neutralSite === true });
  const s = g.ftHome > g.ftAway ? 1 : 0;
  stream.ratings.set(g.home, rh + NBA_ELO_PARAMS.K * (s - exp));
  stream.ratings.set(g.away, ra + NBA_ELO_PARAMS.K * ((1 - s) - (1 - exp)));
  stream.counts.set(g.home, (stream.counts.get(g.home) ?? 0) + 1);
  stream.counts.set(g.away, (stream.counts.get(g.away) ?? 0) + 1);
  stream.folded += 1;
  stream.lastDateUtc = g.dateUtc;
}

const toObject = (m) => Object.fromEntries([...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, Number(v.toFixed(4))]));

/**
 * Build ratings from corpus rows.
 *
 * @param rows            corpus-v1 rows (any order; sorted here by dateUtc, then providerEventId)
 * @param opts.throughDateUtc  ISO — only rows strictly earlier are folded (required)
 * @param opts.targetSeason    corpus-style season the ratings will be USED for; when it is later
 *                             than the last folded season of a stream, that stream's boundary
 *                             regression is applied once (so a 2026-27 forecast starts from
 *                             regressed 2025-26 ratings, exactly as the walk-forward would)
 */
export function buildTeamRatings(rows, { throughDateUtc, targetSeason = null } = {}) {
  if (typeof throughDateUtc !== "string" || !Number.isFinite(Date.parse(throughDateUtc))) {
    throw new Error("buildTeamRatings: throughDateUtc (ISO) is required");
  }
  const cutoff = Date.parse(throughDateUtc);
  const games = (Array.isArray(rows) ? rows : [])
    .filter(isFinalRow)
    .filter((r) => Date.parse(r.dateUtc) < cutoff)
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));

  const regular = makeStream();
  const preseason = makeStream();
  let skippedNonFinal = 0;
  for (const r of Array.isArray(rows) ? rows : []) if (!isFinalRow(r)) skippedNonFinal += 1;
  for (const g of games) fold(g.phase === 1 ? preseason : regular, g);

  const boundaryApplied = { regular: false, preseason: false };
  if (Number.isInteger(targetSeason)) {
    for (const [name, s] of [["regular", regular], ["preseason", preseason]]) {
      if (s.curSeason != null && targetSeason > s.curSeason) { regress(s); boundaryApplied[name] = true; }
    }
  }

  return {
    params: { ...NBA_ELO_PARAMS },
    throughDateUtc,
    targetSeason,
    boundaryRegressionApplied: boundaryApplied,
    ratings: toObject(regular.ratings),
    counts: Object.fromEntries([...regular.counts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    preseasonRatings: toObject(preseason.ratings),
    preseasonCounts: Object.fromEntries([...preseason.counts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    folded: { regular: regular.folded, preseason: preseason.folded, skippedNonFinal },
    lastFoldedDateUtc: { regular: regular.lastDateUtc, preseason: preseason.lastDateUtc },
    seasonsFolded: { regular: [...regular.seasons].sort(), preseason: [...preseason.seasons].sort() },
  };
}

/** Rating lookup with the honest default + a basis label (never a silent 1500). */
export function ratingFor(built, teamName, { population = "regular" } = {}) {
  const table = population === "preseason" ? built?.preseasonRatings : built?.ratings;
  const counts = population === "preseason" ? built?.preseasonCounts : built?.counts;
  const r = table?.[teamName];
  if (Number.isFinite(r)) return { rating: r, games: counts?.[teamName] ?? 0, basis: population };
  return { rating: DEFAULT_RATING, games: 0, basis: "default-no-history" };
}
