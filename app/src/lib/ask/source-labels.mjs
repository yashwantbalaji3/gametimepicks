/**
 * FRIENDLY NAMES FOR THE TOOLS AN ANSWER USED — the "Used:" line under every Ask answer. The reader sees what was
 * consulted, not how.
 *
 * ⚠ Session 2 (Production): six tools had no entry — getProductRecord, getForecastRecord, getRecentResults,
 * getResultsDay, getPendingResults, getCoverage — so every Results answer read "Used: getResultsDay", a function
 * name in a chat bubble. A test now requires an entry for EVERY tool in the registry.
 */
export const ASK_SOURCE_LABEL = Object.freeze({
  runGameFinder: "Game Finder",
  runPlayerResearchQuery: "Player Research",
  getSeasonExplorer: "Season Explorer",
  getPlayerRecentGames: "Player Research",
  getTeamComparison: "Team Compare",
  getPlayerComparison: "Player Compare",
  getMatchupContext: "Matchup",
  getPublishedForecasts: "GameTime Forecast",
  getParlayCandidates: "Parlay candidates",
  getLiveSlate: "Live",
  searchGameTimeHelp: "GameTime guide",
  resolveEntity: "GameTime Research",
  getGameTimeNow: "GameTime clock",
  calculate: "Calculator",
  getProductRecord: "Results",
  getForecastRecord: "Results",
  getRecentResults: "Results",
  getResultsDay: "Results day",
  getPendingResults: "Results",
  getCoverage: "Coverage",
});
