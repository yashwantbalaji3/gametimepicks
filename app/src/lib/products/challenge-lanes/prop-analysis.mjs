/**
 * PROVISIONAL PROP ANALYSIS (founder P0, 2026-11-04) — presentation of nba-engine-eval's
 * `gtp-nba-prop-provisional-analysis@1` document, decrypted server-side by its own reader (encrypted display path;
 * prices never in plain public JSON). Pure. Shows only COMPARED rows: projection, line, difference, book, capture time
 * and the book range; never a side (OVER/UNDER), a probability or a confidence word. Every other state is counted in
 * one line. When the build runs after `lineStaleAfter` the lines are stale: differences are hidden, never guessed.
 */
export const PROP_ANALYSIS_SCHEMA = "gtp-nba-prop-provisional-analysis@1";
const FAMILY = Object.freeze({ pts: "Points", reb: "Rebounds", ast: "Assists" });
const STATE_TEXT = Object.freeze({ EXCLUDED: "excluded by the availability and minutes rules", NOT_PROJECTED: "not projected", NO_LINE: "without a captured line" });
/* One formatter for the module (a formatter per call is what blew the build's memory, #1262). */
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const et = (iso) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? `${ET.format(t)} ET` : null; };
const signed = (n) => (typeof n === "number" && Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n.toFixed(1)}` : null);
const num = (n) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(1) : null);

/** The panel view, or null for no document / another schema / nothing compared. `now` is the build instant (ms). */
export function propAnalysisView(doc, { now = Date.now() } = {}) {
  if (!doc || doc.schema !== PROP_ANALYSIS_SCHEMA) return null;
  const staleAt = Date.parse(String(doc.lineStaleAfter ?? ""));
  const stale = Number.isFinite(staleAt) && now > staleAt;
  const compared = (doc.rows ?? []).filter((r) => r.state === "COMPARED" && r.line);
  if (!compared.length) return null;
  const counts = Object.entries(STATE_TEXT).map(([state, text]) => [(doc.rows ?? []).filter((r) => r.state === state).length, text]).filter(([n]) => n);
  return {
    date: doc.date,
    label: doc.label ?? null,
    gateReason: null,
    stale,
    freshness: `Lines captured ${et(doc.capture?.capturedAt) ?? "—"}${Number.isFinite(staleAt) ? `; stale after ${et(doc.lineStaleAfter)}` : ""}.`,
    others: counts.length ? `Also ${counts.map(([n, t]) => `${n} ${t}`).join(", ")}; not listed.` : null,
    rows: compared.map((r) => ({
      key: `${r.eventId}:${r.playerId}:${r.family}`,
      player: r.name, team: r.team ?? null, opponent: null, game: r.game ?? null, market: FAMILY[r.family] ?? r.family,
      projection: num(r.projection), line: stale ? null : num(r.line.line), difference: stale ? null : signed(r.difference),
      book: r.line.book ?? null, captured: et(r.line.capturedAt),
      range: r.bookRange?.books > 1 ? `${r.bookRange.books} books, ${num(r.bookRange.min)}–${num(r.bookRange.max)}` : null,
    })),
  };
}
