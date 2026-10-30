/**
 * NFL LINE PUBLICATION · THE BUILDER (exporter side) — `gtp.nfl.prop-lines@1`, one artifact per game, the NFL mirror of
 * lib/sports/nba/line-publication-build.mjs. Pure: no fs, no clock, no key. Imported ONLY by
 * scripts/nfl/publish-nfl-line-board.mjs and tests — never by a page (it reads the capture receipt parser).
 *
 * INPUTS: the committed OFFICIAL per-game player boards (app/public/data/nfl/player-board/<event>.json, read verbatim) and
 * the PRIVATE capture files (<private>/odds/nfl/<stamp>/capture-*.json, flattened by nflOffersFromCapture).
 * OUTPUT: per game, the ONE chosen offer per (player, market) that the page's own rule (prop-line-adapter.mjs
 * nflChooseOffer + nflCompareToLine) would compare — or, for anytime touchdown, show as a Yes price. Nothing else is
 * written: a stale, post-kickoff-free but unmatched, ambiguous, ineligible-book or not-published offer is COUNTED by
 * reason, never written as a number. The artifact holds offers, not directions: the page derives the comparison and the
 * public direction gate (display-authorization.mjs directionQualified) decides whether a direction is shown.
 *
 * REFUSES (ok:false, nothing to write) — codes as the CLI exits:
 *   2  the "site" surface is not authorized for nfl; bad asOf; no receipt; the receipt does not parse
 *      (p171-authorization.mjs parseAuthorizationReceipt) or its Output restricts the capture to private research
 *      without deferring to a separate display authorization;
 *   3  no official board;
 *   4  record integrity: a slate offer for a market the receipt does not authorize, an unknown market, an unreadable
 *      capture instant, or one captured at/after its game's kickoff (the receipt forbids it); or a built artifact that
 *      fails the reader's validator;
 *   5  no offer survives the rules (eligible book, matched identity, PUBLISHED family, pre-kickoff, ≤ 12 h).
 *
 * DETERMINISTIC: no wall clock; the only instants are `asOf` and the offers' own capturedAt. Rows sorted by player then
 * market; events by kickoff then id; reason maps key-sorted. Same inputs → same bytes (and, encrypted, the same file).
 */
import { DIRECTION } from "../nba/line-comparison.mjs";
import { DISPLAY_AUTHORIZATION, DISPLAY_AUTHORIZATION_RULE, displayAuthorization } from "../../odds/display-authorization.mjs";
import { ELIGIBLE_OPERATORS_POLICY, isEligibleOperator } from "../odds/eligible-operators.mjs";
import { parseAuthorizationReceipt } from "../odds/p171-authorization.mjs";
import { NFL_FAMILIES, NFL_FAMILY_BY_MARKET, NFL_LINE_COMPARISON_RULE, NFL_LINE_MAX_AGE_HOURS, nflCompareToLine, nflPropLineInputs } from "./prop-line-adapter.mjs";
import { NFL_LINES_SCHEMA, validateNflLineArtifact } from "./public-line-records.mjs";

export const NFL_PUBLICATION_REFUSAL = Object.freeze({ NOT_AUTHORIZED: 2, BAD_INPUT: 2, RECEIPT: 2, NO_BOARD: 3, RECORD_INTEGRITY: 4, NOTHING_TO_PUBLISH: 5 });

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isAmerican = (v) => isNum(v) && Number.isInteger(v) && Math.abs(v) >= 100;
const refused = (code, reasons) => ({ ok: false, code, reasons });

/**
 * May this receipt feed a DISPLAY artifact? Its Output term must not restrict the capture to private research — unless
 * the term itself defers to a separate display authorization (the week-8 NFL receipt: "PRIVATE_RESEARCH, productEligible
 * false unless a separate display authorization says otherwise" — the display authorization record IS that, and the
 * builder refuses without it).
 */
export function nflReceiptAllowsDisplay(text) {
  const t = String(text ?? "").replace(/^>\s?/gm, "");
  const lines = t.split("\n").filter((l) => /^\s*\|?\s*\**Output\**\s*(?:\||:)/i.test(l));
  if (!lines.length) return true;
  return lines.every((l) => !/\bprivate/i.test(l) || /separate display authorization/i.test(l));
}

