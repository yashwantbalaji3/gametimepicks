/**
 * SPORTSBOOK-LINE DISPLAY AUTHORIZATION — the ONE record that says whether captured sportsbook lines and prices may be
 * shown on the site or in the social feed (founder decision 2026-10-22: prices are not committed to the public
 * repository until provider display rights are confirmed; display decision "D3" pending). Pure, import-free, server-only
 * by convention (nothing under lib/odds/ may reach a client bundle: prop-line-switch-off.test.mjs).
 *
 * SITE DISPLAY AUTHORIZED (founder 2026-10-29) for NBA and NFL, after the provider-terms review recorded in
 * docs/odds/ODDS_API_DISPLAY_TERMS_2026-10-29.md. The social feed and social graphics stay NOT authorized (socialDisplay,
 * socialFeedPrices false). A build without the display key, or a date/game without an artifact, renders every page exactly
 * as it is without the feature.
 *
 * NFL (2026-10-29): the same record, the same fields — NFL_LINE_DISPLAY (lib/sports/nfl/line-display.mjs) is
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
 * Committed state: NBA pts, reb, ast, pra, ptsReb, ptsAst qualified (founder 2026-10-29); NBA threePm and every NFL
 * family unqualified. Qualifying a family is a founder decision through review under the APPROVED rule (founder
 * 2026-10-29): graded official above-median share in [0.45, 0.55] with n ≥ 300, supplementary to every other check —
 * not proof of advantage (docs/nba/NBA_LINES_RUNBOOK.md "Direction qualification"). A family missing
 * from the record is unqualified; a malformed entry (non-boolean, blank evidence/approver, bad date) is unqualified.
 */

export const DISPLAY_AUTHORIZATION_RULE = "odds-display-authorization@1";

/** A family entry that is NOT qualified. `evidence` records why. */
function unqualified(evidence) {
  return Object.freeze({ qualified: false, evidence, approvedBy: null, approvedAt: null });
}

/** A family entry the founder qualified (a public direction may show). `evidence` records the basis. */
function qualified(evidence, approvedBy, approvedAt) {
  return Object.freeze({ qualified: true, evidence, approvedBy, approvedAt });
}

/** The committed record of the provider's display terms (both sports). */
export const ODDS_API_TERMS_REF = "docs/odds/ODDS_API_DISPLAY_TERMS_2026-10-29.md";

/** Surface → the record field that switches it. Unknown surfaces refuse. */
export const DISPLAY_SURFACE_FIELD = Object.freeze({ site: "siteDisplay", social: "socialDisplay", socialPrices: "socialFeedPrices" });

/** Provenance fields every authorized record must carry (non-blank strings; approvedAt a real YYYY-MM-DD date). */
export const DISPLAY_AUTHORIZATION_REQUIRED = Object.freeze(["providerTermsRef", "approvedBy", "approvedAt"]);

/** The reader-facing sentence for a surface that is not authorized (the social feed prints it verbatim). Site display is
    authorized for both sports (2026-10-29); the social feed and social graphics are not. */
export const NOT_AUTHORIZED_REASON = Object.freeze({
  nba: "NBA sportsbook lines are shown on the website only; the social feed and social graphics are not authorized to carry them.",
  nfl: "NFL sportsbook lines are shown on the website only; the social feed and social graphics are not authorized to carry them.",
});

/**
 * THE RECORD. Committed state (founder 2026-10-29): "site" authorized for NBA and NFL; "social" and "socialPrices" not.
 * Changing any value here is the founder's display decision and goes through review with the runbook's checklist; a
 * guard fails CI if a line artifact is committed while "site" is off, or if a committed artifact is not a valid envelope.
 */
