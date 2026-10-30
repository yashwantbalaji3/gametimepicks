/**
 * SOCIAL / GRAPHICS EXPORT CONTRACT `gtp-graphics-export@2`, edition NBA_LINE_COMPARISON (2026-10-29, for the
 * 2026-10-30 OVER/UNDER comparison graphics). @1 (graphics-export.mjs) is unchanged: @1 never carries a line or a price
 * (NOT_CARRIED_IN_CONTRACT_V1), so the line-comparison edition is a reviewed, separate version instead of a silent change.
 *
 * One row per official NBA player median of a DIRECTION-QUALIFIED family (display-authorization.mjs directionQualified:
 * pts, reb, ast, pra, ptsReb, ptsAst; threePm is NOT qualified and never appears) beside ONE sportsbook line. Nothing here
 * computes a forecast or a comparison of its own:
 *   model      the @1 NBA export's row (buildNbaGraphicsExport): the lane median, already checked against the official
 *              snapshot (nbaOfficialSnapshot, 1 dp); its snapshot id and receipt sha travel with the row;
 *   line       the authorized, validated publication artifact (`gtp.nba.line-comparisons@1`, decrypted by the build-time
 *              reader public-line-records.mjs) turned into price records (linePublicationToPriceRecords), paired by THE
 *              pairing (prop-line-adapter.mjs nbaPropLineInputs) and compared by THE rule (compareToLine through
 *              NBA_PROP_LINE_ADAPTER) and THE view (prop-line-view.mjs buildPropLineView, rounding policy, OVER/UNDER/NEUTRAL)
 *              under THE direction gate (display-authorization.mjs publicDirectionGate);
 *   checks     every emitted number is re-checked against the artifact's own row (projection, line, difference, side, book,
 *              quote time) and the lane value; any disagreement REFUSES (throws): a consumer never receives a second number.
 *
 * GATING (fail closed):
 *   purpose SOCIAL (default)  line / price / direction / difference carry numbers ONLY when displayAuthorization("nba",
 *                             "social") is ok; prices and the book name additionally need "socialPrices". Committed state
 *                             2026-10-29: social NOT authorized, so the default export carries the model medians and every
 *                             market field as { state: "WITHHELD", reason: "NOT_AUTHORIZED_FOR_SOCIAL" } and reads no
 *                             artifact at all.
 *   purpose FOUNDER_REVIEW_ONLY  the values (line, prices, book, direction, difference) are included so the founder can
 *                             review the graphics privately; the whole document says socialAuthorized:false and
 *                             purpose "FOUNDER_REVIEW_ONLY", and the CLIs refuse to write it anywhere inside a git
 *                             repository (prices never enter the repo). Directions use the SITE direction gate (the
 *                             surface the founder authorized), so an unqualified family is still excluded.
 * MODEL-ONLY (values mode only, `modelOnly`): the canonical medians of qualified families that have NO compared row (no
 * line, stale, suspended...), medians only, no market block, comparison NOT_COMPARED. The box-score card prints them grey
 * with no line or price; they never count as a comparison (events[].rows/over/under/neutral count `rows` only).
 * EXCLUSIONS (counted by reason, never emitted): started games (tip at or before asOf), unqualified families, no line,
 * stale lines (> LINE_MAX_AGE_HOURS before asOf), lines captured after tip, unmatched / suspended lines.
 *
 * DETERMINISM: pure, no fs, no clock. Same inputs + asOf + purpose → byte-identical output (serializeLineGraphicsExport).
 */
import { buildNbaGraphicsExport, ExportRefusal, instantMs, MODEL_STATUS } from "./graphics-export.mjs";
import { DISPLAY_AUTHORIZATION, DISPLAY_AUTHORIZATION_RULE, displayAuthorization, directionAuthorization, publicDirectionGate } from "../odds/display-authorization.mjs";
import { buildPropLineView, PROP_LINE_STATE, DISPLAY_ROUNDING_POLICY, fmt1, lineText, signedDifference, americanPrice, quoteTimeEt, SIDE_GLYPH, PROP_LINE_VIEW_RULE } from "../odds/prop-line-view.mjs";
import { NBA_PROP_LINE_ADAPTER, NBA_MARKET_LABEL, nbaPropLineInputs } from "../sports/nba/prop-line-adapter.mjs";
import { LINE_COMPARISON_RULE, LINE_MAX_AGE_HOURS, MARKET_KEYS, REFERENCE_BOOK_ORDER, COMPARISON_LEGEND } from "../sports/nba/line-comparison.mjs";
import { linePublicationToPriceRecords, validateNbaLinePublication, NBA_LINE_PUBLICATION_SCHEMA } from "../sports/nba/line-publication.mjs";

