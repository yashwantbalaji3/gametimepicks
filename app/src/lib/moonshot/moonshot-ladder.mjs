/**
 * THE MOONSHOT LADDER — the same rule as Bank Builder, over a shorter, steeper climb.
 *
 * Moonshot used to be a different KIND of product: independent longshot cards, six to eight legs,
 * "maximum upside (not a ladder)". Two of those sat side by side at +3380 and +8778, each one a
 * single ticket that either landed or did not, with no relationship to the next day.
 *
 * It is a ladder now, by the founder's direction, and the change is more than cosmetic. An
 * eight-leg card at +8778 is one bet with a very small chance of paying; a three-rung climb at
 * roughly +300, +300, +150 asks three ordinary questions in sequence. Both reach a similar
 * destination. The ladder makes the path legible — you can see where a run is, what it needs next,
 * and exactly what ends it.
 *
 *   Day 1   $25 →   $100     needs +300
 *   Day 2  $100 →   $400     needs +300
 *   Day 3  $400 → $1,000     needs +150
 *
 * THE RULE IS BANK BUILDER'S, DELIBERATELY UNCHANGED — every leg must win, the whole payout carries
 * into the next rung, and one losing leg ends the run and starts the next one back at the seed. Two
 * products with the same shape must not have two different rules about what a loss means, so the
 * arithmetic and the settlement both come from bank-builder/rung-economics.mjs and only the rungs
 * differ. What differs is the RISK: three rungs at these prices is a far less likely climb than
 * five at Bank Builder's, and the seed is $25 rather than $100 because of it.
 */
import { requiredAmericanForRung } from "../bank-builder/rung-economics.mjs";

/** The seed every Moonshot run starts from. Smaller than Bank Builder's, because the climb is steeper. */
export const MOONSHOT_SEED = 25;

/** The crown — the balance a completed run reaches. */
export const MOONSHOT_GOAL = 1000;

/**
 * Three rungs, named by the day they are meant to be climbed on.
 *
 * `start` is the balance carried in, `goal` the balance carried out. The prices below are what each
 * rung REQUIRES, derived rather than typed so a rung and its price can never disagree.
 */
export const MOONSHOT_LADDER = Object.freeze([
  Object.freeze({ step: 1, day: "Day 1", start: 25, goal: 100, multiplier: 100 / 25 }),
  Object.freeze({ step: 2, day: "Day 2", start: 100, goal: 400, multiplier: 400 / 100 }),
  Object.freeze({ step: 3, day: "Day 3", start: 400, goal: 1000, multiplier: 1000 / 400 }),
]);

export const MOONSHOT_STEP_COUNT = MOONSHOT_LADDER.length;

/** The price each rung needs, derived from the rung itself. */
export function moonshotRequiredPrice(step) {
  const rung = MOONSHOT_LADDER.find((r) => r.step === step);
  if (!rung) return null;
  return requiredAmericanForRung({ stake: rung.start, goalTarget: rung.goal });
}

/** Every rung with its required price attached — what a selector hunts and a board renders. */
export function moonshotRungs() {
  return MOONSHOT_LADDER.map((r) => ({ ...r, requiredAmerican: moonshotRequiredPrice(r.step) }));
}

/**
 * Which rung a run is standing on, from the balance it is carrying.
 *
 * A balance at or above the crown means the run is COMPLETE — this returns null rather than
 * inventing a fourth rung, the same way Bank Builder refuses a sixth.
 */
export function moonshotStepForBalance(balance) {
  if (!Number.isFinite(balance)) return MOONSHOT_LADDER[0];
  if (balance < MOONSHOT_SEED) return MOONSHOT_LADDER[0];
  if (balance >= MOONSHOT_GOAL) return null;
  for (const rung of MOONSHOT_LADDER) {
    if (balance >= rung.start && balance < rung.goal) return rung;
  }
  return MOONSHOT_LADDER[0];
}

/**
 * The honest odds of a full climb, given a per-rung hit rate.
 *
 * PUBLISHED BECAUSE THE SHAPE INVITES THE WRONG INTUITION. Three steps sounds close. Three
 * independent rungs that each need roughly a +300 shot do not compound the way a reader expects,
 * and a ladder graphic makes the top look reachable in a way a single +8778 ticket never did. This
 * returns the actual product so a surface can print it instead of letting the picture argue.
 *
 * Takes the hit rate as an argument rather than assuming one: this project does not have a measured
 * Moonshot hit rate, and inventing one to make a nicer number would be the whole problem.
 */
export function climbProbability(perRungHitRate) {
  if (!Number.isFinite(perRungHitRate) || perRungHitRate <= 0 || perRungHitRate > 1) return null;
  return Number(Math.pow(perRungHitRate, MOONSHOT_STEP_COUNT).toFixed(6));
}

/** The break-even per-rung hit rate implied by a rung's price — what it must beat to be worth climbing. */
export function impliedRungProbability(american) {
  const a = Number(american);
  if (!Number.isFinite(a) || a === 0) return null;
  const p = a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100);
  return Number(p.toFixed(4));
}
