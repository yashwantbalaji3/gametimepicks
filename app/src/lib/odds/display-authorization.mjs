/**
 * SPORTSBOOK-LINE DISPLAY AUTHORIZATION — the ONE record that says whether captured sportsbook lines and prices may be
 * shown on the site or in the social feed (founder decision 2026-10-22: prices are not committed to the public
 * repository until provider display rights are confirmed; display decision "D3" pending). Pure, import-free, server-only
 * by convention (nothing under lib/odds/ may reach a client bundle: prop-line-switch-off.test.mjs).
 *
 * NFL (2026-10-29): the same record, the same fields, all OFF — NFL_LINE_DISPLAY (lib/sports/nfl/line-display.mjs) is
 * derived from it exactly as NBA's is, and the NFL build-time reader (lib/sports/nfl/public-line-records.mjs) re-checks it.
 *
 * Every NBA line surface derives from this record: NBA_LINE_DISPLAY (lib/sports/nba/line-board.mjs) is computed from it,
 * the exporter (scripts/nba/publish-nba-line-board.mjs) asserts "site" before writing, the build-time reader
 * (lib/sports/nba/public-line-records.mjs) re-checks it before reading, and the social feed asserts "social" (and, for
 * prices and books, "socialPrices") separately. There is no second switch.
 *
 * PROVIDER TERMS (The Odds API, the-odds-api.com/terms-and-conditions.html, updated 2026-08-31): displaying the data "in
 * a UI, website…" is permitted; redistributing it "as a standalone data product" — explicitly including "your own API,
 * data feed, downloadable files" — is not. Hence:
 *   site          lines and prices rendered into page HTML (never as a downloadable JSON file);
 *   social        the social feed (/data/social/nba/v1/*.json — itself a public data feed) may carry side, difference,
 *                 line and capture time for COMPARED rows;
 *   socialPrices  prices and book names in that feed too — a SEPARATE switch (socialFeedPrices) that additionally needs
 *                 the provider's WRITTEN confirmation that the feed is permitted (socialFeedPricesConfirmationRef).
 *
 * HOW IT IS TURNED ON (docs/nba/NBA_LINES_RUNBOOK.md): a reviewed commit that fills the sport's entry —
 *   siteDisplay / socialDisplay   true for each surface the founder approved (independently);
 *   providerTermsRef              REQUIRED: the committed document recording the provider's display terms and the clause
 *                                 above (repo-relative path);
 *   attribution                   OPTIONAL (the provider does not require attribution); when present every surface prints it;
 *   approvedBy / approvedAt       REQUIRED: who approved (the founder) and when (YYYY-MM-DD);
 *   socialFeedPrices              true only with socialFeedPricesConfirmationRef naming the provider's written confirmation.
 * A malformed record (non-boolean switch, a blank required field, a bad date) refuses — a half-filled record is a
 * mistake, never a permission.
 */

export const DISPLAY_AUTHORIZATION_RULE = "odds-display-authorization@1";

/** Surface → the record field that switches it. Unknown surfaces refuse. */
export const DISPLAY_SURFACE_FIELD = Object.freeze({ site: "siteDisplay", social: "socialDisplay", socialPrices: "socialFeedPrices" });

/** Provenance fields every authorized record must carry (non-blank strings; approvedAt a real YYYY-MM-DD date). */
export const DISPLAY_AUTHORIZATION_REQUIRED = Object.freeze(["providerTermsRef", "approvedBy", "approvedAt"]);

/** The reader-facing sentence while a sport's lines are not authorized (the social feed prints it verbatim). */
export const NOT_AUTHORIZED_REASON = Object.freeze({
  nba: "Provider display terms for NBA lines are not confirmed for this site (founder decision pending).",
  nfl: "Provider display terms for NFL lines are not confirmed for this site (founder decision pending).",
});

/**
 * THE RECORD. Committed state: nothing is authorized. Changing any value here is the founder's display decision and goes
 * through review with the runbook's checklist; a guard fails CI if a line artifact is committed while "site" is off.
 */
