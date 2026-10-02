/**
 * SOURCE ADAPTERS — existing owners → RecommendationReceiptV2. Pure: no fs, no clock.
 *
 * ⚠ NO NEW NORMALISER. Team markets come from the v1.7 normalizers (normalize-mlb/-nfl/-epl/-ufc),
 * NFL player rows from the one board extractor (from-nfl-board.mjs), MLB props from the optimizer leg
 * pool the Suggested Parlays ladder reads. These functions only re-shape what those owners already
 * emit, and say where each probability came from.
 */
import { makeReceiptV2, PROBABILITY_DETAIL, LEG_CLASS } from "./receipt.mjs";
import { SETTLEMENT_SUPPORT } from "../candidate-universe.mjs";

/**
 * Which TEAM-market families have a canonical settler that has graded real cards. Recorded per sport
 * with the owner that proves it, so a report can be audited rather than trusted.
 */
export const TEAM_MARKET_SETTLEMENT = Object.freeze({
  mlb: { support: SETTLEMENT_SUPPORT.PROVEN, owner: "lib/products/mlb-team-market-grading.mjs → mr-dub/settled" },
  nfl: { support: SETTLEMENT_SUPPORT.PROVEN, owner: "nfl/settlement/<date>.json market paper record (PIT @ CLE 2026-10-01)" },
  epl: { support: SETTLEMENT_SUPPORT.PROVEN, owner: "lib/sports/soccer/settlement-contract.mjs → parlays/lab-settled" },
  ufc: { support: SETTLEMENT_SUPPORT.PROVEN, owner: "settle-lab-cards gradeUfcLeg → parlays/lab-settled" },
});

/** v1 forecastClass → V2 probability detail. A model number on an experimental owner stays experimental. */
function detailForV1(c) {
  switch (c.forecastClass) {
    case "VALIDATED_MODEL": return PROBABILITY_DETAIL.MODEL_PUBLISHED;
    case "EXPERIMENTAL_MODEL":
      if (typeof c.probability === "number") return PROBABILITY_DETAIL.MODEL_EXPERIMENTAL;
      return typeof c.marketImpliedProbability === "number" ? PROBABILITY_DETAIL.MARKET_IMPLIED : PROBABILITY_DETAIL.NONE;
    case "MARKET_IMPLIED_NO_FORECAST": return typeof c.marketImpliedProbability === "number" ? PROBABILITY_DETAIL.MARKET_IMPLIED : PROBABILITY_DETAIL.NONE;
    default: return PROBABILITY_DETAIL.NONE;
  }
}

/** A v1 normalizer candidate (team market / fight) → receipt. */
export function receiptFromV1Candidate(c) {
  const sport = String(c.sport ?? "").toLowerCase();
  const o = c.oddsForSide ?? null;
  return makeReceiptV2({
    legClass: LEG_CLASS.TEAM,
    sport, eventId: c.eventId, eventStartUtc: c.eventStartUtc,
    teamId: c.entityIds?.[0] ?? null, opponentId: c.entityIds?.[1] ?? null, matchup: c.displayMatchup,
    family: c.marketFamily, marketKey: c.marketKey, side: c.side, line: c.line,
    sportsbook: o?.bookmaker ?? null, price: o?.american ?? null, marketCapturedAt: o?.capturedAt ?? null, marketReceiptId: o?.receipt ?? null,
    marketImpliedProbability: c.marketImpliedProbability, selectionLabel: c.displaySelection,
    forecastOwner: c.forecastOwner, forecastId: c.forecastId, modelVersion: c.forecastId,
    probabilityDetail: detailForV1(c), modelProbability: c.probability,
    modelStatus: c.modelStatus, publicationStatus: c.modelStatus, generatedAt: c.publishedAt,
    settlementSupport: TEAM_MARKET_SETTLEMENT[sport]?.support ?? SETTLEMENT_SUPPORT.UNSUPPORTED,
    sourceRefs: c.sourceReceiptRefs,
  });
}

