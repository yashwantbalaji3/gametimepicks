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
}

/**
 * Pick the lowest-volatility 2-leg, max-1-per-game card whose combined price reaches `targetMultiplier`.
 * Among combos that reach the target, choose the highest total model confidence, tie-broken by the
 * smallest overshoot. If none reaches the target, choose the highest combined price (closest from below)
 * and flag `fitsTarget=false`.
 */
export function selectSafestTargetFitCard(pool: ModelPick[], rung: LaneRung, exclude: Set<string>): GeneratedLane {
  const legs = pool.filter((p) => !exclude.has(p.id) && p.odds >= -500 && p.odds <= 400);
  const combos: { a: ModelPick; b: ModelPick; d: number; conf: number }[] = [];
  for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
    if (legs[i].gameId === legs[j].gameId) continue; // max 1 leg per game
    const d = dec(legs[i].odds) * dec(legs[j].odds);
    combos.push({ a: legs[i], b: legs[j], d, conf: legs[i].modelProbability + legs[j].modelProbability });
  }
  const target = rung.targetMultiplier;
  const reach = combos.filter((c) => c.d >= target);
  let chosen: { a: ModelPick; b: ModelPick; d: number; conf: number } | null = null;
  let fitsTarget = false;
  if (reach.length) {
    // highest-confidence combo reaching the target, then smallest overshoot
    reach.sort((x, y) => (y.conf - x.conf) || (x.d - y.d));
    chosen = reach[0]; fitsTarget = true;
  } else if (combos.length) {
    // none reaches it: closest from below (highest combined), then highest confidence
    combos.sort((x, y) => (y.d - x.d) || (y.conf - x.conf));
    chosen = combos[0]; fitsTarget = false;
  }
  const picked = chosen ? [chosen.a, chosen.b] : [];
  const combinedDecimal = picked.reduce((p, l) => p * dec(l.odds), 1);
  const combinedOdds = picked.length ? decToAmerican(combinedDecimal) : 0;
  const sameGame = picked.length === 2 && picked[0].gameId === picked[1].gameId;
  const avgConf = picked.length ? Math.round((picked.reduce((s, l) => s + l.modelProbability, 0) / picked.length) * 100) : 0;
  return {
    product: "bank-builder", lane: rung.lane, step: rung.nextStep, clearedSteps: rung.clearedSteps,
    rolledStake: rung.rolledStake, seedExposure: SEED_EXPOSURE, targetReturn: rung.targetReturn,
    combinedOdds, combinedDecimal: Number(combinedDecimal.toFixed(4)),
    potentialReturn: round2(rung.rolledStake * combinedDecimal), fitsTarget,
    legs: picked, correlationNote: sameGame ? `${picked[0].matchup} contributes both legs — correlation checked (different markets); max 1 leg/game preferred.` : null,
    whyThisCard: [
      `Lower-volatility: the 2 highest-confidence model-qualified legs that reach Step ${rung.nextStep} (avg confidence ${avgConf}%), max 1 leg/game.`,
      fitsTarget
        ? `Combined ${combinedOdds > 0 ? "+" : ""}${combinedOdds} rides $${rung.rolledStake.toLocaleString("en-US")} toward the $${rung.targetReturn.toLocaleString("en-US")} rung goal.`
        : `No 2-leg model-qualified combo reaches the $${rung.targetReturn.toLocaleString("en-US")} goal — strongest available shown as a candidate.`,
    ],
    shortfallNote: picked.length < 2 ? "Fewer than 2 model-qualified legs available — awaiting a full card." : (!fitsTarget ? `Below the Step ${rung.nextStep} target — candidate only.` : null),
  };
}
