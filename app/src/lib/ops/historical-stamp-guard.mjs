/**
 * Historical stamp guard (2026-10-15).
 *
 * The nightly settle re-runs (five on 2026-10-15) regenerate every dated settlement artefact and restamp it.
 * On 2026-10-15 each re-run rewrote ~386 files whose date had already passed — model-rows/<date>,
 * optimizer-graded/<date>, research row lineage — changing 16,823 `gradedAt` and 32 `settledAt` values and
 * nothing else. A settled record's grading time moving every night is a quiet edit of history, and every one
 * of those files is a deploy input.
 *
 * Rule: a STAGED MODIFICATION of a file whose path carries a date strictly before "today" (ET) is restored to
 * the committed copy when, after parsing, the two differ only in the stamp keys below (or not at all — a pure
 * re-serialisation). Everything else is left exactly as staged:
 *   - any non-stamp difference (a correction, a late result, a new row) publishes with its new stamps;
 *   - added or deleted files, undated files, today's and future dates, non-JSON files;
 *   - anything that fails to parse.
 * The guard can only ever keep a committed byte sequence; it never writes a value of its own.
 */

export const STAMP_KEYS = Object.freeze(["gradedAt", "generatedAt", "settledAt", "checkedAt", "builtAt", "lastRunAt", "updatedAt"]);
const STAMP = new Set(STAMP_KEYS);
const DATED = /(?:^|[/_-])(\d{4}-\d{2}-\d{2})(?=[./_-])/;

/** The date a path is "about", or null. The LAST date in the path wins (e.g. `.../2026-05-25.json`). */
export function pathDate(file) {
  const all = [...String(file).matchAll(new RegExp(DATED.source, "g"))];
  return all.length ? all[all.length - 1][1] : null;
}

/** America/New_York calendar date for an instant. */
export function etDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function stripStamps(v) {
  if (Array.isArray(v)) return v.map(stripStamps);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v)) if (!STAMP.has(k)) out[k] = stripStamps(v[k]);
    return out;
  }
  return v;
}

function parse(text, file) {
  if (file.endsWith(".jsonl")) return text.split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
  return JSON.parse(text);
}

const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

/**
 * Decide one file. Returns { restore: boolean, reason }.
 * @param {string} file       repo-relative path
 * @param {string} status     git name-status letter (only "M" can be restored)
 * @param {string|null} head  committed text
 * @param {string|null} staged staged text
 * @param {string} today      ET date, YYYY-MM-DD
 */
export function decide(file, status, head, staged, today) {
  if (status !== "M") return { restore: false, reason: "not a modification" };
  if (!/\.jsonl?$/.test(file)) return { restore: false, reason: "not JSON" };
  const d = pathDate(file);
  if (!d) return { restore: false, reason: "undated path" };
  if (!(d < today)) return { restore: false, reason: `dated ${d}, not before ${today}` };
  if (head == null || staged == null) return { restore: false, reason: "missing side" };
  let a, b;
  try { a = parse(head, file); b = parse(staged, file); } catch { return { restore: false, reason: "unparseable" }; }
  if (canon(a) === canon(b)) return { restore: true, reason: "re-serialised only" };
  if (canon(stripStamps(a)) === canon(stripStamps(b))) return { restore: true, reason: "stamps only" };
  return { restore: false, reason: "content changed" };
}
