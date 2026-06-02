/**
 * projection-availability — pure helpers that distinguish ACTIONABLE
 * projections from prop-lines / insufficient-data entries, and choose the
 * honest default date for the /projections page.
 *
 * Why (audit 2026-06-02, feedback #1): the page defaulted to a future
 * props-only board (June-3, 80 legs all `insufficient_data`) and labeled them
 * "80 projections". A prop line with `projection: null` / `confidence:
 * insufficient_data` / a `Pass` recommendation is NOT an actionable
 * projection — it is a posted line awaiting a model projection. These helpers
 * make the count + the default-date fallback honest.
 *
 * Pure + dependency-free (client-safe; `tsx --test` can exercise directly).
 * No fabrication: an entry is only "actionable" when a real projection value
 * and an Over/Under recommendation are present.
 */

/** Minimal lean shape these helpers need (works for the normalized
 *  `ProjectionsLean` and for raw board leans in tests). */
export interface ProjectionEntryLike {
  projection?: number | null;
  confidence?: string | null;
  side?: string | null;
  line?: number | null;
}

const NON_ACTIONABLE_CONFIDENCE = new Set([
  "",
  "insufficient_data",
  "trends_pending",
  "no_play",
  "pass",
]);
const NON_ACTIONABLE_SIDE = new Set(["", "pass", "no play", "no_play"]);

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().trim();

/**
 * True when an entry is an ACTIONABLE projection: it has a real numeric
 * projection AND a real Over/Under recommendation AND a non-insufficient
 * confidence. Everything else is a prop line or insufficient-data entry.
 */
export function isActionableProjection(entry: ProjectionEntryLike | null | undefined): boolean {
  if (!entry) return false;
  if (typeof entry.projection !== "number" || !Number.isFinite(entry.projection)) return false;
  if (NON_ACTIONABLE_CONFIDENCE.has(norm(entry.confidence))) return false;
  const side = norm(entry.side);
  if (NON_ACTIONABLE_SIDE.has(side)) return false;
  // A real recommendation is Over/Under; anything else is not actionable.
  return side === "over" || side === "under";
}

export type ProjectionEntryClass = "actionable" | "prop_line" | "insufficient";

/**
 * Classify a single entry:
 *   - "actionable"   — real projection + Over/Under recommendation
 *   - "prop_line"    — a posted line exists but no actionable projection yet
 *   - "insufficient" — no projection AND no usable line
 */
export function classifyProjectionEntry(entry: ProjectionEntryLike | null | undefined): ProjectionEntryClass {
  if (isActionableProjection(entry)) return "actionable";
  if (entry && typeof entry.line === "number" && Number.isFinite(entry.line)) return "prop_line";
  return "insufficient";
}

/** Count of actionable projections in a list of entries. */
export function getActionableProjectionCount(entries: ReadonlyArray<ProjectionEntryLike>): number {
  return entries.reduce((n, e) => n + (isActionableProjection(e) ? 1 : 0), 0);
}

/** Count of posted prop lines that are NOT actionable (lines awaiting a
 *  projection). Actionable entries are excluded — they're counted elsewhere. */
export function getPropLineCount(entries: ReadonlyArray<ProjectionEntryLike>): number {
  return entries.reduce((n, e) => n + (classifyProjectionEntry(e) === "prop_line" ? 1 : 0), 0);
}

/** Summary of one board/date's entries. */
export interface ProjectionSummary {
  actionable: number;
  propLines: number;
  insufficient: number;
  total: number;
}

export function summarizeProjectionEntries(
  entries: ReadonlyArray<ProjectionEntryLike>,
): ProjectionSummary {
  let actionable = 0, propLines = 0, insufficient = 0;
  for (const e of entries) {
    const c = classifyProjectionEntry(e);
    if (c === "actionable") actionable++;
    else if (c === "prop_line") propLines++;
    else insufficient++;
  }
  return { actionable, propLines, insufficient, total: entries.length };
}

// ---------------------------------------------------------------------------
// Default-date selection
// ---------------------------------------------------------------------------

/** Minimal date shape for default selection. */
export interface DateAvailabilityLike {
  date: string; // YYYY-MM-DD
  actionableCount: number;
  propLineCount?: number;
}

export type DefaultDateMode =
  | "today_actionable" // today has actionable projections
  | "latest_actionable" // newest past/today slate with actionable projections
  | "upcoming_actionable" // nearest future slate with actionable projections
  | "today_empty" // today present but no actionable anywhere — show empty today
  | "upcoming_lines" // only a future props-only board exists
  | "none";

export interface DefaultDateChoice {
  date: string | null;
  mode: DefaultDateMode;
}

/**
 * Choose the default /projections date honestly:
 *   1. today, if it has actionable projections          → today_actionable
 *   2. else the LATEST date ≤ today with actionable      → latest_actionable
 *   3. else the EARLIEST future date with actionable     → upcoming_actionable
 *   4. else a future date with prop lines (no actionable)→ upcoming_lines
 *   5. else today/last available                         → today_empty / none
 *
 * Crucially this prefers the latest ACTIONABLE slate (e.g. yesterday's real
 * MLB board) over a future props-only shell (tomorrow's posted lines), so the
 * page never presents posted-but-unprojected lines as "projections".
 */
export function selectDefaultProjectionDate(
  dates: ReadonlyArray<DateAvailabilityLike>,
  today: string,
): DefaultDateChoice {
  if (!dates.length) return { date: null, mode: "none" };
  const asc = [...dates].sort((a, b) => a.date.localeCompare(b.date));

  const todayEntry = asc.find((d) => d.date === today);
  if (todayEntry && todayEntry.actionableCount > 0) {
    return { date: today, mode: "today_actionable" };
  }
  // Latest past/today slate with actionable projections.
  const pastActionable = asc.filter((d) => d.date <= today && d.actionableCount > 0);
  if (pastActionable.length) {
    return { date: pastActionable[pastActionable.length - 1].date, mode: "latest_actionable" };
  }
  // Earliest future slate with actionable projections.
  const futureActionable = asc.find((d) => d.date > today && d.actionableCount > 0);
  if (futureActionable) {
    return { date: futureActionable.date, mode: "upcoming_actionable" };
  }
  // Only future props-only boards remain (lines posted, projections pending).
  const futureLines = asc.find((d) => d.date > today && (d.propLineCount ?? 0) > 0);
  if (futureLines) {
    return { date: futureLines.date, mode: "upcoming_lines" };
  }
  // Nothing actionable anywhere — prefer today if present, else last available.
  if (todayEntry) return { date: today, mode: "today_empty" };
  return { date: asc[asc.length - 1].date, mode: "today_empty" };
}
