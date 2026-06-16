/**
 * Bank Builder V2 evaluation loader — reads the public survival-gate evaluation written by
 * pipeline.daily.bank_builder_v2_eligibility. Drives the "Run #3 evaluating / launched" status
 * across Today + /bank-builder. Public-data only; returns null when no evaluation exists.
 */
import fs from "node:fs";
import path from "node:path";

export interface V2HitRate {
  available: boolean;
  hits?: number;
  of?: number;
  rate?: number;
}

export interface V2Leg {
  pick: string;
  sport: string;
  gameId: string;
  gameLabel: string;
  market: string;
  marketLabel: string;
  americanOdds: number;
  modelProbability: number;
  marketFamily: string;
  survivalScore: number;
  tier: "eligible" | "watchlist" | "not_eligible" | string;
  eligible: boolean;
  components?: Record<string, number>;
  penalties?: Record<string, number>;
  hitRate: V2HitRate;
  rejectionReasons: string[];
  whySelected: string[];
}

export interface V2Evaluation {
  generatedAt: string;
  date: string;
  decision: "launch" | "evaluating" | string;
  headline: string;
  eligibleThreshold: number;
  watchlistThreshold: number;
  counts: { scored: number; eligible: number; watchlist: number; distinctEligibleGames: number };
  blockers: string[];
  notes?: string[];
  eligibleLegs: V2Leg[];
  watchlistLegs: V2Leg[];
  strongestCandidates: V2Leg[];
  poolSize: number;
  disclaimer: string;
}

export function loadBankBuilderV2(): V2Evaluation | null {
  try {
    const p = path.join(process.cwd(), "public", "data", "bank-builder", "v2-evaluation-latest.json");
    const d = JSON.parse(fs.readFileSync(p, "utf8")) as V2Evaluation;
    if (!d || !Array.isArray(d.eligibleLegs)) return null;
    return d;
  } catch {
    return null;
  }
}
