/**
 * NBA PROP PRICES → THE SHARED EVALUATOR. Pure; the caller passes the evaluator, the snapshot and the clock.
 *
 * The one Over/Under evaluator is lib/consistency/market-evaluator.mjs `evaluateMarket` (on main), and the NBA
 * official snapshot is lib/consistency/official-snapshot.mjs `nbaOfficialSnapshot` (PR 1149's canonical version).
 * This bridge does exactly two things and nothing else:
 *   1. Checks the price record and the snapshot describe the same event, and that the record's family is one the
 *      snapshot schema names — otherwise it refuses with a reason and never calls the evaluator.
 *   2. Hands the evaluator the record's numbers VERBATIM (line, both American prices, book, provider capture time)
 *      and returns the evaluator's result VERBATIM. No probability, edge, EV or lean is computed, rounded or
 *      re-derived here — "numbers copied, never recomputed".
 *
 * TODAY EVERY RESULT IS UNQUALIFIED. The NBA snapshot's player families are PRIVATE_SHADOW (not PUBLISHED), and the
 * sport registry keeps NBA out of prediction products, so the evaluator returns FAMILY_NOT_PUBLISHED and
 * `eligibility.qualified === false` for every NBA price. The bridge surfaces that; it never overrides it.
 *
 * DEPENDENCY INJECTION: the evaluator is a parameter so this module has no import edge into consistency/ (whose
 * snapshot module PR 1149 is still changing). The test runs against the REAL evaluator from main.
 */
import { PRICE_RECORD_SCHEMA, FAMILY_BY_KEY } from "./contract.mjs";

export const BRIDGE_VERSION = "nba-props-evaluator-bridge@1";
export const BRIDGE_REFUSAL = Object.freeze({
  NO_EVALUATOR: "NO_EVALUATOR",
  NOT_A_PRICE_RECORD: "NOT_A_PRICE_RECORD",
  NO_SNAPSHOT: "NO_SNAPSHOT",
  EVENT_MISMATCH: "EVENT_MISMATCH",
  SPORT_MISMATCH: "SPORT_MISMATCH",
  FAMILY_UNKNOWN: "FAMILY_UNKNOWN",
});

/** The exact evaluator input for a record: every number is the record's own field. */
export function evaluatorInput(record, snapshot, now) {
  return {
    snapshot,
    playerId: record.providerAthleteId,
    family: record.family,
    line: record.line,
    book: record.book,
    overAmerican: record.overAmerican,
    underAmerican: record.underAmerican,
    capturedAt: record.capturedAt,
    now,
  };
}

/**
 * @param {object} record     a `gtp.nba.prop-price@1` record (parse.mjs)
 * @param {object} snapshot   nbaOfficialSnapshot(eventId, …)
 * @param {{ evaluateMarket: (input: object) => object, now: string }} deps
 */
export function evaluatePriceRecord(record, snapshot, { evaluateMarket, now } = {}) {
  const refuse = (reason, detail = null) => ({ version: BRIDGE_VERSION, state: "REFUSED", reason, detail, recordId: record?.recordId ?? null, evaluation: null, qualified: false });
  if (typeof evaluateMarket !== "function") return refuse(BRIDGE_REFUSAL.NO_EVALUATOR, "the shared evaluator must be passed in");
  if (record?.schema !== PRICE_RECORD_SCHEMA) return refuse(BRIDGE_REFUSAL.NOT_A_PRICE_RECORD);
  if (!snapshot?.snapshotId) return refuse(BRIDGE_REFUSAL.NO_SNAPSHOT);
  if (String(snapshot.sport ?? "").toUpperCase() !== "NBA") return refuse(BRIDGE_REFUSAL.SPORT_MISMATCH, String(snapshot.sport));
  if (String(snapshot.eventId) !== String(record.eventId)) return refuse(BRIDGE_REFUSAL.EVENT_MISMATCH, `${record.eventId} vs snapshot ${snapshot.eventId}`);
  if (!FAMILY_BY_KEY[record.family]) return refuse(BRIDGE_REFUSAL.FAMILY_UNKNOWN, record.family);
  const evaluation = evaluateMarket(evaluatorInput(record, snapshot, now));
  return {
    version: BRIDGE_VERSION,
    state: "EVALUATED",
    reason: null,
    detail: null,
    recordId: record.recordId,
    snapshotId: snapshot.snapshotId,
    evaluation,
    qualified: evaluation?.eligibility?.qualified === true,
  };
}
