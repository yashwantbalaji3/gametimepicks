/**
 * PR `feature/leg-game-time-threading` (2026-05-28) — leg game-time
 * formatter.
 *
 * Pure: turns the optional `gameDate` (YYYY-MM-DD) + `commenceTime`
 * (ISO UTC) + `gameTime` (already-formatted ET display string) into a
 * single display string the ticket card and drawer can render.
 *
 * Precedence:
 *   1. `commenceTime` (ISO UTC) — the canonical source. We format it
 *      to America/New_York with `Intl.DateTimeFormat`, then attach
 *      the date prefix (`"May 28 · 8:30 PM ET"`).
 *   2. `gameTime` (pre-formatted ET string from NBA `tipoff`). Used
 *      verbatim alongside the date prefix.
 *   3. Date-only fallback (`"May 28"`).
 *
 * Honesty:
 *   - Never fabricates a time. If both sources are missing/invalid we
 *     return the date-only string (or empty if no date either).
 *   - Doesn't sniff system time, never infers a time from a date.
 *   - Doesn't throw — bad inputs all funnel to the date-only fallback.
 *
 * Used by:
 *   - `ParlayTicketCard` leg rows
 *   - Recent-form drawer header
 */

const ET_DATE_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
};

const ET_TIME_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

/** Format a YYYY-MM-DD into the same `"May 28"` style we use across
 *  the app. Returns "" if the input doesn't look like a date. */
export function formatLegDateLabel(gameDate?: string | null): string {
  if (typeof gameDate !== "string") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gameDate);
  if (!m) return "";
  // Build a date at UTC noon so the ET formatter doesn't tip into the
  // previous day for late-night ET slates.
  const utcNoon = new Date(`${gameDate}T17:00:00Z`);
  if (Number.isNaN(utcNoon.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", ET_DATE_OPTS).format(utcNoon);
  } catch {
    return "";
  }
}

/** Format an ISO UTC string to `"8:30 PM ET"` in America/New_York.
 *  Returns "" on any failure. */
function _isoToEtTimeChip(iso: string): string {
  // Cheap shape guard before invoking Date — `Intl.DateTimeFormat`
  // throws on invalid Dates only via `format()`, which we wrap below.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    const t = new Intl.DateTimeFormat("en-US", ET_TIME_OPTS).format(d);
    // Intl emits "8:30 PM" — append " ET" for clarity. Strip any
    // leading zero hour ("08:30 PM" never happens with `hour: numeric`
    // but be defensive).
    const compact = t.replace(/^0/, "");
    return `${compact} ET`;
  } catch {
    return "";
  }
}

export interface LegGameTimeInput {
  /** `"YYYY-MM-DD"` from the snapshot date. */
  gameDate?: string | null;
  /** ISO UTC start (preferred when present). */
  commenceTime?: string | null;
  /** Pre-formatted ET string from the NBA board's `tipoff`. */
  gameTime?: string | null;
}

/** Top-level formatter: builds the display string for a leg row.
 *
 *  Returns `"May 28 · 8:30 PM ET"` when a usable time exists, falls
 *  back to `"May 28"` when only the date is usable, and `""` only when
 *  there's nothing usable at all. Never throws. */
export function formatLegGameTime(input: LegGameTimeInput): string {
  const dateLabel = formatLegDateLabel(input.gameDate ?? null);
  // 1. ISO UTC path (MLB).
  if (typeof input.commenceTime === "string" && input.commenceTime.trim()) {
    const chip = _isoToEtTimeChip(input.commenceTime.trim());
    if (chip) return dateLabel ? `${dateLabel} · ${chip}` : chip;
  }
  // 2. Pre-formatted ET path (NBA tipoff).
  if (typeof input.gameTime === "string" && input.gameTime.trim()) {
    const chip = input.gameTime.trim();
    return dateLabel ? `${dateLabel} · ${chip}` : chip;
  }
  // 3. Date-only fallback.
  return dateLabel;
}
