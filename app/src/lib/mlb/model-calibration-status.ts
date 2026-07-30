/**
 * MLB model calibration status — the single source of truth for whether a public-modeled player-prop market
 * has been VALIDATED to out-predict the market. Derived from the leakage-safe audit
 * (app/scripts/audit-mlb-modeled-markets.mjs → data/internal/mlb/reference/mlb-modeled-markets-audit.json),
 * which joined settled leans (official box-score outcomes) to the pregame board (model + de-vigged market
 * probabilities) over the whole settled history.
 *
 * HONEST FINDING (as of the audit date): NONE of the 4 modeled markets out-predict the market. On every one, the
 * model's probability loses to the market on BOTH Brier and log loss with a large sample, and the model is
 * systematically OVERCONFIDENT (its high-confidence picks under-perform — anti-calibrated edge). So every
 * market is DEMOTED from "model prediction / product edge" to a MARKET-ANCHORED RESEARCH SIGNAL. The model
 * board may still be shown for transparency, but it must NOT be presented as an edge, and the market price is
 * the better probability estimate. Paper / review / educational only.
 *
 * Re-run the audit to refresh: `node app/scripts/audit-mlb-modeled-markets.mjs`. If a market later beats the
 * market on both metrics with sufficient sample, flip its verdict here to PUBLIC_MODEL_OK.
 */
export type MarketVerdict = "PUBLIC_MODEL_OK" | "PUBLIC_MODEL_NEEDS_CAUTION" | "DEMOTE_TO_MARKET_CONTEXT" | "INSUFFICIENT_SAMPLE";

export interface MarketCalibration {
  market: string;
  label: string;
  sampleSize: number;
  brierModel: number;
  brierMarket: number;
  loglossModel: number;
  loglossMarket: number;
  verdict: MarketVerdict;
}

/** As-of date of the audit these numbers came from. */
export const CALIBRATION_AUDIT_ASOF = "2026-07-21";
export const CALIBRATION_AUDIT_TOTAL_LEANS = 18659;

/** Per-market results — verbatim from the committed audit report (public:false evidence). */
export const MLB_MARKET_CALIBRATION: Record<string, MarketCalibration> = {
  pitcher_strikeouts: { market: "pitcher_strikeouts", label: "Strikeouts", sampleSize: 958, brierModel: 0.2725, brierMarket: 0.2429, loglossModel: 0.7475, loglossMarket: 0.6788, verdict: "DEMOTE_TO_MARKET_CONTEXT" },
  batter_hits: { market: "batter_hits", label: "Hits", sampleSize: 7853, brierModel: 0.2438, brierMarket: 0.2352, loglossModel: 0.6836, loglossMarket: 0.663, verdict: "DEMOTE_TO_MARKET_CONTEXT" },
  batter_total_bases: { market: "batter_total_bases", label: "Total bases", sampleSize: 3580, brierModel: 0.2616, brierMarket: 0.2426, loglossModel: 0.7204, loglossMarket: 0.6783, verdict: "DEMOTE_TO_MARKET_CONTEXT" },
  batter_hits_runs_rbis: { market: "batter_hits_runs_rbis", label: "Hits + Runs + RBIs", sampleSize: 6268, brierModel: 0.264, brierMarket: 0.2479, loglossModel: 0.7252, loglossMarket: 0.689, verdict: "DEMOTE_TO_MARKET_CONTEXT" },
};

/** True only when the market's model has been VALIDATED to out-predict the market (verdict PUBLIC_MODEL_OK). */
export function modelBeatsMarket(market: string): boolean {
  return MLB_MARKET_CALIBRATION[market]?.verdict === "PUBLIC_MODEL_OK";
}

/** True when the market is calibration-failed (demoted) — a research signal, not an edge / not product-eligible. */
export function isCalibrationFailed(market: string): boolean {
  return MLB_MARKET_CALIBRATION[market]?.verdict === "DEMOTE_TO_MARKET_CONTEXT";
}

/**
 * Markets DISABLED FOR PREDICTION by the final preregistered protocol (docs/MLB_FINAL_MODEL_DECISION.md):
 * full-corpus hit-rate CI entirely below 50%. History stays visible; no recommendation-style output anywhere.
 */
export const PREDICTION_DISABLED_MARKETS: readonly string[] = ["batter_total_bases"];

export function isPredictionDisabled(market: string): boolean {
  return PREDICTION_DISABLED_MARKETS.includes(market);
}

/** True when no public-modeled market currently beats the market — drives the report's global disclosure. */
export function anyModeledMarketBeatsMarket(): boolean {
  return Object.keys(MLB_MARKET_CALIBRATION).some((m) => modelBeatsMarket(m));
}

/** The honest, plain-English disclosure shown wherever model probabilities are surfaced. */
export const MLB_CALIBRATION_DISCLOSURE =
  `Calibration notice (audit ${CALIBRATION_AUDIT_ASOF}): across ${CALIBRATION_AUDIT_TOTAL_LEANS.toLocaleString()} settled leans, ` +
  `none of these markets' model probabilities out-predict the market on Brier or log loss — the model is overconfident ` +
  `(its high-confidence reads under-perform). Treat the model number as a market-anchored research signal, not a ` +
  `proven advantage; the market price is the better probability. Paper / review / educational only — never a bet.`;
