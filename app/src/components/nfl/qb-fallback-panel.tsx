/**
 * NFL game page · EXPERIMENTAL starting-QB projections (founder P0 2026-11-11 ~17:40Z). Rendered ONLY in a build with
 * GTP_NFL_QB_FALLBACK_PUBLIC=1 (next.config.mjs; the page imports this module behind the compile-time flag). One block
 * per team whose identified starter is not established at his club: the exact experimental label, his median passing
 * yards and 80% range, the method's one permitted accuracy note, and the evidence basis. Never "validated".
 */
import React from "react";

type Entry = { team: string; opponent: string | null; starter: { name: string | null }; starterSource: string | null; tier: string; label: string; note: string | null; careerAttempts: number; projection: { median: number; p10: number; p90: number }; basis: string | null };
export type QbFallbackDoc = { starters: Entry[] } | null;

const mute = { color: "var(--vault-text-mute)" } as const;

export default function QbFallbackPanel({ doc }: { doc: QbFallbackDoc }) {
  if (!doc?.starters?.length) return null;
  return (
    <section aria-labelledby="nf-qbfb-h" data-nfl-qb-fallback="" style={{ marginTop: 18, border: "1px dashed var(--vault-border, #8884)", borderRadius: 10, padding: "12px 14px" }}>
      <h3 id="nf-qbfb-h" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--vault-text)" }}>Starting quarterback · experimental projection</h3>
      {doc.starters.map((e) => (
        <div key={e.team} data-nfl-qb-fallback-team={e.team} style={{ marginTop: 10 }}>
          <p className="font-mono" style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, ...mute }}>{e.label}</p>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--vault-text)" }}>
            <b>{e.starter.name}</b> <span style={mute}>{e.team} · starts ({e.starterSource ?? "depth chart"})</span>
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--vault-text)" }}>
            Passing yards: <b>{Math.round(e.projection.median)}</b> <span style={mute}>· 80% of outcomes {Math.round(e.projection.p10)}–{Math.round(e.projection.p90)}</span>
          </p>
          {e.note ? <p style={{ margin: "4px 0 0", fontSize: 12, ...mute }} title={e.note}>{e.note}</p> : null}
          {e.basis ? <p style={{ margin: "2px 0 0", fontSize: 12, ...mute }}>{e.basis}</p> : null}
        </div>
      ))}
      <p style={{ margin: "10px 0 0", fontSize: 12, ...mute }}>Experimental research, not part of the official player board and not graded with it. Not a sportsbook number and not a pick.</p>
    </section>
  );
}
