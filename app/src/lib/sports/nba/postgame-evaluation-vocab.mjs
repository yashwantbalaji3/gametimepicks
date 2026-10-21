/**
 * NBA POSTGAME EVALUATION · VOCABULARY — the states, roles and fixed wording shared by the report builder
 * (postgame-evaluation.mjs) and its component (components/nba/postgame-evaluation.tsx).
 *
 * CLIENT-SAFE BY CONSTRUCTION: this file imports nothing. The builder itself is server/CLI-only — it reaches
 * node:crypto through grader-metrics.mjs → experimental-grading-ledger.mjs → forecast-receipt.mjs — so a component
 * imports this file, never the builder (the component test walks the import graph and pins both facts).
 */

export const POSTGAME_EVALUATION_SCHEMA = "nba-postgame-evaluation@1";

/**
 * Below this many graded games no model comparison is made (caller brief, 2026-10-21 — a reporting rule, not a
 * preregistered bar; the prereg §6 winner-market minimum is 300). For founder approval.
 */
export const MIN_COMPARISON_N = 30;

export const ROLE = Object.freeze({ OFFICIAL: "OFFICIAL", SUPPORTING: "SUPPORTING", RESEARCH_ONLY: "RESEARCH_ONLY" });
export const ROLE_LABEL = Object.freeze({
  OFFICIAL: "Official",
  SUPPORTING: "Supporting · research only",
  RESEARCH_ONLY: "Research only",
});

export const GAME_STATE = Object.freeze({
  GRADED: "GRADED",
  HELD: "HELD",
  PENDING_FINAL: "PENDING_FINAL",
  NO_OFFICIAL_FORECAST: "NO_OFFICIAL_FORECAST",
  REFUSED_FROZEN_AFTER_TIP: "REFUSED_FROZEN_AFTER_TIP",
  REFUSED_RECEIPT: "REFUSED_RECEIPT",
  REFUSED_IDENTITY: "REFUSED_IDENTITY",
});
export const MODEL_GAME_STATE = Object.freeze({
  GRADED: "GRADED",
  NO_FORECAST: "NO_FORECAST",
  NOT_GRADED: "NOT_GRADED", // the game itself is held / pending
  FROZEN_AFTER_TIP: "FROZEN_AFTER_TIP",
  NO_FROZEN_TIMESTAMP: "NO_FROZEN_TIMESTAMP",
  RECEIPT_NOT_OK: "RECEIPT_NOT_OK",
  IDENTITY_MISMATCH: "IDENTITY_MISMATCH",
});
export const PLAYER_STATE = Object.freeze({
  GRADED: "GRADED",
  PARTIAL: "PARTIAL",
  PENDING_BOXSCORE: "PENDING_BOXSCORE",
  NOT_APPLICABLE: "NOT_APPLICABLE",
  NO_GRADED_GAMES: "NO_GRADED_GAMES",
});
export const COMPARISON_STATE = Object.freeze({ INSUFFICIENT_SAMPLE: "INSUFFICIENT_SAMPLE", COMPUTED: "COMPUTED" });
export const PROMOTION_STATE = Object.freeze({
  NO_RECORD_COMMITTED: "NO_RECORD_COMMITTED",
  NO_PROMOTIONS_RECORDED: "NO_PROMOTIONS_RECORDED",
  RECORDED: "RECORDED",
  UNRECOGNISED_RECORD: "UNRECOGNISED_RECORD",
});

export const PLAYER_FAMILIES = Object.freeze(["pts", "reb", "ast", "threePm"]);
export const FAMILY_LABEL = Object.freeze({ pts: "Points", reb: "Rebounds", ast: "Assists", threePm: "3-pointers made" });

export const WITHHELD = Object.freeze({
  teamScores: "WITHHELD — the official snapshot carries no team score (founder composition, PR 1149); not graded here",
  margin: "WITHHELD — the official snapshot carries no margin; not graded here",
  total: "WITHHELD — the official snapshot carries no total; not graded here",
});

export const WORDING = Object.freeze({
  direction: "Lower log loss and lower Brier are better.",
  playerDirection: "Player MAE: lower is better. p10–p90 coverage: closer to 0.80 is better (it is a band, not a ranking).",
  noPromotion: "Nothing here promotes or demotes a model; promotion state is read from the committed promotion record.",
  withheldLine: "Team scores, margin and total are withheld from the official forecast and are not graded here.",
});
