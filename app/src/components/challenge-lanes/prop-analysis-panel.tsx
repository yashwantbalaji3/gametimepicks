/* PROVISIONAL PROP ANALYSIS (founder P0, 2026-11-04). A separate panel, never a challenge leg: for each prop the
   reliability gate did not pass, our MODEL PROJECTION beside the book's line, the difference, the book and the capture
   time. No probability, no confidence label, no pick language. Lines and books arrive only through the encrypted display
   path (server-side), so this renders into HTML and is never a client prop. Renders nothing without an analysis. */
export type PropAnalysisRow = {
  key: string; player: string; team: string | null; opponent: string | null; market: string;
  projection: string; line: string | null; difference: string | null; book: string | null; captured: string | null;
};
export type PropAnalysisView = { date: string; gateReason: string | null; rows: PropAnalysisRow[] };

export const PROP_PANEL_LABEL = "Not a challenge leg — no prop passed the reliability gate";

export default function PropAnalysisPanel({ analysis }: { analysis: PropAnalysisView | null }) {
  if (!analysis || !analysis.rows.length) return null;
  return (
    <section id="prop-analysis" className="pa-section scroll-mt-24" aria-labelledby="prop-analysis-h" data-prop-analysis={analysis.date}>
      <div className="tb-section-head">
        <h2 id="prop-analysis-h" className="tb-section-title">Provisional prop analysis · {analysis.date}</h2>
      </div>
      <p className="pa-label" data-prop-analysis-label="">{PROP_PANEL_LABEL}{analysis.gateReason ? `. ${analysis.gateReason}` : "."}</p>
      <ol className="pa-rows">
        {analysis.rows.map((r) => (
          <li key={r.key} className="pa-row" data-prop-row={r.key}>
            <div className="pa-who">
              <span className="pa-player">{r.player}</span>
              <span className="pa-meta">{[r.team, r.opponent ? `vs ${r.opponent}` : null, r.market].filter(Boolean).join(" · ")}</span>
            </div>
            <dl className="pa-nums">
              <div><dt>MODEL PROJECTION</dt><dd>{r.projection}</dd></div>
              <div><dt>Line</dt><dd>{r.line ?? "—"}</dd></div>
              <div><dt>Difference</dt><dd>{r.difference ?? "—"}</dd></div>
            </dl>
            <p className="pa-src">{[r.book, r.captured ? `captured ${r.captured}` : null].filter(Boolean).join(" · ") || "No line captured"}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
