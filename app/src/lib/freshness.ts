/**
 * Phase 14 — freshness & date-label utility.
 *
 * Pure, side-effect-free helpers for computing real-time-aware day labels
 * and freshness classifications. The whole site is statically exported
 * (`output: "export"`), which means HTML is generated at build time. To
 * keep "Today / Yesterday / Tomorrow" labels honest after the build ages,
 * these helpers take an explicit `today` parameter — server can pass the
 * build-time guess, client components can re-call with the real
 * `currentEtDate()` after hydration.
 *
 * The Python port lives in `pipeline/freshness.py` (used by tests and the
 * automation refresh logger). Both implementations MUST stay in sync.
 *
 * Hard rules enforced:
 *   - "Today" means the real ET calendar date, not whatever date the
 *     pipeline was last run on.
 *   - When the slate's primary date is older than today, the UI labels
 *     it "latest available slate", not "today's slate".
 *   - When the slate's primary date is in the future (rare — manual
 *     override case), it's labeled with the calendar date, not "Today".
 *   - Freshness classification is timezone-aware: a board generated 4
 *     hours ago is "recent" not "stale" even if it's after midnight UTC.
 */

// ---------------------------------------------------------------------------
// Current ET date — works on server (build) and client (browser)
// ---------------------------------------------------------------------------

/**
 * Returns today's date in ET as `YYYY-MM-DD`.
 *
 * NBA slates roll over at midnight ET, so we use ET as the canonical
 * day boundary regardless of the visitor's actual timezone or the
 * server's UTC clock.
 */
export function currentEtDate(now?: Date): string {
  const d = now ?? new Date();
  // Intl.DateTimeFormat with timeZone: "America/New_York" handles DST
  // transitions automatically — no manual offset math needed.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // en-CA produces "YYYY-MM-DD" natively
}

/**
 * Returns the ET date N days from `today`. Negative N goes backward.
 */
export function offsetEtDate(today: string, days: number): string {
  // Parse YYYY-MM-DD as a UTC midnight, add days, format back.
  // Doing this in UTC avoids DST surprises on the offset arithmetic.
  const [y, m, d] = today.split("-").map(Number);
  const baseUtc = Date.UTC(y, m - 1, d);
  const shifted = new Date(baseUtc + days * 86400000);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Day labels (Today / Yesterday / Tomorrow / "Wed May 7")
// ---------------------------------------------------------------------------

/**
 * Returns the human-friendly label for `date` relative to `today`.
 *
 *   today      → "Today"
 *   today-1    → "Yesterday"
 *   today+1    → "Tomorrow"
 *   anything else → "Wed May 7" style
 *
 * This explicitly does NOT use slate.primaryDate as the anchor — that's
 * the bug Phase 14 is fixing. Always pass the real current ET date.
 */
export function dayLabelFor(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === offsetEtDate(today, -1)) return "Yesterday";
  if (date === offsetEtDate(today, 1)) return "Tomorrow";

  // Long-form fallback. Format in ET to stay consistent with the day
  // boundary — a build-time UTC date might not match the user's ET wall.
  const [y, m, d] = date.split("-").map(Number);
  const localishUtc = Date.UTC(y, m - 1, d, 12); // noon UTC = same date in ET
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return fmt.format(new Date(localishUtc));
}

// ---------------------------------------------------------------------------
// Slate freshness — describes the relationship of a board to "today"
// ---------------------------------------------------------------------------

export type SlateFreshness =
  | "current" // primary slate date == today
  | "previous" // primary slate date < today (stale — "latest available")
  | "future" // primary slate date > today (rare — manual override case)
  | "no_data"; // no boards exist

/**
 * Classify a primary slate date against today.
 */
export function classifySlate(
  primaryDate: string | null | undefined,
  today: string,
): SlateFreshness {
  if (!primaryDate) return "no_data";
  if (primaryDate === today) return "current";
  if (primaryDate < today) return "previous";
  return "future";
}

/**
 * How many ET days old is the primary slate (vs today)? Negative numbers
 * mean future-dated slates.
 */
export function daysOldVs(primaryDate: string, today: string): number {
  const [py, pm, pd] = primaryDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const pUtc = Date.UTC(py, pm - 1, pd);
  const tUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((tUtc - pUtc) / 86400000);
}

// ---------------------------------------------------------------------------
// Pipeline-run freshness — describes how recently the data was generated
// ---------------------------------------------------------------------------

export type RunFreshness =
  | "fresh" // < 3 hours old
  | "recent" // 3–12 hours old
  | "stale" // 12–48 hours old
  | "very_stale" // > 48 hours old
  | "unknown"; // no timestamp

/**
 * Classify how recently the pipeline ran. Used for the footer and the
 * data-source badge.
 */
export function classifyRun(
  lastRunIso: string | null | undefined,
  now?: Date,
): RunFreshness {
  if (!lastRunIso) return "unknown";
  const last = Date.parse(lastRunIso);
  if (!Number.isFinite(last)) return "unknown";
  const ms = (now ?? new Date()).getTime() - last;
  if (ms < 0) return "fresh"; // clock skew → optimistic
  const hours = ms / 3_600_000;
  if (hours < 3) return "fresh";
  if (hours < 12) return "recent";
  if (hours < 48) return "stale";
  return "very_stale";
}

/**
 * Human label for a `RunFreshness` value. Public users see this — keep
 * it short and friendly, no implementation details.
 */
export function runFreshnessLabel(f: RunFreshness): string {
  switch (f) {
    case "fresh":
      return "fresh";
    case "recent":
      return "recently updated";
    case "stale":
      return "stale";
    case "very_stale":
      return "outdated";
    case "unknown":
      return "unknown";
  }
}

/**
 * Human label for a `SlateFreshness` value.
 */
export function slateFreshnessLabel(f: SlateFreshness): string {
  switch (f) {
    case "current":
      return "today's slate";
    case "previous":
      return "latest available slate";
    case "future":
      return "upcoming slate";
    case "no_data":
      return "no current slate";
  }
}

/**
 * Approximate "X hours ago" / "Y days ago" for the given ISO timestamp.
 * Public-friendly; returns "" on bad input.
 */
export function relativeTimeLabel(iso: string | null | undefined, now?: Date): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const ms = (now ?? new Date()).getTime() - ts;
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
