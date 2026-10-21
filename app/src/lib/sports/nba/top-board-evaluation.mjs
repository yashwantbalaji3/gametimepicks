/**
 * NBA TOP BOARD ROW EVALUATION CONTRACT — PURE adapter from a frozen board row to the ONE shared Over/Under
 * evaluator (consistency/market-evaluator.mjs `evaluateMarket`). PRIVATE.
 *
 *   boardRowEvaluation(row, snapshot, price | null, { now, ... })
 *
 * RULES (founder: one official forecast; never invent odds or lines; a projection above a line is NOT an Over):
 *   - price null / undefined → state NO_AUTHORIZED_PRICE. evaluateMarket is NOT called. This is every row today.
 *   - the row's market is not modelled (R+A) → NOT_MODELLED, never evaluated.
 *   - a price object that is not a VERIFIED two-way price for exactly this row (kind, verified flag, provenance with
 *     an authorization reference, same event / athlete / statistic, a book, a finite line, both American prices, a
 *     capture instant) → PRICE_REJECTED with every reason. Not evaluated.
 *   - a price for a statistic that NBA_MARKET_CONFIG does not authorize → PRICE_REJECTED (MARKET_NOT_AUTHORIZED).
 *     Today NBA_MARKET_CONFIG.playerFamilyByProviderKey is empty, so EVERY real price is refused here.
 *   - a price object marked TEST FIXTURE → PRICE_REJECTED (PRICE_TEST_FIXTURE) unless `allowTestFixture` (tests only).
 *   - a row frozen from a family that is not the OFFICIAL player family (official-snapshot NBA_OFFICIAL_FAMILY, v0.1;
 *     v1 is a SUPPORTING_SIMULATION) → PRICE_REJECTED (NOT_OFFICIAL_FAMILY): a supporting board is never priced.
 *   - no official snapshot, a snapshot for another event, or a snapshot that disagrees with the frozen row (different
 *     game payload hash, or a different stored median for this player and statistic) → PRICE_REJECTED: the board
 *     would show one number and the evaluator would read another, which the one-official-forecast rule forbids.
 *   - otherwise → EVALUATED: `evaluation` IS the evaluateMarket result, unmodified. The lean, probabilities, edge and
 *     EV come only from it; this adapter computes none of them. A private snapshot / non-product sport still makes the
 *     evaluation unqualified (the evaluator's own PUBLICATION_PRIVATE / SPORT_NOT_PRODUCT_ELIGIBLE reasons).
 *
 * Snapshot contract: official-snapshot.mjs (#1149) carries pts, reb, ast, threePm, pra, ptsReb, ptsAst (support
 * "integer" → the evaluator's continuity rule) and minutes; rebAst is in `snapshot.notModelled`. A family the
 * snapshot lacks is the evaluator's own FAMILY_NOT_IN_SNAPSHOT (blocking).
 */
import { evaluateMarket } from "../../consistency/market-evaluator.mjs";
import { NBA_OFFICIAL_FAMILY } from "../../consistency/official-snapshot.mjs";
import { NBA_MARKET_CONFIG } from "../../markets/sport-config.ts";
import { NOT_MODELLED_CATEGORIES } from "./top-boards.mjs";
import { NO_AUTHORIZED_PRICE } from "./top-board-rows.mjs";

export const ROW_EVALUATION_VERSION = "nba-top-board-row-evaluation@1";
export const VERIFIED_PRICE_KIND = "nba-player-prop-price@1";
export const TEST_FIXTURE_MARK = "TEST FIXTURE";
export const NBA_MARKETS_DECISION_ID = "decision-nba-markets-authorization";

export const ROW_EVALUATION_STATE = Object.freeze({
  NO_AUTHORIZED_PRICE,
  NOT_MODELLED: "NOT_MODELLED",
  PRICE_REJECTED: "PRICE_REJECTED",
  EVALUATED: "EVALUATED",
});