export const DISPLAY_AUTHORIZATION = Object.freeze({
  nba: Object.freeze({
    siteDisplay: false,
    socialDisplay: false,
    // The committed record of the provider's display terms. The Odds API terms (updated 2026-08-31) permit display in a
    // UI or website and forbid redistribution "as a standalone data product" (API, data feed, downloadable files).
    providerTermsRef: null,
    attribution: null, // optional: the provider does not require attribution
    approvedBy: null,
    approvedAt: null,
    // Prices and book names in the public social JSON feed: a data feed under the clause above. Needs WRITTEN provider
    // confirmation, referenced here, before it may be true.
    socialFeedPrices: false,
    socialFeedPricesConfirmationRef: null,
  }),
  // NFL player props (week 8 private capture 2026-10-29): same fields, same meaning, nothing authorized. Turning NFL on
  // is its own reviewed decision — an NBA approval never carries over.
  nfl: Object.freeze({
    siteDisplay: false,
    socialDisplay: false,
    providerTermsRef: null,
    attribution: null,
    approvedBy: null,
    approvedAt: null,
    socialFeedPrices: false,
    socialFeedPricesConfirmationRef: null,
  }),
});

const blank = (v) => typeof v !== "string" || v.trim() === "";
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/**
 * The verdict for one sport and surface. Never throws.
 * @param {string} sport    e.g. "nba"
 * @param {string} surface  "site" | "social" | "socialPrices"
 * @param {Record<string, any>} [record] the authorization record (tests inject one; default: the committed record)
 * @returns {{ ok: boolean, sport: string, surface: string, reasons: string[], attribution: string|null, providerTermsRef: string|null, approvedBy: string|null, approvedAt: string|null }}
 */
export function displayAuthorization(sport, surface, record = DISPLAY_AUTHORIZATION) {
  const reasons = [];
  const e = record && Object.prototype.hasOwnProperty.call(record, sport) ? record[sport] : null;
  const field = Object.prototype.hasOwnProperty.call(DISPLAY_SURFACE_FIELD, surface) ? DISPLAY_SURFACE_FIELD[surface] : null;
  if (!field) reasons.push(`unknown display surface ${JSON.stringify(surface)} (site | social | socialPrices)`);
  if (!e || typeof e !== "object") reasons.push(`no display authorization record for ${JSON.stringify(sport)}`);
  else {
    for (const f of Object.values(DISPLAY_SURFACE_FIELD)) if (typeof e[f] !== "boolean") reasons.push(`${f} must be true or false (got ${JSON.stringify(e[f] ?? null)})`);
    if (field && e[field] !== true) reasons.push(`${field} is not true: ${NOT_AUTHORIZED_REASON[sport] ?? "display is not authorized"}`);
    // Prices in the social feed ride on the social surface and on the provider's written confirmation.
    if (surface === "socialPrices") {
      if (e.socialDisplay !== true) reasons.push("socialDisplay is not true (feed prices need the social surface first)");
      if (blank(e.socialFeedPricesConfirmationRef)) reasons.push("socialFeedPricesConfirmationRef is missing (written provider confirmation that a price feed is permitted)");
    }
    for (const f of DISPLAY_AUTHORIZATION_REQUIRED) if (blank(e[f])) reasons.push(`${f} is missing`);
    if (!blank(e.approvedAt) && !isDate(e.approvedAt)) reasons.push(`approvedAt must be a YYYY-MM-DD date (got ${JSON.stringify(e.approvedAt)})`);
    if (e.attribution != null && blank(e.attribution)) reasons.push("attribution, when present, must be a non-blank sentence");
  }
  const ok = reasons.length === 0;
  return {
    ok, sport, surface, reasons,
    attribution: ok ? e.attribution ?? null : null, providerTermsRef: ok ? e.providerTermsRef : null,
    approvedBy: ok ? e.approvedBy : null, approvedAt: ok ? e.approvedAt : null,
  };
}

export class DisplayNotAuthorizedError extends Error {
  constructor(verdict) {
    super(`REFUSED: ${verdict.sport} lines are not authorized for the ${verdict.surface} surface:\n  - ${verdict.reasons.join("\n  - ")}`);
    this.name = "DisplayNotAuthorizedError";
    this.verdict = verdict;
  }
}

/**
 * Throws DisplayNotAuthorizedError unless the sport's record is complete and the surface's switch is true. Returns the
 * (ok) verdict, which carries the attribution (possibly null) and terms reference.
 */
export function assertDisplayAuthorized(sport, surface, record = DISPLAY_AUTHORIZATION) {
  const v = displayAuthorization(sport, surface, record);
  if (!v.ok) throw new DisplayNotAuthorizedError(v);
  return v;
}
