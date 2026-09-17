/**
 * RESEARCH FORMATTING (v1.3) — absolute dates and factual phrases only. Pure: no clock.
 *
 * A static page is read long after it is built, so nothing here says "today", "3 days ago" or "live".
 * Reader-clock decisions (is this game still upcoming?) are made in the browser by `isUpcoming`, which takes
 * the reader's `now` explicitly.
 */

const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
const UTC_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * "Sep 14, 2025". An instant is shown on its US Eastern calendar date; a date-only official date is shown as is
 * (converting "2023-04-01" through a time zone would move it to Mar 31).
 */
export function formatGameDate(value) {
  if (!value) return "Date not recorded";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return UTC_DAY.format(new Date(`${value}T12:00:00Z`));
  const t = Date.parse(value);
  return Number.isFinite(t) ? ET_DAY.format(new Date(t)) : "Date not recorded";
}

/** "Sun, Sep 21, 8:20 PM ET" for a scheduled instant. */
export function formatKickoff(value) {
  const t = Date.parse(value ?? "");
  return Number.isFinite(t) ? `${ET_TIME.format(new Date(t))} ET` : "Time not announced";
}

/** Upcoming = a known start strictly after the READER's now. Unknown start is never upcoming. */
export function isUpcoming(startUtc, nowMs) {
  if (typeof startUtc !== "string" || !/T\d{2}:\d{2}/.test(startUtc)) return false;
  const t = Date.parse(startUtc);
  return Number.isFinite(t) && Number.isFinite(nowMs) && t > nowMs;
}

/** "10–5" style record, draws/ties only when present. */
export function formatRecord({ w, l, t }) {
  return t ? `${w}–${l}–${t}` : `${w}–${l}`;
}

/** Plain-English recent form: "Won 3 of its last 5 recorded finals." */
export function recentFormSentence(form, subject = "The team") {
  if (!form || !form.n) return null;
  const tie = form.t ? `, tied ${form.t}` : "";
  return `${subject} won ${form.w} of its last ${form.n} recorded final${form.n === 1 ? "" : "s"}${tie}.`;
}

/**
 * Descriptive windowed values: "Recorded 82, 91, 77 receiving yards in the last 3 available games."
 * Values are listed newest first, exactly as the projection holds them.
 */
export function windowSentence(window, column) {
  if (!window || !window.n) return null;
  const unit = column.label.toLowerCase();
  const count = window.n < window.size ? `the ${window.n} available game${window.n === 1 ? "" : "s"}` : `the last ${window.n} available games`;
  return `Recorded ${window.values.join(", ")} ${unit} in ${count}.`;
}

/** UFC outcome word — a no-winner bout is never called a loss. */
export function boutOutcomeLabel(code) {
  return code === "W" ? "Win" : code === "L" ? "Loss" : code === "N" ? "No winner (draw or no contest)" : "Outcome not recorded";
}

/** UFC record "14–4" plus "1 no winner" when present. */
export function formatFightRecord(r) {
  if (!r) return null;
  return r.n ? `${r.w}–${r.l} · ${r.n} no winner` : `${r.w}–${r.l}`;
}
