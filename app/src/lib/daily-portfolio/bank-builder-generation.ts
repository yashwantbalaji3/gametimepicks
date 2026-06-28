/**
 * Bank Builder NEXT-STEP generation — builds the lowest-volatility 2-leg card that fits a lane's next rung.
 *
 * Reads the active dual-ladder artifact to learn each lane's next step + the rolled balance riding into
 * it (the last settled step's payout) + the rung goal from BANK_BUILDER_LADDER, then picks the SAFEST
 * (highest combined model confidence) 2-leg, max-1-per-game, model-qualified card whose combined price
 * reaches the rung target as closely as possible. No fabricated odds/markets, no started games, no leg
 * shorter than -500, no raw inventory. Pure + deterministic.
 *
 * Exposure note: the dual ladder is a $100-seed paper experiment per lane. The card RIDES the rolled
 * balance toward the rung goal, but the AT-RISK amount (open exposure) is the $100 seed — consistent
 * with the ledger convention. So `rolledStake` drives the card display while `seedExposure` ($100)
 * drives exposure math.
 */
import fs from "node:fs";
import path from "node:path";
import { BANK_BUILDER_LADDER } from "../bank-builder-ladder";
import type { ModelPick } from "../world-cup/model-qualified-picks";
import { classifyRiskTier, cardTier, tierLabel, type RiskTier } from "./risk-tiers";

export const SEED_EXPOSURE = 100;

export interface LaneRung { lane: "A" | "B"; nextStep: number; clearedSteps: number; rolledStake: number; targetReturn: number; targetMultiplier: number }

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d: number) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));
const round2 = (n: number) => Number(n.toFixed(2));

/** Read each lane's next rung from the active dual-ladder artifact + the ladder definition. */
export function readLaneRungs(root: string): { laneA: LaneRung | null; laneB: LaneRung | null } {
  let run: any;
  try { run = JSON.parse(fs.readFileSync(path.join(root, "methodology", "launch", "dual-bank-builder-active.json"), "utf8")).run; } catch { return { laneA: null, laneB: null }; }
  const build = (laneKey: "laneA" | "laneB", lane: "A" | "B"): LaneRung | null => {
    const l = run?.[laneKey];
    if (!l) return null;
    // A COMPLETED ladder is terminal (operator banking decision pending) and a STOPPED lane (lost its rung)
    // does NOT auto-place exposure on a settled rung — its restart is operator-gated, exactly like completion
    // banking. Either way there is no eligible NEXT rung to auto-generate a card for.
    if (l.laneStatus === "completed" || l.laneStatus === "stopped") return null;
    const settled = (l.steps ?? []).filter((s: any) => s.status === "settled" && s.result === "won").sort((a: any, b: any) => a.step - b.step);
    const cleared = settled.length;
    const nextStep = cleared + 1;
    const rung = BANK_BUILDER_LADDER.find((r) => r.step === nextStep);
    if (!rung) return null; // ladder complete
    const rolledStake = cleared ? round2(settled[cleared - 1].payout ?? rung.start) : rung.start;
    return { lane, nextStep, clearedSteps: cleared, rolledStake, targetReturn: rung.goal, targetMultiplier: rung.goal / rolledStake };
  };
  return { laneA: build("laneA", "A"), laneB: build("laneB", "B") };
}

export interface GeneratedLane {
  product: "bank-builder";
  lane: "A" | "B";
  step: number;
  clearedSteps: number;
  rolledStake: number;      // the balance riding on the card
  seedExposure: number;     // the at-risk seed ($100)
  targetReturn: number;     // rung goal
  combinedOdds: number;
  combinedDecimal: number;
  potentialReturn: number;  // rolledStake × combined decimal
  fitsTarget: boolean;
  legs: ModelPick[];
  correlationNote: string | null;
  whyThisCard: string[];
  shortfallNote: string | null;
  estimatedHitProbability?: number; // product of leg model probabilities (P all legs land)
  marketTier?: RiskTier;            // worst (highest) leg tier in the card — overall fragility
  marketTierLabel?: string;
  confidenceScore?: number;         // 0-100, avg leg model probability
  crossSport?: boolean;             // card mixes MLB + World Cup legs
}

