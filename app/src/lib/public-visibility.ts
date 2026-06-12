/**
 * Central public-visibility policy — the single place that decides what a normal user may see.
 * Pure + dependency-light so every surface (today / picks / build / sport pages) shares one
 * source of truth. Internal/research/gated material may exist in artifacts but is filtered here.
 */

export interface VisibilityItem {
  public?: boolean;
  parlayEligible?: boolean;
  bankBuilderEligible?: boolean;
  projectionStatus?: string;
  lineupStatus?: string;
  status?: string;
}
export interface VisibilityCard {
  isPublic?: boolean;
  bankBuilderEligible?: boolean;
  legs?: unknown[];
}

/** A model probability VIEW is public when explicitly flagged public. */
export function isPublicProjection(p: VisibilityItem | null | undefined): boolean {
  return p?.public === true;
}
/** A leg may enter a parlay/Build only when parlay-eligible. */
export function isParlayEligibleLeg(p: VisibilityItem | null | undefined): boolean {
  return p?.parlayEligible === true;
}
/** A suggested card is public when flagged public and has ≥1 leg. */
export function isPublicSuggestedCard(c: VisibilityCard | null | undefined): boolean {
  return !!c && c.isPublic !== false && Array.isArray(c.legs) && c.legs.length > 0;
}
/** Bank Builder may only use cards explicitly flagged bank-builder-eligible. */
export function isBankBuilderCandidate(c: (VisibilityCard & { bankBuilderEligible?: boolean }) | null | undefined): boolean {
  return isPublicSuggestedCard(c) && c?.bankBuilderEligible === true;
}
/** Market status rows render when they carry a status string. */
export function shouldShowMarketStatus(market: { status?: string } | null | undefined): boolean {
  return !!market?.status;
}

const FRIENDLY: Record<string, string> = {
  // June-12 polish: "Pre-lineup" shouted from every card and made the product feel
  // unfinished. Same honest meaning, calmer product vocabulary; the page-level banner
  // (props explorer) carries the shared context once.
  waiting_on_lineups: "Lineups pending",
  pre_lineup_unknown: "Player evidence pending",
  pre_lineup_likely: "Projected starter",
  pre_lineup_public_projection: "Lineup pending",
  pre_lineup_market_view: "Lineup pending",
  confirmed_starter: "Confirmed starter",
  confirmed_sub: "Substitute",
  not_in_lineup: "Not in lineup",
  gated_low_edge: "Edge below card threshold",
  public_projection_no_edge: "Edge below card threshold",
  public_projection_sample_capped: "Building a bigger sample",
  gated_sample_size: "Building a bigger sample",
  gated_market_sanity: "Below our market-sanity bar",
  gated_opponent_strength_missing: "Missing opponent strength",
  gated_missing_features: "Missing model features",
  unavailable_from_provider: "Market unavailable from current provider",
  waiting_on_provider_stats: "Waiting on provider stats",
  waiting_on_odds: "Waiting on odds",
  waiting_on_edge_threshold: "Awaiting an edge",
  parlay_eligible: "Card eligible",
  active: "Card eligible",
  public_projection: "Projection view",
  research_only: "Research only",
};

/** A user-friendly reason a projection/card isn't a suggested pick (never internal jargon). */
export function getPublicGateReason(item: VisibilityItem | null | undefined): string | null {
  if (!item) return null;
  if (item.parlayEligible === true) return null;
  const key = item.lineupStatus && FRIENDLY[item.lineupStatus] ? item.lineupStatus
    : item.projectionStatus ?? item.status;
  return (key && FRIENDLY[key]) || "Not a suggested pick yet";
}

/** Friendly label for any status string (chips). */
export function friendlyStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return FRIENDLY[status] ?? status.replace(/_/g, " ");
}
