/**
 * TALE OF THE TAPE FOR THE BOUT PAGE (UFC-001 UX Phase B, 2026-10-10).
 *
 * Reads `data/internal/research/ufc/raw/stats/ufc_fighter_tott.json` at BUILD time, server side — the same way the
 * bout page already reads the card artifact. No new public file and no runtime fetch: the static export carries only
 * the rendered values.
 *
 * What the file is, and what it is not:
 *  - ESPN core MMA athlete endpoint, keyed by ESPN athlete id (the id the card artifact carries for each fighter);
 *  - self-reported and static (one pull; `generatedAt` is its "as of"). Listed heights are generous and reach is
 *    measured inconsistently. The page states that beside the numbers;
 *  - ESPN writes an unknown height or reach as 0 and an unknown stance as "--". Those are MISSING, never a value:
 *    a 0-inch reach printed as "0 in" would be a false fact. Each missing field carries its reason.
 *
 * Age is computed for the EVENT date (completed years), not today, so the page does not age as it sits in the export.
 * Everything here is pure except `loadTaleOfTheTape`, which is the only filesystem read.
 */
import fs from "node:fs";
import path from "node:path";

/** Repo-relative path of the tale-of-the-tape file. */
export const TOTT_REL_PATH = "data/internal/research/ufc/raw/stats/ufc_fighter_tott.json";
export const TOTT_SOURCE_LABEL = "ESPN athlete profile (self-reported)";

/** Why a field shows "—". One sentence each, written for a reader. */
export const MISSING = Object.freeze({
  FILE: "Tale-of-the-tape file not available to this build",
  NOT_LISTED: "This fighter is not in the ESPN tale-of-the-tape pull",
  CONFLICT: "The ESPN pull has two different entries for this fighter",
  HEIGHT: "ESPN lists no height",
  REACH: "ESPN lists no reach",
  STANCE: "ESPN lists no stance",
  DOB: "ESPN lists no date of birth",
  DOB_UNUSABLE: "ESPN's date of birth is not a usable date",
  EVENT_DATE: "No event date to compute an age against",
});

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Completed years between a date of birth and the event date (both "YYYY-MM-DD"). Null when either is missing or
 * malformed, or when the result is not a plausible fighter age (a typo'd DOB must not render as a fact).
 */
export function ageAtEvent(dateOfBirth, eventDate) {
  const b = ISO_DAY.exec(String(dateOfBirth ?? ""));
  const e = ISO_DAY.exec(String(eventDate ?? ""));
  if (!b || !e) return null;
  const [by, bm, bd] = b.slice(1).map(Number);
  const [ey, em, ed] = e.slice(1).map(Number);
  let age = ey - by;
  if (em < bm || (em === bm && ed < bd)) age -= 1;
  return age >= 14 && age <= 70 ? age : null;
}

/** The event's calendar date in US Eastern time — the site's day convention (the card's `slateDate`). */
export function easternDate(iso) {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(t));
  const get = (k) => parts.find((p) => p.type === k)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 74 → `6′2″ (74 in)`. Half inches keep their half. */
export function formatHeight(inches) {
  const ft = Math.floor(inches / 12);
  const rest = Math.round((inches - ft * 12) * 2) / 2;
  return `${ft}′${rest}″ (${inches} in)`;
}
export const formatReach = (inches) => `${inches} in`;

const positive = (x) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null);
const stanceOf = (s) => {
  const t = String(s ?? "").trim();
  return t && !/^-+$/.test(t) ? t : null;
};
const sameEntry = (a, b) =>
  a.heightIn === b.heightIn && a.reachIn === b.reachIn && a.stance === b.stance && a.dateOfBirth === b.dateOfBirth;

/**
 * Index the file by athlete id. Two identical rows for one id collapse to one; two DIFFERENT rows for one id are a
 * conflict, and a conflict renders as missing — picking one would be choosing a fact.
 */
export function indexTaleOfTheTape(doc) {
  if (!doc || !Array.isArray(doc.fighters)) return null;
  const byId = new Map();
  const conflicts = new Set();
  for (const f of doc.fighters) {
    const id = String(f?.athleteId ?? "").trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (prev && !sameEntry(prev, f)) conflicts.add(id);
    else if (!prev) byId.set(id, f);
  }
  const asOf = typeof doc.generatedAt === "string" && doc.generatedAt.length >= 10 ? doc.generatedAt.slice(0, 10) : null;
  return { byId, conflicts, asOf, caveat: typeof doc.caveat === "string" ? doc.caveat : null };
}

/**
 * One fighter's tape for one event. Every field is `{ value, display, reason }`: either a value with its display
 * string, or null with the reason it is missing.
 *
 * @param {ReturnType<typeof indexTaleOfTheTape>} index
 * @param {string} athleteId ESPN athlete id from the card artifact
 * @param {string | null} eventDate "YYYY-MM-DD" (use `easternDate(bout.startUtc)`)
 */
export function tapeFor(index, athleteId, eventDate) {
  const all = (reason) => {
    const m = { value: null, display: null, reason };
    return { found: false, height: m, reach: m, stance: m, age: m };
  };
  if (!index) return all(MISSING.FILE);
  const id = String(athleteId ?? "");
  if (index.conflicts.has(id)) return all(MISSING.CONFLICT);
  const e = index.byId.get(id);
  if (!e) return all(MISSING.NOT_LISTED);

  const h = positive(e.heightIn);
  const r = positive(e.reachIn);
  const s = stanceOf(e.stance);
  const age = ageAtEvent(e.dateOfBirth, eventDate);
  const ageReason = !e.dateOfBirth ? MISSING.DOB : !eventDate ? MISSING.EVENT_DATE : MISSING.DOB_UNUSABLE;
  return {
    found: true,
    height: h != null ? { value: h, display: formatHeight(h), reason: null } : { value: null, display: null, reason: MISSING.HEIGHT },
    reach: r != null ? { value: r, display: formatReach(r), reason: null } : { value: null, display: null, reason: MISSING.REACH },
    stance: s != null ? { value: s, display: s, reason: null } : { value: null, display: null, reason: MISSING.STANCE },
    age: age != null ? { value: age, display: String(age), reason: null } : { value: null, display: null, reason: ageReason },
  };
}

/**
 * The single filesystem read. `repoRoot` is the repository root (the page passes `path.join(process.cwd(), "..")`,
 * as it already does for the report-card context). A missing or unreadable file returns null, and every field then
 * renders "—" with MISSING.FILE rather than failing the build.
 */
export function loadTaleOfTheTape(repoRoot) {
  try {
    return indexTaleOfTheTape(JSON.parse(fs.readFileSync(path.join(repoRoot, TOTT_REL_PATH), "utf8")));
  } catch {
    return null;
  }
}
