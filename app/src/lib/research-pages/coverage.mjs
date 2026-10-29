/**
 * RESEARCH COVERAGE (v1.3 · §34 §62) — one descriptor per page plus the ONLY user-facing coverage copy.
 *
 * The projection stores structured facts (status, seasons covered, codes); the words live here, in one place,
 * so no page invents its own caveat and no page drops one. Copy is plain English: it never names a provider,
 * a file, or an internal status word, and it never says "career", "all-time" or "complete".
 *
 * Pure: no filesystem, no clock.
 */
import { COVERAGE_STATUS } from "./contract.mjs";

/** Note codes → user copy. `{from}`/`{to}` are season labels, `{through}` an absolute date. */
export const COVERAGE_COPY = Object.freeze({
  MLB_TEAM_RUNS_ONLY: "Results come from official final scores. Team batting and pitching statistics are not part of GameTime data yet.",
  MLB_TEAM_2026_FROM_JULY: "2026 results are recorded from July 4, 2026. Earlier 2026 games show the schedule only.",
  NFL_TEAM_2026_WINDOW: "Some 2026 results are not recorded yet; those games show no final rather than a guessed score.",
  EPL_TEAM_NO_RESULTS: "Fixture history is available. Final team results are not yet available from GameTime's ID-based data, so no record or table is shown.",
  /* Batch 1 · #8: a club page that lists its current-season results (lib/sports/epl/team-results.mjs) says where they come
     from and that earlier seasons are still fixtures only. */
  EPL_TEAM_CURRENT_RESULTS: "Current-season results are the official full-time scores of every graded Premier League match, the same record the Premier League hub shows. Earlier seasons show fixtures only.",
  NFL_PLAYER_2026_BLOCKED: "No 2026 game logs are recorded for this player yet. Recorded history through {to} is shown below.",
  /* Audit 2026-10-28 F08: 425 NFL player pages showed 2026 game logs under a note saying 2026 logs were not available.
     A page that HAS 2026 rows says they are partial — never that they are absent. */
  NFL_PLAYER_2026_PARTIAL: "2026 game logs cover the games recorded so far this season. A 2026 game with no row here is not recorded yet; it is not a game missed.",
  NFL_PLAYER_PRE_2023_PARTIAL: "Game logs before 2023 cover rushing, receiving and passing lines only for games GameTime can match to this player exactly, so some older games may be missing.",
  MLB_PLAYER_CAPTURED_ONLY: "Game logs include only the stat categories GameTimePicks captured for that game. This is not a complete MLB box-score history, and a game with no row is not a game missed.",
  EPL_PLAYER_2026_27_BLOCKED: "2026-27 match lines are not available yet. Recorded history covers {from} to {to}.",
  EPL_PLAYER_APPEARANCES_ONLY: "Matches where the player was named but did not come on are not counted as appearances. Match results are not shown.",
  UFC_FIGHTER_OUTCOME_ONLY: "Fight history currently includes opponent and outcome. Method and round are not yet available from GameTime's canonical data.",
  UFC_FIGHTER_RECENT_WINDOW: "Recorded bouts begin in August 2023, so earlier fights are not included.",
});

export const AVAILABLE_COPY = Object.freeze({
  RESULTS: "Final results",
  RUNS: "Runs scored and allowed",
  POINTS: "Points scored and allowed",
  SCHEDULE: "Schedule",
  FIXTURES: "Fixture history",
  GAME_LOGS: "Game logs",
  SEASON_TOTALS: "Season totals over recorded games",
  RECENT_WINDOWS: "Last 3 / 5 / 10 recorded games",
  FIGHT_HISTORY: "Fight history and outcomes",
  RESULTS_UNAVAILABLE: "Final results",
  TEAM_BOX_SCORES: "Team batting and pitching statistics",
  FULL_BOX_SCORES: "Complete box scores",
  CURRENT_SEASON_LOGS: "Current-season game logs",
  METHOD_ROUND: "Method and round",
  CURRENT_RESULTS: "Current-season final results",
  EARLIER_RESULTS: "Final results for earlier seasons",
});

/**
 * An EPL club's coverage once its current-season results are listed (Batch 1 · #8). The projection's stored coverage
 * says no results; the page that joins the graded record says which results it shows and which it still does not.
 * Unchanged when nothing was joined.
 * @template {{ available: string[], unavailable: string[], notes: string[] }} C
 * @param {C} coverage
 * @param {number} resultCount
 * @returns {C}
 */
export function eplTeamCoverageWithResults(coverage, resultCount) {
  if (!(resultCount > 0)) return coverage;
  return {
    ...coverage,
    available: ["CURRENT_RESULTS", ...coverage.available.filter((k) => k !== "CURRENT_RESULTS")],
    unavailable: [...coverage.unavailable.filter((k) => k !== "RESULTS_UNAVAILABLE"), "EARLIER_RESULTS"],
    notes: [...coverage.notes.filter((k) => k !== "EPL_TEAM_NO_RESULTS"), "EPL_TEAM_CURRENT_RESULTS"],
  };
}

