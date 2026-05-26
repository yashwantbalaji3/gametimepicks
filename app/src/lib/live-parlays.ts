/**
 * Live parlay tracking loader — no-op placeholder.
 *
 * The full design lives in `docs/LIVE_TRACKING_DESIGN.md`.
 *
 * Today this module:
 *   - Defines the schema types so future UI work can hold a stable
 *     contract.
 *   - Returns `null` from `getLiveParlayState()` because no live file
 *     is ever produced yet (the polling pipeline + cron workflow are
 *     deferred to a follow-up PR).
 *
 * UI callers (ticket card, results card) MUST handle null and render
 * exactly as if live tracking didn't exist. We never imply live state
 * we don't actually have.
 */
import fs from "node:fs";
import path from "node:path";

export type LiveLegStatus =
  | "not_started"
  | "live"
  | "won"
  | "lost"
  | "push"
  | "pending_final"
  | "dnp_or_unavailable";

export type LiveGameStatus = "scheduled" | "in_progress" | "final";

export interface LiveGame {
  sport: "nba" | "mlb";
  status: LiveGameStatus;
  period: string | null;
  clock: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

export interface LiveLeg {
  legId: string;
  playerName: string;
  market: string;
  side: "Over" | "Under";
  line: number;
  currentStat: number | null;
  needed: number | null;
  legStatus: LiveLegStatus;
  gameStatus: LiveGameStatus;
  lastUpdated: string;
}

export interface LiveSlip {
  slipId: string;
  profile: string;
  status: LiveLegStatus;
  legs: LiveLeg[];
}

export interface LiveParlayState {
  date: string;
  generatedAt: string;
  lastPollSource: "manual" | "cron";
  games: Record<string, LiveGame>;
  slips: LiveSlip[];
}

const LIVE_DIR = path.join(
  process.cwd(),
  "public",
  "data",
  "parlays",
  "live",
);

/**
 * Return the live parlay state for a YYYY-MM-DD date, or null when no
 * file is on disk. Pure file read — never fabricates a live state.
 *
 * Callers must treat null as "live tracking inactive" and render
 * exactly as if the feature didn't exist.
 */
export function getLiveParlayState(date: string): LiveParlayState | null {
  if (!date) return null;
  const p = path.join(LIVE_DIR, `${date}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as LiveParlayState;
  } catch {
    return null;
  }
}

/**
 * Convenience: is live tracking currently active for the given date?
 *
 * Returns true only when (a) the file exists, (b) `generatedAt` is
 * within the last 30 minutes. Anything older is treated as stale and
 * we fall back to the saved/graded state. Honest about lag.
 */
export function isLiveTrackingActive(state: LiveParlayState | null): boolean {
  if (!state || !state.generatedAt) return false;
  try {
    const ageMs = Date.now() - new Date(state.generatedAt).getTime();
    return ageMs >= 0 && ageMs < 30 * 60 * 1000;
  } catch {
    return false;
  }
}
