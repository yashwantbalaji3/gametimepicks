/**
 * MLB PROJECTED SCORE — PUBLIC COPY (MLB Department, 2026-10-05). Pure, no I/O.
 *
 * The decision owner's `projectedScore` is TWO SEPARATE MEDIANS: each club's own median simulated runs
 * (decision.ts). It is not a simulated final score: across the 801 graded games 07-24 → 10-04, 330 of these
 * pairs were ties (e.g. 4-4) — a final no baseball game can have — and 287 did not add up to the published
 * median total. Printed as "CWS 4 – 4 CLE" beside "CLE wins", it read like a predicted tied final.
 *
 * So every MLB game-page surface names it for what it is — median runs per team — joins the two numbers with a
 * separator that is not a score dash, and says plainly that equal medians are not a predicted tie. The numbers
 * are never changed here: this formats the owner's values verbatim.
 */

export const MEDIAN_RUNS_LABEL = "Median runs per team";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * @param {{ away: number, home: number } | null | undefined} score  the decision owner's projectedScore
 * @param {string} awayAbbr
 * @param {string} homeAbbr
 * @returns {{ label: string, text: string, note: string, tied: boolean } | null}
 */
export function medianRunsCopy(score, awayAbbr, homeAbbr) {
  if (!score || !isNum(score.away) || !isNum(score.home)) return null;
  const tied = score.away === score.home;
  return {
    label: MEDIAN_RUNS_LABEL,
    text: `${awayAbbr} ${score.away} · ${homeAbbr} ${score.home}`,
    note: tied
      ? "Equal medians, not a predicted tie: each team's own median, not a final score"
      : "Each team's own median, not a predicted final score",
    tied,
  };
}