export const PRICE_REJECTION = Object.freeze({
  PRICE_MALFORMED: "PRICE_MALFORMED",
  PRICE_NOT_VERIFIED: "PRICE_NOT_VERIFIED",
  PRICE_NO_PROVENANCE: "PRICE_NO_PROVENANCE",
  PRICE_TEST_FIXTURE: "PRICE_TEST_FIXTURE",
  PRICE_SUBJECT_MISMATCH: "PRICE_SUBJECT_MISMATCH",
  PRICE_NOT_TWO_WAY: "PRICE_NOT_TWO_WAY",
  NOT_OFFICIAL_FAMILY: "NOT_OFFICIAL_FAMILY",
  MARKET_NOT_AUTHORIZED: "MARKET_NOT_AUTHORIZED",
  NO_SNAPSHOT: "NO_SNAPSHOT",
  SNAPSHOT_EVENT_MISMATCH: "SNAPSHOT_EVENT_MISMATCH",
  BOARD_SNAPSHOT_DIVERGED: "BOARD_SNAPSHOT_DIVERGED",
});

/**
 * Board statistic → The Odds API player-prop market key (the vocabulary pipeline/config.py and
 * pipeline/probe_nba_markets.py use). P+R / P+A keys are the provider's names; whether each is offered is a probe
 * question, not an assumption.
 */
export const NBA_PROVIDER_KEY_BY_STAT = Object.freeze({
  pts: "player_points",
  reb: "player_rebounds",
  ast: "player_assists",
  threePm: "player_threes",
  pra: "player_points_rebounds_assists",
  ptsReb: "player_points_rebounds",
  ptsAst: "player_points_assists",
});

