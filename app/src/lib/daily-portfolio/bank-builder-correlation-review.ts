/**
 * Cross-lane Bank Builder selector — picks Lane A + Lane B TOGETHER so the two lanes stay independent.
 *
 * The two lanes were each generated independently, which let both touch the same game (e.g. both used
 * Colombia/DR Congo), so a single game script could swing both lanes at once. This selector partitions
 * the day's games so **no game is shared across Lane A and Lane B** (with 4 World Cup games and 2 legs
 * per lane, a clean zero-overlap split is possible), while still: preferring team/game markets, hitting
 * each lane's rung target, max 1 leg per game, no leg shorter than -500, honest combined odds.
 *
 * Pure + deterministic. Returns two GeneratedLane objects (same shape as bank-builder-generation), each
 * carrying a cross-lane correlation note. Never places exposure; the seed exposure stays $100/lane.
 */
import type { ModelPick } from "../world-cup/model-qualified-picks";
import { SEED_EXPOSURE, type GeneratedLane, type LaneRung } from "./bank-builder-generation";

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d: number) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));
const round2 = (n: number) => Number(n.toFixed(2));
const isTeamMarket = (p: ModelPick) => p.category === "team" || p.category === "total_btts";

interface LaneFit { legs: ModelPick[]; combinedDecimal: number; conf: number; fitsTarget: boolean }

/** Best 2-leg card from EXACTLY the given games (one leg per game), reaching the rung target. Team
 *  markets first; falls back to any model-qualified leg if no team-only card reaches the target. */
function bestCardForGames(byGame: Map<string, ModelPick[]>, games: string[], targetMult: number): LaneFit | null {
  if (games.length !== 2) return null;
  const pickPerGame = (filter: (p: ModelPick) => boolean) => games.map((g) => (byGame.get(g) ?? []).filter(filter));
  const evaluate = (filter: (p: ModelPick) => boolean): LaneFit | null => {
    const [g0, g1] = pickPerGame(filter);
    let best: LaneFit | null = null;
    for (const a of g0) for (const b of g1) {
      const d = dec(a.odds) * dec(b.odds);
      const conf = a.modelProbability + b.modelProbability;
      const fits = d >= targetMult;
      // prefer fitting + highest confidence, tie-broken by smaller overshoot
      if (!best
        || (fits && !best.fitsTarget)
        || (fits === best.fitsTarget && (conf > best.conf || (conf === best.conf && d < best.combinedDecimal)))) {
        best = { legs: [a, b], combinedDecimal: d, conf, fitsTarget: fits };
      }
    }
    return best;
  };
  // Tier 1: team/game markets only; Tier 2: any model-qualified leg.
  const teamFit = evaluate(isTeamMarket);
  if (teamFit?.fitsTarget) return teamFit;
  const anyFit = evaluate(() => true);
  // prefer the fitting card; if neither fits, prefer the team-only closest.
  if (anyFit?.fitsTarget) return anyFit;
  return teamFit ?? anyFit;
}

function toGeneratedLane(rung: LaneRung, fit: LaneFit | null, otherGames: string[]): GeneratedLane {
  const legs = fit?.legs ?? [];
  const combinedDecimal = legs.reduce((p, l) => p * dec(l.odds), 1);
  const combinedOdds = legs.length ? decToAmerican(combinedDecimal) : 0;
  const teamOnly = legs.length > 0 && legs.every(isTeamMarket);
  const avgConf = legs.length ? Math.round((legs.reduce((s, l) => s + l.modelProbability, 0) / legs.length) * 100) : 0;
  const fitsTarget = !!fit?.fitsTarget;
  return {
    product: "bank-builder", lane: rung.lane, step: rung.nextStep, clearedSteps: rung.clearedSteps,
    rolledStake: rung.rolledStake, seedExposure: SEED_EXPOSURE, targetReturn: rung.targetReturn,
    combinedOdds, combinedDecimal: Number(combinedDecimal.toFixed(4)),
    potentialReturn: round2(rung.rolledStake * combinedDecimal), fitsTarget, legs,
    correlationNote: `Correlation checked: no shared game with the other lane (Lane ${rung.lane === "A" ? "B" : "A"} uses different fixtures) — the two lanes can advance independently.`,
    whyThisCard: [
      teamOnly
        ? `Lower-volatility: 2 team/game markets (avg confidence ${avgConf}%), one per game, picked jointly with the other lane to avoid shared-game correlation.`
        : `Lower-volatility: 2 model-qualified legs (avg confidence ${avgConf}%); no team-only card reached the target so a model-qualified prop is included.`,
      fitsTarget
        ? `Combined ${combinedOdds > 0 ? "+" : ""}${combinedOdds} rides $${rung.rolledStake.toLocaleString("en-US")} toward the $${rung.targetReturn.toLocaleString("en-US")} rung goal.`
        : `No 2-leg combo reaches the $${rung.targetReturn.toLocaleString("en-US")} goal — strongest available shown.`,
    ],
    shortfallNote: legs.length < 2 ? "Fewer than 2 model-qualified legs available — awaiting a full card." : (!fitsTarget ? `Below the Step ${rung.nextStep} target — candidate only.` : null),
  };
}

/**
 * Pick Lane A + Lane B together. Enumerates every way to split the available games into a Lane-A pair
 * and a Lane-B pair (no shared game), scores each split by (both lanes fit target) then total
 * confidence, and returns the best independent pair. Falls back to the single-lane selector's behaviour
 * via `null` legs only when a clean split is impossible.
 */
export function selectCrossLaneBankBuilder(pool: ModelPick[], rungA: LaneRung, rungB: LaneRung): { laneA: GeneratedLane; laneB: GeneratedLane } {
  const inWindow = pool.filter((p) => p.odds >= -500 && p.odds <= 400);
  const byGame = new Map<string, ModelPick[]>();
  for (const p of inWindow) { const a = byGame.get(p.gameId) ?? []; a.push(p); byGame.set(p.gameId, a); }
  const games = [...byGame.keys()];

  let best: { a: LaneFit | null; b: LaneFit | null; aGames: string[]; bGames: string[]; score: number } | null = null;
  // All ordered 2+2 splits of the games (Lane A gets a pair, Lane B gets a disjoint pair).
  for (let i = 0; i < games.length; i++) for (let j = i + 1; j < games.length; j++) {
    const aGames = [games[i], games[j]];
    const rest = games.filter((g) => g !== games[i] && g !== games[j]);
    for (let k = 0; k < rest.length; k++) for (let l = k + 1; l < rest.length; l++) {
      const bGames = [rest[k], rest[l]];
      const aFit = bestCardForGames(byGame, aGames, rungA.targetMultiplier);
      const bFit = bestCardForGames(byGame, bGames, rungB.targetMultiplier);
      const bothFit = !!aFit?.fitsTarget && !!bFit?.fitsTarget;
      // Score: both-fit dominates; then total confidence.
      const score = (bothFit ? 1000 : 0) + (aFit?.conf ?? 0) + (bFit?.conf ?? 0);
      if (!best || score > best.score) best = { a: aFit, b: bFit, aGames, bGames, score };
    }
  }
  if (!best) {
    // No 4+ game split possible (e.g. <4 games) — return empty lanes (caller falls back).
    return { laneA: toGeneratedLane(rungA, null, []), laneB: toGeneratedLane(rungB, null, []) };
  }
  return { laneA: toGeneratedLane(rungA, best.a, best.bGames), laneB: toGeneratedLane(rungB, best.b, best.aGames) };
}