/**
 * @param {{ boards: Array<{ board: any, path: string, sha256: string }>, captureFiles: Array<{ name: string, sha256: string, offers: any[] }>,
 *           asOf: string, receiptText: string|null, receiptRel: string|null, authorization?: any }} input
 * @returns {{ ok: true, artifacts: Array<{ eventId: string, artifact: any, text: string }>, summary: any } | { ok: false, code: number, reasons: string[] }}
 */
export function buildNflLinePublication({ boards, captureFiles = [], asOf, receiptText, receiptRel, authorization = DISPLAY_AUTHORIZATION }) {
  const auth = displayAuthorization("nfl", "site", authorization);
  if (!auth.ok) return refused(NFL_PUBLICATION_REFUSAL.NOT_AUTHORIZED, auth.reasons.map((r) => `display authorization: ${r}`));
  if (typeof asOf !== "string" || !Number.isFinite(Date.parse(asOf))) return refused(NFL_PUBLICATION_REFUSAL.BAD_INPUT, ["asOf must be an ISO instant (no default: output must be deterministic)"]);
  if (!receiptText) return refused(NFL_PUBLICATION_REFUSAL.RECEIPT, ["no capture receipt: a published line must come from an authorized capture"]);
  const receipt = parseAuthorizationReceipt(receiptText);
  if (!receipt.ok) return refused(NFL_PUBLICATION_REFUSAL.RECEIPT, receipt.errors.map((e) => `receipt ${receiptRel ?? ""}: ${e}`));
  if (!nflReceiptAllowsDisplay(receiptText)) return refused(NFL_PUBLICATION_REFUSAL.RECEIPT, [`receipt ${receiptRel ?? ""} restricts its output to private research; a display artifact needs a receipt that allows display (or defers to a separate display authorization)`]);
  const valid = (boards ?? []).filter((b) => b?.board && /^\d{6,12}$/.test(String(b.board.providerEventId ?? "")) && Number.isFinite(Date.parse(b.board.kickoffUtc)));
  if (!valid.length) return refused(NFL_PUBLICATION_REFUSAL.NO_BOARD, ["no committed official player board"]);

  const kickoffOf = new Map(valid.map((b) => [`nfl-${b.board.providerEventId}`, b.board.kickoffUtc]));
  const all = captureFiles.flatMap((f) => (f.offers ?? []).map((o) => ({ o, file: f.name })));
  const slate = all.filter(({ o }) => kickoffOf.has(String(o?.canonicalEventId)));
  const allowed = new Set(receipt.propMarkets);

  // Record integrity: anything the capture would never have produced (per its receipt) means the private input was altered.
  const bad = [];
  for (const { o, file } of slate) {
    const id = `${o.canonicalEventId}|${o.playerId}|${o.market}|${o.book}`;
    if (!NFL_FAMILY_BY_MARKET[o.market]) bad.push(`${id}: unknown market ${JSON.stringify(o.market)} (${file})`);
    else if (!allowed.has(o.market)) bad.push(`${id}: market ${o.market} is not on the receipt's authorization row (${file})`);
    const cap = Date.parse(o.capturedAt);
    if (!Number.isFinite(cap)) bad.push(`${id}: capturedAt is not an instant (${file})`);
    else if (cap >= Date.parse(kickoffOf.get(String(o.canonicalEventId)))) bad.push(`${id}: captured at or after kickoff (${file})`);
  }
  if (bad.length) return refused(NFL_PUBLICATION_REFUSAL.RECORD_INTEGRITY, [...bad.slice(0, 20), ...(bad.length > 20 ? [`… and ${bad.length - 20} more`] : [])]);

  const offers = slate.map(({ o }) => o);
  const filesByEvent = new Map();
  for (const { o, file } of slate) {
    const e = String(o.canonicalEventId).slice(4);
    if (!filesByEvent.has(e)) filesByEvent.set(e, new Set());
    filesByEvent.get(e).add(file);
  }
  const shaOf = new Map(captureFiles.map((f) => [f.name, f.sha256]));
  const artifacts = [];
  const totals = { events: valid.length, eventsWritten: 0, rowsWritten: 0, overUnderRows: 0, yesNoRows: 0, notWrittenByReason: {}, slateOffers: slate.length, ineligibleBookOffers: slate.filter(({ o }) => !isEligibleOperator(o.book)).length, otherSlateOffers: all.length - slate.length };
  const ordered = [...valid].sort((a, b) => String(a.board.kickoffUtc).localeCompare(String(b.board.kickoffUtc)) || String(a.board.providerEventId).localeCompare(String(b.board.providerEventId)));
  for (const { board, path: boardPath, sha256 } of ordered) {
    const eventId = String(board.providerEventId);
    const { inputs, projections, yesNoProjections } = nflPropLineInputs({ board, offers, asOf, withLineOnly: false });
    const rows = [];
    const notWritten = {};
    for (const i of inputs) {
      const c = nflCompareToLine(i);
      const survives = c.direction !== DIRECTION.UNAVAILABLE || c.reason === "YES_NO_MARKET";
      if (!survives) {
        notWritten[c.reason] = (notWritten[c.reason] ?? 0) + 1;
        continue;
      }
      const o = i.offer;
      const yesNo = NFL_FAMILIES[i.marketKey].kind === "YES_NO";
      rows.push(yesNo
        ? { canonicalEventId: o.canonicalEventId, playerId: String(o.playerId), market: o.market, book: o.book, price: o.price, capturedAt: o.capturedAt }
        : { canonicalEventId: o.canonicalEventId, playerId: String(o.playerId), market: o.market, book: o.book, line: o.line, overPrice: isAmerican(o.overPrice) ? o.overPrice : null, underPrice: isAmerican(o.underPrice) ? o.underPrice : null, capturedAt: o.capturedAt });
    }
    for (const [k, v] of Object.entries(notWritten)) totals.notWrittenByReason[k] = (totals.notWrittenByReason[k] ?? 0) + v;
    if (!rows.length) continue;
    rows.sort((a, b) => a.playerId.localeCompare(b.playerId) || a.market.localeCompare(b.market));
    const byMarket = {};
    for (const r of rows) byMarket[r.market] = (byMarket[r.market] ?? 0) + 1;
    const artifact = {
      schema: NFL_LINES_SCHEMA,
      sport: "nfl",
      eventId,
      kickoffUtc: new Date(Date.parse(board.kickoffUtc)).toISOString(),
      asOf: new Date(Date.parse(asOf)).toISOString(),
      dataClass: "DISPLAY_ONLY_BUILD_INPUT",
      rule: NFL_LINE_COMPARISON_RULE,
      display: {
        surface: "site", authorizationRule: DISPLAY_AUTHORIZATION_RULE,
        providerTermsRef: auth.providerTermsRef, attribution: auth.attribution, approvedBy: auth.approvedBy, approvedAt: auth.approvedAt,
        redistribution: "Encrypted at rest; decrypted at build time and rendered into page HTML only; never served as a downloadable file or data feed (provider terms).",
        directions: "Offers only. Whether a direction is shown is the display authorization record's per-family directionQualified gate.",
      },
      provenance: {
        board: { path: boardPath, sha256 },
        capture: {
          provider: "the-odds-api", receipt: receiptRel ?? null,
          files: [...(filesByEvent.get(eventId) ?? [])].sort().map((name) => ({ name, sha256: shaOf.get(name) ?? null })),
        },
        eligibleOperatorsPolicy: ELIGIBLE_OPERATORS_POLICY,
        freshness: `captured before kickoff, within ${NFL_LINE_MAX_AGE_HOURS} h of min(asOf, kickoff)`,
      },
      coverage: { overUnderProjections: projections, yesNoProjections, written: rows.length, byMarket: sortKeys(byMarket), notWrittenByReason: sortKeys(notWritten) },
      rows,
    };
    const v = validateNflLineArtifact(artifact, eventId);
    if (!v.ok) return refused(NFL_PUBLICATION_REFUSAL.RECORD_INTEGRITY, v.errors.slice(0, 20).map((e) => `${eventId}: ${e}`));
    totals.eventsWritten++;
    totals.rowsWritten += rows.length;
    totals.yesNoRows += rows.filter((r) => r.market === NFL_FAMILIES.anytime_td.market).length;
    totals.overUnderRows += rows.filter((r) => r.market !== NFL_FAMILIES.anytime_td.market).length;
    artifacts.push({ eventId, artifact, text: `${JSON.stringify(artifact, null, 1)}\n` });
  }
  totals.notWrittenByReason = sortKeys(totals.notWrittenByReason);
  if (!artifacts.length) return refused(NFL_PUBLICATION_REFUSAL.NOTHING_TO_PUBLISH, [`no offer survives the rules (eligible book, matched, published family, pre-kickoff, ≤ ${NFL_LINE_MAX_AGE_HOURS} h): ${JSON.stringify(totals.notWrittenByReason)}; nothing is written`]);
  return { ok: true, artifacts, summary: totals };
}
