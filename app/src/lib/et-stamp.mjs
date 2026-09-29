/**
 * An absolute ET stamp that renders the SAME bytes on the server and in every browser (#761).
 *
 * Intl's format() output differs across ICU builds in its separators (Node 20 and newer Chrome put a
 * narrow no-break space before "PM"; others a plain space), which is a hydration mismatch on any
 * server-rendered client component. This assembles the text from formatToParts VALUES with plain ASCII
 * separators. It never reads a clock: an absolute time is true for every reader, forever.
 */
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

/** "Sep 28, 5:10 PM ET", or null for a missing or unreadable instant (never a guess). */
export function etStamp(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const p = Object.fromEntries(ET.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.month} ${p.day}, ${p.hour}:${p.minute} ${String(p.dayPeriod ?? "").toUpperCase()} ET`;
}
