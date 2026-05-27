/**
 * Date-status helper — small pure functions for the
 * `<DateStatusHeader>` component. Keeping the logic separated from
 * the JSX makes it trivially testable and reusable from anywhere
 * else that needs the same labels.
 *
 * All times are treated as ET / America/New_York for the user-facing
 * "today / tomorrow / yesterday" labels (that's the slate timezone).
 */

export type DateLabel =
  | "today"
  | "tomorrow"
  | "yesterday"
  | "latest-available"
  | "replay"
  | "official"
  | "pending-settlement"
  | "custom";

export interface FormattedDate {
  /** ISO YYYY-MM-DD passed in. */
  iso: string;
  /** Human-friendly long form, e.g. "Tuesday · May 27". */
  pretty: string;
  /** Short form for the badge, e.g. "May 27". */
  short: string;
  /** ET-relative label (today/tomorrow/yesterday/latest-available). */
  relative: DateLabel | null;
}

const _MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const _WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

/**
 * Return YYYY-MM-DD in America/New_York for a given JS Date instance.
 * `Date#toLocaleDateString` with `en-CA` happens to produce the ISO
 * shape, and `timeZone: 'America/New_York'` does the offset for us.
 */
export function isoDateInET(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * Parse a YYYY-MM-DD string into a UTC-noon Date so weekday math
 * doesn't slip across timezones. Returns null if the input is malformed.
 */
function _parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const yr = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  return new Date(Date.UTC(yr, mo, day, 12, 0, 0));
}

/**
 * Format an ISO date with the relative label. `now` is overridable
 * for testing; defaults to the current ET date.
 */
export function formatDateForHeader(
  iso: string,
  options?: { nowIsoEt?: string },
): FormattedDate {
  const d = _parseIsoDate(iso);
  if (!d) {
    return { iso, pretty: iso, short: iso, relative: null };
  }
  const weekday = _WEEKDAYS[d.getUTCDay()];
  const month = _MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const short = `${month} ${day}`;
  const pretty = `${weekday} · ${month} ${day}`;
  const todayIso = options?.nowIsoEt ?? isoDateInET();
  let relative: DateLabel | null = null;
  if (iso === todayIso) {
    relative = "today";
  } else if (iso < todayIso) {
    // We don't try to call it "yesterday" unless it's literally
    // yesterday — anything older is just "latest-available" when the
    // caller flags it that way.
    const todayDate = _parseIsoDate(todayIso);
    if (todayDate) {
      const diffDays = Math.round(
        (todayDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
      );
      relative = diffDays === 1 ? "yesterday" : null;
    }
  } else {
    const todayDate = _parseIsoDate(todayIso);
    if (todayDate) {
      const diffDays = Math.round(
        (d.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      relative = diffDays === 1 ? "tomorrow" : null;
    }
  }
  return { iso, pretty, short, relative };
}

/**
 * Human label for the relative position (e.g. "Today", "Latest
 * available · 1 day behind"). Caller passes the relative + an
 * optional fallback when there's no natural relative (e.g. for
 * "replay" or "official" callouts).
 */
export function relativeLabel(
  relative: DateLabel | null,
  todayIso: string,
  iso: string,
): string | null {
  if (!relative) {
    // Try to express the gap in days for the latest-available case.
    const t = _parseIsoDate(todayIso);
    const d = _parseIsoDate(iso);
    if (!t || !d) return null;
    const diffDays = Math.round((t.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) return `Latest available · ${diffDays} days behind`;
    if (diffDays < 0) return `${Math.abs(diffDays)} days ahead`;
    return null;
  }
  switch (relative) {
    case "today":
      return "Today";
    case "tomorrow":
      return "Tomorrow";
    case "yesterday":
      return "Yesterday";
    case "latest-available":
      return "Latest available";
    case "replay":
      return "Replay · not official";
    case "official":
      return "Official";
    case "pending-settlement":
      return "Pending settlement";
    case "custom":
      return "Custom · not officially tracked";
  }
}
