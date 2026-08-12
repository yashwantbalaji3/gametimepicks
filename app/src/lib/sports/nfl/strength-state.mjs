/**
 * NFL team-strength state — reproducible, cutoff-versioned, leakage-proof (Program 166 · Release E).
 *
 * EXACTLY the committed baseline's arithmetic (scripts/nfl/evaluate-nfl-baselines.mjs: K=20,
 * home advantage +48, mean 1505, one-third regression to mean at season boundaries, preseason
 * phase-1 games never fit) — promoted from the research script into a pure, importable state
 * builder so the live input-assembly path and the historical evaluation can never disagree about
 * what "team strength" means. This is a BASELINE, not a market claim: its own evaluation receipt
 * is log loss 0.6415 vs coin 0.6931 (P151), and nothing here narrows that honesty.
 *
 * LEAKAGE RULE, structural: the state at cutoff T is a fold over finals with dateUtc < T only.
 * The guard proves shifting the cutoff changes nothing about earlier folds and that the target
 * game itself never contributes to the state used to assess it.
 */

export const NFL_STRENGTH_VERSION = 1;
export const ELO_PARAMS = Object.freeze({ K: 20, HOME_ADVANTAGE: 48, MEAN: 1505, SEASON_REGRESSION: 1 / 3 });

const isFinal = (r) => /^STATUS_FINAL/.test(r?.statusRaw ?? "");

/**
 * Fold finals chronologically into an Elo state. Rows may come from the research corpus
 * (home/away as names, ftHome/ftAway, seasonType or phase) and/or current results captures —
 * the caller supplies one merged, deduplicated list; this function sorts, filters, and folds.
 */
export function strengthStateAt({ rows, cutoffIso }) {
  const cutoff = Date.parse(cutoffIso ?? "");
  if (!Number.isFinite(cutoff)) throw new Error("strengthStateAt: cutoffIso required");
  const { K, HOME_ADVANTAGE, MEAN, SEASON_REGRESSION } = ELO_PARAMS;
  const elo = new Map();
  const get = (t) => elo.get(t) ?? MEAN;

  const eligible = (rows ?? [])
    .filter((r) => isFinal(r) && Number.isInteger(r.ftHome) && Number.isInteger(r.ftAway) && r.ftHome !== r.ftAway)
    .filter((r) => (r.seasonType ?? r.phase) !== 1) // preseason never fits — the baseline's rule
    .filter((r) => Number.isFinite(Date.parse(r.dateUtc ?? "")) && Date.parse(r.dateUtc) < cutoff)
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));

  let lastSeason = null;
  let folded = 0;
  for (const g of eligible) {
    const season = g.season ?? new Date(Date.parse(g.dateUtc)).getUTCFullYear();
    if (lastSeason !== null && season !== lastSeason) {
      for (const [t, r] of elo) elo.set(t, r + (MEAN - r) * SEASON_REGRESSION);
    }
    lastSeason = season;
    const home = typeof g.home === "string" ? g.home : g.home?.abbr ?? g.home?.name;
    const away = typeof g.away === "string" ? g.away : g.away?.abbr ?? g.away?.name;
    if (!home || !away) continue;
    const exp = 1 / (1 + 10 ** (-((get(home) + HOME_ADVANTAGE - get(away)) / 400)));
    const score = g.ftHome > g.ftAway ? 1 : 0;
    elo.set(home, get(home) + K * (score - exp));
    elo.set(away, get(away) + K * ((1 - score) - (1 - exp)));
    folded += 1;
  }
  return {
    version: NFL_STRENGTH_VERSION,
    params: ELO_PARAMS,
    cutoffIso,
    gamesFolded: folded,
    ratings: Object.fromEntries([...elo.entries()].sort()),
    ratingFor: (team) => elo.get(team) ?? MEAN,
    winProbability: (home, away) => 1 / (1 + 10 ** (-((get(home) + HOME_ADVANTAGE - get(away)) / 400))),
  };
}
