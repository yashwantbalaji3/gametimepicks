/**
 * NBA LINE PUBLICATION · THE BUILDER (exporter side). Pure: no fs, no clock. Imported ONLY by
 * scripts/nba/publish-nba-line-board.mjs and tests — never by a page (it reads the capture receipt parser, whose module
 * names the private odds ledgers; build-input-coverage.test.mjs would rightly flag that on a public route).
 * The contract, the rules and where the artifact lives: line-publication.mjs.
 */
import { buildNbaLineBoard } from "./line-board.mjs";
import { DIRECTION, LINE_COMPARISON_RULE, LINE_MAX_AGE_HOURS, MARKET_KEYS, USER_SIDE } from "./line-comparison.mjs";
import { DISPLAY_AUTHORIZATION, DISPLAY_AUTHORIZATION_RULE, displayAuthorization } from "../../odds/display-authorization.mjs";
import { ELIGIBLE_OPERATORS_POLICY, isEligibleOperator } from "../odds/eligible-operators.mjs";
import { PRICE_RECORD_SCHEMA, PROVIDER, FAMILY_BY_MARKET_KEY } from "../odds/nba-props/contract.mjs";
import { parseNbaPropsReceipt } from "../odds/nba-props/credits.mjs";
import { NBA_LINE_PUBLICATION_SCHEMA } from "./line-publication.mjs";

const isAmerican = (p) => Number.isInteger(p) && Math.abs(p) >= 100;
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

export const PUBLICATION_REFUSAL = Object.freeze({
  NOT_AUTHORIZED: 2, BAD_INPUT: 2, RECEIPT: 2, NO_LANE: 3, RECORD_INTEGRITY: 4, NOTHING_TO_PUBLISH: 5,
});


/**
 * A capture receipt whose own words restrict the output to private research cannot feed a publication (the 2026-10-21
 * NBA pilot receipt says "Output: Private research and shadow evaluation only."). A publishing receipt must say so.
 */
export function receiptAllowsPublication(text) {
  const t = String(text ?? "").replace(/^>\s?/gm, "");
  return !/\bOutput:[^\n]*\bprivate\b/i.test(t);
}

const refused = (code, reasons) => ({ ok: false, code, reasons });

/**
 * @param {{ lane: any, laneSha256: string, priceRecords: any[], asOf: string, receiptText: string|null, receiptRel: string|null,
 *           captureFiles?: Array<{ name: string, sha256: string, records: any[] }>, authorization?: any }} input
 *   `captureFiles` (optional) names each private capture file and its sha256 for provenance; when given, `priceRecords`
 *   defaults to the concatenation of their records.
 * @returns {{ ok: true, artifact: any, text: string } | { ok: false, code: number, reasons: string[] }}
 */
