/**
 * PROVISIONAL PROP ANALYSIS (founder P0, 2026-11-04) — presentation of nba-engine-eval's reader output
 * (lib/odds/nba-prop-analysis.mjs readPropAnalysis: the price-free public file joined to its encrypted prices,
 * server-side, compared with compareToLine at the build instant). Pure. Shows only COMPARED rows: MODEL PROJECTION,
 * line, difference, book, capture time and the book range; never a side (OVER/UNDER), a price, a probability or a
 * confidence word. Every other comparison state is counted in one line; when the 6 h line rule has made the lines
 * STALE they are counted, not shown. No prices available → no panel.
 */
const MARKET = Object.freeze({ pts: "Points", reb: "Rebounds", ast: "Assists" });
/* One formatter for the module (a formatter per call is what blew the build's memory, #1262). */
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const et = (iso) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? `${ET.format(t)} ET` : null; };
const signed = (n) => (typeof n === "number" && Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n.toFixed(1)}` : null);
const num = (n) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(1) : null);
const count = (n, text) => (Number.isInteger(n) && n > 0 ? `${n} ${text}` : null);

/** The panel view of a decrypted site document, or null (no document, another schema, nothing compared). */
export function propAnalysisView(doc, { now = Date.now() } = {}) {
  if (!doc || doc.schema !== "gtp.prop-analysis.site@1" || !Array.isArray(doc.rows)) return null;
  const compared = doc.rows.filter((r) => r.state === "COMPARED" && r.line);
  if (!compared.length) return null;
  const staleAt = Date.parse(String(doc.lineStaleAfter ?? ""));
  const stale = Number.isFinite(staleAt) && now > staleAt;
  const sm = doc.summary ?? {};
  const excluded = sm.excluded ?? doc.rows.filter((r) => r.state === "EXCLUDED").length;
  const notProjected = Number.isInteger(sm.notProjected) ? sm.notProjected : Array.isArray(doc.notProjected) ? doc.notProjected.length : null;
  const counts = [count(excluded, "excluded by the availability and minutes rules"), count(notProjected, "players not projected"), count(sm.linesOutOfScopeFamily, "lines in markets outside points, rebounds and assists")].filter(Boolean);
  return {
    date: doc.date, label: doc.label ?? null, gateReason: doc.gate?.reason ?? null, stale,
    freshness: `Lines captured ${et(doc.capture?.capturedAt) ?? "—"}${Number.isFinite(staleAt) ? `; stale after ${et(doc.lineStaleAfter)}` : ""}.`,
    others: counts.length ? `Also ${counts.join(", ")}; not listed.` : null,
    rows: compared.map((r) => ({
      key: `${r.eventId}:${r.playerId}:${r.family}`,
      player: r.name, team: r.team ?? null, opponent: null, game: r.game ?? null, market: MARKET[r.family] ?? r.family,
      projection: num(r.projection), line: stale ? null : num(r.line.line), difference: stale ? null : signed(r.difference),
      book: r.line.book ?? null, captured: et(r.line.capturedAt),
      range: r.bookRange?.books > 1 ? `${r.bookRange.books} books, ${num(r.bookRange.min)}–${num(r.bookRange.max)}` : null,
    })),
  };
}
