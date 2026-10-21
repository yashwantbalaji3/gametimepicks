/**
 * NBA TOP-BOARD ROLES — dependency-free on purpose: the board producers (freeze / grade / report scripts) run under
 * plain node in workflows and must not import official-snapshot.mjs (it reaches .ts files). Founder decision
 * 2026-10-20: "Retain the v1 Top 10 research board, but relabel it clearly as an NBA v1 Challenger — Research Only.
 * Remove any possibility that its numbers appear as official predictions, Top Picks or product recommendations."
 * The family keys equal official-snapshot.mjs NBA_OFFICIAL_FAMILY / NBA_SUPPORTING_FAMILY (pinned by a test).
 */
export const NBA_BOARD_ROLE = Object.freeze({ OFFICIAL: "OFFICIAL", CHALLENGER_RESEARCH_ONLY: "CHALLENGER_RESEARCH_ONLY" });
export const NBA_BOARD_ROLES = Object.freeze({
  "v0.1": Object.freeze({ role: NBA_BOARD_ROLE.OFFICIAL, label: "NBA official experimental projections (v0.1)" }),
  v1: Object.freeze({ role: NBA_BOARD_ROLE.CHALLENGER_RESEARCH_ONLY, label: "NBA v1 Challenger — Research Only", decidedBy: "founder 2026-10-20" }),
});
