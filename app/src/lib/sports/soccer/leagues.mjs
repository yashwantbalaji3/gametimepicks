/**
 * Soccer league registry (P257 · league expansion). ONE place that says which leagues exist, where each
 * league's free data lives, and what stage it is at. Every soccer script takes a league KEY from here —
 * no script hard-codes a league again (the EPL pipeline does, in ~20 files; that is the debt this pays).
 *
 * Stages (a league moves forward only on evidence, never on data arriving):
 *   LIVE         public model-only forecasts (EPL today)
 *   ACCEPTED_V1  cleared every preregistered bar (preregistration-league-expansion-v1.json, v1.2) —
 *                may publish model-only forecasts once its public surface exists
 *   REJECTED_V1  scored once and failed a bar; stays rejected for epl-model-v1-split-poisson. A variant
 *                needs its own preregistration and an unseen season (2026-27, forward).
 *   RESEARCH     data captured; the walk-forward backtest decides
 *   PLANNED      named here, nothing captured yet
 *   HOLD         named so nothing assumes it away — blocked on format support (knockouts, two legs) and data
 *   ARCHIVE      a finished tournament whose published record stays; nothing new is forecast
 *
 * Registry v2 (Soccer V2 · C-1, data only). Every competition also says WHAT IT IS, so shared code can stop
 * assuming "a 20-club August–May league with relegation and no extra time":
 *   kind          club-league | club-cup | national
 *   openfootball  { code, timeZone } for the results source, or null (was a second table in openfootball.mjs,
 *                 which is now derived from this one)
 *   season        { model: "aug-may" | "calendar" | "tournament", fixtures, clubs } — fixtures/clubs are the
 *                 CURRENT format's counts, or null when not established here (never guessed)
 *   format        { relegation, playoffs, knockout, legs, extraTime, neutral } — extraTime:true means a
 *                 90-minute grader must refuse its AET/PEN scores
 *   route         the public page, or null
 *   oddsReceipt   the founder receipt that authorizes paid odds capture for THIS competition, or null
 *   validation    { preregistration, report } evidence paths for the stage, or { modelOwner } where a live
 *                 selector (not this file) decides which model publishes
 *   idScheme      how its PUBLISHED event ids are built — "derived" (clubs + kickoff minute, EPL) or "espn"
 *                 (the ESPN event id). Never renamed; lib/sports/soccer/event-id.mjs reads both (C-2)
 *
 * Sources (all verified reachable 2026-09-11, $0):
 *   espn          site.api.espn.com/apis/site/v2/sports/soccer/<code>/  fixtures, results, per-player stats
 *   results       openfootball football.json (public domain) via openfootball.mjs — see OPENFOOTBALL_LEAGUES
 *   oddsApiKey    The Odds API sport key — PAID; each league needs its own founder receipt before any capture
 */
