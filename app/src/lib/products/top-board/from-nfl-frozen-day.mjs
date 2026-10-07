/**
 * PROTOTYPE · Stage 5 prep (not wired). Maps the one existing frozen rank receipt, the NFL daily Top-5 file
 * (public/data/results/top-boards/<ET-day>.json, scripts/results/freeze-daily-top-boards.mjs), onto the universal
 * board receipt. It proves the schema fits real frozen data; it invents nothing:
 *   · ledgerForecastId is the Forecast Ledger id the NFL adapter computes for the same row (sport NFL, PLAYER,
 *     playerId, family, BINARY for touchdowns / CONTINUOUS for yardage and receptions);
 *   · modelVersion stays null where the freezer wrote null; maturityAtFreeze is the owner's own word at freeze
 *     ("PUBLISHED" family state), not a Stage 4 maturity, because Stage 4 did not exist when it froze.
 */
import { forecastIdFor } from "../../forecast-ledger/identity.mjs";
import { TOP_BOARD_SCHEMA, METRIC_KIND, SELECTOR_STATUS } from "./top-board.mjs";

const KIND = (family) => (family === "anytime_td" ? "BINARY_PROBABILITY" : "CONTINUOUS_PROJECTION");

export function receiptsFromNflFrozenDay(doc) {
  return (doc?.boards ?? []).map((b) => ({
    schema: TOP_BOARD_SCHEMA,
    boardId: `nfl:${b.propFamily}:${doc.date}:TOP_5`,
    sport: "nfl",
    family: b.propFamily,
    boardType: "TOP_5",
    scopeDate: doc.date,
    frozenAt: doc.publishedAt,
    rankingRule: { id: "nfl-board-ranking@1", metricKind: b.metric === "probability" ? METRIC_KIND.MODEL_PROBABILITY : METRIC_KIND.MODEL_MEDIAN, tiebreak: "model mean, then playerId" },
    selectorStatus: SELECTOR_STATUS.PUBLIC_RANKED_FORECAST,
    modelId: b.model ?? null,
    modelVersion: b.modelVersion ?? null,
    generation: null,
    maturityAtFreeze: "OWNER:PUBLISHED",
    eligibilityVersion: "nfl-public-board-cleared@1",
    rows: (b.rows ?? []).map((e) => ({
      rank: e.rank,
      ledgerForecastId: forecastIdFor({ sport: "NFL", eventId: String(e.providerEventId), subjectType: "PLAYER", subjectId: e.playerId, family: b.propFamily, forecastKind: KIND(b.propFamily) }),
      claimKey: null, // the Stage 3A claim key joins here once 3A is on main
      eventId: String(e.providerEventId),
      eventStartUtc: e.kickoffUtc,
      subjectType: "PLAYER",
      subjectId: e.playerId,
      metricValue: b.metric === "probability" ? e.projection?.probability : e.projection?.median,
      line: e.line ?? null,
      frozenSide: null, // no side was frozen on these boards (Stage 3 Q3): projection rows are not directional
    })),
    ineligibleCount: (doc.ineligible ?? []).length,
  }));
}
