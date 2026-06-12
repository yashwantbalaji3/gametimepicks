/**
 * World Cup Flex Card — a clearly SEPARATE spotlight leg, NOT the official Bank Builder ladder
 * candidate. Data-driven: the single genuinely Bank-Builder-grade World Cup team favorite (parlay-
 * eligible, Low risk, model ≥60%) from tonight's real projections — which by design excludes the
 * High-risk South-Africa-or-Draw and Over-2.5 legs. Returns null when none exists; never fabricated.
 * This never touches the Bank Builder bankroll, ledger, step, or nextPick.
 */
import { loadWorldCupProjections } from "@/lib/world-cup/projections";
import { americanToDecimal } from "@/lib/odds-math";

export interface WorldCupFlexLeg {
  pickLabel: string;
  gameLabel: string;
  matchId: number | string;
  market: string;
  americanOdds: number;
  modelProbability: number;
  marketProbability: number;
  edgePct: number;
  riskTier: string;
  bookmaker?: string | null;
  regulationOnly: boolean;
}

type LooseProj = {
  homeTeam?: string; awayTeam?: string; market?: string; pickLabel?: string;
  americanOdds?: number | null; modelProbability?: number | null; marketProbability?: number | null;
  edgePct?: number | null; riskTier?: string; matchId?: number | string; parlayEligible?: boolean;
  regulationOnly?: boolean; bookmaker?: string | null;
};

/** The spotlight Flex leg: the highest-model Low-risk, parlay-eligible WC team favorite (model
 *  ≥60%). Excludes High-risk underdog/total legs by construction. Null when the slate has none. */
export function loadWorldCupFlexLeg(): WorldCupFlexLeg | null {
  const proj = loadWorldCupProjections();
  if (!proj) return null;
  const cands = (proj.matches as LooseProj[])
    .filter((m) => m.parlayEligible && m.riskTier === "Low" && (m.modelProbability ?? 0) >= 0.6 && m.americanOdds != null)
    .sort((a, b) => (b.modelProbability ?? 0) - (a.modelProbability ?? 0));
  const top = cands[0];
  if (!top || top.americanOdds == null) return null;
  return {
    pickLabel: top.pickLabel ?? "",
    gameLabel: `${top.homeTeam ?? ""} vs ${top.awayTeam ?? ""}`.trim(),
    matchId: top.matchId ?? "",
    market: top.market ?? "",
    americanOdds: top.americanOdds,
    modelProbability: top.modelProbability ?? 0,
    marketProbability: top.marketProbability ?? 0,
    edgePct: top.edgePct ?? 0,
    riskTier: top.riskTier ?? "Low",
    bookmaker: top.bookmaker ?? null,
    regulationOnly: top.regulationOnly ?? true,
  };
}

/** Paper return + profit for an example stake on the flex leg (no ledger effect). */
export function flexReturn(stake: number, americanOdds: number): { ret: number; profit: number } {
  const ret = stake * americanToDecimal(americanOdds);
  return { ret, profit: ret - stake };
}