/** The statistics NBA_MARKET_CONFIG authorizes (a provider key mapped to a player family). Empty today. */
export function authorizedNbaStats(config = NBA_MARKET_CONFIG) {
  const byKey = config?.playerFamilyByProviderKey ?? {};
  return Object.entries(NBA_PROVIDER_KEY_BY_STAT).filter(([, key]) => Object.prototype.hasOwnProperty.call(byKey, key)).map(([stat]) => stat);
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isStr = (v) => typeof v === "string" && v.trim() !== "";
const NOT_MODELLED_KEYS = new Set(NOT_MODELLED_CATEGORIES.map((c) => c.key));

/** Structural checks of a price object against the row. Returns every failing reason (empty = verified). */
export function priceRejections(row, price, { allowTestFixture = false } = {}) {
  const r = [];
  if (!price || typeof price !== "object" || Array.isArray(price)) return [PRICE_REJECTION.PRICE_MALFORMED];
  if (price.kind !== VERIFIED_PRICE_KIND) r.push(PRICE_REJECTION.PRICE_MALFORMED);
  if (price.verified !== true) r.push(PRICE_REJECTION.PRICE_NOT_VERIFIED);
  const pv = price.provenance;
  if (!pv || !isStr(pv.provider) || !isStr(pv.captureId) || !isStr(pv.authorizationRef)) r.push(PRICE_REJECTION.PRICE_NO_PROVENANCE);
  if (price.fixture === TEST_FIXTURE_MARK && !allowTestFixture) r.push(PRICE_REJECTION.PRICE_TEST_FIXTURE);
  if (String(price.eventId) !== String(row?.eventId) || String(price.providerAthleteId) !== String(row?.player?.providerAthleteId) || price.stat !== row?.stat) r.push(PRICE_REJECTION.PRICE_SUBJECT_MISMATCH);
  if (!isStr(price.book) || !isNum(price.line) || !isStr(price.capturedAt) || !Number.isFinite(Date.parse(price.capturedAt))) r.push(PRICE_REJECTION.PRICE_MALFORMED);
  if (!isNum(price.overAmerican) || !isNum(price.underAmerican)) r.push(PRICE_REJECTION.PRICE_NOT_TWO_WAY);
  return [...new Set(r)];
}

/** Does the official snapshot describe the same frozen forecast as the board row? Returns reasons (empty = same). */
export function snapshotRejections(row, snapshot) {
  if (!snapshot?.snapshotId) return [PRICE_REJECTION.NO_SNAPSHOT];
  const r = [];
  if (snapshot.sport !== "NBA" || String(snapshot.eventId) !== String(row?.eventId)) r.push(PRICE_REJECTION.SNAPSHOT_EVENT_MISMATCH);
  const official = (snapshot.sources ?? []).find((s) => s.role === "OFFICIAL");
  const rowPayload = row?.receipt?.gamePayloadSha256 ?? null;
  if (official?.inputRef && rowPayload && official.inputRef !== rowPayload) r.push(PRICE_REJECTION.BOARD_SNAPSHOT_DIVERGED);
  const p = (snapshot.players ?? []).find((x) => x.playerId === String(row?.player?.providerAthleteId));
  const fam = p?.families?.[row?.stat];
  if (fam && isNum(fam.median) && isNum(row?.projection?.p50) && fam.median !== row.projection.p50) r.push(PRICE_REJECTION.BOARD_SNAPSHOT_DIVERGED);
  return [...new Set(r)];
}

/**
 * @param row       a frozen board row (top-boards.mjs)
 * @param snapshot  the OFFICIAL NBA snapshot for the row's event (consistency/official-snapshot.mjs), or null
 * @param price     a verified price object ({ kind: VERIFIED_PRICE_KIND, verified: true, provenance, eventId,
 *                  providerAthleteId, stat, book, line, overAmerican, underAmerican, capturedAt }) or null
 * @param o         { now (ISO, required to evaluate), authorizedStats?, allowTestFixture?, evaluate? (injected for tests) }
 */
export function boardRowEvaluation(row, snapshot, price, { now = null, authorizedStats = authorizedNbaStats(), allowTestFixture = false, evaluate = evaluateMarket } = {}) {
  const base = {
    version: ROW_EVALUATION_VERSION,
    rowId: row?.rowId ?? null,
    stat: row?.stat ?? null,
    authorization: { decisionId: NBA_MARKETS_DECISION_ID, authorizedStats: [...authorizedStats] },
    book: null, line: null, overAmerican: null, underAmerican: null, capturedAt: null,
    evaluation: null,
  };
  if (NOT_MODELLED_KEYS.has(row?.category) || row?.stat == null) return { ...base, state: ROW_EVALUATION_STATE.NOT_MODELLED, reasonCodes: [ROW_EVALUATION_STATE.NOT_MODELLED] };
  if (price == null) return { ...base, state: ROW_EVALUATION_STATE.NO_AUTHORIZED_PRICE, reasonCodes: [NO_AUTHORIZED_PRICE] };

  const reasons = [...priceRejections(row, price, { allowTestFixture })];
  if (!authorizedStats.includes(row.stat)) reasons.push(PRICE_REJECTION.MARKET_NOT_AUTHORIZED);
  if (row.family !== NBA_OFFICIAL_FAMILY) reasons.push(PRICE_REJECTION.NOT_OFFICIAL_FAMILY);
  reasons.push(...snapshotRejections(row, snapshot));
  const reasonCodes = [...new Set(reasons)];
  if (reasonCodes.length) return { ...base, state: ROW_EVALUATION_STATE.PRICE_REJECTED, reasonCodes };

  const evaluation = evaluate({
    snapshot,
    playerId: String(row.player.providerAthleteId),
    family: row.stat,
    line: price.line,
    book: price.book,
    overAmerican: price.overAmerican,
    underAmerican: price.underAmerican,
    capturedAt: price.capturedAt,
    now,
  });
  return {
    ...base,
    state: ROW_EVALUATION_STATE.EVALUATED,
    reasonCodes: evaluation?.withheldReasons ?? [],
    book: price.book, line: price.line, overAmerican: price.overAmerican, underAmerican: price.underAmerican, capturedAt: price.capturedAt,
    fixture: price.fixture === TEST_FIXTURE_MARK ? TEST_FIXTURE_MARK : null,
    evaluation,
  };
}
