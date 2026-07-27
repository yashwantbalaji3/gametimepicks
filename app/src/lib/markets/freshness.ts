/**
 * SPORTSBOOK FRESHNESS — ARTIFACT-LEVEL ONLY (Sprint 029 · Phase 1).
 *
 * The feed has no row-level update timestamps (measured: 0% on every live row, both artifacts).
 * Freshness is therefore a property of the FILE, and this module exists so that constraint is
 * expressed once instead of being re-derived — correctly or otherwise — on every surface.
 *
 * Two independent axes, deliberately not collapsed into one label:
 *
 *   1. ARTIFACT freshness — how current the captured snapshot is. Derived from the artifact's
 *      slate `date` and `generatedAt`.
 *   2. EVENT phase — whether the game has started. Derived from `commenceTime`.
 *
 * They answer different questions. A perfectly fresh artifact can contain a market whose game
 * started an hour ago; that market is not an actionable pregame line even though the snapshot is
 * current. Merging them would hide one behind the other.
 *
 * `commenceTime` must NEVER be used as a capture time. It is when the game begins, not when the
 * price was read — using it that way would manufacture a per-market timestamp the feed does not
 * have, which is precisely the claim this module exists to prevent.
 *
 * Every function takes `now` explicitly. No wall-clock is read inside, so results are reproducible
 * and testable at pinned instants.
 */

/** How current the captured artifact is. */
export type ArtifactFreshness =
  /** Captured for the current slate date. */
  | "CURRENT"
  /** Real data from an earlier slate — history, not a current market. */
  | "STALE"
  /** No artifact exists for the requested date. */
  | "MISSING"
  /** An artifact exists but carries no usable date/timestamp, so no freshness claim is possible. */
  | "UNAVAILABLE"
  /** Dated in the future. Fails closed — never silently treated as current. */
  | "ANOMALY";

/** Where the event sits relative to now. Independent of how fresh the snapshot is. */
export type EventPhase = "PREGAME" | "STARTED" | "UNKNOWN";

/**
 * Generation cadence, measured rather than assumed: the pipeline writes ONE artifact per slate
 * date (`mlb/team-markets/<date>.json`), regenerated in place by the daily production workflow.
 * So the meaningful unit of staleness is the slate date, not an elapsed-minutes budget — a
 * "30 minutes old" threshold would be arbitrary UI logic invented on top of a daily feed.
 */
export const CADENCE = "one artifact per slate date, regenerated in place";

export interface FreshnessReading {
  readonly state: ArtifactFreshness;
  /** The artifact's slate date, when it has one. */
  readonly artifactDate: string | null;
  /** When the artifact was generated, when it says. */
  readonly generatedAt: string | null;
  /** Whole days between the artifact's slate date and the reference date. Null when unknown. */
  readonly ageDays: number | null;
  /** True only when a surface may present this snapshot as the current market picture. */
  readonly isCurrent: boolean;
}

const UNAVAILABLE: FreshnessReading = {
  state: "UNAVAILABLE",
  artifactDate: null,
  generatedAt: null,
  ageDays: null,
  isCurrent: false,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/**
 * Evaluate an artifact's freshness against a reference slate date.
 *
 * `todayEt` is the current date in ET — the calendar the slate is keyed on. Passing a UTC date
 * near midnight would roll a day early and mark a live artifact stale.
 */
export function evaluateArtifactFreshness(
  input: { artifactDate?: string | null; generatedAt?: string | null } | null | undefined,
  todayEt: string,
): FreshnessReading {
  if (!input) return { ...UNAVAILABLE, state: "MISSING" };
  const artifactDate = input.artifactDate ?? null;
  const generatedAt = input.generatedAt ?? null;

  // Without a parseable date there is no honest freshness claim to make.
  if (!artifactDate || !ISO_DATE.test(artifactDate) || !ISO_DATE.test(todayEt)) {
    return { ...UNAVAILABLE, generatedAt };
  }

  const ageDays = dayDiff(artifactDate, todayEt);
  // Negative age = the artifact is dated after today. Something is wrong with the clock or the
  // pipeline; either way it must not be presented as the current market.
  if (ageDays < 0) {
    return { state: "ANOMALY", artifactDate, generatedAt, ageDays, isCurrent: false };
  }
  const state: ArtifactFreshness = ageDays === 0 ? "CURRENT" : "STALE";
  return { state, artifactDate, generatedAt, ageDays, isCurrent: state === "CURRENT" };
}

/**
 * Where an event sits relative to now, from its start time ONLY.
 *
 * Kept separate from artifact freshness on purpose — see the module header.
 */
export function evaluateEventPhase(
  eventStart: string | null | undefined,
  nowIso: string,
): EventPhase {
  if (!eventStart) return "UNKNOWN";
  const start = Date.parse(eventStart);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(start) || !Number.isFinite(now)) return "UNKNOWN";
  return now >= start ? "STARTED" : "PREGAME";
}

/**
 * Display string for a snapshot's capture time, in ET.
 *
 * Intentionally coarse — "captured <date> at <time> ET" describes the ARTIFACT. There is
 * deliberately no relative "N minutes ago" formatter in this module: relative phrasing reads as a
 * per-market update claim, and the feed cannot support one.
 */
export function formatSnapshotCapture(reading: FreshnessReading): string | null {
  if (!reading.generatedAt) return null;
  const t = Date.parse(reading.generatedAt);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const date = d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Sportsbook snapshot captured ${date} at ${time} ET`;
}

/** Short label for a freshness badge. Never claims currency for a non-current state. */
export function freshnessLabel(reading: FreshnessReading): string {
  switch (reading.state) {
    case "CURRENT":
      return "Current snapshot";
    case "STALE":
      return reading.ageDays === 1 ? "Snapshot from yesterday" : `Snapshot ${reading.ageDays} days old`;
    case "MISSING":
      return "No sportsbook snapshot";
    case "ANOMALY":
      return "Snapshot date unavailable";
    case "UNAVAILABLE":
    default:
      return "Snapshot time unavailable";
  }
}
