/**
 * The NFL game page's win-chance text (components/nfl/forecast/game-hero.tsx), shared so every surface that prints an
 * official NFL win chance (the Parlay Lab's Level A legs) prints exactly what the game page prints.
 */
export const nflWinPct = (p) => `${(p * 100).toFixed(1)}%`;
export const nflWinChanceText = (p) => `${nflWinPct(p)} to win`;
/** The source label the game page names its numbers by (forecast-view.mjs SOURCES.record.label). */
export const NFL_FORECAST_LABEL = "Game Time Forecast";
