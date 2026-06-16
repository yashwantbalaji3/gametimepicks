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
  // Rich leg context (for the clickable drawer + portraits/logos).
  playerId?: number | null;
  opponent?: string | null;
  line?: number | null;
  side?: string | null;
  modelPredict?: string;
  recentGames?: Array<{ date: string; opponent: string; isHome: boolean; value: number }>;
  reasonBullets?: Array<{ label: string; text: string; tone?: string }>;
  homeTeam?: string | null;
  awayTeam?: string | null;
  homeForm?: { formString: string; last5: Array<{ date: string; opponent: string; score: string; result: string; competition: string }> } | null;
  awayForm?: { formString: string; last5: Array<{ date: string; opponent: string; score: string; result: string; competition: string }> } | null;
  outcomes?: Array<{ label: string; side: string; modelProbability: number; americanOdds: number | null }>;
  // Settlement (set once the step is officially graded).
  result?: "won" | "lost" | "void" | "pending" | "needs_review" | string;
  final?: string;
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
  // Settlement (set once the lane's step is officially graded).
  return?: number;
  profit?: number | null;
  settledAt?: string;
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
  // Settlement summary (once closed).
  runStatus?: string;
  settledAt?: string;
  lanesSurvived?: number;
  overallResult?: string;
  advancedToStep?: number | null;
}

export function loadDualBankBuilder(): DualBankBuilder | null {
  try {
    const p = path.join(process.cwd(), "public", "data", "bank-builder", "dual-lanes-latest.json");
    const d = JSON.parse(fs.readFileSync(p, "utf8")) as DualBankBuilder;
    // Render while pending (live lanes) AND once settled/closed (results) — only the
    // empty "not started" state falls through to the teaser.
    const ok = d.status === "pending" || d.status === "settled" || d.status === "closed";
    if (ok && Array.isArray(d.lanes) && d.lanes.length > 0) return d;
    return null;
  } catch {
    return null;
  }
}
