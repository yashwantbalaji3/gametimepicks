/**
 * Loader for the settled-only market-reliability research artifact
 * (`app/public/data/audit/market-reliability.json`, written by
 * `scripts/audit-hits-misses-research.mjs`). Powers the public, honest
 * "what's working / what we're improving" note on Results. Read-only; returns
 * null when the artifact is absent so the UI simply omits the panel.
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "public", "data");

export interface MarketInsight {
  market: string;
  label: string;
  hitRate: number; // percent, settled-only
}
export interface OddsBandRate {
  hitRate: number;
  decisive: number;
}
export interface MarketReliabilityInsights {
  strongestMarkets: MarketInsight[];
  weakestMarkets: MarketInsight[];
  oddsBandRates: Record<string, OddsBandRate>;
}

export function getMarketReliabilityInsights(): MarketReliabilityInsights | null {
  try {
    const p = path.join(DATA_DIR, "audit", "market-reliability.json");
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    const ins = raw?.insights;
    if (!ins || !Array.isArray(ins.strongestMarkets)) return null;
    return {
      strongestMarkets: ins.strongestMarkets ?? [],
      weakestMarkets: ins.weakestMarkets ?? [],
      oddsBandRates: ins.oddsBandRates ?? {},
    };
  } catch {
    return null;
  }
}