export const LINE_GRAPHICS_SCHEMA = "gtp-graphics-export@2";
export const LINE_GRAPHICS_EDITION = "NBA_LINE_COMPARISON";
export const PURPOSE = Object.freeze({ SOCIAL: "SOCIAL", FOUNDER_REVIEW: "FOUNDER_REVIEW_ONLY" });
/** The artifact data class a real capture carries (line-publication-build.mjs). Anything else is test data (watermarked). */
export const REAL_ARTIFACT_DATA_CLASS = "DISPLAY_ONLY_BUILD_INPUT";
/** Family order on cards and in the export (the site's order). threePm is listed so its exclusion is explicit. */
export const LINE_FAMILY_ORDER = Object.freeze(["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst"]);

export const LINE_WITHHELD_REASON = Object.freeze({
  NOT_AUTHORIZED_FOR_SOCIAL: "NOT_AUTHORIZED_FOR_SOCIAL",
  PRICES_NOT_AUTHORIZED_FOR_SOCIAL: "PRICES_NOT_AUTHORIZED_FOR_SOCIAL",
});

export const EXCLUSION = Object.freeze({
  GAME_STARTED: "GAME_STARTED",
  FAMILY_NOT_QUALIFIED: "FAMILY_NOT_QUALIFIED",
  NOT_GRAPHIC_ELIGIBLE: "NOT_GRAPHIC_ELIGIBLE",
});

export const LINE_USAGE_RULES = Object.freeze([
  "Print every value exactly as given (model.display, market.line.text, market.difference.text, prices' text, quotedAt.et). Never compute, round, re-rank by difference, or combine.",
  "Only rows present here may be shown; excluded rows (started, stale, unqualified family, no line) are counts only.",
  "When a market field's state is WITHHELD, say nothing about any line, price, book, side or difference.",
  "A document with purpose FOUNDER_REVIEW_ONLY is never posted: socialAuthorized is false. Posting lines, prices or OVER/UNDER colours on social needs the founder's separate social-display authorization.",
  "OVER / UNDER / NEUTRAL say where the model's median sits against one sportsbook line. They are not a probability, a pick or advice; never call them an edge, a lock or value.",
  "Always print the quote time and the footer: model projection vs observed line, Not betting advice, the responsible-gambling line.",
]);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const withheld = (reason) => ({ state: "WITHHELD", reason });

/** Which families may carry a direction on this purpose's surface (founder review: the site surface). */
export function lineFamilyGate(purpose, record = DISPLAY_AUTHORIZATION) {
  const surface = purpose === PURPOSE.FOUNDER_REVIEW ? "site" : "social";
  const gate = publicDirectionGate("nba", surface, record);
  // Family qualification itself (independent of the surface switch) decides which families are listed at all.
  const qualified = LINE_FAMILY_ORDER.filter((f) => directionAuthorization("nba", f, "site", record).ok);
  return { surface, gate, qualifiedFamilies: qualified, unqualifiedFamilies: LINE_FAMILY_ORDER.filter((f) => !qualified.includes(f)) };
}

/**
 * @param {{ date: string, asOf: string, lane: any|null, laneSha256: string|null,
 *           snapshots: Map<string, { snapshot: any|null, refusal: string|null }>,
 *           artifact?: any|null,                 the DECRYPTED, reader-validated line publication for `date` (null: none)
 *           artifactRef?: { path: string, encSha256: string|null } | null,
 *           purpose?: "SOCIAL"|"FOUNDER_REVIEW_ONLY", authorizationRecord?: object,
 *           inputs?: Array<{ref: string, sha256: string|null}> }} o
 */
