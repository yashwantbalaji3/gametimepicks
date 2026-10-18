/**
 * MLB settled-lean outcome → display state. Pure, no I/O, so the rule the
 * MLB results pages render by is testable (mlb-settled-outcome.test.mjs).
 *
 * ⚠ VOID IS NOT PUSH. The MLB producer writes four outcomes — Win, Loss,
 * Push, Void — and the `/results/mlb` adapter used to map everything that
 * was not Win or Loss to "push". Every Void row (a DNP / 0-AB batter, every
 * row of a postponed game: all 41 of 2026-10-16 TB@CLE) was therefore shown
 * as a Push and tallied under the push chip. The record was right and the
 * label was wrong. A push is a graded result that landed on the line; a void
 * is a row that was never graded. Pushes and voids are never losses, and they
 * are reported distinctly.
 */
import type { SettledLean } from "./settlement-data";
import type { MlbSettledLean } from "./types-mlb-results";

/** MlbSettledLean.outcome → the shared SettledLean.result vocabulary. */
export function mlbOutcomeToSettledResult(
  outcome: MlbSettledLean["outcome"] | null | undefined,
): NonNullable<SettledLean["result"]> {
  switch (outcome) {
    case "Win":
      return "win";
    case "Loss":
      return "loss";
    case "Push":
      return "push";
    case "Void":
      return "void";
    default:
      // An outcome we don't recognise is never promoted to a graded state.
      return "invalid";
  }
}

export interface MlbOutcomeTally {
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
}

/** W / L / P / V counts for a set of MLB rows. Voids are counted apart, never as push, win or loss. */
export function tallyMlbOutcomes(
  rows: ReadonlyArray<Pick<MlbSettledLean, "outcome">>,
): MlbOutcomeTally {
  const t: MlbOutcomeTally = { wins: 0, losses: 0, pushes: 0, voids: 0 };
  for (const r of rows) {
    if (r.outcome === "Win") t.wins += 1;
    else if (r.outcome === "Loss") t.losses += 1;
    else if (r.outcome === "Push") t.pushes += 1;
    else if (r.outcome === "Void") t.voids += 1;
  }
  return t;
}
