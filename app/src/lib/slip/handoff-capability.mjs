/**
 * SMART BETSLIP · SPORTSBOOK HANDOFF CAPABILITY — the ONE place that says what GameTimePicks can do to move a slip to
 * a sportsbook. Pure data + two functions. Source of every row: docs/nba/SPORTSBOOK_HANDOFF_CAPABILITY_MATRIX_2026-10-21.md.
 *
 * THE ANSWER TODAY IS MANUAL_ENTRY FOR EVERY OPERATOR.
 *   FULL_PREFILL   a multi-leg prefilled betslip, documented BY THE OPERATOR and verified end to end. No operator
 *                  publishes one; no public document (operator or aggregator) describes a working multi-leg prefill.
 *   PARTIAL_LINK   a documented operator link to a market or a single-leg prefill. Aggregators (The Odds API
 *                  includeLinks, SharpAPI, OpticOdds) describe per-leg links for some books, but no operator documents
 *                  the format, and none has been verified end to end here — so none counts.
 *   MANUAL_ENTRY   the reader enters the legs themselves, using the copyable leg-by-leg summary (odds-comparison.mjs).
 * A capability is never inferred from a URL seen in the wild: "Do not invent a prefilled-betslip URL format".
 *
 * LINKS ARE OFF, TWICE.
 *   1. The Terms of Use say the Site does not "link to or partner with any sportsbook" (lib/legal/texts.mjs), and
 *      Ask refuses sportsbook links (lib/ask/contract.mjs ASK_LINK_PATTERNS). `TERMS_PERMIT_SPORTSBOOK_LINKS` is a
 *      constant false that only a founder/legal Terms change may flip, in the same commit as that change.
 *   2. `NEXT_PUBLIC_SPORTSBOOK_HANDOFF_LINKS` must be exactly "1" — default OFF.
 *   Even with both, `handoffLinks` emits a link only from a VERIFIED operator template, and this file holds none.
 *   There is no URL string anywhere in this module by design (a test scans for one).
 */
import { ELIGIBLE_OPERATOR_KEYS } from "../sports/odds/eligible-operators.mjs";

export const HANDOFF_CAPABILITY_VERSION = "sportsbook-handoff-capability@1";
export const HANDOFF = Object.freeze({ FULL_PREFILL: "FULL_PREFILL", PARTIAL_LINK: "PARTIAL_LINK", MANUAL_ENTRY: "MANUAL_ENTRY" });
export const HANDOFF_LABEL = Object.freeze({
  FULL_PREFILL: "Opens the sportsbook with every leg on the slip",
  PARTIAL_LINK: "Opens the sportsbook market; add each leg yourself",
  MANUAL_ENTRY: "Enter these legs yourself at the sportsbook",
});
export const CLAIM = Object.freeze({ VERIFIED: "VERIFIED", UNVERIFIED: "UNVERIFIED" });
export const MATRIX_DOC = "docs/nba/SPORTSBOOK_HANDOFF_CAPABILITY_MATRIX_2026-10-21.md";

/** Legal gate. Flip ONLY with a founder/legal Terms change in the same commit. */
export const TERMS_PERMIT_SPORTSBOOK_LINKS = false;
export const HANDOFF_LINKS_FLAG = "NEXT_PUBLIC_SPORTSBOOK_HANDOFF_LINKS";

const U = (note) => Object.freeze({ status: CLAIM.UNVERIFIED, note });

/**
 * Per operator (provider key). `operatorTemplate` is where a VERIFIED, operator-documented, end-to-end-tested link
 * template would live; it is null for every row. Geo facts are summarised; the matrix doc carries the citations.
 */