export function buildNbaLineGraphicsExport({ date, asOf, lane, laneSha256 = null, snapshots = new Map(), artifact = null, artifactRef = null, purpose = PURPOSE.SOCIAL, authorizationRecord = DISPLAY_AUTHORIZATION, inputs = [] }) {
  if (!Object.values(PURPOSE).includes(purpose)) throw new ExportRefusal(`purpose must be ${Object.values(PURPOSE).join(" | ")}`);
  // THE canonical NBA rows (lane value == official snapshot median at 1 dp; throws on any disagreement).
  const base = buildNbaGraphicsExport({ date, asOf, lane, snapshots, laneSha256, authorizationRecord, inputs });
  const t = Date.parse(asOf);
  const social = displayAuthorization("nba", "social", authorizationRecord);
  const socialPrices = displayAuthorization("nba", "socialPrices", authorizationRecord);
  const review = purpose === PURPOSE.FOUNDER_REVIEW;
  const valuesAllowed = review || social.ok;
  const pricesAllowed = review || socialPrices.ok;
  const fam = lineFamilyGate(purpose, authorizationRecord);
  const baseRow = new Map(base.rows.map((r) => [r.rowId, r]));
  const excluded = {};
  const exclude = (reason) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
  const tipOf = new Map((lane?.games ?? []).map((g) => [String(g.providerEventId), g.tipUtc]));
  const startedIds = new Set(base.scope.eventsExcludedStarted.map((e) => e.eventId));
  const snapMedian = (eventId, playerId, family) => snapshots.get(eventId)?.snapshot?.players?.find((p) => p.playerId === playerId)?.families?.[family]?.median ?? null;
  const rows = [];

  const modelBlock = (b, eventId, playerId, family) => ({
    status: b.model.status,
    value: b.model.value,
    display: fmt1(b.model.value),
    snapshotMedianExact: snapMedian(eventId, playerId, family),
    expectedMinutes: b.model.expectedMinutes ?? null,
  });
  const familyOrder = (f) => LINE_FAMILY_ORDER.indexOf(f);

  let artifactBlock = null;
  if (!valuesAllowed) {
    // Default today: the medians only, every market field withheld; the artifact is never read.
    for (const b of base.rows) {
      if (b.kind !== "PLAYER_PROP") continue;
      const f = b.identity.market;
      if (!fam.qualifiedFamilies.includes(f)) { exclude(EXCLUSION.FAMILY_NOT_QUALIFIED); continue; }
      if (!b.graphicEligibility.eligible) { exclude(EXCLUSION.NOT_GRAPHIC_ELIGIBLE); continue; }
      const w = withheld(LINE_WITHHELD_REASON.NOT_AUTHORIZED_FOR_SOCIAL);
      rows.push({
        rowId: b.rowId, kind: "PLAYER_PROP_LINE",
        identity: { ...b.identity, marketLabel: NBA_MARKET_LABEL[f] },
        officialForecast: b.officialForecast, snapshot: b.snapshot,
        model: modelBlock(b, b.identity.eventId, b.identity.playerId, f),
        market: { line: w, book: w, overPrice: w, underPrice: w, quotedAt: w, direction: w, difference: w },
        checks: { laneValue: "EQUAL", officialSnapshot: b.checks.officialSnapshot },
        provenance: b.provenance,
      });
    }
  } else {
    if (!artifact) throw new ExportRefusal(`no authorized NBA line artifact for ${date} is available to this run (key absent, file absent, or another key): nothing to compare`);
    const v = validateNbaLinePublication(artifact, { date, laneSha256 });
    if (!v.ok) throw new ExportRefusal(`line artifact for ${date} is invalid:\n  - ${v.errors.slice(0, 10).join("\n  - ")}`);
    const artRow = new Map((artifact.events ?? []).flatMap((e) => (e.rows ?? []).map((r) => [`${r.eventId}|${r.athleteId}|${r.family}`, r])));
    const { inputs: pairs } = nbaPropLineInputs({ lane, priceRecords: linePublicationToPriceRecords(artifact), asOf });
    for (const i of pairs) {
      const f = i.marketKey;
      if (startedIds.has(i.eventId) || !(instantMs(tipOf.get(i.eventId)) > t)) { exclude(EXCLUSION.GAME_STARTED); continue; }
      if (!fam.qualifiedFamilies.includes(f)) { exclude(EXCLUSION.FAMILY_NOT_QUALIFIED); continue; }
      const view = buildPropLineView(i, NBA_PROP_LINE_ADAPTER, { directions: fam.gate });
      if (view.state !== PROP_LINE_STATE.COMPARED) { exclude(view.reason ?? view.state); continue; }
      const c = NBA_PROP_LINE_ADAPTER.compare(i);
      const rowId = `nba:${date}:${i.eventId}:${i.player.id}:${f}`;
      const b = baseRow.get(rowId);
      if (!b) throw new ExportRefusal(`${rowId}: a compared line has no canonical model row`);
      if (!b.graphicEligibility.eligible) { exclude(EXCLUSION.NOT_GRAPHIC_ELIGIBLE); continue; }
      if (b.model.value !== i.projection || b.model.value !== c.median) throw new ExportRefusal(`${rowId}: canonical median ${b.model.value} ≠ compared projection ${i.projection}`);
      const a = artRow.get(`${i.eventId}|${i.player.id}|${f}`);
      if (!a) throw new ExportRefusal(`${rowId}: compared line is not an artifact row`);
      const mismatch = [
        a.projection !== b.model.value && `artifact projection ${a.projection} ≠ lane ${b.model.value}`,
        a.line !== c.line && `artifact line ${a.line} ≠ compared ${c.line}`,
        a.book !== c.book && `artifact book ${a.book} ≠ compared ${c.book}`,
        a.capturedAt !== c.capturedAt && `artifact quote ${a.capturedAt} ≠ compared ${c.capturedAt}`,
        a.difference !== c.difference && `artifact difference ${a.difference} ≠ compared ${c.difference}`,
        a.side !== c.side && `artifact side ${a.side} ≠ compared ${c.side}`,
        a.side !== view.side && `artifact side ${a.side} ≠ view ${view.side}`,
        (a.overPrice !== c.overPrice || a.underPrice !== c.underPrice) && "artifact prices ≠ compared prices",
      ].filter(Boolean);
      if (mismatch.length) throw new ExportRefusal(`${rowId}: ${mismatch.join("; ")}`);
      const tip = instantMs(tipOf.get(i.eventId));
      const ageMinutes = Math.round((Math.min(t, tip) - Date.parse(c.capturedAt)) / 60000);
      const pw = withheld(LINE_WITHHELD_REASON.PRICES_NOT_AUTHORIZED_FOR_SOCIAL);
      rows.push({
        rowId, kind: "PLAYER_PROP_LINE",
        identity: { ...b.identity, marketLabel: NBA_MARKET_LABEL[f] },
        officialForecast: b.officialForecast, snapshot: b.snapshot,
        model: modelBlock(b, i.eventId, i.player.id, f),
        market: {
          line: { state: "SHOWN", value: c.line, text: lineText(c.line), marketKey: MARKET_KEYS[f] },
          book: pricesAllowed ? { state: "SHOWN", key: view.book.key, label: view.book.label } : pw,
          overPrice: pricesAllowed ? { state: "SHOWN", value: view.overPrice.value, text: view.overPrice.text } : pw,
          underPrice: pricesAllowed ? { state: "SHOWN", value: view.underPrice.value, text: view.underPrice.text } : pw,
          quotedAt: { state: "SHOWN", iso: c.capturedAt, et: quoteTimeEt(c.capturedAt), ageMinutes, maxAgeHours: LINE_MAX_AGE_HOURS },
          direction: { state: "SHOWN", side: view.side, glyph: SIDE_GLYPH[view.side], word: view.side },
          difference: { state: "SHOWN", exact: c.differenceExact, value: view.difference.value, text: view.difference.text },
        },
        checks: {
          laneValue: "EQUAL", officialSnapshot: b.checks.officialSnapshot,
          artifactProjection: "EQUAL", artifactLine: "EQUAL", artifactDifference: "EQUAL", artifactSide: "EQUAL", artifactBook: "EQUAL", artifactQuote: "EQUAL",
          comparisonRule: LINE_COMPARISON_RULE, viewRule: PROP_LINE_VIEW_RULE, directionGate: `publicDirectionGate(nba, ${fam.surface})`,
        },
        provenance: { ...b.provenance, artifact: artifactRef?.path ?? null, artifactEncSha256: artifactRef?.encSha256 ?? null },
      });
    }
    artifactBlock = {
      schemaVersion: artifact.schemaVersion ?? NBA_LINE_PUBLICATION_SCHEMA,
      path: artifactRef?.path ?? null,
      encSha256: artifactRef?.encSha256 ?? null,
      asOf: artifact.asOf ?? null,
      dataClass: artifact.dataClass ?? null,
      testData: artifact.dataClass !== REAL_ARTIFACT_DATA_CLASS,
      laneSha256: artifact.provenance?.lane?.sha256 ?? null,
      captureReceipt: artifact.provenance?.capture?.receipt ?? null,
      provider: artifact.provenance?.capture?.provider ?? null,
      validation: "validateNbaLinePublication ok",
    };
  }

  // MODEL-ONLY medians (values mode only): every canonical, graphic-eligible median of a qualified family in a game that
  // has not tipped that has NO compared row (no line, stale line, suspended, ...). A box-score card prints these grey with
  // no line or price; they carry no market field at all, so they can never be read as a comparison.
  const modelOnly = [];
  if (valuesAllowed) {
    const compared = new Set(rows.map((r) => r.rowId));
    const included = new Set(base.scope.eventsIncluded.map((e) => e.eventId));
    for (const b of base.rows) {
      if (b.kind !== "PLAYER_PROP" || compared.has(b.rowId)) continue;
      const f = b.identity.market;
      if (!fam.qualifiedFamilies.includes(f) || !b.graphicEligibility.eligible || !included.has(b.identity.eventId)) continue;
      if (!(instantMs(b.identity.tipUtc ?? tipOf.get(b.identity.eventId)) > t)) continue;
      modelOnly.push({
        rowId: b.rowId, kind: "PLAYER_PROP_MODEL_ONLY",
        identity: { ...b.identity, marketLabel: NBA_MARKET_LABEL[f] },
        officialForecast: b.officialForecast, snapshot: b.snapshot,
        model: modelBlock(b, b.identity.eventId, b.identity.playerId, f),
        comparison: { state: "NOT_COMPARED", reason: "NO_QUALIFIED_LINE" },
        checks: { laneValue: "EQUAL", officialSnapshot: b.checks.officialSnapshot },
        provenance: b.provenance,
      });
    }
  }
  const order = (x, y) => {
    const ex = base.scope.eventsIncluded.findIndex((e) => e.eventId === x.identity.eventId), ey = base.scope.eventsIncluded.findIndex((e) => e.eventId === y.identity.eventId);
    return ex - ey || familyOrder(x.identity.market) - familyOrder(y.identity.market) || (y.model.expectedMinutes ?? 0) - (x.model.expectedMinutes ?? 0) || String(x.identity.playerId).localeCompare(String(y.identity.playerId));
  };
  rows.sort(order);
  modelOnly.sort(order);
  const events = base.scope.eventsIncluded.map((e) => {
    const ids = rows.filter((r) => r.identity.eventId === e.eventId).map((r) => r.rowId);
    const side = (s) => rows.filter((r) => r.identity.eventId === e.eventId && r.market.direction.side === s).length;
    const be = base.events.find((x) => x.eventId === e.eventId);
    return { ...e, snapshotId: be?.snapshotId ?? null, rows: ids.length, over: side("OVER"), under: side("UNDER"), neutral: side("NEUTRAL"), rowIds: ids };
  });
  const shown = valuesAllowed;
  return {
    schemaVersion: LINE_GRAPHICS_SCHEMA,
    sport: "nba",
    edition: { kind: LINE_GRAPHICS_EDITION, key: date, date },
    purpose,
    socialAuthorized: review ? false : social.ok,
    asOf,
    publication: {
      status: base.publication.status !== "PUBLISHED" ? base.publication.status : !shown ? "LINES_WITHHELD" : rows.length ? "PUBLISHED" : "NO_COMPARISONS",
      lane: base.publication.lane, laneSha256,
    },
    authorization: {
      rule: DISPLAY_AUTHORIZATION_RULE,
      social: { authorized: social.ok, reasons: social.reasons },
      socialPrices: { authorized: socialPrices.ok, reasons: socialPrices.reasons },
      valuesIncluded: shown, pricesIncluded: shown && pricesAllowed,
      directionGate: { surface: fam.surface, qualifiedFamilies: fam.qualifiedFamilies, unqualifiedFamilies: fam.unqualifiedFamilies },
    },
    contract: {
      rows: "one official median of a direction-qualified family beside one sportsbook line (most recent pre-tip capture, REFERENCE_BOOK_ORDER tie-break)",
      bookOrder: REFERENCE_BOOK_ORDER,
      rounding: DISPLAY_ROUNDING_POLICY,
      freshness: `line captured before tip and at most ${LINE_MAX_AGE_HOURS} h before asOf`,
      sportsbookFields: "SHOWN only when purpose FOUNDER_REVIEW_ONLY or the social surface is authorized; prices and book additionally need socialPrices outside founder review",
      determinism: "no wall-clock field; identical inputs, asOf and purpose give identical bytes",
    },
    legend: COMPARISON_LEGEND,
    artifact: artifactBlock,
    scope: {
      rule: "Games that have not tipped off at asOf; started games, stale or unmatched lines and unqualified families never contribute a row.",
      eventsIncluded: base.scope.eventsIncluded,
      eventsExcludedStarted: base.scope.eventsExcludedStarted,
      excludedByReason: sortKeys(excluded),
    },
    events,
    rows,
    ...(valuesAllowed ? { modelOnly } : {}),
    inputs: base.inputs,
    usageRules: LINE_USAGE_RULES,
  };
}

