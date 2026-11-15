/**
 * NCAAF → Universal Forecast Ledger: PROPOSED adapter (NCAAF-006.8). PRIVATE_RESEARCH, NOT WIRED.
 *
 * This file is NCAAF-local and imported by nothing in the ledger builder. It exists so the shared ledger owner
 * can review exactly what NCAAF rows would look like, built with the ledger's OWN row/measure functions.
 * Wiring it needs two shared changes that this lane must not make itself (docs/ncaaf/LEDGER_ADAPTER_PROPOSAL.md):
 *   1. `"NCAAF"` added to `SPORTS` in app/src/lib/forecast-ledger/contract.mjs;
 *   2. an import + call in app/scripts/results/build-forecast-ledger.mjs.
 *
 * Only PUBLISHED / WITHDRAWN forecasts may ever become rows. Every NCAAF receipt today is SHADOW, so
 * `ncaafLedgerRows` returns [] for all of them, by construction.
 *
 * Families (one forecast of record per event; identity per forecast-ledger/identity.mjs):
 *   ncaaf_winner       GAME  BINARY_PROBABILITY      C1 P(home win)
 *   ncaaf_margin       GAME  CONTINUOUS_PROJECTION   C2 mean margin (home − away), 80% normal range
 *   ncaaf_total        GAME  CONTINUOUS_PROJECTION   C2 mean total, 80% normal range
 *   ncaaf_team_points  TEAM  CONTINUOUS_PROJECTION   C2 mean points, home and away rows
 */
import { FORECAST_KIND, PUBLIC_LEDGER_STATUSES, RECOVERABILITY } from "../../forecast-ledger/contract.mjs";
import { measureBinary, measureContinuous } from "../../forecast-ledger/measure.mjs";
import { makeRow, marketBlock } from "../../forecast-ledger/row.mjs";
import { centralZ } from "./metrics.mjs";
import { devigHome } from "./grade.mjs";

const Z80 = centralZ(0.8);

/** Ledger settlement block from an NCAAF grade (grade.mjs), carrying the owner's state, never inventing one. */
function settlementOf(grade, finalValue) {
  if (!grade) return { state: "PENDING" };
  const s = grade.settlement;
  return {
    state: s.state === "SETTLED" ? "SETTLED" : s.state === "VOID" ? "VOID" : s.state === "NO_MEASUREMENT" ? "NO_MEASUREMENT" : "PENDING",
    finalValue: s.state === "SETTLED" ? finalValue : null,
    settledAt: s.state === "SETTLED" ? s.gradedAt : null,
    finality: s.state === "SETTLED" ? "PROVIDER_FINAL" : null,
    corrections: grade.corrections ?? 0,
    source: s.source ?? null,
    reason: s.reason ?? null,
  };
}

/**
 * Rows for one event's forecast of record. `publicationStatus` is the receipt's own; anything other than
 * PUBLISHED / WITHDRAWN yields [] (shadow, research and withheld forecasts never enter public history).
 */
export function ncaafLedgerRows(receipt, grade = null) {
  if (!receipt || !PUBLIC_LEDGER_STATUSES.includes(receipt.publicationStatus)) return [];
  const e = receipt.event, f = receipt.forecast;
  const settled = grade?.settlement.state === "SETTLED";
  const h = grade?.settlement.finalHome, a = grade?.settlement.finalAway;
  const common = {
    sport: "NCAAF", competition: "NCAA FBS", season: String(e.season), eventId: e.eventId, eventStart: e.startUtcAtCapture,
    matchup: `${e.awayAbbreviation ?? "?"} @ ${e.homeAbbreviation ?? "?"}`,
    publicationStatus: receipt.publicationStatus, publicationSurface: "ncaaf-hub", receiptId: `${e.eventId}@${receipt.capturedAt}`,
    publishedAt: receipt.capturedAt, frozenAt: receipt.capturedAt, recoverability: RECOVERABILITY.EXACT_FROZEN,
    provenance: { owner: "ncaaf forward receipts", alsoPublishedOn: [], notes: [] },
  };
  const continuous = (family, subjectType, subjectId, teamId, mean, sd, finalValue) => makeRow({
    ...common, family, subjectType, subjectId, teamId, forecastKind: FORECAST_KIND.CONTINUOUS,
    modelId: "ncaaf-c2-ridge", modelVersion: JSON.stringify(receipt.models.score.spec), modelStatusAtPublish: "RESEARCH",
    projection: mean, rangeLow: mean - Z80 * sd, rangeHigh: mean + Z80 * sd, rangeCoverage: 0.8,
    settlement: settlementOf(grade, finalValue),
    measurement: settled ? measureContinuous({ projection: mean, rangeLow: mean - Z80 * sd, rangeHigh: mean + Z80 * sd, finalValue }) : undefined,
  });
  const teamSd = f.score.marginSd / Math.sqrt(2 * (1 - (f.score.rho ?? 0))); // σ of one team's points under the receipt's (σ, ρ)
  const mk = receipt.market;
  return [
    makeRow({
      ...common, family: "ncaaf_winner", subjectType: "GAME", subjectId: e.eventId, teamId: null, forecastKind: FORECAST_KIND.BINARY,
      modelId: "ncaaf-c1-elo", modelVersion: JSON.stringify(receipt.models.winner.spec), modelStatusAtPublish: "RESEARCH",
      probability: f.winner.pHome, probabilityType: "MODEL",
      market: marketBlock(mk && { line: mk.homeSpread, price: mk.homeMoneyline, impliedProbability: devigHome(mk.homeMoneyline, mk.awayMoneyline), provider: mk.provider, capturedAt: mk.capturedAt }),
      settlement: settlementOf(grade, settled ? (h > a ? 1 : 0) : null),
      measurement: settled ? measureBinary({ probability: f.winner.pHome, observed: h > a ? 1 : 0 }) : undefined,
    }),
    continuous("ncaaf_margin", "GAME", e.eventId, null, f.score.marginMean, f.score.marginSd, settled ? h - a : null),
    continuous("ncaaf_total", "GAME", e.eventId, null, f.score.totalMean, f.score.totalSd, settled ? h + a : null),
    continuous("ncaaf_team_points", "TEAM", e.homeTeamId, e.homeTeamId, f.score.homeMean, teamSd, settled ? h : null),
    continuous("ncaaf_team_points", "TEAM", e.awayTeamId, e.awayTeamId, f.score.awayMean, teamSd, settled ? a : null),
  ];
}
