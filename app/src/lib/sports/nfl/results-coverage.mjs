/**
 * WHICH MODEL THE NFL RESULTS GRADE (founder directive 2026-10-08, results integrity). From Week 5 the game pages and
 * Weekly leaders show World Model V2 passing / rushing / receiving yards and receptions. The published player results
 * grade the forecasts that were on the page at the time — the player board's ranges, each under its own recorded model
 * and version. World Model V2's projections are kept write-once (data/internal/nfl/world-model-v2/runs/) and are not
 * graded yet, so no existing hit rate describes them. One sentence, shared by every surface that needs it.
 */
export const NFL_RESULTS_COVERAGE_NOTE =
  "Player results published so far grade the player-board ranges that were on each page before kickoff, under the model that made them. World Model V2's passing, rushing and receiving yards and receptions (shown from Week 5) are recorded before every kickoff but are not graded yet, so none of these results describe them.";