export const serializeLineGraphicsExport = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

const MARKET_FIELDS = ["line", "book", "overPrice", "underPrice", "quotedAt", "direction", "difference"];
const containsNumber = (v) => (isNum(v) ? true : Array.isArray(v) ? v.some(containsNumber) : v && typeof v === "object" ? Object.values(v).some(containsNumber) : false);

/**
 * Every rule of the @2 line edition on a finished document; [] when it holds. The CLIs refuse to write otherwise.
 * @param {any} doc
 * @param {{ authorizationRecord?: object }} [o]
 */
export function lineGraphicsExportViolations(doc, { authorizationRecord = DISPLAY_AUTHORIZATION } = {}) {
  const v = [];
  if (doc?.schemaVersion !== LINE_GRAPHICS_SCHEMA) v.push(`schemaVersion is ${JSON.stringify(doc?.schemaVersion)}`);
  if (doc?.edition?.kind !== LINE_GRAPHICS_EDITION) v.push("edition is not NBA_LINE_COMPARISON");
  if (!Object.values(PURPOSE).includes(doc?.purpose)) v.push(`purpose ${JSON.stringify(doc?.purpose)}`);
  const review = doc?.purpose === PURPOSE.FOUNDER_REVIEW;
  if (review && doc.socialAuthorized !== false) v.push("a founder-review document must say socialAuthorized:false");
  const social = displayAuthorization("nba", "social", authorizationRecord).ok;
  const prices = displayAuthorization("nba", "socialPrices", authorizationRecord).ok;
  if (!review && doc?.socialAuthorized !== social) v.push("socialAuthorized disagrees with the authorization record");
  const valuesOk = review || social, pricesOk = review || prices;
  const asOf = Date.parse(doc?.asOf ?? "");
  if (!Number.isFinite(asOf)) v.push("asOf missing");
  const qualified = new Set(LINE_FAMILY_ORDER.filter((f) => directionAuthorization("nba", f, "site", authorizationRecord).ok));
  const seen = new Set();
  for (const r of doc?.rows ?? []) {
    const id = r?.rowId ?? "?";
    if (seen.has(id)) v.push(`${id}: duplicate rowId`);
    seen.add(id);
    if (r?.model?.status !== MODEL_STATUS.OFFICIAL || !isNum(r?.model?.value)) v.push(`${id}: not an official median`);
    if (r?.model?.display !== fmt1(r?.model?.value)) v.push(`${id}: model display is not the 1 dp of the value`);
    if (!qualified.has(r?.identity?.market)) v.push(`${id}: family ${r?.identity?.market} is not direction-qualified`);
    if (!r?.snapshot?.id) v.push(`${id}: no official snapshot id`);
    const tip = instantMs(r?.identity?.tipUtc);
    if (!(tip > asOf)) v.push(`${id}: game started at asOf`);
    const m = r?.market ?? {};
    for (const k of MARKET_FIELDS) {
      const f = m[k];
      if (!f || !["SHOWN", "WITHHELD"].includes(f.state)) v.push(`${id}: market.${k} has no state`);
      if (f?.state === "WITHHELD" && (containsNumber(f) || Object.keys(f).some((x) => !["state", "reason"].includes(x)))) v.push(`${id}: withheld market.${k} carries more than state/reason`);
      const priceField = ["book", "overPrice", "underPrice"].includes(k);
      if (f?.state === "SHOWN" && !(priceField ? pricesOk : valuesOk)) v.push(`${id}: market.${k} shown without authorization`);
    }
    if (m.line?.state === "SHOWN") {
      if (m.line.text !== lineText(m.line.value)) v.push(`${id}: line text`);
      const exact = r.model.value - m.line.value;
      if (m.difference?.exact !== exact) v.push(`${id}: difference is not model − line at full precision`);
      if (m.difference?.text !== signedDifference(exact).text) v.push(`${id}: difference text breaks the rounding policy`);
      const side = exact > 0 ? "OVER" : exact < 0 ? "UNDER" : "NEUTRAL";
      if (m.direction?.side !== side || m.direction?.word !== side || m.direction?.glyph !== SIDE_GLYPH[side]) v.push(`${id}: direction disagrees with the sign of the difference`);
      const cap = Date.parse(m.quotedAt?.iso ?? "");
      if (!(cap < tip) || Math.min(asOf, tip) - cap > LINE_MAX_AGE_HOURS * 3600_000 || cap > asOf) v.push(`${id}: stale or post-tip line`);
      if (m.quotedAt?.et !== quoteTimeEt(m.quotedAt?.iso)) v.push(`${id}: quote time text`);
      if (m.overPrice?.state === "SHOWN" && m.overPrice.text !== americanPrice(m.overPrice.value).text) v.push(`${id}: over price text`);
      if (m.underPrice?.state === "SHOWN" && m.underPrice.text !== americanPrice(m.underPrice.value).text) v.push(`${id}: under price text`);
    }
  }
  for (const r of doc?.modelOnly ?? []) {
    const id = r?.rowId ?? "?";
    if (seen.has(id)) v.push(`${id}: model-only entry duplicates a row`);
    seen.add(id);
    if (!valuesOk) v.push(`${id}: model-only block present without authorization`);
    if (r?.kind !== "PLAYER_PROP_MODEL_ONLY" || r?.comparison?.state !== "NOT_COMPARED") v.push(`${id}: model-only entry is not marked NOT_COMPARED`);
    if ("market" in (r ?? {})) v.push(`${id}: model-only entry carries a market block`);
    if (r?.model?.status !== MODEL_STATUS.OFFICIAL || !isNum(r?.model?.value)) v.push(`${id}: not an official median`);
    if (r?.model?.display !== fmt1(r?.model?.value)) v.push(`${id}: model display is not the 1 dp of the value`);
    if (!qualified.has(r?.identity?.market)) v.push(`${id}: family ${r?.identity?.market} is not direction-qualified`);
    if (!r?.snapshot?.id) v.push(`${id}: no official snapshot id`);
    if (!(instantMs(r?.identity?.tipUtc) > asOf)) v.push(`${id}: game started at asOf`);
  }
  const raw = JSON.stringify(doc ?? null);
  for (const b of ["data/internal", "PRIVATE_RESEARCH", "apiKey", "api_key", "GTP_ODDS_DISPLAY_KEY="]) if (raw.includes(b)) v.push(`banned string ${JSON.stringify(b)} in the export`);
  return v;
}
