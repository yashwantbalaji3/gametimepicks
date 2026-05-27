/**
 * Slate-label helper — formats the small per-card date chip on each
 * Parlay Lab suggested-slip card.
 *
 * Honest behavior:
 *   - "Today · May 27"           when the slip's date matches today (ET).
 *   - "Latest available · May 25"   when the slip is from an older snapshot
 *                                   (caller passes `isFallback: true`).
 *   - "Wed May 27"               when neither today nor fallback applies
 *                                 (e.g. a date inspected from a different
 *                                 historical page).
 *   - "Date unavailable"         when `date` is null/undefined/malformed.
 *
 * The "today" check is always against the ET slate timezone — `nowIsoEt`
 * is overridable so unit tests don't drift with real time.
 */
import { formatDateForHeader, isoDateInET } from "./date-status";

export interface SlateChip {
  /** Display text — caller renders as a single mono-font span. */
  label: string;
  /** Token-key for the chip tone so the card can colour it
   *  consistently with the existing `<DateStatusHeader>` chips. */
  tone: "today" | "latest-available" | "neutral" | "missing";
}

export function formatSlateChip(
  date: string | null | undefined,
  isFallback: boolean,
  options?: { nowIsoEt?: string },
): SlateChip {
  if (!date || typeof date !== "string") {
    return { label: "Date unavailable", tone: "missing" };
  }
  const todayIso = options?.nowIsoEt ?? isoDateInET();
  const formatted = formatDateForHeader(date, { nowIsoEt: todayIso });
  if (formatted.relative === null && formatted.short === date) {
    // formatDateForHeader returns short === iso when the date was
    // malformed — fall through to "Date unavailable".
    return { label: "Date unavailable", tone: "missing" };
  }
  const short = formatted.short;
  if (date === todayIso) {
    return { label: `Today · ${short}`, tone: "today" };
  }
  if (isFallback) {
    return { label: `Latest available · ${short}`, tone: "latest-available" };
  }
  // Weekday + month/day for older / explicit historical dates.
  const weekdayShort = formatted.pretty.split(" · ")[0]?.slice(0, 3) ?? "";
  const label = weekdayShort ? `${weekdayShort} ${short}` : short;
  return { label, tone: "neutral" };
}
