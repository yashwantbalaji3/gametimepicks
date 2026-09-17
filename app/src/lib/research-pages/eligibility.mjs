/**
 * RESEARCH PAGE ELIGIBILITY (v1.3 · §17 §97) — which canonical entities get a public page, and which of those
 * are indexable. Decided from PLATFORM FACTS ONLY (never a name, never a forecast), so the projection stays a pure
 * function of the committed platform store.
 *
 * Why thresholds at all: the platform holds ~7,400 people. A page per person would be thousands of thin, mostly
 * empty pages and would multiply the static export (measured before v1.3: 455 generated pages, 161 s local build).
 * Each rule below names what makes a page worth opening; everything else is excluded WITH a reason in the
 * readiness receipt, never silently.
 *
 * Pure: no filesystem, no clock.
 */

export const ELIGIBILITY_RULES = Object.freeze({
  MLB_TEAM: "at least one final with both clubs' official runs recorded",
  NFL_TEAM: "at least one final with both teams' official points recorded",
  EPL_TEAM: "a club in the current (2026-27) fixture list — results are not an id-keyed fact, so pages are PARTIAL and noindex",
  NFL_PLAYER: "on a current ESPN roster with at least one recorded game 2023–2025, or at least 8 recorded games across 2024–2025",
  MLB_PLAYER: "at least 30 games with a captured category — partial by construction, so noindex",
  EPL_PLAYER: "at least 10 appearances in 2025-26",
  UFC_FIGHTER: "at least 5 recorded bouts, or an upcoming bout on a committed schedule plus at least 1 recorded bout",
});

export const THRESHOLDS = Object.freeze({
  NFL_RECENT_SEASONS: ["NFL-2024", "NFL-2025"],
  NFL_ROSTER_SEASONS: ["NFL-2023", "NFL-2024", "NFL-2025"],
  NFL_RECENT_MIN: 8,
  NFL_INDEX_MIN: 8,
  MLB_MIN: 30,
  EPL_SEASON: "EPL-2025-26",
  EPL_MIN: 10,
  EPL_CURRENT_SEASON: "EPL-2026-27",
  UFC_MIN: 5,
  UFC_UPCOMING_MIN: 1,
});

/** The hard ceiling on research pages in one export. Raising it is a deliberate, measured change (§17). */
export const RESEARCH_PAGE_BUDGET = 2000;

const countIn = (seasonCounts, seasons) => seasons.reduce((a, s) => a + (seasonCounts[s] ?? 0), 0);

/**
 * @param {{ sport: string, games: number, seasonCounts: Record<string, number>, currentTeamId: string|null, hasUpcoming: boolean }} p
 *   games = recorded game-log rows (participation rows only)
 * @returns {{ published: boolean, indexable: boolean, reason: string }}
 */
export function playerEligibility(p) {
  const T = THRESHOLDS;
  switch (p.sport) {
    case "NFL": {
      const rostered = Boolean(p.currentTeamId) && countIn(p.seasonCounts, T.NFL_ROSTER_SEASONS) >= 1;
      const volume = countIn(p.seasonCounts, T.NFL_RECENT_SEASONS) >= T.NFL_RECENT_MIN;
      if (!rostered && !volume) return { published: false, indexable: false, reason: p.games ? "BELOW_THRESHOLD" : "NO_RECORDED_GAMES" };
      return { published: true, indexable: p.games >= T.NFL_INDEX_MIN, reason: rostered ? "ROSTERED_WITH_HISTORY" : "RECENT_VOLUME" };
    }
    case "MLB":
      if (p.games < T.MLB_MIN) return { published: false, indexable: false, reason: p.games ? "BELOW_THRESHOLD" : "NO_RECORDED_GAMES" };
      return { published: true, indexable: false, reason: "PARTIAL_CAPTURED_CATEGORIES" };
    case "EPL":
      if ((p.seasonCounts[T.EPL_SEASON] ?? 0) < T.EPL_MIN) return { published: false, indexable: false, reason: p.games ? "BELOW_THRESHOLD" : "NO_RECORDED_GAMES" };
      return { published: true, indexable: true, reason: "RECENT_APPEARANCES" };
    case "UFC": {
      if (p.games >= T.UFC_MIN) return { published: true, indexable: true, reason: "RECORDED_BOUTS" };
      if (p.hasUpcoming && p.games >= T.UFC_UPCOMING_MIN) return { published: true, indexable: false, reason: "UPCOMING_BOUT" };
      return { published: false, indexable: false, reason: p.games ? "BELOW_THRESHOLD" : "NO_RECORDED_GAMES" };
    }
    default:
      return { published: false, indexable: false, reason: "UNSUPPORTED_SPORT" };
  }
}

/**
 * @param {{ sport: string, finalsWithResult: number, seasons: string[] }} t
 */
export function teamEligibility(t) {
  if (t.sport === "MLB" || t.sport === "NFL") {
    return t.finalsWithResult > 0 ? { published: true, indexable: true, reason: "RESULTS_RECORDED" } : { published: false, indexable: false, reason: "NO_RECORDED_RESULTS" };
  }
  if (t.sport === "EPL") {
    return t.seasons.includes(THRESHOLDS.EPL_CURRENT_SEASON)
      ? { published: true, indexable: false, reason: "CURRENT_FIXTURES_PARTIAL" }
      : { published: false, indexable: false, reason: "NOT_IN_CURRENT_SEASON" };
  }
  return { published: false, indexable: false, reason: "UNSUPPORTED_SPORT" };
}
