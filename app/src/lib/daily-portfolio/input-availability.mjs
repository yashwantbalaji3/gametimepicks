/**
 * "NO CARD TODAY" AND "NO SLATE TODAY" ARE DIFFERENT ANSWERS.
 *
 * The generator says the same sentence for both — "fewer than 2 model-qualified legs — awaiting a
 * full card" — whether it evaluated forty-five candidates and none qualified, or whether its input
 * artifact did not exist at all. That conflation is how the World Cup pool stayed dead for months
 * behind a message that read like a thin slate.
 *
 * It is not hypothetical timing, either. Generation is scheduled at 15:30 UTC. The team-market pool
 * it reads was written at 16:50 UTC on 2026-09-05 — an hour and twenty minutes LATER. That day only
 * produced a pool because cron drift pushed generation to 17:29; on a day the two jobs drift the
 * other way, the generator reads nothing and publishes a no-card that is really a missing input.
 *
 * This says which of the two it is. Pure: it looks for the artifacts and reports, nothing more.
 */
import fs from "node:fs";
import path from "node:path";

export const POOL_STATUS = Object.freeze({
  PRICED: "PRICED",                 // a priced slate exists for the date
  INPUTS_MISSING: "INPUTS_MISSING", // no priced slate has been published yet
  NO_EVENTS: "NO_EVENTS",           // a slate exists and holds no games
});

const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/**
 * @param {string} root  public/data
 * @param {string} date  YYYY-MM-DD
 * @returns {{status: string, sources: Array<{path: string, present: boolean, games: number|null}>}}
 */
export function poolAvailability(root, date) {
  const candidates = [
    path.join(root, "mlb", "team-markets", `${date}.json`),
    path.join(root, "mlb", "board", `${date}.json`),
  ];
  const sources = candidates.map((p) => {
    const present = exists(p);
    let games = null;
    if (present) {
      try {
        const doc = JSON.parse(fs.readFileSync(p, "utf8"));
        const g = doc?.games ?? doc?.rows ?? null;
        games = Array.isArray(g) ? g.length : g && typeof g === "object" ? Object.keys(g).length : null;
      } catch { games = null; }
    }
    return { path: p.slice(p.indexOf("mlb")), present, games };
  });
  const anyPresent = sources.some((s) => s.present);
  if (!anyPresent) return { status: POOL_STATUS.INPUTS_MISSING, sources };
  const anyGames = sources.some((s) => (s.games ?? 0) > 0);
  return { status: anyGames ? POOL_STATUS.PRICED : POOL_STATUS.NO_EVENTS, sources };
}

/**
 * The sentence a lane shows when it has no legs. A missing input names itself, so an operator reading
 * the page can tell a job that has not run yet from a slate that genuinely offered nothing.
 */
export function emptyPoolReason(status, date) {
  if (status === POOL_STATUS.INPUTS_MISSING) {
    return `no priced slate has been published for ${date} yet — this is a missing input, not a slate that came up short`;
  }
  if (status === POOL_STATUS.NO_EVENTS) {
    return `the ${date} slate holds no games`;
  }
  return null;   // PRICED — the lane's own qualification reason stands
}
