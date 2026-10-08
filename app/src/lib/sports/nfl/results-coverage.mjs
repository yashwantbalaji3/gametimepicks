/**
 * WHICH MODEL THE NFL RESULTS GRADE (founder directive 2026-10-08, results integrity). From Week 5 the game pages and
 * Weekly leaders show World Model V2 passing / rushing / receiving yards and receptions. The published player results
 * grade the player board's own pre-kickoff ranges, each under its recorded model and version — from Week 5 those ranges
 * are no longer what the game pages show, which is exactly why this has to be said. World Model V2's projections are kept write-once (data/internal/nfl/world-model-v2/runs/) and are not
 * graded yet, so no existing hit rate describes them. One sentence, shared by every surface that needs it.
 */
export const NFL_RESULTS_COVERAGE_NOTE =
  "Player results published so far grade the player-board model's own pre-kickoff ranges, each under the model and version that made it. From Week 5 the game pages and Weekly leaders show World Model V2's passing, rushing and receiving yards and receptions instead; those projections are frozen before every kickoff but are not graded in these results, so none of these results describe them.";
