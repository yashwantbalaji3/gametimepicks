/**
 * PROTOTYPE · Stage 5 prep (Product Engine, local only). NOT WIRED: no surface imports this module.
 *
 * TOP BOARD MEMBERSHIP / RANK RECEIPT, STANDARD WINDOWS, AND FAMILY-vs-BOARD PERFORMANCE.
 *
 * The universal prediction object (roadmap §3) is mostly the Forecast Ledger row that already exists
 * (lib/forecast-ledger/contract.mjs: identity, event, subject, family, model, publication, projection/probability,
 * market, settlement, measurement). What the ledger does NOT hold is board membership and rank: a forecast that was
 * #3 on a frozen Top-5 is one ledger row, and nothing records that it was #3. This module adds that missing piece as
 * its own append-only receipt that JOINS to ledger rows by `ledgerForecastId`, so one prediction serves many surfaces
 * and is still counted once (roadmap §2.4).
 *
 * SETTLED HERE (invariants already in force; each has a test):
 *   · A board record counts only rows whose membership and rank were frozen before that row's event start
 *     (roadmap §4). A receipt frozen at/after any member's start is invalid, not "partly valid".
 *   · Top-N is a maximum, not a quota (freeze-daily-top-boards.mjs rule). Ranks are 1..k, contiguous, unique.
 *   · Membership is never revised: a withdrawal is an append-only event beside the receipt (top-board-withdrawals).
 *   · A ranking metric that is a sportsbook price is typed MARKET_IMPLIED and never presented as a GTP number.
 *   · Outcomes reuse the Stage 3 denominator words. Only WIN and LOSS decide; PUSH / VOID / PENDING / NO_PICK /
 *     UNKNOWN are shown beside the record and are never a loss; nothing decided is "no record" (null), never 0–0.
 *   · A board member with no ledger row of record is disclosed as UNJOINED, never a loss and never dropped silently.
 *   · Continuous (projection) families have no W–L unless a side was frozen pregame (Stage 3 Q3): their board rows are
 *     measured by the owner's range/error words, reported separately as NOT_DIRECTIONAL.
 *
 * NOT SETTLED (inputs here, decided elsewhere):
 *   · Whether a Top Board is a DISPLAY surface (ranked forecasts, maturity-labelled) or a PROMOTED product (Stage 4 Q9).
 *     The receipt only records `maturityAtFreeze` and `eligibilityVersion` as the Stage 4 contract returned them.
 *   · Whether a GTP-probability ranking may be public (roadmap §10: GTP-probability selectors stay SHADOW until the
 *     family validates). The receipt records `selectorStatus`; it never upgrades it.
 *   · Season start per sport (owner decision; passed in).
 *   · Which outcome word an owner gives a row (Results / Stage 3 owners). This module never re-grades.
 *
 * Pure: no fs, no clock, no imports.
 */

export const TOP_BOARD_SCHEMA = "top-board-receipt@0"; // 0 = prototype

export const BOARD_SIZE = Object.freeze({ TOP_10: 10, TOP_5: 5 });

/** What the ranking metric is. Only MODEL_* metrics are GameTimePicks numbers. */
export const METRIC_KIND = Object.freeze({
  MODEL_PROBABILITY: "MODEL_PROBABILITY",
  MODEL_MEDIAN: "MODEL_MEDIAN",
  MODEL_EDGE: "MODEL_EDGE", // model vs market; still a GTP-probability selector
  MARKET_IMPLIED: "MARKET_IMPLIED",
});
export const GTP_PROBABILITY_METRICS = Object.freeze(new Set([METRIC_KIND.MODEL_PROBABILITY, METRIC_KIND.MODEL_EDGE]));

/**
 * Selector status of the ranking rule (roadmap §10). Never upgraded by this module.
 *   SHADOW: computed and frozen, not shown.  PUBLIC_RANKED_FORECAST: shown as a ranked list of published forecasts,
 *   drives no product.  ADOPTED: drives a promoted product; needs a founder adoption reference.
 */
export const SELECTOR_STATUS = Object.freeze({ SHADOW: "SHADOW", PUBLIC_RANKED_FORECAST: "PUBLIC_RANKED_FORECAST", ADOPTED: "ADOPTED" });

