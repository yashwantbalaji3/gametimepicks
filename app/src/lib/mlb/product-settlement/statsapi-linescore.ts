/**
 * STATSAPI LINESCORE PARSER — pure extraction of official MLB final scores from a StatsAPI schedule
 * payload. NO network, NO fs, NO money — the fetcher (scripts/fetch-mlb-linescores.mjs) does the HTTP
 * and hands parsed payloads here (and to tests as fixtures).
 *
 * A game is FINAL only when StatsAPI's `status.abstractGameState === "Final"` (e.g. Final / Game Over /
 * Completed Early). Anything else (Preview / Live / Postponed / Suspended) is NOT final: runs are left
 * null and it must NOT be graded. Missing scores never become a loss downstream — they stay pending.
 */

export interface LinescoreResult {
  gamePk: number;
  officialDate: string | null;
  homeTeam: string; // abbreviation (e.g. "SF")
  awayTeam: string;
  homeRuns: number | null;
  awayRuns: number | null;
  /** True only when StatsAPI marks the game Final. */
  isFinal: boolean;
  /** Human status detail (e.g. "Final", "In Progress", "Postponed"). */
  status: string;
  /** "Final" | "Live" | "Preview" | "Other". */
  abstractState: string;
  source: "statsapi";
}

const FINAL_STATES = new Set(["Final"]);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Parse ONE StatsAPI schedule `game` object into a LinescoreResult. */
export function parseScheduleGame(game: any): LinescoreResult {
  const abstractState = game?.status?.abstractGameState ?? "Other";
  const isFinal = FINAL_STATES.has(abstractState) && (game?.status?.codedGameState ?? "F") !== "C"; // C = cancelled
  return {
    gamePk: game?.gamePk,
    officialDate: game?.officialDate ?? game?.gameDate?.slice?.(0, 10) ?? null,
    homeTeam: game?.teams?.home?.team?.abbreviation ?? game?.teams?.home?.team?.name ?? "",
    awayTeam: game?.teams?.away?.team?.abbreviation ?? game?.teams?.away?.team?.name ?? "",
    // Runs only when the game is genuinely final — never expose a mid-game score for settlement.
    homeRuns: isFinal ? num(game?.teams?.home?.score) : null,
    awayRuns: isFinal ? num(game?.teams?.away?.score) : null,
    isFinal,
    status: game?.status?.detailedState ?? abstractState,
    abstractState: abstractState === "Final" ? "Final" : abstractState === "Live" ? "Live" : abstractState === "Preview" ? "Preview" : "Other",
    source: "statsapi",
  };
}

/** Parse a full StatsAPI `schedule` payload (dates[].games[]) into LinescoreResults. */
export function parseSchedulePayload(payload: any): LinescoreResult[] {
  const out: LinescoreResult[] = [];
  for (const d of payload?.dates ?? []) {
    for (const g of d?.games ?? []) out.push(parseScheduleGame(g));
  }
  return out;
}

/** Is this game safely gradeable? (final + both scores present). */
export function isGradeable(r: LinescoreResult | null | undefined): boolean {
  return !!r && r.isFinal && typeof r.homeRuns === "number" && typeof r.awayRuns === "number";
}
