/**
 * World Cup Flex Card — a clearly SEPARATE spotlight leg, NOT the official Bank Builder ladder
 * candidate. Data-driven: the single genuinely Bank-Builder-grade World Cup team favorite (parlay-
 * eligible, Low risk, model ≥60%) from tonight's real projections — which by design excludes the
 * High-risk South-Africa-or-Draw and Over-2.5 legs. Returns null when none exists; never fabricated.
 * This never touches the Bank Builder bankroll, ledger, step, or nextPick.
 */
import { loadWorldCupProjections } from "@/lib/world-cup/projections";
import { currentEtDate } from "@/lib/freshness";
import { teamByName } from "@/lib/data-world-cup";
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
  // Slate freshness: never spotlight a leg from an already-played slate.
  if ((proj as { date?: string }).date !== currentEtDate()) return null;
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
  /** Match teams + their ISO flag codes (from teams.json) for a mini-fixture
   *  flag matchup. Empty string when the country isn't in the WC team set. */
  homeTeam: string; awayTeam: string; homeCode: string; awayCode: string;
  /** True for 90-minute regulation markets (moneyline_90, double_chance). */
  regulationOnly: boolean;
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
 * Builds the official Bank Builder candidate for ANY ladder step: the cross-match two-leg card
 * of model-AND-market-supported team-market legs whose paper return on the stake hits the step's
 * ladder floor, maximizing combined model probability.
 *
 * Gates (bank-builder-methodology-current.md, tightened from settled June-11 results):
 *   - team markets only, real posted odds;
 *   - every leg model probability ≥55% AND market probability ≥50% (model+market agreement —
 *     the model-disfavored +195 DC leg lost on June 11; agreement favorites delivered);
 *   - legs from DIFFERENT matches (no same-game correlation);
 *   - return on the FULL stake ≥ targetMin (never forced with weak filler legs).
 *
 * Real projection outcomes only; null when none clears ("no card" is a valid outcome). NEVER
 * mutates the bankroll/ledger/nextPick — a pending candidate rendered from data, not a settlement.
 */
export function loadOfficialStepCandidate(
  stake: number,
  targetMin: number,
  targetPreferred = Math.round(targetMin * 1.05),
): OfficialStep3Candidate | null {
  const proj = loadWorldCupProjections();
  if (!proj) return null;
  // Slate freshness: an official candidate may only come from TODAY's projections.
  // A stale (already-played) slate must never resurface as a pending card.
  if ((proj as { date?: string }).date !== currentEtDate()) return null;
  const TARGET_MIN = targetMin, TARGET_PREF = targetPreferred;
  // Best model-favored team leg per (match, market) from real outcomes.
  const legs: OfficialStep3Leg[] = [];
  for (const m of proj.matches as LoosePartial[]) {
    if (!m.market || !TEAM_MARKETS.has(m.market) || m.matchId == null) continue;
    for (const o of m.outcomes ?? []) {
      const mdl = o.modelProbability ?? 0, mkt = o.marketProbability ?? 0, odds = o.americanOdds;
      if (odds == null || mdl < 0.55 || mkt < 0.5 || odds > 200 || odds < -2000) continue; // model+market agreement, sane price
      const homeTeam = m.homeTeam ?? "", awayTeam = m.awayTeam ?? "";
      legs.push({
        label: o.label ?? "", gameLabel: `${homeTeam} vs ${awayTeam}`.trim(),
        matchId: m.matchId, market: m.market, marketLabel: TEAM_MARKET_LABEL[m.market] ?? m.market,
        americanOdds: odds, modelProbability: mdl, marketProbability: mkt,
        edgePct: Math.round((mdl - mkt) * 1000) / 10, bookmaker: m.bookmaker ?? null, riskTier: m.riskTier,
        homeTeam, awayTeam,
        homeCode: teamByName(homeTeam)?.code ?? "", awayCode: teamByName(awayTeam)?.code ?? "",
        regulationOnly: m.market === "moneyline_90" || m.market === "double_chance",
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

/** Back-compat wrapper — the Step-3 review at its lowered $1,400–$1,500 target. */
export function loadOfficialStep3Candidate(stake = 728.76): OfficialStep3Candidate | null {
  return loadOfficialStepCandidate(stake, 1400, 1500);
}
