/**
 * NFL STARTING-QB FALLBACK · the EXPERIMENTAL projection record and its labels (founder P0 2026-11-11 ~17:40Z). PURE.
 *
 * A starter who is not established at his club (tier b: limited individual history; tier d: rookie / contextual
 * fallback) is named on the public board with "experimental projection in research" and no number. His projection is
 * written to data/internal/nfl/qb-fallback/<eventId>.json and is displayed only by a build with
 * GTP_NFL_QB_FALLBACK_PUBLIC=1, under these exact labels. Never "validated" (forward validation pending:
 * docs/NFL_QB_FALLBACK_FORWARD_PREREG_DRAFT.md).
 */
export const QB_FALLBACK_SCHEMA = "gtp.nfl.qb-fallback@1";
export const QB_FALLBACK_LABEL = Object.freeze({
  A_CLUB_HISTORY: "MODEL PROJECTION",
  B_ALL_CLUB_HISTORY: "EXPERIMENTAL MODEL PROJECTION — limited individual history",
  D_CONTEXTUAL_FALLBACK: "EXPERIMENTAL MODEL PROJECTION — rookie/contextual fallback",
});
/* The one accuracy statement each experimental tier may carry (PD 2026-11-11). */
export const QB_FALLBACK_NOTE = Object.freeze({
  B_ALL_CLUB_HISTORY: "Beats the league-average-starter baseline in a walk-forward backtest (paired pinball diff −0.64, 95% CI −1.12 to −0.17, n=479, cluster bootstrap over 143 season-weeks; level 0.931 near the lower bar).",
  D_CONTEXTUAL_FALLBACK: "Tends to project rookies high in historical testing.",
});

/** One experimental starter record (deterministic key order). */
export function qbFallbackEntry({ eventId, team, opponent, starter, tier, source, careerAttempts, market, basis, starterShare = null }) {
  return {
    eventId, team, opponent,
    starter: { playerId: starter.playerId, name: starter.name ?? null },
    starterSource: source ?? null,
    tier,
    label: QB_FALLBACK_LABEL[tier],
    note: QB_FALLBACK_NOTE[tier] ?? null,
    careerAttempts,
    market: "player_pass_yds",
    projection: market,
    basis,
    ...(starterShare ? { starterShare } : {}),
  };
}