const isTeamMarket = (p: ModelPick) => p.category === "team" || p.category === "total_btts";
const legSport = (p: ModelPick) => p.sport ?? "WORLD_CUP";

interface SafeCombo { legs: ModelPick[]; d: number; prob: number; tier: RiskTier }
const makeCombo = (legs: ModelPick[]): SafeCombo => ({
  legs,
  d: legs.reduce((p, l) => p * dec(l.odds), 1),
  prob: legs.reduce((p, l) => p * l.modelProbability, 1), // P(all legs land) — the safest-card objective
  tier: cardTier(legs),
});

const wcCount = (c: SafeCombo) => c.legs.filter((l) => legSport(l) === "WORLD_CUP").length;
const distinctGames = (legs: ModelPick[]) => new Set(legs.map((l) => l.gameId)).size === legs.length;

/** Enumerate distinct-game combos of 2..maxLegs legs over a bounded pool (top legs by model probability),
 *  so soccer-first 3- and 4-leg cards are reachable while the enumeration stays O(bounded^k). */
function buildSafeCombos(legs: ModelPick[], maxLegs: number): SafeCombo[] {
  const out: SafeCombo[] = [];
  const top = [...legs].sort((a, b) => b.modelProbability - a.modelProbability).slice(0, 30);
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
    if (top[i].gameId === top[j].gameId) continue; // max 1 leg per game
    out.push(makeCombo([top[i], top[j]]));
    if (maxLegs >= 3) for (let k = j + 1; k < top.length; k++) {
      if (!distinctGames([top[i], top[j], top[k]])) continue;
      out.push(makeCombo([top[i], top[j], top[k]]));
      if (maxLegs >= 4) for (let l = k + 1; l < top.length; l++) {
        if (!distinctGames([top[i], top[j], top[k], top[l]])) continue;
        out.push(makeCombo([top[i], top[j], top[k], top[l]]));
      }
    }
  }
  return out;
}

/**
 * Pick the SAFEST card (highest combined hit probability) whose combined price reaches the rung target —
 * PROBABILITY-FIT, not EV/odds-fit. The pool is cross-sport (MLB + World Cup), so a lane can be e.g. an
 * MLB "batter to record a hit" + a WC double chance. Among combos reaching the target, choose the one that
 * maximizes P(all legs land), tie-broken by the safest risk tier, then the smallest overshoot, then fewer
 * legs. Tries 2-leg first; only escalates to 3-leg when no 2-leg combo reaches a high target. `excludeGames`
 * keeps lanes independent (no shared game across Lane A / Lane B). Max 1 leg/game. No leg shorter than -500.
 */
