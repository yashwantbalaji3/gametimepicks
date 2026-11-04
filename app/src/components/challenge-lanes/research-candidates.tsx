/* RESEARCH CANDIDATES (founder 2026-11-04): visually and verbally apart from the official lanes. It never says "pick",
   never shows a stake or payout, prints the engine's own label, and marks stale lines stale. Renders nothing without a
   research block. Server-rendered only (lines and odds come from the encrypted display). */
export type ResearchView = {
  date: string | null; label: string; heldNote: string | null;
  candidates: Array<{
    id: string; status: string; evidence: { class: string; label: string } | null; reason: string | null; stale: boolean; captured: string | null;
    legs: Array<{ legId: string; game: string | null; who: string | null; what: string; projection: string | null; projectionLabel: string; odds: string | null; book: string | null; hitRates: string[] }>;
  }>;
};

const STATUS_TEXT: Record<string, string> = { UNDER_REVIEW: "Under review", RESEARCH: "Research only" };

export default function ResearchCandidates({ research }: { research: ResearchView | null }) {
  if (!research) return null;
  return (
    <section id="research-candidates" className="rc-section scroll-mt-24" aria-labelledby="research-h" data-research={research.date ?? ""}>
      <p className="rc-banner" data-research-banner="">Not an official selection</p>
      <h2 id="research-h" className="tb-section-title" style={{ margin: 0 }}>{research.label}{research.date ? ` · ${research.date}` : ""}</h2>
      {research.heldNote ? <p className="rc-reason">{research.heldNote}</p> : null}
      <ol className="rc-list">
        {research.candidates.map((c) => (
          <li key={c.id} className="rc-item" data-research-candidate={c.id} data-research-status={c.status}>
            <div className="rc-head">
              <span>{STATUS_TEXT[c.status] ?? c.status}</span>
              {c.evidence ? <span className={`cl-evidence cl-evidence--${c.evidence.class.toLowerCase()}`}>{c.evidence.label}</span> : null}
              {c.stale ? <span className="rc-stale">Line stale — not shown</span> : c.captured ? <span>captured {c.captured}</span> : null}
            </div>
            <ol className="cl-legs cl-legs--compact">
              {c.legs.map((l) => (
                <li key={l.legId} className="cl-leg">
                  <div className="cl-leg-main">
                    <span className="cl-leg-name">{l.who}</span>
                    <span className="cl-prop-line">{l.what}</span>
                    <span className="cl-leg-meta">{[l.game, l.odds ? `${l.odds}${l.book ? ` ${l.book}` : ""}` : null].filter(Boolean).join(" · ")}</span>
                    {l.hitRates.length ? <span className="cl-hit-rates"><span className="cl-label">Hit rate</span> {l.hitRates.join(" · ")}</span> : null}
                  </div>
                  <div className="cl-leg-side">
                    <span className="cl-label cl-label--accent">{l.projectionLabel}</span>
                    <span className="cl-leg-pct">{l.projection ?? "—"}</span>
                  </div>
                </li>
              ))}
            </ol>
            {c.reason ? <p className="rc-reason">{c.reason}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
