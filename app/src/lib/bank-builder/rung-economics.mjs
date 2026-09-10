/**
 * RUNG ECONOMICS — the ladder decides the stake, not the card.
 *
 * WHAT WAS WRONG. On 2026-09-10 the public board showed Lane B standing on "Step 2 · from $200"
 * while its money row read "$100.00 Stake · $307.01 To win". Both numbers were internally
 * consistent and the pair was nonsense: a ladder that compounds cannot stake the seed again on the
 * second rung. The stake was being read off the daily card, which is generated at a flat $100
 * whatever rung the lane is standing on, so the ladder's arithmetic and the card's arithmetic were
 * two different claims sitting side by side.
 *
 * The same screen also showed Lane B's Step 1 as "Upcoming" beneath an active Step 2. There is no
 * such state. You arrive at rung 2 by clearing rung 1; if rung 1 did not clear, the ladder restarts
 * at rung 1 and there is no rung 2 to be standing on.
 *
 * THE RULE, stated once so every surface can share it:
 *
 *   · a run starts at the seed ($100) on rung 1
 *   · a card wins ONLY if every leg wins — a parlay is one outcome, not two
 *   · win  → the whole payout carries into the next rung and becomes the next stake
 *   · lose → the run is over; the next run starts again at the seed on rung 1
 *
 * There is no partial credit and nothing is ever staked that the previous rung did not produce.
 *
 * THE TARGET IS A DESIGN, THE RETURN IS ARITHMETIC. Each rung names the balance the run is climbing
 * toward ($200 → $700 → $1,400 → $3,500 → $10,000). Whether today's card actually gets there
 * depends on its price: $200 at +207 returns $614, not $700. That shortfall is REPORTED rather than
 * papered over — a rung that prints its target while the card underneath cannot reach it is the
 * same species of error as the $100 stake.
 */

/** The seed every run starts from. */
export const BANK_BUILDER_SEED = 100;

/** American odds → decimal multiplier. Returns null for anything unusable rather than guessing. */
export function decimalFromAmerican(american) {
  const a = Number(american);
  if (!Number.isFinite(a) || a === 0) return null;
  return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
}

/**
 * The stake a run carries INTO a rung.
 *
 * `clearedPayout` is what the previous rung actually returned — the real settled number, not the
 * rung's design target, because a rung can clear for more or less than its target and the next
 * stake is whatever the money actually did.
 *
 * Rung 1 always stakes the seed. Any later rung with no cleared payout behind it is incoherent:
 * this returns null rather than falling back to the seed, so a caller cannot accidentally render
 * the exact bug this module exists to remove.
 */
export function stakeForRung({ step, clearedPayout = null, seed = BANK_BUILDER_SEED } = {}) {
  if (!Number.isFinite(step) || step < 1) return null;
  if (step === 1) return seed;
  if (!Number.isFinite(clearedPayout) || clearedPayout <= 0) return null;
  return Number(clearedPayout.toFixed(2));
}

/**
 * What today's card actually returns on that stake, and whether it reaches the rung's target.
 *
 * `shortfall` is positive when the card cannot reach the target. It is surfaced because the honest
 * answer to "this rung is worth $700" is sometimes "this card gets you to $614".
 */
export function rungProjection({ stake, americanOdds, goalTarget }) {
  const dec = decimalFromAmerican(americanOdds);
  if (!Number.isFinite(stake) || stake <= 0 || dec === null) {
    return { stake: Number.isFinite(stake) ? stake : null, decimal: null, projectedReturn: null, projectedProfit: null, reachesTarget: null, shortfall: null };
  }
  const projectedReturn = Number((stake * dec).toFixed(2));
  const reachesTarget = Number.isFinite(goalTarget) ? projectedReturn >= goalTarget : null;
  return {
    stake: Number(stake.toFixed(2)),
    decimal: Number(dec.toFixed(4)),
    projectedReturn,
    projectedProfit: Number((projectedReturn - stake).toFixed(2)),
    reachesTarget,
    shortfall: Number.isFinite(goalTarget) && projectedReturn < goalTarget ? Number((goalTarget - projectedReturn).toFixed(2)) : null,
  };
}

/** The price a rung needs for this stake to reach its target — what the selector should be hunting. */
export function requiredAmericanForRung({ stake, goalTarget }) {
  if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(goalTarget) || goalTarget <= stake) return null;
  const dec = goalTarget / stake;
  const profitMultiple = dec - 1;
  return profitMultiple >= 1
    ? Math.round(profitMultiple * 100)
    : -Math.round(100 / profitMultiple);
}

/**
 * Advance or restart a run after a card settles.
 *
 * ONE LOSING LEG ENDS THE RUN. `legResults` is every leg's outcome; the card wins only if they all
 * win. A pushed leg neither wins nor loses — it is dropped from the parlay, exactly as a book would,
 * rather than being counted as a loss that resets a healthy run.
 */
export function settleRung({ step, stake, payout, legResults, stepCount = 5 }) {
  const results = Array.isArray(legResults) ? legResults : [];
  const decided = results.filter((r) => r !== "push" && r !== "void");
  const anyLost = decided.some((r) => r === "lost" || r === "loss" || r === false);
  const allWon = decided.length > 0 && !anyLost;

  if (!decided.length) {
    return { outcome: "UNDECIDED", nextStep: step, nextStake: stake, runEnded: false, reason: "no leg has a decided result yet" };
  }
  if (anyLost) {
    return {
      outcome: "LOST", nextStep: 1, nextStake: BANK_BUILDER_SEED, runEnded: true,
      reason: "a leg lost — a parlay is one outcome, so the run ends and the next one starts again at the seed",
    };
  }
  if (allWon && step >= stepCount) {
    return { outcome: "COMPLETED", nextStep: null, nextStake: null, runEnded: true, reason: "the final rung cleared — the run reached the crown" };
  }
  return {
    outcome: "WON", nextStep: step + 1,
    nextStake: Number.isFinite(payout) ? Number(payout.toFixed(2)) : null,
    runEnded: false,
    reason: "every leg won — the whole payout carries into the next rung",
  };
}

/**
 * Is a lane's rendered ladder internally coherent?
 *
 * The board showed an active rung 2 above an "Upcoming" rung 1. Whatever produced it, no reader
 * should ever see it, so the contradiction is named here and the surfaces can refuse to draw it.
 */
export function ladderCoherence(rungs) {
  const problems = [];
  const rows = [...(rungs ?? [])].sort((a, b) => a.step - b.step);
  const activeIdx = rows.findIndex((r) => r.status === "active" || r.status === "current");
  if (activeIdx > 0) {
    for (const below of rows.slice(0, activeIdx)) {
      if (below.status !== "completed" && below.status !== "cleared") {
        problems.push(`step ${below.step} is "${below.status}" beneath an active step ${rows[activeIdx].step} — a rung is only reached by clearing the one below it`);
      }
    }
  }
  for (const r of rows) {
    if ((r.status === "active" || r.status === "current") && Number.isFinite(r.stake) && Number.isFinite(r.startTarget) && r.step > 1 && r.stake === BANK_BUILDER_SEED && r.startTarget !== BANK_BUILDER_SEED) {
      problems.push(`step ${r.step} stakes the $${BANK_BUILDER_SEED} seed while standing on a rung entered at $${r.startTarget} — the ladder is not compounding`);
    }
  }
  return { coherent: problems.length === 0, problems };
}