/** Outcome words: identical to Stage 3A forecast-of-record OUTCOME (replace with an import once 3A is on main). */
export const OUTCOME = Object.freeze({ WIN: "WIN", LOSS: "LOSS", PUSH: "PUSH", VOID: "VOID", PENDING: "PENDING", NO_PICK: "NO_PICK", UNKNOWN: "UNKNOWN" });
const BESIDE = [OUTCOME.PUSH, OUTCOME.VOID, OUTCOME.PENDING, OUTCOME.NO_PICK, OUTCOME.UNKNOWN];

const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Validate a receipt. Returns problems (empty = valid).
 *
 * Receipt shape:
 * { schema, boardId, sport, family, boardType: "TOP_10"|"TOP_5", scopeDate (ET day), frozenAt,
 *   rankingRule: { id, metricKind, tiebreak }, selectorStatus, modelId, modelVersion, generation,
 *   maturityAtFreeze, eligibilityVersion,
 *   rows: [{ rank, ledgerForecastId, claimKey, eventId, eventStartUtc, subjectType, subjectId, metricValue,
 *            line, frozenSide }],
 *   ineligibleCount }
 */
export function validateBoardReceipt(r) {
  const p = [];
  if (!r || typeof r !== "object") return ["receipt is not an object"];
  if (r.schema !== TOP_BOARD_SCHEMA) p.push("schema");
  for (const k of ["boardId", "sport", "family", "scopeDate"]) if (typeof r[k] !== "string" || !r[k]) p.push(k);
  const size = BOARD_SIZE[r.boardType];
  if (!size) p.push(`boardType ${r.boardType}`);
  if (!isIso(r.frozenAt)) p.push("frozenAt");
  if (!Object.values(METRIC_KIND).includes(r.rankingRule?.metricKind)) p.push("rankingRule.metricKind");
  if (!Object.values(SELECTOR_STATUS).includes(r.selectorStatus)) p.push("selectorStatus");
  // ADOPTED (the ranking drives a promoted product) always needs a founder adoption reference; for a GTP-probability
  // metric that is roadmap §10 (SHADOW until the family validates). PUBLIC_RANKED_FORECAST is a display-only ranking of
  // published forecasts (today's live NFL Top-5); whether that stays allowed is Stage 4 Q9, not decided here.
  if (r.selectorStatus === SELECTOR_STATUS.ADOPTED && !r.adoptionRef) p.push("ADOPTED ranking without a founder adoption reference");
  if (r.rankingRule?.metricKind === METRIC_KIND.MARKET_IMPLIED && r.selectorStatus === SELECTOR_STATUS.PUBLIC_RANKED_FORECAST) {
    p.push("a sportsbook-price ranking is not a ranked GameTimePicks forecast");
  }
  if (typeof r.maturityAtFreeze !== "string" || !r.maturityAtFreeze) p.push("maturityAtFreeze");
  const rows = Array.isArray(r.rows) ? r.rows : (p.push("rows"), []);
  if (size && rows.length > size) p.push(`more rows (${rows.length}) than ${r.boardType}`);
  const frozenMs = Date.parse(r.frozenAt);
  const seen = new Set();
  rows.forEach((row, i) => {
    if (row.rank !== i + 1) p.push(`row ${i}: rank ${row.rank} is not ${i + 1} (ranks are 1..k, contiguous, in order)`);
    if (typeof row.ledgerForecastId !== "string" || !/^fl1-[0-9a-f]{16}$/.test(row.ledgerForecastId)) p.push(`row ${i}: ledgerForecastId`);
    if (seen.has(row.ledgerForecastId)) p.push(`row ${i}: duplicate member`);
    seen.add(row.ledgerForecastId);
    if (!row.eventId || !row.subjectId) p.push(`row ${i}: identity (never inferred)`);
    if (!isIso(row.eventStartUtc)) p.push(`row ${i}: eventStartUtc`);
    else if (!(frozenMs < Date.parse(row.eventStartUtc))) p.push(`row ${i}: membership frozen at/after its event start`);
    if (!isNum(row.metricValue)) p.push(`row ${i}: metricValue`);
  });
  if (!(isNum(r.ineligibleCount) && r.ineligibleCount >= 0) && r.ineligibleCount !== null) p.push("ineligibleCount");
  return p;
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Standard windows (roadmap §4): Yesterday, 3D, 7D, 10D, 30D, Season, All-Time.                                  */
/* Basis: the ET calendar day of the canonical (rescheduled) event start: the majority basis today (NFL, EPL).     */
/* Anchor: the READER's ET day, passed in (never the build clock). Windows END YESTERDAY: today is still playing.   */
/* ------------------------------------------------------------------------------------------------------------- */

export const WINDOW = Object.freeze({ YESTERDAY: "YESTERDAY", D3: "D3", D7: "D7", D10: "D10", D30: "D30", SEASON: "SEASON", ALL_TIME: "ALL_TIME" });
const SPAN = { YESTERDAY: 1, D3: 3, D7: 7, D10: 10, D30: 30 };

export function etDayOf(iso) {
  const ms = Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

/** Inclusive [from, to] ET-day bounds for a window, or null bounds for ALL_TIME. `seasonStart` is per sport, passed in. */
export function windowBounds(window, { readerEtDay, seasonStart = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readerEtDay ?? "")) throw new Error("windowBounds: readerEtDay (YYYY-MM-DD) is required");
  const to = addDays(readerEtDay, -1);
  if (window === WINDOW.ALL_TIME) return { from: null, to };
  if (window === WINDOW.SEASON) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(seasonStart ?? "")) throw new Error("windowBounds: SEASON needs the sport's seasonStart");
    return { from: seasonStart, to };
  }
  if (!SPAN[window]) throw new Error(`windowBounds: unknown window ${window}`);
  return { from: addDays(readerEtDay, -SPAN[window]), to };
}

