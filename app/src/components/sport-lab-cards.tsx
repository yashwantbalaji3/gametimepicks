/**
 * A YOUNG LANE'S PAPER CARDS — one component, and never one claim.
 *
 * /build renders MLB's ladder through RiskLadderBoard, which carries swap pools, a settled ledger,
 * a returns figure and bettor tiers. UFC and EPL have earned none of that, and an empty record slot
 * inside it would read as a measured zero rather than an absent one. This is the smaller surface
 * those lanes have actually earned: what published, and which bands could not be filled.
 *
 * THE SENTENCE IS NOT WRITTEN HERE. The three ladders choose their sides differently and the
 * difference is the whole point — UFC selects on its model because that model passed its
 * preregistered bar; EPL selects on price because its model has never been scored against a no-vig
 * line and would currently pick Hull City to beat Manchester United. A shared component that
 * composed its own caption would eventually render one sport's cards under another's claim, and on
 * the page the honest and dishonest versions look identical. So `selection` arrives from the
 * artifact, and a ladder that does not state one is never loaded at all.
 */
import type { SportLabLadder } from "@/lib/parlays/sport-lab-cards";
import { fmtAmerican, legLabel } from "@/lib/parlays/sport-lab-cards";
import SectionHeader from "@/components/section-header";

export default function SportLabCards({ ladder, eyebrow = "Paper cards" }: { ladder: SportLabLadder; eyebrow?: string }) {
  return (
    <section className="mt-8" id="cards">
      <SectionHeader
        eyebrow={eyebrow}
        title={`${ladder.eventName ?? "Today's ladder"} · ${ladder.cards.length} of 4 price bands`}
        sub={`Each leg takes ${ladder.selection}. Paper-only and educational — no stake is filled in, and nothing here has been settled yet.`}
      />
      <div className="mt-3" style={{ display: "grid", gap: 10 }}>
        {ladder.cards.map((c) => (
          <div key={c.slipId} style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--vault-text-mute)" }}>{c.tier}</span>
              <span className="font-mono" style={{ fontSize: 15, fontWeight: 800, color: "var(--gtp-bank-cta)" }}>{fmtAmerican(c.combinedAmerican)}</span>
            </div>
            <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
              {c.legs.map((l) => (
                <li key={l.eventId} style={{ fontSize: 13, color: "var(--vault-text)", display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span>{legLabel(l)}</span>
                  <span className="font-mono" style={{ color: "var(--vault-text-mute)" }}>{fmtAmerican(l.odds)}</span>
                </li>
              ))}
            </ul>
            {/* Null, never 0-0: a zeroed record reads as a measured result rather than an absent one. */}
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>No settled record yet — this lane has graded no card.</p>
          </div>
        ))}
      </div>
      {ladder.skipped.length > 0 ? (
        <p className="mt-2" style={{ fontSize: 11.5, color: "var(--vault-text-faint)", lineHeight: 1.6 }}>
          {/* Named rather than hidden: a band we could not reach is a different fact from one we
              chose not to offer, and widening the limits to fill it would be the dishonest fix. */}
          Not built today: {ladder.skipped.map((s) => s.tier).join(", ")} — no combination of today&rsquo;s prices
          lands in {ladder.skipped.length === 1 ? "that band" : "those bands"}, and the band limits are not widened to fill them.
        </p>
      ) : null}
    </section>
  );
}
