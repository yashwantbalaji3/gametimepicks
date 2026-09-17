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
  NFL_PLAYER_2026_BLOCKED: "Current-season (2026) factual game logs are not available yet. Recorded history through 2025 is shown below.",
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
});

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
    if (e.sport === "NFL") return { ...base, status: e.hasPre2023 ? COVERAGE_STATUS.PARTIAL : COVERAGE_STATUS.FULL, available: ["GAME_LOGS", "SEASON_TOTALS", "RECENT_WINDOWS"], unavailable: ["CURRENT_SEASON_LOGS"], notes: ["NFL_PLAYER_2026_BLOCKED", ...(e.hasPre2023 ? ["NFL_PLAYER_PRE_2023_PARTIAL"] : [])] };
    if (e.sport === "MLB") return { ...base, status: COVERAGE_STATUS.LIMITED, available: ["GAME_LOGS", "RECENT_WINDOWS"], unavailable: ["FULL_BOX_SCORES"], notes: ["MLB_PLAYER_CAPTURED_ONLY"] };
    if (e.sport === "EPL") return { ...base, status: COVERAGE_STATUS.PARTIAL, available: ["GAME_LOGS", "SEASON_TOTALS", "RECENT_WINDOWS"], unavailable: ["CURRENT_SEASON_LOGS", "RESULTS_UNAVAILABLE"], notes: ["EPL_PLAYER_2026_27_BLOCKED", "EPL_PLAYER_APPEARANCES_ONLY"] };
    if (e.sport === "UFC") return { ...base, status: COVERAGE_STATUS.PARTIAL, available: ["FIGHT_HISTORY"], unavailable: ["METHOD_ROUND"], notes: ["UFC_FIGHTER_OUTCOME_ONLY", "UFC_FIGHTER_RECENT_WINDOW"] };
  }
  return { ...base, status: COVERAGE_STATUS.UNSUPPORTED, available: [], unavailable: [], notes: [] };
}

/** Render one note code for a reader. Unknown codes throw: a missing caveat must never render as nothing. */
export function coverageNoteText(code, coverage) {
  const t = COVERAGE_COPY[code];
  if (!t) throw new Error(`research coverage: unknown note code ${code}`);
  return t.replace("{from}", coverage?.from ?? "earlier seasons").replace("{to}", coverage?.to ?? "the latest recorded season");
}