export function inWindow(eventStartUtc, bounds) {
  const d = etDayOf(eventStartUtc);
  if (!d) return false; // an unknown start is never placed in a window (and never zero)
  return (bounds.from == null || d >= bounds.from) && d <= bounds.to;
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Family vs board performance                                                                                   */
/* ------------------------------------------------------------------------------------------------------------- */

function emptyTally() { return { WIN: 0, LOSS: 0, PUSH: 0, VOID: 0, PENDING: 0, NO_PICK: 0, UNKNOWN: 0 }; }
function finish(t, extra = {}) {
  const decided = t.WIN + t.LOSS;
  return { ...t, decided, hitRate: decided ? t.WIN / decided : null, ...extra };
}

/**
 * One family's performance, three ways, over one window:
 *   family: every forecast of record in the family (the full-family record),
 *   top10 / top5: only forecasts that were members of a VALID frozen receipt of that size, at or above the cut.
 *
 * @param {object} a
 * @param {Array<{ledgerForecastId:string, eventStartUtc:string, outcome:string, directional:boolean}>} a.ofRecord
 *        Rows of record for the family, from the Stage 3 forecast-of-record owner (already deduplicated). `directional`
 *        is false for projection rows with no frozen side: those never get a W–L here.
 * @param {object[]} a.receipts  board receipts for the family
 * @param {{from:string|null,to:string}} a.bounds
 */
export function familyAndBoardPerformance({ ofRecord, receipts, bounds }) {
  const byId = new Map();
  for (const r of ofRecord ?? []) if (r?.ledgerForecastId) byId.set(r.ledgerForecastId, r);

  const tallyOf = (rows) => {
    const t = emptyTally();
    let notDirectional = 0;
    for (const r of rows) {
      if (!r.directional) { notDirectional++; continue; }
      const o = Object.values(OUTCOME).includes(r.outcome) ? r.outcome : OUTCOME.UNKNOWN;
      t[o]++;
    }
    return { t, notDirectional };
  };

  const fam = tallyOf([...byId.values()].filter((r) => inWindow(r.eventStartUtc, bounds)));
  const out = { family: finish(fam.t, { notDirectional: fam.notDirectional }) };

  for (const [key, size] of [["top10", 10], ["top5", 5]]) {
    const members = new Map();
    let invalidReceipts = 0, unjoined = 0;
    for (const rc of receipts ?? []) {
      if (validateBoardReceipt(rc).length) { invalidReceipts++; continue; }
      if (BOARD_SIZE[rc.boardType] < size) continue; // a Top-5 board says nothing about ranks 6-10
      for (const row of rc.rows) {
        if (row.rank > size || !inWindow(row.eventStartUtc, bounds)) continue;
        const rec = byId.get(row.ledgerForecastId);
        if (!rec) { unjoined++; continue; }
        members.set(row.ledgerForecastId, rec); // one forecast, counted once even if on several boards
      }
    }
    const b = tallyOf([...members.values()]);
    out[key] = finish(b.t, { notDirectional: b.notDirectional, unjoined, invalidReceipts });
  }
  return out;
}

export const SHOWN_BESIDE = Object.freeze(BESIDE);
