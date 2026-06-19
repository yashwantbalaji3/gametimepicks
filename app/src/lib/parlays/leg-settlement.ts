/**
 * Pure leg-settlement grading for Bank Builder lanes — encodes the official rules so a settlement is
 * deterministic and unit-tested, never ad-hoc. Soccer uses the 90-minute regulation result only (no
 * extra time / penalties). Player props void on no plate appearance (DNP). No fabrication: the caller
 * passes the official numbers; these functions only apply the rule.
 */
export type LegResult = "won" | "lost" | "void";

/** Soccer moneyline (90'): the picked team must win in regulation; draw or loss → lost. */
export function gradeSoccerMoneyline(pickedIsHome: boolean, homeGoals: number, awayGoals: number): LegResult {
  const picked = pickedIsHome ? homeGoals : awayGoals;
  const other = pickedIsHome ? awayGoals : homeGoals;
  return picked > other ? "won" : "lost";
}

/** Soccer draw-no-bet (90'): picked team win → won; draw → void (stake refunded); loss → lost. */
export function gradeSoccerDrawNoBet(pickedIsHome: boolean, homeGoals: number, awayGoals: number): LegResult {
  if (homeGoals === awayGoals) return "void";
  const picked = pickedIsHome ? homeGoals : awayGoals;
  const other = pickedIsHome ? awayGoals : homeGoals;
  return picked > other ? "won" : "lost";
}

/**
 * Over/Under player prop. `hadPlateAppearance` false → DNP/no action → void. Otherwise compare the
 * official value to the line. Exactly on the line is a push (treated as void/no-action).
 */
export function gradeOverUnder(side: "over" | "under", value: number, line: number, hadPlateAppearance: boolean): LegResult {
  if (!hadPlateAppearance) return "void";
  if (value === line) return "void"; // push / no-action
  const over = value > line;
  return side === "over" ? (over ? "won" : "lost") : (over ? "lost" : "won");
}

/** Hits + Runs + RBIs total → graded as an Over/Under on the summed value. */
export function gradeHitsRunsRbis(side: "over" | "under", hits: number, runs: number, rbis: number, line: number, hadPlateAppearance: boolean): LegResult {
  return gradeOverUnder(side, hits + runs + rbis, line, hadPlateAppearance);
}

/**
 * Combine leg results into a parlay step result. A single lost leg → the step is lost. Voided legs drop
 * out (no action) and the parlay reduces to the remaining legs; if every leg voids → the step voids.
 */
export function gradeParlayStep(legs: LegResult[]): LegResult {
  if (legs.some((r) => r === "lost")) return "lost";
  const live = legs.filter((r) => r !== "void");
  if (live.length === 0) return "void";
  return live.every((r) => r === "won") ? "won" : "lost";
}
