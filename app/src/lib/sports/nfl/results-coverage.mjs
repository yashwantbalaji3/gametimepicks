/**
 * WHICH MODEL THE NFL RESULTS GRADE (founder directive 2026-10-08, results integrity; founder decision 2026-10-20,
 * prediction consistency). The published player results grade the player board's own pre-kickoff projections, each
 * under its recorded model and version — and since 2026-10-20 those are again exactly the projections the game pages
 * and Weekly leaders show (the official player board, via the official forecast snapshot). World Model V2 is shown only
 * as a labelled supporting simulation; its runs are kept write-once (data/internal/nfl/world-model-v2/runs/) and are
 * not graded, so no existing hit rate describes them. One sentence, shared by every surface that needs it.
 */
export const NFL_RESULTS_COVERAGE_NOTE =
  "Player results grade the official player board's own pre-kickoff projections, each under the model and version that made it — the same projections the game pages and Weekly leaders show. World Model V2 appears only as a labelled supporting simulation; its numbers are not graded in these results, so none of these results describe them.";
