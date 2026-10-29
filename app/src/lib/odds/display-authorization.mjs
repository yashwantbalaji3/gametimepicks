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
 *
 * DIRECTION QUALIFICATION (founder 2026-10-29) — a captured line does not make a direction publishable. Each sport entry
 * carries `directionQualified: { <family>: { qualified, evidence, approvedBy, approvedAt } }`. A family's comparison may
 * show OVER / UNDER / NEUTRAL publicly ONLY when the surface is authorized (above) AND that family's entry is complete
 * and `qualified: true` (directionAuthorization / publicDirectionGate below). Otherwise the shared view
 * (lib/odds/prop-line-view.mjs) shows the state "Comparison not shown": projection and line visible, no badge, no
 * colour, no difference. Private diagnostics (evidence scripts, coverage reports) still compute every direction.
 * Committed state: EVERY family `qualified: false`. Qualifying a family is a founder decision through review; the
 * recommended (unapproved) criterion is in docs/nba/NBA_LINES_RUNBOOK.md "Direction qualification". A family missing
 * from the record is unqualified; a malformed entry (non-boolean, blank evidence/approver, bad date) is unqualified.
 */

export const DISPLAY_AUTHORIZATION_RULE = "odds-display-authorization@1";

/** A family entry that is NOT qualified (the committed state of every family). `evidence` records why. */
function unqualified(evidence) {
  return Object.freeze({ qualified: false, evidence, approvedBy: null, approvedAt: null });
}

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
    // Which statistics may show a public direction. All unqualified (see the header). Evidence: NBA v0.1 graded official
    // above-median shares, 54 games / 910 rows (founder message 2026-10-29); recommended gate [0.45, 0.55] with n ≥ 300.
    directionQualified: Object.freeze({
      pts: unqualified("v0.1 graded official above-median share 0.524 (54 games, 910 rows; 2026-10-29). Inside the recommended [0.45, 0.55] band; per-family n ≥ 300 to be confirmed. Awaiting founder approval."),
      reb: unqualified("v0.1 graded official above-median share 0.545 (54 games, 910 rows; 2026-10-29). Inside the recommended [0.45, 0.55] band; per-family n ≥ 300 to be confirmed. Awaiting founder approval."),
      ast: unqualified("v0.1 graded official above-median share 0.509 (54 games, 910 rows; 2026-10-29). Inside the recommended [0.45, 0.55] band; per-family n ≥ 300 to be confirmed. Awaiting founder approval."),
      threePm: unqualified("v0.1 graded official above-median share 0.438 (54 games, 910 rows; 2026-10-29). Below the recommended [0.45, 0.55] band: the median runs high. Fails."),
      pra: unqualified("v0.1 graded official above-median share 0.546 (54 games, 910 rows; 2026-10-29). Inside the recommended [0.45, 0.55] band; per-family n ≥ 300 to be confirmed. Awaiting founder approval."),
      ptsReb: unqualified("v0.1 graded official above-median share 0.540 (54 games, 910 rows; 2026-10-29). Inside the recommended [0.45, 0.55] band; per-family n ≥ 300 to be confirmed. Awaiting founder approval."),
      ptsAst: unqualified("v0.1 graded official above-median share 0.533 (54 games, 910 rows; 2026-10-29). Inside the recommended [0.45, 0.55] band; per-family n ≥ 300 to be confirmed. Awaiting founder approval."),
    }),
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
    // Over/under families only (anytime touchdown is a yes/no market and never carries a direction). All unqualified.
    directionQualified: Object.freeze({
      receptions: unqualified("Official over-median share 0.42–0.45 historically (the median runs slightly high). Borderline below the recommended [0.45, 0.55] band. Fails."),
      reception_yds: unqualified("Published v1: actuals beat the median 56.6% historically (interval level 0.845, runs low); week-8 lines: model median/line 0.80 (median below line 95/112) while mean/line 1.04 — genuine median bias plus skew. Fails; must stay withheld."),
      pass_yds: unqualified("Not an official forecast in week 8 (ESTIMATE): never compared publicly."),
      rush_yds: unqualified("Not an official forecast in week 8 (ESTIMATE): never compared publicly."),
    }),
  }),
});

const blank = (v) => typeof v !== "string" || v.trim() === "";
const isDate = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`); // an impossible month (2099-13-01) is NaN: never throw, refuse
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
};

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

/**
 * May `family`'s OVER / UNDER / NEUTRAL be shown on `surface` for `sport`? Only when the surface is authorized
 * (displayAuthorization) AND the family's directionQualified entry is complete and `qualified: true`. Never throws.
 * @param {string} sport
 * @param {string} family    the sport adapter's family key (NBA "pts", NFL "receptions", …)
 * @param {string} [surface] "site" (default) | "social"
 * @param {Record<string, any>} [record]
 * @returns {{ ok: boolean, sport: string, family: string, surface: string, reasons: string[], evidence: string|null }}
 */
export function directionAuthorization(sport, family, surface = "site", record = DISPLAY_AUTHORIZATION) {
  const reasons = [];
  const d = displayAuthorization(sport, surface, record);
  if (!d.ok) reasons.push(...d.reasons);
  const e = record && Object.prototype.hasOwnProperty.call(record, sport) ? record[sport] : null;
  const q = e?.directionQualified && typeof e.directionQualified === "object" && Object.prototype.hasOwnProperty.call(e.directionQualified, family)
    ? e.directionQualified[family] : null;
  if (!q || typeof q !== "object") reasons.push(`no direction qualification entry for ${sport}/${JSON.stringify(family)} (unqualified)`);
  else {
    if (typeof q.qualified !== "boolean") reasons.push(`directionQualified.${family}.qualified must be true or false`);
    else if (q.qualified !== true) reasons.push(`directionQualified.${family} is not qualified: its forecast has not met the calibration standard`);
    if (blank(q.evidence)) reasons.push(`directionQualified.${family}.evidence is missing`);
    if (q.qualified === true) {
      if (blank(q.approvedBy)) reasons.push(`directionQualified.${family}.approvedBy is missing`);
      if (!isDate(q.approvedAt)) reasons.push(`directionQualified.${family}.approvedAt must be a YYYY-MM-DD date`);
    }
  }
  return { ok: reasons.length === 0, sport, family, surface, reasons, evidence: q && !blank(q.evidence) ? q.evidence : null };
}

/**
 * The public direction gate the shared view takes (lib/odds/prop-line-view.mjs `directions` option): shows(family) is
 * true only when directionAuthorization(sport, family, surface) is ok. Pages pass this; private diagnostics pass
 * PRIVATE_DIRECTIONS from the view module instead.
 */
export function publicDirectionGate(sport, surface = "site", record = DISPLAY_AUTHORIZATION) {
  return Object.freeze({ scope: "public", shows: (family) => directionAuthorization(sport, family, surface, record).ok });
}