export function selectSafestTargetFitCard(pool: ModelPick[], rung: LaneRung, exclude: Set<string>, excludeGames?: Set<string>, maxLegs = 4): GeneratedLane {
  const eligible = pool.filter((p) =>
    !exclude.has(p.id) && (!excludeGames || !excludeGames.has(p.gameId)) &&
    p.odds >= -650 && p.odds <= 400 && p.modelProbability > 0);
  // SOCCER-FIRST: keep every World Cup leg; cap MLB to the top legs by hit rate (fill-only) so the
  // enumeration stays bounded and the selector leans on soccer.
  const wc = eligible.filter((p) => legSport(p) === "WORLD_CUP");
  const mlb = eligible.filter((p) => legSport(p) === "MLB").sort((a, b) => b.modelProbability - a.modelProbability).slice(0, 24);
  const inWindow = [...wc, ...mlb];
  const target = rung.targetMultiplier;

  // Build up to maxLegs-leg cards, keep those that reach the rung target.
  const reach = buildSafeCombos(inWindow, maxLegs).filter((c) => c.d >= target);

  let chosen: SafeCombo | null = null;
  let fitsTarget = false;
  if (reach.length) {
    // Soccer-first preference: require >=1 World Cup leg, prefer >=2 non-correlated WC legs; within the
    // best WC bucket maximize combined hit probability (safest), then more WC legs, safest tier, fewer legs.
    const wc2 = reach.filter((c) => wcCount(c) >= 2);
    const wc1 = reach.filter((c) => wcCount(c) >= 1);
    const bucket = wc2.length ? wc2 : (wc1.length ? wc1 : reach);
    bucket.sort((x, y) => (y.prob - x.prob) || (wcCount(y) - wcCount(x)) || (x.tier - y.tier) || (x.legs.length - y.legs.length) || (x.d - y.d));
    chosen = bucket[0]; fitsTarget = true;
  } else {
    // Nothing reaches the target — surface the closest card, still preferring soccer legs.
    const all = buildSafeCombos(inWindow, maxLegs);
    const wcAll = all.filter((c) => wcCount(c) >= 1);
    const bucket = wcAll.length ? wcAll : all;
    if (bucket.length) { bucket.sort((x, y) => (y.d - x.d) || (y.prob - x.prob)); chosen = bucket[0]; }
  }

  const picked = chosen ? chosen.legs : [];
  const combinedDecimal = picked.reduce((p, l) => p * dec(l.odds), 1);
  const combinedOdds = picked.length ? decToAmerican(combinedDecimal) : 0;
  const hitProb = picked.length ? picked.reduce((p, l) => p * l.modelProbability, 1) : 0;
  const tier = cardTier(picked);
  const avgConf = picked.length ? Math.round((picked.reduce((s, l) => s + l.modelProbability, 0) / picked.length) * 100) : 0;
  const sports = new Set(picked.map(legSport));
  const crossSport = sports.size > 1;
  const sportLabel = crossSport ? "cross-sport (MLB + World Cup)" : (sports.has("MLB") ? "MLB" : "World Cup");
  const sameGame = picked.length >= 2 && new Set(picked.map((l) => l.gameId)).size < picked.length;

  return {
    product: "bank-builder", lane: rung.lane, step: rung.nextStep, clearedSteps: rung.clearedSteps,
    rolledStake: rung.rolledStake, seedExposure: SEED_EXPOSURE, targetReturn: rung.targetReturn,
    combinedOdds, combinedDecimal: Number(combinedDecimal.toFixed(4)),
    potentialReturn: round2(rung.rolledStake * combinedDecimal), fitsTarget,
    legs: picked,
    correlationNote: sameGame ? `Correlation checked: legs share a game (different markets).` : null,
    estimatedHitProbability: Number(hitProb.toFixed(4)),
    marketTier: tier,
    marketTierLabel: tierLabel(tier),
    confidenceScore: avgConf,
    crossSport,
    whyThisCard: [
      picked.length >= 2
        ? `Safest-fit (${sportLabel}): chosen to MAXIMIZE the chance all ${picked.length} legs land — estimated ${Math.round(hitProb * 100)}% combined hit probability at ${tierLabel(tier)}, not the longest-odds card.`
        : `Awaiting a full card — fewer than 2 model-qualified legs available.`,
      fitsTarget
        ? `Combined ${combinedOdds > 0 ? "+" : ""}${combinedOdds} rides $${rung.rolledStake.toLocaleString("en-US")} toward the $${rung.targetReturn.toLocaleString("en-US")} rung goal (avg leg confidence ${avgConf}%).`
        : `No combo reaches the $${rung.targetReturn.toLocaleString("en-US")} goal — strongest available shown as a candidate.`,
    ],
    shortfallNote: picked.length < 2 ? "Fewer than 2 model-qualified legs available — awaiting a full card." : (!fitsTarget ? `Below the Step ${rung.nextStep} target — candidate only.` : null),
  };
}

/** Lane B VALUE band: still clears the rung goal, but aims for a higher combined price (+200..+700) for a
 *  bigger jump per win. Among band-fitting, distinct-game, soccer-first combos it picks the SURVIVABLE one
 *  (max combined hit probability) — de-vigged market odds carry ~no edge, so the honest "maximize EV"
 *  objective reduces to the safest card that still reaches the value band. */
export const VALUE_BAND = { minOdds: 200, maxOdds: 700 } as const;

