/**
 * Soccer league registry (P257 · league expansion). ONE place that says which leagues exist, where each
 * league's free data lives, and what stage it is at. Every soccer script takes a league KEY from here —
 * no script hard-codes a league again (the EPL pipeline does, in ~20 files; that is the debt this pays).
 *
 * Stages (a league moves forward only on evidence, never on data arriving):
 *   LIVE      public model-only forecasts (EPL today)
 *   RESEARCH  data captured; the walk-forward backtest decides — see the league preregistration
 *   PLANNED   named here, nothing captured yet
 *
 * Sources (all verified reachable 2026-09-11, $0):
 *   espn          site.api.espn.com/apis/site/v2/sports/soccer/<code>/  fixtures, results, per-player stats
 *   footballData  football-data.co.uk/mmz4281/<season>/<code>.csv      results + closing odds (Europe)
 *   footballDataExtra  football-data.co.uk/new/<code>.csv               results + Pinnacle closing (Americas/Asia)
 *   oddsApiKey    The Odds API sport key — PAID; each league needs its own founder receipt before any capture
 */
export const SOCCER_LEAGUES = Object.freeze([
  { key: "epl", name: "Premier League", country: "England", espn: "eng.1", footballData: "E0", oddsApiKey: "soccer_epl", stage: "LIVE", wave: 0 },
  { key: "laliga", name: "LaLiga", country: "Spain", espn: "esp.1", footballData: "SP1", oddsApiKey: "soccer_spain_la_liga", stage: "RESEARCH", wave: 1 },
  { key: "serie-a", name: "Serie A", country: "Italy", espn: "ita.1", footballData: "I1", oddsApiKey: "soccer_italy_serie_a", stage: "RESEARCH", wave: 1 },
  { key: "bundesliga", name: "Bundesliga", country: "Germany", espn: "ger.1", footballData: "D1", oddsApiKey: "soccer_germany_bundesliga", stage: "RESEARCH", wave: 1 },
  { key: "ligue-1", name: "Ligue 1", country: "France", espn: "fra.1", footballData: "F1", oddsApiKey: "soccer_france_ligue_one", stage: "RESEARCH", wave: 1 },
  { key: "championship", name: "Championship", country: "England", espn: "eng.2", footballData: "E1", oddsApiKey: "soccer_efl_champ", stage: "PLANNED", wave: 2 },
  { key: "mls", name: "MLS", country: "USA", espn: "usa.1", footballDataExtra: "USA", oddsApiKey: "soccer_usa_mls", stage: "PLANNED", wave: 2 },
  { key: "eredivisie", name: "Eredivisie", country: "Netherlands", espn: "ned.1", footballData: "N1", oddsApiKey: "soccer_netherlands_eredivisie", stage: "PLANNED", wave: 3 },
  { key: "primeira", name: "Primeira Liga", country: "Portugal", espn: "por.1", footballData: "P1", oddsApiKey: "soccer_portugal_primeira_liga", stage: "PLANNED", wave: 3 },
]);

/** football-data.co.uk season codes → our season labels. 2022-23 is warm-up (fit only, never scored). */
export const FOOTBALL_DATA_SEASONS = Object.freeze({ "2223": "2022-23", "2324": "2023-24", "2425": "2024-25", "2526": "2025-26", "2627": "2026-27" });

export function league(key) {
  const l = SOCCER_LEAGUES.find((x) => x.key === key);
  if (!l) throw new Error(`unknown soccer league "${key}" — add it to lib/sports/soccer/leagues.mjs`);
  return l;
}

export const leagueDir = (key) => `data/internal/research/soccer/${league(key).key}`;