export function buildNbaLinePublication({ lane, laneSha256, priceRecords, asOf, receiptText, receiptRel, captureFiles = [], authorization = DISPLAY_AUTHORIZATION }) {
  const auth = displayAuthorization("nba", "site", authorization);
  if (!auth.ok) return refused(PUBLICATION_REFUSAL.NOT_AUTHORIZED, auth.reasons.map((r) => `display authorization: ${r}`));
  if (typeof asOf !== "string" || !Number.isFinite(Date.parse(asOf))) return refused(PUBLICATION_REFUSAL.BAD_INPUT, ["asOf must be an ISO instant (no default: output must be deterministic)"]);
  if (!lane || !/^\d{4}-\d{2}-\d{2}$/.test(String(lane.date ?? "")) || !Array.isArray(lane.games)) return refused(PUBLICATION_REFUSAL.NO_LANE, ["no committed lane snapshot for this date"]);
  if (!/^[0-9a-f]{64}$/.test(String(laneSha256 ?? ""))) return refused(PUBLICATION_REFUSAL.NO_LANE, ["the lane's sha256 is required (provenance)"]);
  if (!receiptText) return refused(PUBLICATION_REFUSAL.RECEIPT, ["no capture receipt: a published line must come from an authorized capture"]);
  if (!receiptAllowsPublication(receiptText)) return refused(PUBLICATION_REFUSAL.RECEIPT, [`receipt ${receiptRel ?? ""} restricts its output to private research; a publishing capture needs a receipt that allows publication`]);

  const records = priceRecords ?? captureFiles.flatMap((f) => f.records ?? []);
  const tipByEvent = new Map(lane.games.map((g) => [String(g.providerEventId), g.tipUtc]));
  const players = new Set(lane.games.flatMap((g) => ["away", "home"].flatMap((s) => (g.players?.[s] ?? []).map((p) => `${g.providerEventId}|${p.providerAthleteId}`))));
  const slate = (records ?? []).filter((r) => tipByEvent.has(String(r?.eventId)));
  const recordsOtherSlate = (records ?? []).length - slate.length;

  // Receipt: valid for NBA player props at every slate record's fetch instant.
  const instants = [...new Set(slate.map((r) => r.fetchedAt ?? r.capturedAt))].sort();
  const receiptErrors = new Set();
  let receiptMarkets = null;
  for (const at of instants.length ? instants : [asOf]) {
    const p = parseNbaPropsReceipt(receiptText, { now: at });
    if (!p.ok) for (const e of p.errors) receiptErrors.add(`receipt at ${at}: ${e}`);
    else receiptMarkets = p.markets;
  }
  if (receiptErrors.size) return refused(PUBLICATION_REFUSAL.RECEIPT, [...receiptErrors]);

  // Record integrity: anything the adapter would never have produced means the private input was altered — refuse.
  const bad = [];
  for (const r of slate) {
    const id = `${r.eventId}|${r.providerAthleteId}|${r.family}|${r.book}`;
    if (r.schema !== PRICE_RECORD_SCHEMA) bad.push(`${id}: schema ${JSON.stringify(r.schema)} is not ${PRICE_RECORD_SCHEMA}`);
    if (r.provider !== PROVIDER) bad.push(`${id}: provider ${JSON.stringify(r.provider)} is not ${PROVIDER}`);
    if (!isEligibleOperator(r.book)) bad.push(`${id}: book is not on the eligible-operator allowlist (${ELIGIBLE_OPERATORS_POLICY})`);
    if (!receiptMarkets?.includes(r.providerMarketKey)) bad.push(`${id}: market ${r.providerMarketKey} is not on the receipt's authorization row`);
    if (FAMILY_BY_MARKET_KEY[r.providerMarketKey]?.family !== r.family) bad.push(`${id}: family does not match market ${r.providerMarketKey}`);
    const cap = Date.parse(r.capturedAt), tip = Date.parse(tipByEvent.get(String(r.eventId)));
    if (!Number.isFinite(cap)) bad.push(`${id}: capturedAt is not an instant`);
    else if (Number.isFinite(tip) && cap >= tip) bad.push(`${id}: captured at or after tip-off`);
  }
  if (bad.length) return refused(PUBLICATION_REFUSAL.RECORD_INTEGRITY, [...bad.slice(0, 20), ...(bad.length > 20 ? [`… and ${bad.length - 20} more`] : [])]);

  const recordsUnsupportedMarket = slate.filter((r) => !Object.prototype.hasOwnProperty.call(MARKET_KEYS, r.family)).length;
  const recordsUnmatchedPlayer = slate.filter((r) => Object.prototype.hasOwnProperty.call(MARKET_KEYS, r.family) && !players.has(`${r.eventId}|${r.providerAthleteId}`)).length;

  const board = buildNbaLineBoard({ lane, priceRecords: slate, asOf });
  const asOfMs = Date.parse(asOf);
  const byEvent = new Map();
  const notComparedByReason = {};
  let withoutLine = 0;
  for (const b of board.rows) {
    if (b.direction === DIRECTION.UNAVAILABLE) {
      if (b.reason === "NO_LINE" || b.reason === "NO_PROJECTION") withoutLine += b.reason === "NO_LINE" ? 1 : 0;
      if (b.reason !== "NO_LINE") notComparedByReason[b.reason] = (notComparedByReason[b.reason] ?? 0) + 1;
      continue;
    }
    const tipUtc = tipByEvent.get(b.eventId);
    const at = Math.min(asOfMs, Date.parse(tipUtc));
    const twoSided = isAmerican(b.overPrice) && isAmerican(b.underPrice);
    const row = {
      eventId: b.eventId, athleteId: b.athleteId, name: b.name, team: b.team, family: b.family, marketKey: b.marketKey,
      projection: b.median, line: b.line,
      overPrice: twoSided ? b.overPrice : null, underPrice: twoSided ? b.underPrice : null, prices: twoSided ? "TWO_SIDED" : "PRICE_UNAVAILABLE",
      book: b.book, capturedAt: b.capturedAt,
      state: "COMPARED", direction: b.direction, side: USER_SIDE[b.direction], difference: b.difference,
      freshness: { rule: `captured before tip, within ${LINE_MAX_AGE_HOURS} h`, ageMinutes: Math.round((at - Date.parse(b.capturedAt)) / 60000) },
      reason: null,
    };
    if (!byEvent.has(b.eventId)) byEvent.set(b.eventId, []);
    byEvent.get(b.eventId).push(row);
  }
  const rows = [...byEvent.values()].flat();
  if (!rows.length) return refused(PUBLICATION_REFUSAL.NOTHING_TO_PUBLISH, [`no comparison survives the rules (pre-tip, ≤ ${LINE_MAX_AGE_HOURS} h, matched): ${JSON.stringify(sortKeys(notComparedByReason))}; nothing is written`]);

  const usedFiles = captureFiles
    .filter((f) => (f.records ?? []).some((r) => tipByEvent.has(String(r?.eventId))))
    .map((f) => ({ name: f.name, sha256: f.sha256 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const artifact = {
    schemaVersion: NBA_LINE_PUBLICATION_SCHEMA,
    dataClass: "DISPLAY_ONLY_BUILD_INPUT",
    rule: LINE_COMPARISON_RULE,
    date: lane.date,
    asOf: new Date(asOfMs).toISOString(),
    display: {
      surface: "site", authorizationRule: DISPLAY_AUTHORIZATION_RULE,
      providerTermsRef: auth.providerTermsRef, attribution: auth.attribution, approvedBy: auth.approvedBy, approvedAt: auth.approvedAt,
      redistribution: "Rendered into page HTML only; never served as a downloadable file or data feed (provider terms).",
    },
    provenance: {
      lane: { path: `app/public/data/nba/experimental-public/${lane.date}.json`, sha256: laneSha256, generatedAt: lane.generatedAt ?? null },
      capture: { provider: PROVIDER, receipt: receiptRel ?? null, recordSchema: PRICE_RECORD_SCHEMA, slateRecords: slate.length, files: usedFiles },
      eligibleOperatorsPolicy: ELIGIBLE_OPERATORS_POLICY,
    },
    coverage: {
      events: lane.games.length,
      eventsWithAnyLine: byEvent.size,
      playerFamilies: board.rows.length,
      compared: rows.length,
      over: rows.filter((r) => r.side === "OVER").length,
      under: rows.filter((r) => r.side === "UNDER").length,
      neutral: rows.filter((r) => r.side === "NEUTRAL").length,
      withoutLine,
      notComparedByReason: sortKeys(notComparedByReason),
      recordsOtherSlate, recordsUnmatchedPlayer, recordsUnsupportedMarket,
    },
    events: lane.games.filter((g) => byEvent.has(String(g.providerEventId))).map((g) => ({ eventId: String(g.providerEventId), tipUtc: g.tipUtc, rows: byEvent.get(String(g.providerEventId)) })),
  };
  return { ok: true, artifact, text: `${JSON.stringify(artifact, null, 1)}\n` };
}