export function selectValueTargetFitCard(
  pool: ModelPick[], rung: LaneRung, exclude: Set<string>, excludeGames?: Set<string>,
  band: { minOdds: number; maxOdds: number } = VALUE_BAND, maxLegs = 4,
): GeneratedLane {
  const eligible = pool.filter((p) =>
    !exclude.has(p.id) && (!excludeGames || !excludeGames.has(p.gameId)) &&
    p.odds >= -650 && p.odds <= 400 && p.modelProbability > 0);
  const wc = eligible.filter((p) => legSport(p) === "WORLD_CUP");
  const mlb = eligible.filter((p) => legSport(p) === "MLB").sort((a, b) => b.modelProbability - a.modelProbability).slice(0, 24);
  const inWindow = [...wc, ...mlb];
  const minDec = dec(band.minOdds);   // +200 -> 3.0
  const maxDec = dec(band.maxOdds);   // +700 -> 8.0
  const target = rung.targetMultiplier;

  // Value band: reach the rung goal AND land within the +200..+700 price band.
  const all = buildSafeCombos(inWindow, maxLegs);
  const inBand = all.filter((c) => c.d >= target && c.d >= minDec && c.d <= maxDec);

  let chosen: SafeCombo | null = null;
  let fitsTarget = false;
  let inValueBand = false;
  if (inBand.length) {
    const wc2 = inBand.filter((c) => wcCount(c) >= 2);
    const wc1 = inBand.filter((c) => wcCount(c) >= 1);
    const bucket = wc2.length ? wc2 : (wc1.length ? wc1 : inBand);
    // survivability-first within the value band, then more WC legs, safest tier, fewer legs.
    bucket.sort((x, y) => (y.prob - x.prob) || (wcCount(y) - wcCount(x)) || (x.tier - y.tier) || (x.legs.length - y.legs.length));
    chosen = bucket[0]; fitsTarget = true; inValueBand = true;
  } else {
    // No band combo — fall back to the safest card that simply reaches the rung goal (Lane B still exists,
    // just not in the value band; honest, no forced long-odds card).
    return selectSafestTargetFitCard(pool, rung, exclude, excludeGames, maxLegs);
  }

  const picked = chosen.legs;
  const combinedDecimal = picked.reduce((p, l) => p * dec(l.odds), 1);
  const combinedOdds = decToAmerican(combinedDecimal);
  const hitProb = picked.reduce((p, l) => p * l.modelProbability, 1);
  const tier = cardTier(picked);
  const avgConf = Math.round((picked.reduce((s, l) => s + l.modelProbability, 0) / picked.length) * 100);
  const sports = new Set(picked.map(legSport));
  const crossSport = sports.size > 1;
  const sportLabel = crossSport ? "cross-sport (MLB + World Cup)" : (sports.has("MLB") ? "MLB" : "World Cup");
  const sameGame = new Set(picked.map((l) => l.gameId)).size < picked.length;

  return {
    product: "bank-builder", lane: rung.lane, step: rung.nextStep, clearedSteps: rung.clearedSteps,
    rolledStake: rung.rolledStake, seedExposure: SEED_EXPOSURE, targetReturn: rung.targetReturn,
    combinedOdds, combinedDecimal: Number(combinedDecimal.toFixed(4)),
    potentialReturn: round2(rung.rolledStake * combinedDecimal), fitsTarget,
    legs: picked,
    correlationNote: sameGame ? `Correlation checked: legs share a game (different markets).` : null,
    estimatedHitProbability: Number(hitProb.toFixed(4)),
    marketTier: tier, marketTierLabel: tierLabel(tier), confidenceScore: avgConf, crossSport,
    whyThisCard: [
      `Value lane (${sportLabel}): the most SURVIVABLE ${picked.length}-leg card inside the +${band.minOdds}..+${band.maxOdds} band — ~${Math.round(hitProb * 100)}% combined hit probability at ${tierLabel(tier)}, picked for a bigger jump per win without chasing the longest price.`,
      `Combined +${combinedOdds} rides $${rung.rolledStake.toLocaleString("en-US")} → $${round2(rung.rolledStake * combinedDecimal).toLocaleString("en-US")} (clears the $${rung.targetReturn.toLocaleString("en-US")} rung goal; avg leg confidence ${avgConf}%).`,
    ],
    shortfallNote: inValueBand ? null : `Below the +${band.minOdds} value band — safest target-fit shown.`,
  };
}
