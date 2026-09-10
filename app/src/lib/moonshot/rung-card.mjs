/**
 * MOONSHOT RUNG CARD — the two-leg card that reaches today's rung, chosen by the chance it lands.
 *
 * Moonshot is Bank Builder's ladder run faster: Day 1 $25 → $100, Day 2 $100 → $400, Day 3 $400 →
 * $1,000. Both legs win → the whole payout carries to the next day; either leg loses → back to $25.
 * The card for a rung therefore has one job: reach the rung's price (carried balance × price ≥ goal)
 * with the best chance of both legs landing.
 *
 * WHY NOT BANK BUILDER'S SELECTOR. That selector keeps only the 24 most probable MLB legs before it
 * enumerates. Those are favourites: two of them top out near +230, so a +300 rung could never be
 * reached and Moonshot would publish "no card" on every slate. Two legs from a full slate is at most a
 * few thousand pairs, so every pair is scored — no truncation needed.
 *
 * RULES
 *   · exactly two legs, from two different games (legs from one game are correlated, and a pair's
 *     chance is only the product of its legs' chances when they are independent)
 *   · the combined price must reach the rung: rolledStake × decimal ≥ goal
 *   · among pairs that reach it, the highest joint probability wins; ties go to the smaller overshoot
 *   · nothing reaches → the closest pair is returned as a CANDIDATE (fitsTarget false), never placed
 *   · the probabilities are the legs' own (de-vigged market prices for team markets); nothing here
 *     claims to beat a price
 */

const dec = (american) => (american > 0 ? 1 + american / 100 : 1 + 100 / -american);
const toAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)));
const round2 = (n) => Math.round(n * 100) / 100;

export const RUNG_CARD_LEGS = 2;
/** Same leg bounds Bank Builder applies — no heavy chalk that adds nothing, no lottery legs. */
export const LEG_ODDS_MIN = -650;
export const LEG_ODDS_MAX = 400;

/**
 * @param {Array<object>} pool   ModelPick-shaped legs: { id, gameId, odds, modelProbability, ... }
 * @param {object} rung          { lane, nextStep, clearedSteps, rolledStake, targetReturn, targetMultiplier }
 * @param {{excludeIds?: Set<string>, excludeGames?: Set<string>, seed?: number}} [opts]
 */
export function selectMoonshotRungCard(pool, rung, { excludeIds = new Set(), excludeGames = new Set(), seed = 25 } = {}) {
  const legs = (pool ?? []).filter((p) =>
    p && p.id && p.gameId && Number.isFinite(p.odds) && p.odds >= LEG_ODDS_MIN && p.odds <= LEG_ODDS_MAX &&
    Number.isFinite(p.modelProbability) && p.modelProbability > 0 && p.modelProbability < 1 &&
    !excludeIds.has(p.id) && !excludeGames.has(p.gameId));

  const target = rung.targetMultiplier;
  let best = null;
  let closest = null;
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i], b = legs[j];
      if (a.gameId === b.gameId) continue;
      const d = dec(a.odds) * dec(b.odds);
      const prob = a.modelProbability * b.modelProbability;
      const key = [a.id, b.id].sort().join("|");
      const c = { legs: [a, b], d, prob, key };
      if (d >= target) {
        if (!best || prob > best.prob + 1e-12 || (Math.abs(prob - best.prob) <= 1e-12 && (d < best.d - 1e-12 || (Math.abs(d - best.d) <= 1e-12 && key < best.key)))) best = c;
      } else if (!closest || d > closest.d + 1e-12 || (Math.abs(d - closest.d) <= 1e-12 && key < closest.key)) {
        closest = c;
      }
    }
  }

  const chosen = best ?? closest;
  const fitsTarget = Boolean(best);
  const picked = chosen ? [...chosen.legs].sort((x, y) => String(x.kickoffUtc ?? "").localeCompare(String(y.kickoffUtc ?? "")) || String(x.id).localeCompare(String(y.id))) : [];
  const combinedDecimal = chosen ? chosen.d : 1;
  const hitProbability = chosen ? chosen.prob : 0;
  const potentialReturn = round2(rung.rolledStake * combinedDecimal);
  const pct = Math.round(hitProbability * 1000) / 10;
  return {
    product: "moonshot",
    lane: rung.lane,
    step: rung.nextStep,
    clearedSteps: rung.clearedSteps,
    rolledStake: rung.rolledStake,
    seedExposure: seed,
    targetReturn: rung.targetReturn,
    legs: picked,
    combinedDecimal: round2(combinedDecimal),
    combinedOdds: picked.length ? toAmerican(combinedDecimal) : 0,
    potentialReturn,
    hitProbability: Math.round(hitProbability * 10000) / 10000,
    fitsTarget,
    correlationNote: picked.length === 2 ? "Two different games — the legs do not share a result." : null,
    shortfallNote: picked.length < 2
      ? "Fewer than two eligible legs on the slate — awaiting a full card."
      : (!fitsTarget ? `No two-leg card reaches the Day ${rung.nextStep} goal of $${rung.targetReturn.toLocaleString("en-US")} — shown as a candidate, not placed.` : null),
    whyThisCard: picked.length === 2 ? [
      `Day ${rung.nextStep}: $${rung.rolledStake.toLocaleString("en-US")} needs ${target.toFixed(2)}× to reach $${rung.targetReturn.toLocaleString("en-US")}.`,
      fitsTarget
        ? `Of every two-leg pair from different games that reaches it, this one has the best chance of both landing (${pct}%).`
        : `The closest pair reaches ${combinedDecimal.toFixed(2)}×, short of the goal.`,
      "Both legs win → the whole payout carries to the next day. Either leg loses → the lane restarts at $25.",
    ] : [],
  };
}
