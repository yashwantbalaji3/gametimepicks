/* RESEARCH CANDIDATES (founder 2026-11-04): visually and verbally apart from the official lanes. It never says "pick",
   never shows a stake or payout, prints the engine's own label, and marks stale lines stale. Renders nothing without a
   research block. Server-rendered only (lines and odds come from the encrypted display). */
export type ResearchView = {
  date: string | null; label: string; heldLabel: string; rankingLabel: string | null;
  lanesHeld: Array<{ lane: string; reason: string | null }>;
  candidates: Array<{
    id: string; status: string; selection?: { mode: string | null; label: string } | null; rank: number | null; evidence: { class: string; label: string } | null; reasonCodes: string[]; stale: boolean;
    combined: { label: string; odds: string | null } | null;
    legs: Array<{ legId: string; game: string | null; stale: boolean; who: string | null; what: string; projection: string | null; projectionLabel: string | null; odds: string | null; book: string | null; captured: string | null; hitRates: string[]; evidenceLine?: string | null; lineup?: string | null; limits?: string[] }>;
  }>;
};

const STATUS_TEXT: Record<string, string> = { UNDER_REVIEW: "Under review", RESEARCH: "Research" };

export default function ResearchCandidates({ research }: { research: ResearchView | null }) {
  if (!research) return null;
  return (
    <section id="research-candidates" className="rc-section scroll-mt-24" aria-labelledby="research-h" data-research={research.date ?? ""}>
      <p className="rc-banner" data-research-banner="">{research.heldLabel}</p>
      <h2 id="research-h" className="tb-section-title" style={{ margin: 0 }}>{research.label}{research.date ? ` · ${research.date}` : ""}</h2>
      {research.lanesHeld.length ? (
        <ul className="rc-held">
          {research.lanesHeld.map((h) => <li key={h.lane} className="rc-reason"><strong>{h.lane}: held.</strong> {h.reason}</li>)}
        </ul>
      ) : null}
      {research.rankingLabel ? <p className="rc-reason">{research.rankingLabel}</p> : null}
      <ol className="rc-list">
        {research.candidates.map((c) => (
          <li key={c.id} className="rc-item" data-research-candidate={c.id} data-research-status={c.status}>
            <div className="rc-head">
              <span>{STATUS_TEXT[c.status] ?? c.status}{c.rank != null ? ` · #${c.rank}` : ""}</span>
              {c.selection ? <span className="cl-selection-mode">{c.selection.label}</span> : null}
              {c.evidence ? <span className={`cl-evidence cl-evidence--${c.evidence.class.toLowerCase()}`}>{c.evidence.label}</span> : null}
              {c.stale ? <span className="rc-stale">Line stale — not shown</span> : null}
            </div>
            <ol className="cl-legs cl-legs--compact">
              {c.legs.map((l) => (
                <li key={l.legId} className="cl-leg">
                  <div className="cl-leg-main">
                    <span className="cl-leg-name">{l.who}</span>
                    <span className="cl-prop-line">{l.what}</span>
                    <span className="cl-leg-meta">{[l.game, l.odds ? `${l.odds}${l.book ? ` ${l.book}` : ""}` : null, l.captured ? `captured ${l.captured}` : null].filter(Boolean).join(" · ")}</span>
                    {l.evidenceLine ? <span className="cl-hit-rates">{l.evidenceLine}</span> : l.hitRates.length ? <span className="cl-hit-rates"><span className="cl-label">Hit rate</span> {l.hitRates.join(" · ")}</span> : null}
                    {l.lineup ? <span className="cl-hit-rates">{l.lineup}</span> : null}
                    {l.limits?.length ? <span className="cl-limits"><span className="cl-label">Disclosed limits</span> {l.limits.join(" · ")}</span> : null}
                  </div>
                  {l.projectionLabel ? (
                    <div className="cl-leg-side">
                      <span className="cl-label cl-label--accent">{l.projectionLabel}</span>
                      <span className="cl-leg-pct">{l.projection ?? "—"}</span>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
            {c.combined?.odds ? <p className="rc-reason">Combined price ({c.combined.label}) {c.combined.odds}</p> : null}
            {c.reasonCodes.length ? <p className="rc-reason">Held back: {c.reasonCodes.join(", ")}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
