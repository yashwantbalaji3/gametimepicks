/**
 * Loader for the settled-only market-reliability research artifact
 * (`app/public/data/audit/market-reliability.json`, written by
 * `scripts/audit-hits-misses-research.mjs`). Powers the public, honest
 * "what's working / what we're improving" note on Results. Read-only; returns
 * null when the artifact is absent OR not current (insightsAreCurrent), so the UI simply omits the panel.
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

/** How far behind the newest settled slate the research artifact may be before the panel is withheld. */
export const MAX_INSIGHTS_LAG_DAYS = 7;

/**
 * Whether the artifact describes the CURRENT record (TRUTH-001, 2026-10-09). It was written once, on 2026-06-07,
 * by a script no workflow runs, and carries no generation time; /results kept presenting its June figures as
 * "what the model is learning" — NBA Points under "Working" at 53.7% while the ledger and /results/model-audit
 * say 47.3%. An artifact with no stated time, or one more than MAX_INSIGHTS_LAG_DAYS behind the newest settled
 * slate, is withheld rather than shown as current.
 */
export function insightsAreCurrent(generatedAt: unknown, newestSettledDate: string | null): boolean {
  if (typeof generatedAt !== "string" || !newestSettledDate) return false;
  const gen = Date.parse(generatedAt);
  const newest = Date.parse(`${newestSettledDate}T00:00:00Z`);
  if (!Number.isFinite(gen) || !Number.isFinite(newest)) return false;
  return newest - gen <= MAX_INSIGHTS_LAG_DAYS * 86400e3;
}

export function getMarketReliabilityInsights(newestSettledDate: string | null = null): MarketReliabilityInsights | null {
  try {
    const p = path.join(DATA_DIR, "audit", "market-reliability.json");
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (!insightsAreCurrent(raw?.generatedAt, newestSettledDate)) return null;
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
