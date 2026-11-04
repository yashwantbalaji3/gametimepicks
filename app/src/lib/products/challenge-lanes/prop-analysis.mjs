/**
 * PROVISIONAL PROP ANALYSIS (founder P0, 2026-11-04) — presentation of nba-engine-eval's reader output
 * (lib/odds/nba-prop-analysis.mjs readPropAnalysis: the price-free public file joined to its encrypted prices,
 * server-side, compared with compareToLine at the build instant). Pure. Shows only COMPARED rows: MODEL PROJECTION,
 * line, difference, book, capture time and the book range; never a side (OVER/UNDER), a price, a probability or a
 * confidence word. Every other comparison state is counted in one line; when the 6 h line rule has made the lines
 * STALE they are counted, not shown. No prices available → no panel.
 */
const MARKET = Object.freeze({ pts: "Points", reb: "Rebounds", ast: "Assists", points: "Points", rebounds: "Rebounds", assists: "Assists" });
const STATE_TEXT = Object.freeze({ EXCLUDED: "excluded by the availability and minutes rules", NO_LINE: "without a captured line", STALE: "with lines older than the 6-hour limit", CAPTURED_AFTER_TIP: "with lines captured after tip-off" });
/* One formatter for the module (a formatter per call is what blew the build's memory, #1262). */
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const et = (iso) => { const t = Date.parse(String(iso ?? "")); return Number.isFinite(t) ? `${ET.format(t)} ET` : null; };
const signed = (n) => (typeof n === "number" && Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n.toFixed(1)}` : null);
const num = (n) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(1) : null);

/** The panel view of a readPropAnalysis result, or null (no analysis, no prices available, or nothing compared). */
export function propAnalysisView(a) {
  if (!a || !a.pricesAvailable || !Array.isArray(a.rows)) return null;
  const compared = a.rows.filter((r) => r.comparison === "COMPARED");
  const others = new Map();
  for (const r of a.rows) if (r.comparison && r.comparison !== "COMPARED") { const k = STATE_TEXT[r.comparison] ? r.comparison : "OTHER"; others.set(k, (others.get(k) ?? 0) + 1); }
  const stale = (others.get("STALE") ?? 0) > 0 && !compared.length;
  if (!compared.length && !stale) return null;
  const captured = [...a.rows].map((r) => r.capturedAt).filter(Boolean).sort().at(-1);
  const counts = [...others].map(([k, n]) => `${n} ${STATE_TEXT[k] ?? "not compared"}`);
  return {
    date: a.date, label: a.label ?? null, gateReason: a.gate?.reason ?? null, stale,
    freshness: captured ? `Lines captured ${et(captured)}; a line counts for 6 hours.` : null,
    others: counts.length ? `Also ${counts.join(", ")}; not listed.` : null,
    rows: compared.map((r) => ({
      key: `${r.eventId}:${r.playerId}:${r.market}`,
      player: r.player, team: r.team ?? null, opponent: r.opponent ?? null, market: MARKET[r.market] ?? r.market,
      projection: num(r.projection?.value), line: num(r.line), difference: signed(r.differenceExact ?? r.difference),
      book: r.book ?? null, captured: et(r.capturedAt),
      range: r.bookRange?.books > 1 ? `${r.bookRange.books} books, ${num(r.bookRange.min)}–${num(r.bookRange.max)}` : null,
    })),
  };
}
