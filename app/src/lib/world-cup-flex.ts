/**
 * World Cup Flex Card — a clearly SEPARATE spotlight leg, NOT the official Bank Builder ladder
 * candidate. Data-driven: the single genuinely Bank-Builder-grade World Cup team favorite (parlay-
 * eligible, Low risk, model ≥60%) from tonight's real projections — which by design excludes the
 * High-risk South-Africa-or-Draw and Over-2.5 legs. Returns null when none exists; never fabricated.
 * This never touches the Bank Builder bankroll, ledger, step, or nextPick.
 */
import { loadWorldCupProjections } from "@/lib/world-cup/projections";
import { americanToDecimal, decimalToAmerican } from "@/lib/odds-math";

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

// ── Official Bank Builder Step-3 candidate (World Cup, lowered $1,400–$1,500+ target) ──
const TEAM_MARKET_LABEL: Record<string, string> = {
  double_chance: "Double chance", moneyline_90: "Moneyline (90′)",
  match_total_goals: "Total goals", match_total_corners: "Total corners",
};
const TEAM_MARKETS = new Set(Object.keys(TEAM_MARKET_LABEL));

export interface OfficialStep3Leg {
  label: string; gameLabel: string; matchId: number | string; market: string; marketLabel: string;
  americanOdds: number; modelProbability: number; marketProbability: number; edgePct: number;
  bookmaker?: string | null; riskTier?: string;
}
export interface OfficialStep3Candidate {
  legs: OfficialStep3Leg[];
  combinedAmericanOdds: number;
  stake: number;
  projectedReturn: number;
  projectedProfit: number;
  combinedModelProbability: number;
  targetMin: number;
  targetPreferred: number;
}

type LoosePartial = { matchId?: number | string; homeTeam?: string; awayTeam?: string; market?: string; bookmaker?: string | null; riskTier?: string; outcomes?: Array<{ label?: string; americanOdds?: number | null; modelProbability?: number | null; marketProbability?: number | null }> };

/**
 * Builds the official Step-3 World Cup candidate: the cross-match two-leg card of model-favored
 * team-market legs (model ≥55%) whose paper return on the stake hits the $1,400 floor, maximizing
 * combined model probability. Real projection outcomes only; null when none clears. NEVER mutates
 * the bankroll/ledger/nextPick — this is a pending candidate rendered from data, not a settlement.
 */
export function loadOfficialStep3Candidate(stake = 728.76): OfficialStep3Candidate | null {
  const proj = loadWorldCupProjections();
  if (!proj) return null;
  const TARGET_MIN = 1400, TARGET_PREF = 1500;
  // Best model-favored team leg per (match, market) from real outcomes.
  const legs: OfficialStep3Leg[] = [];
  for (const m of proj.matches as LoosePartial[]) {
    if (!m.market || !TEAM_MARKETS.has(m.market) || m.matchId == null) continue;
    for (const o of m.outcomes ?? []) {
      const mdl = o.modelProbability ?? 0, mkt = o.marketProbability ?? 0, odds = o.americanOdds;
      if (odds == null || mdl < 0.55 || odds > 200 || odds < -2000) continue; // model-favored, sane price
      legs.push({
        label: o.label ?? "", gameLabel: `${m.homeTeam ?? ""} vs ${m.awayTeam ?? ""}`.trim(),
        matchId: m.matchId, market: m.market, marketLabel: TEAM_MARKET_LABEL[m.market] ?? m.market,
        americanOdds: odds, modelProbability: mdl, marketProbability: mkt,
        edgePct: Math.round((mdl - mkt) * 1000) / 10, bookmaker: m.bookmaker ?? null, riskTier: m.riskTier,
      });
    }
  }
  // Best cross-match pair that reaches the floor, maximizing combined model probability.
  let best: OfficialStep3Candidate | null = null;
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i], b = legs[j];
      if (String(a.matchId) === String(b.matchId)) continue; // different games → no correlation
      const dec = americanToDecimal(a.americanOdds) * americanToDecimal(b.americanOdds);
      const ret = stake * dec;
      if (ret < TARGET_MIN) continue;
      const combModel = a.modelProbability * b.modelProbability;
      if (!best || combModel > best.combinedModelProbability || (combModel === best.combinedModelProbability && Math.abs(ret - TARGET_PREF) < Math.abs(best.projectedReturn - TARGET_PREF))) {
        best = {
          legs: [a, b], combinedAmericanOdds: decimalToAmerican(dec), stake,
          projectedReturn: Math.round(ret * 100) / 100, projectedProfit: Math.round((ret - stake) * 100) / 100,
          combinedModelProbability: combModel, targetMin: TARGET_MIN, targetPreferred: TARGET_PREF,
        };
      }
    }
  }
  return best;
}
