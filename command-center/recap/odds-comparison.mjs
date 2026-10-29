/**
 * MODEL vs SPORTSBOOK LINE for social graphics — the Command Center side of the ONE comparison the website publishes
 * (docs/odds-comparison-contract.md). Pure. It never fetches, prices or compares: it reads a row of the website's public
 * social feed (`/data/social/nba/v1/<date>.json`, contract `gtp-social-nba@1`) and either returns a display view or
 * says why the post must fall back to projection-only.
 *
 * Colour = the site standard (founder, 2026-10-29): the row's `side` — OVER (projection above the one verified line,
 * green), UNDER (below, red), NEUTRAL (equal). `difference` (model − line) is shown signed. It is a model direction,
 * not a pick and not an expected-value claim.
 */
export const ODDS_COMPARISON_CONTRACT = "gtp.cc.odds-comparison@2";
export const ACCEPTED_FEED_CONTRACTS = Object.freeze(["gtp-social-nba@1"]);
/** Social odds graphics stay off until the feed, display rights (D3), API budget and tests are production-ready. */
export const SOCIAL_ODDS_ENABLED = false;
export const BOOK_AVAILABILITY_NOTE = "Sportsbook availability varies by state."; // the website's one wording
export const REFUSAL = Object.freeze({
  GATED: "SOCIAL_ODDS_GATED",
  FEED_UNKNOWN: "FEED_CONTRACT_UNKNOWN",
  NOT_PERMITTED: "DISPLAY_NOT_PERMITTED_ON_SOCIAL",
  NOT_COMPARED: "LINE_NOT_COMPARED",
  OPERATOR: "OPERATOR_NOT_ELIGIBLE",
  AFTER_START: "AFTER_START",
  INCOMPLETE: "COMPARISON_INCOMPLETE",
});
const SIDES = { OVER: "over", UNDER: "under", NEUTRAL: "neutral" };
const num = (x) => typeof x === "number" && Number.isFinite(x);

/**
 * @param {{ feedContract: string, socialDisplayPermitted: boolean, player: {name: string, team: string}, family: string,
 *           projection: number|null, lineComparison?: object|null, eligibleBooks?: string[], now: string,
 *           startUtc?: string|null, enabled?: boolean }} input
 *   socialDisplayPermitted — from the feed's top-level `lineComparisons.displayPermission`, and only true when it
 *   explicitly covers social posts (decision D3 is open: today it doesn't).
 */
export function comparisonView(input) {
  const { feedContract, socialDisplayPermitted = false, player, family, projection, lineComparison: lc = null, eligibleBooks = [], now, startUtc = null, enabled = SOCIAL_ODDS_ENABLED } = input;
  const reasons = [];
  if (!enabled) reasons.push(REFUSAL.GATED);
  if (!ACCEPTED_FEED_CONTRACTS.includes(feedContract)) reasons.push(REFUSAL.FEED_UNKNOWN);
  if (!socialDisplayPermitted) reasons.push(REFUSAL.NOT_PERMITTED);
  if (lc?.status !== "COMPARED") reasons.push(`${REFUSAL.NOT_COMPARED}:${lc?.status ?? "NONE"}${lc?.reason ? `:${lc.reason}` : ""}`);
  else {
    if (!num(lc.line) || !lc.book || !lc.capturedAt || !num(lc.difference) || !SIDES[lc.side]) reasons.push(REFUSAL.INCOMPLETE);
    if (lc.book && !eligibleBooks.includes(lc.book)) reasons.push(REFUSAL.OPERATOR);
  }
  if (startUtc && Date.parse(startUtc) <= Date.parse(now)) reasons.push(REFUSAL.AFTER_START);

  const base = { player: player.name, team: player.team, family, projection: num(projection) ? projection : null };
  if (reasons.length) {
    // projection only: no line, no price, no side — and any graphic that needs the line is held, never improvised
    return { contract: ODDS_COMPARISON_CONTRACT, mode: "projection-only", lineDependentHeld: true, reasons, view: { ...base, style: "neutral" } };
  }
  return {
    contract: ODDS_COMPARISON_CONTRACT, mode: "comparison", lineDependentHeld: false, reasons: [],
    view: {
      ...base,
      line: lc.line, book: lc.book, marketKey: lc.marketKey ?? null,
      overPrice: num(lc.overPrice) ? lc.overPrice : null, underPrice: num(lc.underPrice) ? lc.underPrice : null, // missing = "price unavailable", never 0
      side: lc.side, style: SIDES[lc.side], difference: lc.difference, // copied verbatim from the website
      capturedAt: lc.capturedAt, freshness: lc.freshness ?? null,
      bookNote: BOOK_AVAILABILITY_NOTE,
      disclaimer: "Model direction vs the line — not a pick or an expected-value claim.",
    },
  };
}