export const SOCCER_LEAGUES = Object.freeze([
  { key: "epl", name: "Premier League", country: "England", espn: "eng.1", oddsApiKey: "soccer_epl", stage: "LIVE", wave: 0,
    kind: "club-league", idScheme: "derived", openfootball: { code: "en.1", timeZone: "Europe/London" }, season: { model: "aug-may", fixtures: 380, clubs: 20 },
    format: { relegation: true, playoffs: false, knockout: false, legs: 1, extraTime: false, neutral: false }, route: "/epl", oddsReceipt: "docs/receipts/ODDS_AUTHORIZATION_EPL.md",
    validation: { modelOwner: "app/src/lib/sports/epl/match-model.mjs" },
    /* ESPN display name → corpus club name, where they differ (checked against the 2026-27 graded ledger;
       the rest for promoted/relegated clubs). The corpus keeps these names across the openfootball move. */
    aliases: { "AFC Bournemouth": "Bournemouth", "Brighton & Hove Albion": "Brighton", "Coventry City": "Coventry", "Hull City": "Hull",
      "Ipswich Town": "Ipswich", "Leeds United": "Leeds", "Leicester City": "Leicester", "Luton Town": "Luton", "Manchester City": "Man City",
      "Manchester United": "Man United", "Newcastle United": "Newcastle", "Nottingham Forest": "Nott'm Forest", "Tottenham Hotspur": "Tottenham",
      "West Ham United": "West Ham", "Wolverhampton Wanderers": "Wolves" } },
  { key: "laliga", name: "LaLiga", country: "Spain", espn: "esp.1", oddsApiKey: "soccer_spain_la_liga", stage: "REJECTED_V1", wave: 1,
    kind: "club-league", idScheme: "espn", openfootball: { code: "es.1", timeZone: "Europe/Madrid" }, season: { model: "aug-may", fixtures: 380, clubs: 20 },
    format: { relegation: true, playoffs: false, knockout: false, legs: 1, extraTime: false, neutral: false }, route: null, oddsReceipt: null,
    validation: { preregistration: "data/internal/research/soccer/preregistration-league-expansion-v1.json", report: "data/internal/research/soccer/laliga/reports/walk-forward-v1.json" } },
  { key: "serie-a", name: "Serie A", country: "Italy", espn: "ita.1", oddsApiKey: "soccer_italy_serie_a", stage: "REJECTED_V1", wave: 1,
    kind: "club-league", idScheme: "espn", openfootball: { code: "it.1", timeZone: "Europe/Rome" }, season: { model: "aug-may", fixtures: 380, clubs: 20 },
    format: { relegation: true, playoffs: false, knockout: false, legs: 1, extraTime: false, neutral: false }, route: null, oddsReceipt: null,
    validation: { preregistration: "data/internal/research/soccer/preregistration-league-expansion-v1.json", report: "data/internal/research/soccer/serie-a/reports/walk-forward-v1.json" } },
  { key: "bundesliga", name: "Bundesliga", country: "Germany", espn: "ger.1", oddsApiKey: "soccer_germany_bundesliga", stage: "REJECTED_V1", wave: 1,
    kind: "club-league", idScheme: "espn", openfootball: { code: "de.1", timeZone: "Europe/Berlin" }, season: { model: "aug-may", fixtures: 306, clubs: 18 },
    format: { relegation: true, playoffs: false, knockout: false, legs: 1, extraTime: false, neutral: false }, route: null, oddsReceipt: null,
    validation: { preregistration: "data/internal/research/soccer/preregistration-league-expansion-v1.json", report: "data/internal/research/soccer/bundesliga/reports/walk-forward-v1.json" } },
  { key: "ligue-1", name: "Ligue 1", country: "France", espn: "fra.1", oddsApiKey: "soccer_france_ligue_one", stage: "ACCEPTED_V1", wave: 1,
    kind: "club-league", idScheme: "espn", openfootball: { code: "fr.1", timeZone: "Europe/Paris" }, season: { model: "aug-may", fixtures: 306, clubs: 18 },
    format: { relegation: true, playoffs: false, knockout: false, legs: 1, extraTime: false, neutral: false }, route: "/soccer/ligue-1", oddsReceipt: null,
    validation: { preregistration: "data/internal/research/soccer/preregistration-league-expansion-v1.json", report: "data/internal/research/soccer/ligue-1/reports/walk-forward-v1.json" },
    /* ESPN display name → corpus club name, where they differ (checked club by club, 2026-09-11). */
    aliases: { "AJ Auxerre": "Auxerre", "AS Monaco": "Monaco", "Le Havre AC": "Le Havre", "Paris Saint-Germain": "Paris SG", "Stade Rennais": "Rennes" } },
  { key: "championship", name: "Championship", country: "England", espn: "eng.2", oddsApiKey: "soccer_efl_champ", stage: "PLANNED", wave: 2,
    kind: "club-league", idScheme: "espn", openfootball: null, season: { model: "aug-may", fixtures: 552, clubs: 24 },
    format: { relegation: true, playoffs: true, knockout: false, legs: 1, extraTime: false, neutral: false }, route: null, oddsReceipt: null, validation: null },
  { key: "mls", name: "MLS", country: "USA", espn: "usa.1", oddsApiKey: "soccer_usa_mls", stage: "PLANNED", wave: 2,
    kind: "club-league", idScheme: "espn", openfootball: null, season: { model: "calendar", fixtures: null, clubs: null },
    format: { relegation: false, playoffs: true, knockout: true, legs: 1, extraTime: true, neutral: false }, route: null, oddsReceipt: null, validation: null },
  { key: "eredivisie", name: "Eredivisie", country: "Netherlands", espn: "ned.1", oddsApiKey: "soccer_netherlands_eredivisie", stage: "PLANNED", wave: 3,
    kind: "club-league", idScheme: "espn", openfootball: null, season: { model: "aug-may", fixtures: 306, clubs: 18 },
    format: { relegation: true, playoffs: false, knockout: false, legs: 1, extraTime: false, neutral: false }, route: null, oddsReceipt: null, validation: null },
  { key: "primeira", name: "Primeira Liga", country: "Portugal", espn: "por.1", oddsApiKey: "soccer_portugal_primeira_liga", stage: "PLANNED", wave: 3,
    kind: "club-league", idScheme: "espn", openfootball: null, season: { model: "aug-may", fixtures: 306, clubs: 18 },
    format: { relegation: true, playoffs: false, knockout: false, legs: 1, extraTime: false, neutral: false }, route: null, oddsReceipt: null, validation: null },
  /* Named so no shared code assumes them away. Nothing is captured or forecast for these. */
  { key: "ucl", name: "Champions League", country: "Europe", espn: "uefa.champions", oddsApiKey: "soccer_uefa_champs_league", stage: "HOLD", wave: 3,
    kind: "club-cup", idScheme: "espn", openfootball: null, season: { model: "aug-may", fixtures: null, clubs: null },
    format: { relegation: false, playoffs: false, knockout: true, legs: 2, extraTime: true, neutral: false }, route: null, oddsReceipt: null, validation: null },
  { key: "uel", name: "Europa League", country: "Europe", espn: "uefa.europa", oddsApiKey: "soccer_uefa_europa_league", stage: "HOLD", wave: 3,
    kind: "club-cup", idScheme: "espn", openfootball: null, season: { model: "aug-may", fixtures: null, clubs: null },
    format: { relegation: false, playoffs: false, knockout: true, legs: 2, extraTime: true, neutral: false }, route: null, oddsReceipt: null, validation: null },
  { key: "world-cup", name: "World Cup", country: "International", espn: "fifa.world", oddsApiKey: "soccer_fifa_world_cup", stage: "ARCHIVE", wave: 0,
    kind: "national", idScheme: "derived", openfootball: null, season: { model: "tournament", fixtures: 104, clubs: 48 },
    format: { relegation: false, playoffs: false, knockout: true, legs: 1, extraTime: true, neutral: true }, route: "/world-cup", oddsReceipt: null, validation: null },
]);

/** The seasons the operational soccer corpora carry (corpus-openfootball-v1.json). 2022-23 is warm-up (fit only, never scored). */
export const CORPUS_SEASONS = Object.freeze(["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"]);

export function league(key) {
  const l = SOCCER_LEAGUES.find((x) => x.key === key);
  if (!l) throw new Error(`unknown soccer league "${key}" — add it to lib/sports/soccer/leagues.mjs`);
  return l;
}

export const leagueDir = (key) => `data/internal/research/soccer/${league(key).key}`;
