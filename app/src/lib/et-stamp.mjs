/**
 * An absolute ET stamp that renders the SAME bytes on the server and in every browser (#761).
 *
 * Intl's format() output differs across ICU builds in its separators (Node 20 and newer Chrome put a
 * narrow no-break space before "PM"; others a plain space), which is a hydration mismatch on any
 * server-rendered client component. This assembles the text from formatToParts VALUES with plain ASCII
 * separators. It never reads a clock: an absolute time is true for every reader, forever.
 */
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });

/**
 * "Thu, Oct 1" for an ET day ("2031-10-01") or an instant (its ET day), or null when unreadable — never a
 * guess. The ONE human day format for prose (P1-C, #816): raw ISO days read as unfinished in sentences.
 */
export function etDayLabel(dayOrIso) {
  if (typeof dayOrIso !== "string" || !dayOrIso) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(dayOrIso) ? `${dayOrIso}T12:00:00Z` : dayOrIso);
  if (!Number.isFinite(t)) return null;
  const p = Object.fromEntries(ET_DAY.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.weekday}, ${p.month} ${p.day}`;
}

/** "Sep 28, 5:10 PM ET", or null for a missing or unreadable instant (never a guess). */
export function etStamp(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const p = Object.fromEntries(ET.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.month} ${p.day}, ${p.hour}:${p.minute} ${String(p.dayPeriod ?? "").toUpperCase()} ET`;
}