export const DISPLAY_AUTHORIZATION = Object.freeze({
  nba: Object.freeze({
    siteDisplay: true,
    socialDisplay: false,
    // The committed record of the provider's display terms. The Odds API terms (updated 2026-08-31) permit display in a
    // UI or website and forbid redistribution "as a standalone data product" (API, data feed, downloadable files).
    providerTermsRef: ODDS_API_TERMS_REF,
    attribution: null, // optional: the provider does not require attribution
    approvedBy: "founder",
    approvedAt: "2026-10-29",
    // Prices and book names in the public social JSON feed: a data feed under the clause above. Needs WRITTEN provider
    // confirmation, referenced here, before it may be true.
    socialFeedPrices: false,
    socialFeedPricesConfirmationRef: null,
    // Which statistics may show a public direction (see the header). Evidence: NBA v0.1 graded official above-median
    // shares, 54 games / 910 graded played rows per family (founder message 2026-10-29); approved rule [0.45, 0.55], n ≥ 300.
    directionQualified: Object.freeze({
      pts: qualified("v0.1 graded official above-median share 0.524 (54 games; n = 910 graded played rows per family (≥300); 2026-10-29). Inside [0.45, 0.55]; approved by founder 2026-10-29 under the [0.45, 0.55] rule. Supplementary to every other check; not proof of advantage.", "founder", "2026-10-29"),
      reb: qualified("v0.1 graded official above-median share 0.545 (54 games; n = 910 graded played rows per family (≥300); 2026-10-29). Inside [0.45, 0.55]; approved by founder 2026-10-29 under the [0.45, 0.55] rule. Supplementary to every other check; not proof of advantage.", "founder", "2026-10-29"),
      ast: qualified("v0.1 graded official above-median share 0.509 (54 games; n = 910 graded played rows per family (≥300); 2026-10-29). Inside [0.45, 0.55]; approved by founder 2026-10-29 under the [0.45, 0.55] rule. Supplementary to every other check; not proof of advantage.", "founder", "2026-10-29"),
      threePm: unqualified("v0.1 graded official above-median share 0.438 (54 games, 910 rows; 2026-10-29). Below the approved [0.45, 0.55] band: the median runs high. Fails."),
      pra: qualified("v0.1 graded official above-median share 0.546 (54 games; n = 910 graded played rows per family (≥300); 2026-10-29). Inside [0.45, 0.55]; approved by founder 2026-10-29 under the [0.45, 0.55] rule. Supplementary to every other check; not proof of advantage.", "founder", "2026-10-29"),
      ptsReb: qualified("v0.1 graded official above-median share 0.540 (54 games; n = 910 graded played rows per family (≥300); 2026-10-29). Inside [0.45, 0.55]; approved by founder 2026-10-29 under the [0.45, 0.55] rule. Supplementary to every other check; not proof of advantage.", "founder", "2026-10-29"),
      ptsAst: qualified("v0.1 graded official above-median share 0.533 (54 games; n = 910 graded played rows per family (≥300); 2026-10-29). Inside [0.45, 0.55]; approved by founder 2026-10-29 under the [0.45, 0.55] rule. Supplementary to every other check; not proof of advantage.", "founder", "2026-10-29"),
    }),
  }),
  // NFL player props: same fields, same meaning. Site display approved by the founder 2026-10-29 as its own decision (an
  // NBA approval never carries over); social not authorized.
  nfl: Object.freeze({
    siteDisplay: true,
    socialDisplay: false,
    providerTermsRef: ODDS_API_TERMS_REF,
    attribution: null,
    approvedBy: "founder",
    approvedAt: "2026-10-29",
    socialFeedPrices: false,
    socialFeedPricesConfirmationRef: null,
    // Over/under families only (anytime touchdown is a yes/no market and never carries a direction). All unqualified
    // under the approved [0.45, 0.55] / n ≥ 300 rule.
    directionQualified: Object.freeze({
      receptions: unqualified("Official over-median share 0.42–0.45 historically (the median runs slightly high). Borderline below the approved [0.45, 0.55] band. Fails. A tie-adjusted (mid-p) share ≈0.50 is pending a founder decision on tie treatment."),
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

/**
 * MATCHUP SOCIAL GRAPHICS, DATED (founder 2026-11-04, receipts f529fa44fa and 41c421cf1d on claude/bbm-v2-authorization,
 * docs/receipts/FOUNDER_ODDS_SNAPSHOT_OVERRIDE_2026-11-04.md): already-captured moneyline and player-prop prices may print
 * on NBA matchup social IMAGES for the listed ET date only, each labelled with its own capture time. It is NOT the
 * "social" surface: the public social JSON feed stays off (provider terms forbid a price feed), and nothing here changes
 * DISPLAY_AUTHORIZATION. It authorizes no capture and no spend. An entry missing a field refuses.
 */
export const MATCHUP_GRAPHICS_PRICE_AUTHORIZATION = Object.freeze({
  nba: Object.freeze([
    Object.freeze({
      etDate: "2026-11-04",
      markets: Object.freeze(["moneyline", "playerProps"]),
      receiptRef: "docs/receipts/FOUNDER_ODDS_SNAPSHOT_OVERRIDE_2026-11-04.md (claude/bbm-v2-authorization f529fa44fa, amended 41c421cf1d)",
      snapshotLabel: "ODDS SNAPSHOT",
      captionDisclosure: "Odds shown are snapshots captured at the stated time and may have changed.",
      approvedBy: "founder",
      approvedAt: "2026-11-04",
      // Line age: founder 2026-11-04T22:30:09Z, verbatim (~/gtp-evidence/nov4-founder-decisions-2230Z.md, sha256 0bb0c75cc18f…):
      // "For today's captured prices only, I approve extending the six-hour display-age rule to a maximum of nine hours
      // where needed for late games". Capped at lineAgeMaxHours; this date only.
      lineAgeExceptionApproved: true,
      lineAgeMaxHours: 9,
    }),
    // Nov 5 (founder ~22:30Z, ~/gtp-evidence/nov5-founder-weekend-directive-excerpts.md sha256 80818f48…; receipt
    // docs/receipts/ODDS_AUTHORIZATION_NBA_PROPS_MATCHUP_DISPLAY_2026-11-05.md @ b8317feadf): the props already captured at
    // 19:00Z/19:02Z only. No moneyline was captured, so none is authorized; the standard line age applies.
    Object.freeze({
      etDate: "2026-11-05",
      markets: Object.freeze(["playerProps"]),
      receiptRef: "docs/receipts/ODDS_AUTHORIZATION_NBA_PROPS_MATCHUP_DISPLAY_2026-11-05.md (claude/bbm-v2-authorization b8317feadf)",
      snapshotLabel: "ODDS SNAPSHOT",
      captionDisclosure: "Odds shown are snapshots captured at the stated time and may have changed.",
      approvedBy: "founder",
      approvedAt: "2026-11-05",
      lineAgeExceptionApproved: false,
    }),
  ]),
  // NFL Week 9 (founder 2026-11-05T16:04:37Z, ~/gtp-evidence/nov5-founder-approval-items1-5.md; receipt
  // docs/receipts/ODDS_AUTHORIZATION_NFL_WEEK9_2026-11-05.md @ 2837ec8fc9): the one ~3 PM ET Thursday capture, shown as a dated
  // snapshot on Week 9 social graphics through 2026-11-09, no book names, never a feed. Images carry the capture time.
  nfl: Object.freeze(["2026-11-05", "2026-11-06", "2026-11-08", "2026-11-09"].map((etDate) => Object.freeze({
    etDate,
    markets: Object.freeze(["moneyline", "anytimeTd", "playerProps"]),
    receiptRef: "docs/receipts/ODDS_AUTHORIZATION_NFL_WEEK9_2026-11-05.md (claude/bbm-v2-authorization 2837ec8fc9); nov5-founder-approval-items1-5.md sha256 64bbd869…",
    snapshotLabel: "ODDS SNAPSHOT",
    captionDisclosure: "none in captions (founder 2026-11-04T22:44Z: no snapshot or odds talk in captions); the image carries the capture time",
    approvedBy: "founder",
    approvedAt: "2026-11-05",
    lineAgeExceptionApproved: false,
  }))),
});

/**
 * May captured prices of `market` print on `sport` matchup social graphics posted on `etDate`? Never throws.
 * @returns {{ ok: boolean, reasons: string[], entry: object|null }}
 */
export function matchupGraphicsPriceAuthorization(sport, etDate, market, record = MATCHUP_GRAPHICS_PRICE_AUTHORIZATION) {
  const list = record && Object.prototype.hasOwnProperty.call(record, sport) && Array.isArray(record[sport]) ? record[sport] : [];
  const entry = list.find((e) => e?.etDate === etDate) ?? null;
  const reasons = [];
  if (!entry) reasons.push(`no matchup-graphics price authorization for ${sport} on ${etDate}`);
  else {
    for (const f of ["receiptRef", "snapshotLabel", "captionDisclosure", "approvedBy", "approvedAt"]) if (blank(entry[f])) reasons.push(`${f} is missing`);
    if (!isDate(entry.etDate) || !isDate(entry.approvedAt)) reasons.push("etDate and approvedAt must be YYYY-MM-DD dates");
    if (!Array.isArray(entry.markets) || !entry.markets.includes(market)) reasons.push(`${market} is not authorized for matchup graphics on ${etDate}`);
  }
  return { ok: reasons.length === 0, reasons, entry: reasons.length ? null : entry };
}