export const CAPABILITY_MATRIX = Object.freeze({
  draftkings: Object.freeze({ title: "DraftKings", marketDeepLink: U("aggregator docs only (SharpAPI); no DraftKings-published format"), singleLegPrefill: U("aggregator says 'preselects'; no format published by DraftKings"), multiLegPrefill: U("no document found"), affiliate: U("official affiliate page not reachable (403)"), geo: Object.freeze({ status: CLAIM.VERIFIED, note: "state-by-state; must be physically located in a legal state (DK Network, 2026-06-17)" }), operatorTemplate: null }),
  fanduel: Object.freeze({ title: "FanDuel", marketDeepLink: U("example on The Odds API release notes only; not FanDuel-documented"), singleLegPrefill: U("a single-leg link example appears in The Odds API release notes; not FanDuel-documented, not verified"), multiLegPrefill: U("third-party product claims only"), affiliate: U("partner site unreachable"), geo: Object.freeze({ status: CLAIM.VERIFIED, note: "21+ (18+ DC, WY) and present in select states (FanDuel promo terms)" }), operatorTemplate: null }),
  betmgm: Object.freeze({ title: "BetMGM", marketDeepLink: U("aggregator docs only; state-specific"), singleLegPrefill: U("aggregator docs only"), multiLegPrefill: U("no document found"), affiliate: Object.freeze({ status: CLAIM.VERIFIED, note: "a BetMGM Partners programme exists; it says nothing about deep links" }), geo: Object.freeze({ status: CLAIM.VERIFIED, note: "listed states only; must be located in one (BetMGM site)" }), operatorTemplate: null }),
  williamhill_us: Object.freeze({ title: "Caesars", marketDeepLink: U("aggregator docs only; state-specific"), singleLegPrefill: U("a single-leg link example appears in OpticOdds docs; not Caesars-documented"), multiLegPrefill: U("no document found"), affiliate: U("no official page found"), geo: Object.freeze({ status: CLAIM.VERIFIED, note: "jurisdiction selector; 21+ (Caesars site)" }), operatorTemplate: null }),
  caesars: Object.freeze({ title: "Caesars", marketDeepLink: U("same operator as williamhill_us"), singleLegPrefill: U("same operator as williamhill_us"), multiLegPrefill: U("no document found"), affiliate: U("no official page found"), geo: Object.freeze({ status: CLAIM.VERIFIED, note: "jurisdiction selector; 21+" }), operatorTemplate: null }),
  betrivers: Object.freeze({ title: "BetRivers", marketDeepLink: U("aggregator docs only; state-specific"), singleLegPrefill: U("aggregator docs only"), multiLegPrefill: U("no document found"), affiliate: U("no official page found"), geo: Object.freeze({ status: CLAIM.VERIFIED, note: "state selector on the BetRivers site" }), operatorTemplate: null }),
  fanatics: Object.freeze({ title: "Fanatics", marketDeepLink: U("aggregator lists no deep link"), singleLegPrefill: U("aggregator lists not supported"), multiLegPrefill: U("no document found"), affiliate: U("no official page found"), geo: Object.freeze({ status: CLAIM.VERIFIED, note: "23 states plus DC (Fanatics investor release, 2026-09-02)" }), operatorTemplate: null }),
  espnbet: Object.freeze({ title: "ESPN BET", marketDeepLink: U("aggregator lists no deep link; brand now theScore Bet"), singleLegPrefill: U("aggregator lists not supported"), multiLegPrefill: U("no document found"), affiliate: U("no official page found"), geo: U("official pages not reachable (403)"), operatorTemplate: null }),
  betparx: Object.freeze({ title: "betPARX", marketDeepLink: U("aggregator docs only"), singleLegPrefill: U("aggregator docs only"), multiLegPrefill: U("no document found"), affiliate: U("'Work With Us' leads nowhere"), geo: Object.freeze({ status: CLAIM.VERIFIED, note: "names MD, MI, NJ, PA; 21+ (betPARX site) — live status per state unverified" }), operatorTemplate: null }),
});

/** The capability for one operator, derived ONLY from the matrix. Unknown or ineligible operators are MANUAL_ENTRY. */
export function handoffFor(operatorKey) {
  const row = CAPABILITY_MATRIX[String(operatorKey ?? "").toLowerCase()] ?? null;
  const verifiedTemplate = row?.operatorTemplate != null;
  const capability = verifiedTemplate && row.multiLegPrefill.status === CLAIM.VERIFIED ? HANDOFF.FULL_PREFILL
    : verifiedTemplate && (row.singleLegPrefill.status === CLAIM.VERIFIED || row.marketDeepLink.status === CLAIM.VERIFIED) ? HANDOFF.PARTIAL_LINK
    : HANDOFF.MANUAL_ENTRY;
  return {
    operator: operatorKey ?? null,
    capability,
    label: HANDOFF_LABEL[capability],
    reason: row ? "No operator-documented, end-to-end-verified betslip link exists for this sportsbook." : "This sportsbook is not in the capability matrix.",
    source: MATRIX_DOC,
  };
}

/** Are outbound sportsbook links allowed at all? Both gates; the legal one is a constant false. */
export function handoffLinksEnabled(env = {}) {
  return TERMS_PERMIT_SPORTSBOOK_LINKS === true && env?.[HANDOFF_LINKS_FLAG] === "1";
}

/**
 * Links for an operator's matched legs. Returns no link unless BOTH gates are open AND the operator has a verified
 * template — and no operator has one. The reason says which gate closed it.
 */
export function handoffLinks(operatorKey, _legs, { env = {} } = {}) {
  if (!TERMS_PERMIT_SPORTSBOOK_LINKS) return { links: [], reason: "TERMS_DO_NOT_PERMIT_SPORTSBOOK_LINKS" };
  if (!handoffLinksEnabled(env)) return { links: [], reason: "FLAG_OFF" };
  const row = CAPABILITY_MATRIX[String(operatorKey ?? "").toLowerCase()];
  if (!row?.operatorTemplate) return { links: [], reason: "NO_VERIFIED_TEMPLATE" };
  return { links: [], reason: "NO_VERIFIED_TEMPLATE" };
}

/** Every eligible operator has a matrix row (a new allowlisted book must get one before it can appear). */
export const MATRIX_COVERS_ALLOWLIST = ELIGIBLE_OPERATOR_KEYS.every((k) => Object.prototype.hasOwnProperty.call(CAPABILITY_MATRIX, k));