const NFL_BASIS_TO_DETAIL = Object.freeze({
  MODEL_PUBLISHED: PROBABILITY_DETAIL.MODEL_PUBLISHED,
  MODEL_DISTRIBUTION_UNCONVERTED: PROBABILITY_DETAIL.MODEL_DISTRIBUTION_UNCONVERTED,
  MARKET_IMPLIED: PROBABILITY_DETAIL.MARKET_IMPLIED,
  NONE: PROBABILITY_DETAIL.NONE,
});

/**
 * An NFL player-board candidate (from-nfl-board.mjs) → receipt.
 * ⚠ A board row's side is OVER for yardage/receptions and YES for anytime TD — the board publishes
 * the over/yes price; nothing here flips it.
 */
export function receiptFromNflBoardCandidate(c) {
  return makeReceiptV2({
    legClass: LEG_CLASS.PLAYER,
    sport: "nfl", eventId: c.eventId, eventStartUtc: c.eventStartUtc, matchup: c.matchup,
    participantId: c.participantId, participantDisplay: c.participant, teamId: c.team ? `nfl-team-${c.team}` : null, rosterTeam: c.team,
    family: c.marketFamily, marketKey: c.marketFamily, side: c.binary ? "yes" : "over", line: c.line, binary: c.binary,
    sportsbook: c.sportsbook, price: c.price, marketCapturedAt: c.marketCapturedAt, marketReceiptId: c.sportsbook ? "docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md" : null,
    forecastOwner: "nfl/player-board", modelVersion: c.modelVersion, projection: c.modelProjection, generatedAt: c.forecastGeneratedAt ?? null,
    probabilityDetail: NFL_BASIS_TO_DETAIL[c.probabilityBasis] ?? PROBABILITY_DETAIL.NONE, modelProbability: c.modelProbability,
    publicationStatus: c.familyState, modelStatus: c.familyState, familyValidationState: c.familyState,
    availabilityState: c.participation, roleState: c.participation,
    settlementSupport: c.settlementSupport, withheldReason: c.withheldReason ?? null,
    sourceRefs: c.provenance?.sourceReceiptRefs ?? [],
  });
}

/**
 * An MLB optimizer leg (the Suggested Parlays pool) → receipt.
 *
 * ⚠ THE OPTIMIZER CHOSE THE SIDE WITH THE MODEL'S EDGE, so a leg on a family the coverage registry
 * demotes is MODEL_DEMOTED — the F-1 rule, now a typed code instead of a card-level withhold.
 * ⚠ It carries no capture time and no canonical gamePk; both stay null (MARKET_MISSING / its own
 * odds-event id), never borrowed from the file's generatedAt.
 */
export function receiptFromMlbOptimizerLeg(l, { demotedFamilies, generatedAt = null } = {}) {
  const demoted = demotedFamilies?.has?.(`MLB:${l.market}`) === true;
  return makeReceiptV2({
    legClass: LEG_CLASS.PLAYER,
    sport: "mlb", eventId: l.gameId ? `oddsapi:${l.gameId}` : null, eventStartUtc: l.commenceTime ?? l.gameTime ?? null,
    participantId: l.playerId != null ? `mlb-player-${l.playerId}` : null, participantDisplay: l.playerName,
    teamId: l.team ? `mlb-team-abbr:${l.team}` : null, opponentId: l.opponent ? `mlb-team-abbr:${l.opponent}` : null, rosterTeam: l.team,
    family: l.market, marketKey: l.market, side: String(l.side ?? "").toLowerCase() || null, line: l.line,
    sportsbook: l.bookmaker, price: l.oddsForSide, marketCapturedAt: null,
    forecastOwner: "parlays/optimizer", forecastId: l.leanId, projection: l.projection, confidence: l.confidence,
    probabilityDetail: demoted ? PROBABILITY_DETAIL.MODEL_DEMOTED : PROBABILITY_DETAIL.MODEL_DISTRIBUTION_UNCONVERTED,
    publicationStatus: demoted ? "DEMOTED_TO_MARKET_CONTEXT" : null, modelStatus: demoted ? "DEMOTED_TO_MARKET_CONTEXT" : null,
    generatedAt, settlementSupport: SETTLEMENT_SUPPORT.PROVEN,
    sourceRefs: ["parlays/optimizer"],
  });
}