/**
 * @param {{ kind: "team"|"player", sport: string, seasons: string[], firstSeasonLabel?: string|null, lastSeasonLabel?: string|null, hasPre2023?: boolean }} e
 */
export function coverageFor(e) {
  const from = e.firstSeasonLabel ?? null;
  const to = e.lastSeasonLabel ?? null;
  const base = { from, to };
  if (e.kind === "team") {
    if (e.sport === "MLB") return { ...base, status: COVERAGE_STATUS.PARTIAL, available: ["RESULTS", "RUNS", "SCHEDULE"], unavailable: ["TEAM_BOX_SCORES"], notes: ["MLB_TEAM_RUNS_ONLY", ...(e.seasons.includes("MLB-2026") ? ["MLB_TEAM_2026_FROM_JULY"] : [])] };
    if (e.sport === "NFL") return { ...base, status: COVERAGE_STATUS.FULL, available: ["RESULTS", "POINTS", "SCHEDULE"], unavailable: [], notes: e.seasons.includes("NFL-2026") ? ["NFL_TEAM_2026_WINDOW"] : [] };
    if (e.sport === "EPL") return { ...base, status: COVERAGE_STATUS.PARTIAL, available: ["FIXTURES", "SCHEDULE"], unavailable: ["RESULTS_UNAVAILABLE"], notes: ["EPL_TEAM_NO_RESULTS"] };
  } else {
    if (e.sport === "NFL") {
      // The current season is described from the rows themselves: recorded (partial) or not recorded yet.
      const has2026 = e.seasons.includes("NFL-2026");
      return {
        ...base, status: has2026 || e.hasPre2023 ? COVERAGE_STATUS.PARTIAL : COVERAGE_STATUS.FULL,
        available: ["GAME_LOGS", "SEASON_TOTALS", "RECENT_WINDOWS"], unavailable: has2026 ? [] : ["CURRENT_SEASON_LOGS"],
        notes: [has2026 ? "NFL_PLAYER_2026_PARTIAL" : "NFL_PLAYER_2026_BLOCKED", ...(e.hasPre2023 ? ["NFL_PLAYER_PRE_2023_PARTIAL"] : [])],
      };
    }
    if (e.sport === "MLB") return { ...base, status: COVERAGE_STATUS.LIMITED, available: ["GAME_LOGS", "RECENT_WINDOWS"], unavailable: ["FULL_BOX_SCORES"], notes: ["MLB_PLAYER_CAPTURED_ONLY"] };
    if (e.sport === "EPL") return { ...base, status: COVERAGE_STATUS.PARTIAL, available: ["GAME_LOGS", "SEASON_TOTALS", "RECENT_WINDOWS"], unavailable: ["CURRENT_SEASON_LOGS", "RESULTS_UNAVAILABLE"], notes: ["EPL_PLAYER_2026_27_BLOCKED", "EPL_PLAYER_APPEARANCES_ONLY"] };
    if (e.sport === "UFC") return { ...base, status: COVERAGE_STATUS.PARTIAL, available: ["FIGHT_HISTORY"], unavailable: ["METHOD_ROUND"], notes: ["UFC_FIGHTER_OUTCOME_ONLY", "UFC_FIGHTER_RECENT_WINDOW"] };
  }
  return { ...base, status: COVERAGE_STATUS.UNSUPPORTED, available: [], unavailable: [], notes: [] };
}

/**
 * A player's coverage from its own recorded seasons — the ONE call both the projection build and the player page make, so
 * a page never shows a stored note its own rows contradict. `seasons` is newest-first, as the projection stores it.
 * @param {string} sport
 * @param {ReadonlyArray<{ id: string, label?: string | null }>} seasons
 */
export function playerCoverage(sport, seasons) {
  const ids = seasons.map((s) => s.id);
  return coverageFor({
    kind: "player", sport, seasons: ids,
    firstSeasonLabel: seasons[seasons.length - 1]?.label ?? null, lastSeasonLabel: seasons[0]?.label ?? null,
    hasPre2023: sport === "NFL" && ids.some((s) => s < "NFL-2023"),
  });
}

/** Render one note code for a reader. Unknown codes throw: a missing caveat must never render as nothing. */
export function coverageNoteText(code, coverage) {
  const t = COVERAGE_COPY[code];
  if (!t) throw new Error(`research coverage: unknown note code ${code}`);
  return t.replace("{from}", coverage?.from ?? "earlier seasons").replace("{to}", coverage?.to ?? "the latest recorded season");
}
