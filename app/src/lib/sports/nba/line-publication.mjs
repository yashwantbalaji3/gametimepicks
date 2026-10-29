/**
 * NBA LINE PUBLICATION — `gtp.nba.line-comparisons@1`: the ONE gated path from captured sportsbook lines (private price
 * records, `gtp.nba.prop-price@1`) to what the static site renders and the social feed reads (launch program
 * 2026-10-29, NBA lines plan). Pure: no fs, no clock — the CLI (scripts/nba/publish-nba-line-board.mjs) does the I/O.
 * THIS module is the shared contract (constants, the validator, the converters the build-time reader uses); the
 * exporter's builder is line-publication-build.mjs, imported only by the CLI and tests.
 *
 * WHERE THE ARTIFACT LIVES — NEVER under app/public/. The provider's terms (the-odds-api.com terms and conditions,
 * updated 2026-08-31) allow displaying its data in a website UI but forbid redistributing it as a standalone data
 * product — "your own API, data feed, downloadable files". A JSON file under app/public/data would be served by the
 * static export as exactly such a downloadable file. So the artifact is a BUILD INPUT outside public/:
 *   default   <repo>/data/odds-display/nba/lines/<date>.json   (committed — the repo is public, so committing it is itself
 *             the founder's decision; a guard fails CI if one is committed while display is not authorized)
 *   private   any absolute directory outside every repository, handed to the build as GTP_NBA_LINES_DIR
 * It is read only at build time (lib/sports/nba/public-line-records.mjs) and rendered into page HTML; it is never copied
 * into out/ (odds-display-export.test.mjs proves no exported /data JSON carries a price or a book).
 *
 * REFUSES (ok:false, nothing to write) unless: the "site" surface is authorized (lib/odds/display-authorization.mjs);
 * the capture receipt parses for NBA player props at every record's fetch instant and does not restrict its output to
 * private research; every slate record is an eligible-operator, receipt-scoped, pre-tip adapter record; and at least
 * one comparison survives the existing rules (line-comparison.mjs: matched identity, same market, pre-tip, ≤ 6 h).
 * Rows that do not survive are COUNTED by reason — never written as numbers.
 *
 * DETERMINISTIC: no wall clock. The only instants are inputs (`asOf`) and the records' own capturedAt. Same inputs →
 * same bytes (rows in lane order, reason keys sorted).
 */
import { LINE_MAX_AGE_HOURS, MARKET_KEYS, USER_SIDE } from "./line-comparison.mjs";
import { isEligibleOperator } from "../odds/eligible-operators.mjs";
import { PRICE_RECORD_SCHEMA, PROVIDER } from "../odds/nba-props/contract.mjs";

export const NBA_LINE_PUBLICATION_SCHEMA = "gtp.nba.line-comparisons@1";
/** Repo-relative default home of the artifact (a build input outside app/public — see the header). */
export const NBA_LINES_REPO_DIR = "data/odds-display/nba/lines";
/** Environment variable naming a private, absolute build-time directory instead of the committed default. */
export const NBA_LINES_DIR_ENV = "GTP_NBA_LINES_DIR";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;
const isAmerican = (p) => Number.isInteger(p) && Math.abs(p) >= 100;

/**
 * Defense in depth for the reader: re-checks a committed artifact against the rules, the lane it claims, and the
 * allowlist. A present-but-invalid artifact is a release error, so the reader throws on it.
 * @param {any} a
 * @param {{ date: string, laneSha256: string|null }} ctx
 */
export function validateNbaLinePublication(a, { date, laneSha256 }) {
  const errs = [];
  if (a?.schemaVersion !== NBA_LINE_PUBLICATION_SCHEMA) errs.push(`schemaVersion is not ${NBA_LINE_PUBLICATION_SCHEMA}`);
  if (a?.date !== date) errs.push(`date ${a?.date} is not ${date}`);
  if (!laneSha256 || a?.provenance?.lane?.sha256 !== laneSha256) errs.push("the committed lane changed since publication (lane sha256 differs) — republish");
  const asOf = Date.parse(a?.asOf);
  if (!Number.isFinite(asOf)) errs.push("asOf is not an instant");
  for (const e of a?.events ?? []) {
    const tip = Date.parse(e.tipUtc);
    for (const r of e.rows ?? []) {
      const id = `${r.eventId}|${r.athleteId}|${r.family}`;
      if (String(r.eventId) !== String(e.eventId)) errs.push(`${id}: row under the wrong event`);
      if (!isEligibleOperator(r.book)) errs.push(`${id}: book not on the eligible-operator allowlist`);
      if (MARKET_KEYS[r.family] !== r.marketKey) errs.push(`${id}: market does not match family`);
      if (!isNum(r.projection) || !isNum(r.line) || r.line < 0) errs.push(`${id}: projection/line not numbers`);
      else if (r.difference !== r1(r.projection - r.line)) errs.push(`${id}: difference is not projection − line`);
      // Direction from the full-precision projection − line (line-comparison.mjs), never from the rounded difference.
      const exact = isNum(r.projection) && isNum(r.line) ? r.projection - r.line : r.difference;
      const dir = exact > 0 ? "ABOVE" : exact < 0 ? "BELOW" : "EQUAL";
      if (r.state !== "COMPARED" || r.direction !== dir || r.side !== USER_SIDE[dir]) errs.push(`${id}: state/direction/side inconsistent`);
      const two = isAmerican(r.overPrice) && isAmerican(r.underPrice), none = r.overPrice === null && r.underPrice === null;
      if (!(two && r.prices === "TWO_SIDED") && !(none && r.prices === "PRICE_UNAVAILABLE")) errs.push(`${id}: prices must be two-sided or explicitly unavailable`);
      const cap = Date.parse(r.capturedAt);
      if (!Number.isFinite(cap) || !(cap < tip)) errs.push(`${id}: not captured before tip`);
      else if (Math.min(asOf, tip) - cap > LINE_MAX_AGE_HOURS * 3600_000 || cap > Math.min(asOf, tip)) errs.push(`${id}: stale at the comparison instant`);
    }
  }
  return { ok: errs.length === 0, errors: errs };
}

/** Artifact → adapter-shaped price records, so pages run the SAME pairing + comparison (nbaLineCandidates, compareToLine). */
export function linePublicationToPriceRecords(a) {
  return (a?.events ?? []).flatMap((e) => (e.rows ?? []).map((r) => ({
    schema: PRICE_RECORD_SCHEMA, provider: PROVIDER, eventId: String(r.eventId), providerAthleteId: String(r.athleteId), family: r.family,
    providerMarketKey: r.marketKey, line: r.line, book: r.book, overAmerican: r.overPrice, underAmerican: r.underPrice, capturedAt: r.capturedAt,
  })));
}

/** Artifact → the line-board shape the social builder reads (rows + coverage). Prices are filtered there, not here. */
export function linePublicationToSocialBoard(a) {
  return {
    rows: (a?.events ?? []).flatMap((e) => (e.rows ?? []).map((r) => ({
      eventId: String(r.eventId), athleteId: String(r.athleteId), family: r.family, direction: r.direction, line: r.line,
      overPrice: r.overPrice, underPrice: r.underPrice, book: r.book, marketKey: r.marketKey, capturedAt: r.capturedAt, difference: r.difference,
    }))),
    coverage: a?.coverage ?? null,
    attribution: a?.display?.attribution ?? null,
  };
}
