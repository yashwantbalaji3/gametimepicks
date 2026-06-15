/**
 * Dual Bank Builder loader — the two LIVE paper lanes launched June 15 from real,
 * odds-backed, upcoming legs (written by pipeline.daily.build_dual_bank_builder).
 * Public-data only. Returns null unless the artifact is a real `pending` run with
 * lanes, so the UI cleanly falls back to the "coming soon" teaser otherwise. The
 * completed first run lives in a separate artifact and is never read/mutated here.
 */
import fs from "node:fs";
import path from "node:path";

export interface DualLaneLeg {
  sport: string;
  sportLabel: string;
  gameLabel: string;
  market?: string;
  marketLabel?: string;
  pick: string;
  americanOdds: number;
  modelProbability: number;
  confidence?: string;
  commenceTime?: string | null;
  dataQuality?: string;
  homeCode?: string | null;
  awayCode?: string | null;
  recentForm?: string | null;
  group?: string | null;
  playerName?: string | null;
  team?: string | null;
}

export interface DualLane {
  lane: string;
  name: string;
  thesis: string;
  riskTier: string;
  stake: number;
  combinedDecimal: number;
  combinedAmericanOdds: number;
  projectedReturn: number;
  projectedProfit: number;
  combinedModelProbability: number;
  status: string;
  legs: DualLaneLeg[];
  whyThisLane: string;
  dataQuality: string;
  startTimes: Array<string | null>;
  settlementSource?: string;
}

export interface DualBankBuilder {
  generatedAt: string;
  date: string;
  status: string;
  name: string;
  step: number;
  stakePerLane: number;
  stepTarget: number;
  disclaimer: string;
  lanes: DualLane[];
  priceSource?: string;
  statSource?: string;
}

export function loadDualBankBuilder(): DualBankBuilder | null {
  try {
    const p = path.join(process.cwd(), "public", "data", "bank-builder", "dual-lanes-latest.json");
    const d = JSON.parse(fs.readFileSync(p, "utf8")) as DualBankBuilder;
    if (d.status === "pending" && Array.isArray(d.lanes) && d.lanes.length > 0) return d;
    return null;
  } catch {
    return null;
  }
}
