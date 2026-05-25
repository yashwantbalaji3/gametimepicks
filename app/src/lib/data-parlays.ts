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

import type {
  ParlayLeg,
  ParlayLegResult,
  ParlayRiskProfile,
  ParlaySlip,
  ParlaySlipStatus,
  ParlaySnapshot,
  ParlaySummary,
} from "./parlay-suggested";

const ROOT = path.join(process.cwd(), "public", "data", "parlays");
const SNAPSHOT_DIR = path.join(ROOT, "snapshots");
const GRADED_DIR = path.join(ROOT, "graded");
const SUMMARY_PATH = path.join(ROOT, "summary.json");

// Re-export types so existing server-side imports keep working.
export type {
  ParlayLeg,
  ParlayLegResult,
  ParlayRiskProfile,
  ParlaySlip,
  ParlaySlipStatus,
  ParlaySnapshot,
  ParlaySummary,
};

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

/**
 * Slips for a specific game on a specific date.
 *
 * Filters the snapshot (or graded payload, when settlement has run)
 * down to slips whose legs all reference the given gameId. Used by
 * the redesigned `/parlay-lab` flow to show saved slips for the
 * currently-selected game card.
 *
 * Honest behavior:
 *   - Returns `null` when no snapshot exists at all for the date.
 *   - Returns `{ slips: [] }` when a snapshot exists but no slips
 *     match the gameId (so the UI can render an empty-state).
 *   - Source tag mirrors `getCuratedTonightPicks` semantics — the
 *     caller can render different copy for "saved" vs "graded".
 */
export function getSlipsForGame(
  date: string,
  gameId: string,
): {
  date: string;
  gameId: string;
  source: "snapshot" | "graded";
  slips: ParlaySlip[];
} | null {
  const graded = getGradedForDate(date);
  const snapshot = graded ? null : getSnapshotForDate(date);
  const payload = graded ?? snapshot;
  if (!payload) return null;
  const source: "snapshot" | "graded" = graded ? "graded" : "snapshot";

  const matching = (payload.slips ?? []).filter((slip) => {
    if (!slip.legs || slip.legs.length === 0) return false;
    // Slip belongs to a game iff EVERY leg references that gameId.
    // Cross-game slips (multi-sport in the future) are excluded from
    // a game-detail view by design — they belong on a "Cross-game"
    // surface that we don't render today.
    return slip.legs.every((leg) => leg.gameId === gameId);
  });

  return { date, gameId, source, slips: matching };
}

// ---------------------------------------------------------------------------
// Suggested parlays — fs-backed loader (pure helpers live in
// `parlay-suggested.ts` so client components can use them).
// ---------------------------------------------------------------------------

export type { SuggestedSport } from "./parlay-suggested";

/**
 * The most recent date with a real parlay payload (graded > snapshot).
 *
 * Honest behavior: we never return a date we don't have a real file
 * for. When neither directory has any dates, returns null and the UI
 * should render an "no parlays yet" empty state.
 */
export function getLatestParlayDate(): {
  date: string;
  source: "graded" | "snapshot";
} | null {
  const graded = _listDates(GRADED_DIR);
  const snaps = _listDates(SNAPSHOT_DIR);
  // Prefer the latest snapshot for *upcoming* dates; only fall back to
  // graded when no upcoming snapshot exists. This is the right call
  // for the homepage carousel which wants to feature "tonight" not
  // "yesterday's results".
  const latestSnap = snaps.length > 0 ? snaps[snaps.length - 1] : null;
  if (latestSnap) {
    const graded2 = _readJsonSafe<ParlaySnapshot>(
      path.join(GRADED_DIR, `${latestSnap}.json`),
    );
    return { date: latestSnap, source: graded2 ? "graded" : "snapshot" };
  }
  const latestGraded = graded.length > 0 ? graded[graded.length - 1] : null;
  if (latestGraded) return { date: latestGraded, source: "graded" };
  return null;
}

/**
 * Best suggested parlays for the carousel + lab "current slate".
 *
 * Resolution order:
 *   1. Try the requested `date`. If that file has slips, use it.
 *   2. Otherwise walk backward through every snapshot/graded date
 *      until we find one with at least one slip — never further than
 *      14 days, never silent — so an empty snapshot for tonight
 *      doesn't leave the homepage blank.
 *
 * Returns `null` when no usable parlay file exists in history. The
 * caller should render an honest empty state in that case (no
 * fabrication).
 */
export function getSuggestedParlaysForDate(
  date: string | null,
  options: { maxLookbackDays?: number } = {},
): {
  date: string;
  source: "snapshot" | "graded";
  slips: ParlaySlip[];
  isFallback: boolean;
} | null {
  const lookback = options.maxLookbackDays ?? 14;
  const tried = new Set<string>();

  const orderedCandidates: string[] = [];
  if (date) orderedCandidates.push(date);
  // Walk newest-first through every known snapshot date (graded too).
  const snaps = _listDates(SNAPSHOT_DIR).slice().reverse();
  const graded = _listDates(GRADED_DIR).slice().reverse();
  for (const d of snaps) if (!orderedCandidates.includes(d)) orderedCandidates.push(d);
  for (const d of graded) if (!orderedCandidates.includes(d)) orderedCandidates.push(d);

  let walked = 0;
  for (const candidate of orderedCandidates) {
    if (tried.has(candidate)) continue;
    tried.add(candidate);
    walked += 1;
    if (walked > lookback + 1) break;
    const gradedPayload = getGradedForDate(candidate);
    const snapPayload = gradedPayload ? null : getSnapshotForDate(candidate);
    const payload = gradedPayload ?? snapPayload;
    if (!payload) continue;
    const slips = payload.slips ?? [];
    if (slips.length === 0) continue;
    return {
      date: candidate,
      source: gradedPayload ? "graded" : "snapshot",
      slips: slips.slice(),
      isFallback: candidate !== date,
    };
  }
  return null;
}

// Pure helpers (groupSuggestedBySport / getBestSuggestedByRisk /
// playersFromSlips / suggestedScore) are re-exported from
// `parlay-suggested.ts` so server pages can import them from one
// place too. Client code should import directly from
// `./parlay-suggested` to avoid pulling fs into the client bundle.
export {
  suggestedScore,
  groupSuggestedBySport,
  getBestSuggestedByRisk,
  playersFromSlips,
} from "./parlay-suggested";
