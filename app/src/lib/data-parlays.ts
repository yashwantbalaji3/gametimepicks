/**
 * Loaders for the parlay snapshot + graded artifacts written by
 * `pipeline.snapshot_parlays` and `pipeline.grade_parlays`.
 *
 * Every loader is safe against missing files / missing directories;
 * the UI must show an honest empty state rather than crashing. Until
 * the first real pregame snapshot lands, every helper returns null /
 * empty arrays — never invented data.
 *
 * File layout (mirrors the Python writers):
 *   app/public/data/parlays/snapshots/<YYYY-MM-DD>.json
 *   app/public/data/parlays/graded/<YYYY-MM-DD>.json
 *   app/public/data/parlays/summary.json
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "public", "data", "parlays");
const SNAPSHOT_DIR = path.join(ROOT, "snapshots");
const GRADED_DIR = path.join(ROOT, "graded");
const SUMMARY_PATH = path.join(ROOT, "summary.json");

export type ParlaySlipStatus = "pending" | "win" | "loss" | "push" | "void";
export type ParlayRiskProfile =
  | "conservative"
  | "balanced"
  | "aggressive";
export type ParlayLegResult = "win" | "loss" | "push" | "unresolved";

export interface ParlayLeg {
  sport: string;
  gameId: string | null;
  gameDate: string;
  playerId: number | null;
  playerName: string;
  team: string | null;
  opponent: string | null;
  market: string;
  side: string;
  line: number | null;
  projection: number | null;
  edgePct: number | null;
  confidence: string | null;
  bookmaker: string | null;
  oddsForSide: number | null;
  riskFlags?: string[];
  /** Filled in by the grader. Snapshot rows never carry this. */
  result?: ParlayLegResult;
  finalStat?: number | null;
  settlementSource?: string | null;
}

export interface ParlaySlip {
  slipId: string;
  riskProfile: ParlayRiskProfile;
  sport: string;
  status: ParlaySlipStatus;
  legs: ParlayLeg[];
  score: number;
  sameGame: boolean;
  hasAnomalyLeg: boolean;
  gradedAt?: string;
}

export interface ParlaySnapshot {
  date: string;
  generatedAt: string;
  sportsIncluded: string[];
  sourceBoardDates: string[];
  profilesGenerated: string[];
  slipsCount: number;
  slips: ParlaySlip[];
  /** Present once the grader has run on this date. */
  gradedAt?: string;
}

export interface ParlaySummary {
  generatedAt: string;
  byDate: Array<{
    date: string;
    wins: number;
    losses: number;
    pushes: number;
    pending: number;
  }>;
  lifetime: {
    wins: number;
    losses: number;
    pushes: number;
    pending: number;
    decisive: number;
    hitRate: number | null;
  };
  byProfile: Record<
    string,
    {
      wins: number;
      losses: number;
      pushes: number;
      pending: number;
      decisive: number;
      hitRate: number | null;
    }
  >;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _readJsonSafe<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

function _listDates(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Latest pregame snapshot date that has been GRADED. Null when no
 *  graded file exists yet — UI should render an honest empty state. */
export function getLatestGradedDate(): string | null {
  const dates = _listDates(GRADED_DIR);
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/** Latest pregame snapshot date — graded or not. Useful for the
 *  Parlay Lab "saved before lock" pill. Null when no snapshot exists. */
export function getLatestSnapshotDate(): string | null {
  const dates = _listDates(SNAPSHOT_DIR);
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

export function getAvailableSnapshotDates(): string[] {
  return _listDates(SNAPSHOT_DIR).slice().reverse();
}

export function getAvailableGradedDates(): string[] {
  return _listDates(GRADED_DIR).slice().reverse();
}

/** Snapshot for a date. Returns null if no snapshot file exists. */
export function getSnapshotForDate(date: string): ParlaySnapshot | null {
  return _readJsonSafe<ParlaySnapshot>(path.join(SNAPSHOT_DIR, `${date}.json`));
}

/** Graded payload for a date. Returns null if no graded file exists. */
export function getGradedForDate(date: string): ParlaySnapshot | null {
  return _readJsonSafe<ParlaySnapshot>(path.join(GRADED_DIR, `${date}.json`));
}

/** Lifetime summary. Returns null when no graded snapshot has ever
 *  been written. UI MUST treat null as "no history yet" and never
 *  fabricate a hit rate. */
export function getParlaySummary(): ParlaySummary | null {
  return _readJsonSafe<ParlaySummary>(SUMMARY_PATH);
}

/** Honest status string for the "Saved slip tracking" banner. */
export function getParlayStatusForDate(date: string): {
  state: "none" | "saved-pregame" | "graded";
  snapshot: ParlaySnapshot | null;
  graded: ParlaySnapshot | null;
} {
  const graded = getGradedForDate(date);
  if (graded) return { state: "graded", snapshot: null, graded };
  const snapshot = getSnapshotForDate(date);
  if (snapshot) return { state: "saved-pregame", snapshot, graded: null };
  return { state: "none", snapshot: null, graded: null };
}

/**
 * Curated picks for a date: top-1 slip per risk profile, sorted by
 * snapshot `score` (then leg count desc as a tiebreaker so a deeper
 * slip beats a shallow same-score one). Returns null when no snapshot
 * exists or no profile produced a candidate. Pure read — never invents
 * a slip, never returns more than one slip per profile.
 *
 * Why one-per-profile: the surface using this is a "Tonight's curated
 * tickets" rail on the homepage / Parlay Lab. Rendering every slip the
 * builder produced (often 5+ that overlap heavily on legs) clutters
 * the surface and dilutes the recommendation. Top-of-profile is what
 * a casual reader wants to see at a glance.
 */
export interface CuratedTonightPick {
  profile: ParlayRiskProfile;
  slip: ParlaySlip;
  /** Either "snapshot" (saved before games) or "graded" (post-settlement).
   *  Set to "snapshot" when only the pre-game file exists. */
  source: "snapshot" | "graded";
}

export function getCuratedTonightPicks(date: string): {
  date: string;
  source: "snapshot" | "graded";
  picks: CuratedTonightPick[];
} | null {
  const graded = getGradedForDate(date);
  const snapshot = graded ? null : getSnapshotForDate(date);
  const payload = graded ?? snapshot;
  if (!payload) return null;
  const source: "snapshot" | "graded" = graded ? "graded" : "snapshot";

  const byProfile = new Map<ParlayRiskProfile, ParlaySlip[]>();
  for (const slip of payload.slips ?? []) {
    const list = byProfile.get(slip.riskProfile) ?? [];
    list.push(slip);
    byProfile.set(slip.riskProfile, list);
  }

  const order: ParlayRiskProfile[] = [
    "conservative",
    "balanced",
    "aggressive",
  ];
  const picks: CuratedTonightPick[] = [];
  for (const profile of order) {
    const slips = byProfile.get(profile);
    if (!slips || slips.length === 0) continue;
    // Highest score wins; tie → more legs wins (deeper slip is more
    // interesting); tie → stable by slipId for determinism.
    const top = slips
      .slice()
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.legs.length !== a.legs.length) return b.legs.length - a.legs.length;
        return a.slipId.localeCompare(b.slipId);
      })[0];
    picks.push({ profile, slip: top, source });
  }

  if (picks.length === 0) return null;
  return { date, source, picks };
}
