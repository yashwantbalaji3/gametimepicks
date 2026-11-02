/**
 * NBA PLAYER READINESS, audit §8 (docs/nba/NBA_MINUTES_ROOT_CAUSE_AUDIT_2026-11-02.md). PURE. Report and social use only:
 * it changes no forecast. Constants await founder approval. R_STAT and R_LINE are proposed additions, not in §8.
 */
export const READINESS = Object.freeze({ cap: 48, blockGap: 14.3, review: 41, reviewGap: 8.4, minGames: 3, statShare: 0.25, statFloor: 3 });
const off = (a, b) => Math.abs(a - b) >= READINESS.statFloor && Math.abs(a - b) / Math.max(Math.abs(b), 1) >= READINESS.statShare;
/** @param r { mu, n, cur, teamGames, missedLast, missedTwo, injured, medians, recent, lines } */
export function assessPlayer(r) {
  const R = READINESS; const blocked = []; const review = [];
  if (r.mu >= R.cap) blocked.push("B_CAP");
  if (r.n >= R.minGames && Math.abs(r.mu - r.cur) >= R.blockGap) blocked.push("B_GAP");
  if ((r.n === 0 && r.teamGames >= R.minGames) || r.missedTwo) blocked.push("B_ELIG");
  if (r.mu >= R.review) review.push("R_41");
  if (r.n >= R.minGames && Math.abs(r.mu - r.cur) >= R.reviewGap) review.push("R_GAP");
  if (r.n < R.minGames && r.teamGames >= R.minGames) review.push("R_THIN");
  if (r.teamGames < R.minGames) review.push("R_NO_CURRENT");
  if (r.missedLast) review.push("R_MISSED_1");
  if (r.injured) review.push("R_INJ");
  const cells = {};
  for (const m of ["pts", "reb", "ast"]) {
    const reasons = [];
    if (r.recent?.[m] != null && r.n >= R.minGames && off(r.medians[m], r.recent[m])) reasons.push("R_STAT");
    if (r.lines?.[m] != null && off(r.medians[m], r.lines[m])) reasons.push("R_LINE");
    cells[m] = { state: blocked.length ? "BLOCKED" : review.some((x) => x !== "R_INJ") || reasons.length ? "REVIEW" : "PASS", reasons };
  }
  return { state: blocked.length ? "BLOCKED" : review.length ? "REVIEW" : "PASS", reasons: [...blocked, ...review], cells };
}
