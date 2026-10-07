/**
 * PE-1 ranking-eligibility reasons and their reader text. Kept free of node imports so the client-side
 * ranked list can explain an empty board with the same words the server used to withhold it.
 */
export type IneligibleReason =
  | "STATUS_UNREADABLE"     // registry or scorecard missing, unparseable or stale
  | "UFC_EXPERIMENTAL"      // Q6: UFC is never product-eligible
  | "UNRESOLVED_FAMILY"     // the registry does not name this family
  | "DEMOTED"               // DEMOTED_TO_MARKET_CONTEXT
  | "NOT_PUBLIC_ELIGIBLE"   // publicEligible false (experimental, settlement-blocked, coming soon …)
  | "MARKET_BASIS"          // K4: the probability is market-implied/anchored, so it is market context, not a model pick
  | "PAUSED";               // live record BREACHED on the model-health scorecard

export const INELIGIBLE_TEXT: Record<IneligibleReason, string> = {
  STATUS_UNREADABLE: "the market-status registry or model-health scorecard could not be read, so nothing is ranked",
  UFC_EXPERIMENTAL: "UFC forecasts are experimental and never ranked as picks",
  UNRESOLVED_FAMILY: "the market-status registry does not list this market",
  DEMOTED: "demoted to market context: the model has not out-predicted the sportsbook price",
  NOT_PUBLIC_ELIGIBLE: "not publicly eligible yet (experimental or not yet settlement-proven)",
  MARKET_BASIS: "the probability comes from sportsbook prices, so it is market context rather than a model pick",
  PAUSED: "paused: its live record is below a coin flip",
};
