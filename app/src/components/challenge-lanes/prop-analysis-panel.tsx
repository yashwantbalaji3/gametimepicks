/* PROVISIONAL PROP ANALYSIS (founder P0, 2026-11-04). A separate panel, never a challenge leg: for each prop the
   reliability gate did not pass, our MODEL PROJECTION beside the book's line, the difference, the book and the capture
   time. No probability, no confidence label, no pick language. Lines and books arrive only through the encrypted display
   path (server-side), so this renders into HTML and is never a client prop. Renders nothing without an analysis. */
export type PropAnalysisRow = {
  key: string; player: string; team: string | null; opponent: string | null; game?: string | null; market: string;
  projection: string | null; line: string | null; difference: string | null; lineStale?: boolean; book: string | null; captured: string | null; range?: string | null;
};
export type PropAnalysisView = {
  date: string; label?: string | null; gateReason: string | null; rows: PropAnalysisRow[];
  stale?: boolean; freshness?: string | null; others?: string | null;
};

const groups = (rows: PropAnalysisRow[]) => {
  const m = new Map<string, PropAnalysisRow[]>();
  for (const r of rows) { const g = r.game ?? r.team ?? "Other"; m.set(g, [...(m.get(g) ?? []), r]); }
  return [...m];
};

export const PROP_PANEL_LABEL = "Not a challenge leg — no prop passed the reliability gate";

export default function PropAnalysisPanel({ analysis }: { analysis: PropAnalysisView | null }) {
  if (!analysis || (!analysis.rows.length && !analysis.stale)) return null;
  return (
    <section id="prop-analysis" className="pa-section scroll-mt-24" aria-labelledby="prop-analysis-h" data-prop-analysis={analysis.date}>
      <div className="tb-section-head">
        <h2 id="prop-analysis-h" className="tb-section-title">Provisional prop analysis · {analysis.date}</h2>
      </div>
      <p className="pa-label" data-prop-analysis-label="">{PROP_PANEL_LABEL}{analysis.gateReason ? `. ${analysis.gateReason}` : "."}</p>
      {analysis.label ? <p className="pa-src" data-prop-analysis-source-label="">{analysis.label}</p> : null}
      {analysis.freshness ? <p className="pa-src" data-prop-analysis-freshness="">{analysis.freshness}{analysis.stale ? " These lines are stale, so no difference is shown — awaiting a fresher capture." : ""}</p> : null}
      {/* Grouped by game in tip-off order and folded, so a full slate stays short; never ranked by difference. */}
      {groups(analysis.rows).map(([game, rows]) => (
        <details key={game} className="pa-game" data-prop-game={game}>
          <summary className="pa-game-summary"><span><strong>{game}</strong> · {rows.length} {rows.length === 1 ? "prop" : "props"}</span></summary>
          <table className="pa-table">
            <thead><tr><th scope="col">Player · book</th><th scope="col">Market</th><th scope="col">MODEL PROJECTION</th><th scope="col">Line</th><th scope="col">Difference</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.player}{r.team ? <span className="pa-team"> {r.team}</span> : null}{r.book ? <span className="pa-book">{r.book}</span> : null}</th>
                  <td>{r.market}</td><td>{r.projection ?? "—"}</td><td>{r.line ?? "—"}</td><td>{r.difference ?? (r.lineStale ? <span className="pa-stale">line stale</span> : "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
      {analysis.others ? <p className="pa-src">{analysis.others}</p> : null}
    </section>
  );
}
