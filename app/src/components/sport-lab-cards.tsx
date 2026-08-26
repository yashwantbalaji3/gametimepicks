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
import { deriveBandSubstitutes } from "@/lib/parlays/sport-lab-cards";
import type { SportLabLadder } from "@/lib/parlays/sport-lab-cards";
import { fmtAmerican, legLabel } from "@/lib/parlays/sport-lab-cards";
import Link from "next/link";
import SectionHeader from "@/components/section-header";
import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";

export default function SportLabCards({
  ladder,
  eyebrow = "Paper cards",
  /*
   * Whether to name the event in the heading.
   *
   * On a standalone product page the event IS the context and belongs in the title. On a sport hub
   * the section directly above already reads "UFC Fight Night: Hernandez vs. Rodrigues", so
   * repeating it gave the page two consecutive h2s with the same words — a table of contents that
   * looks like a duplicate rather than two different things.
   */
  nameEvent = true,
}: { ladder: SportLabLadder; eyebrow?: string; nameEvent?: boolean }) {
  const substitutes = deriveBandSubstitutes(ladder);
  return (
    <section className="mt-8" id="cards">
      <SectionHeader
        eyebrow={eyebrow}
        title={`${nameEvent && ladder.eventName ? ladder.eventName : "Today's ladder"} · ${ladder.cards.length} of 4 price bands`}
        sub={`Each leg takes ${ladder.selection}. Paper-only and educational — no stake is filled in, and nothing here has been settled yet.`}
      />
      {/* THE LADDER'S OWN STAMP, not a build time and not another artifact's. A reader cannot judge
          a price without knowing when it was read, and these cards were once served four days stale
          under a heading that said today. */}
      <p className="mt-1" style={{ margin: "4px 0 0", fontSize: 11, color: "var(--vault-text-faint)" }}>
        Prices read {ladder.generatedAt} · card date {ladder.date}
      </p>
      {/*
        minmax(0, 1fr), NOT the default 1fr.
        A grid item's automatic minimum size is its CONTENT, so a card holding a long leg label —
        "Crystal Palace v Manchester City — total goals 3" — refuses to shrink below it and drags the
        whole document wider than the viewport. At 320px that is a WCAG 1.4.10 failure: two-
        dimensional scrolling. The ellipsis on the label could never take effect, because the box it
        was meant to be clipped inside was growing to fit it.
        It surfaced the day /epl carried three cards with real fixture names; the same markup was fine
        for months on one short card, which is why a reflow gate has to run on every route rather than
        on the ones that looked risky.
      */}
      <div className="mt-3" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
        {ladder.cards.map((c) => (
          <div key={c.slipId} style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--vault-text-mute)" }}>{c.tier}</span>
              <span className="font-mono" style={{ fontSize: 15, fontWeight: 800, color: "var(--gtp-bank-cta)" }}>{fmtAmerican(c.combinedAmerican)}</span>
            </div>
            {/* Same rule one level down: each leg is a grid item and needs the same permission to shrink. */}
            <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 5 }}>
              {c.legs.map((l) => (
                <li key={l.eventId} style={{ fontSize: 13, color: "var(--vault-text)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  {/*
                    A FACE OR A CREST ON EVERY LEG.
                    These read as bare text — "Gauge Young", "Brentford" — on a site whose other
                    surfaces all carry identity. Which one is drawn depends on what the leg IS: a
                    fight is a person, a football match result is a club, and a draw is neither, so
                    it gets no image rather than a borrowed one.
                  */}
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {/* PlayerAvatar takes no sport here: the explicit artifact URL wins over any
                        id-derived CDN path, and there is no MMA branch to fall back to — a missing
                        photo lands on the initials disc rather than requesting a 404. */}
                    {l.player ? (
                      <PlayerAvatar playerName={l.player} photoUrl={l.photoUrl ?? undefined} size="xs" flat />
                    ) : l.team ? (
                      <TeamLogo team={l.team} sport="soccer" size="sm" ariaLabel={l.team} />
                    ) : null}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{legLabel(l)}</span>
                  </span>
                  <span className="font-mono" style={{ color: "var(--vault-text-mute)", flexShrink: 0 }}>{fmtAmerican(l.odds)}</span>
                </li>
              ))}
            </ul>
            {/* Null, never 0-0: a zeroed record reads as a measured result rather than an absent one. */}
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>No settled record yet — this lane has graded no card.</p>
            {/* P210 · Release B: a lane card is a starting point, not just a display. Every leg is
                decomposed in the artifact, so the card seeds the shared draft — the same engine,
                stake math and conflict rules a hand-built card uses. A card with an unpriced leg
                says so instead of offering a dead control. */}
            {c.legs.length > 0 && c.legs.every((l) => l.odds != null && l.odds !== 0) ? (
              <Link
                href={`/build/custom?card=${encodeURIComponent(c.slipId)}`}
                className="vault-press"
                style={{ marginTop: 10, display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 16px", borderRadius: 999, border: "1px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)", background: "var(--vault-gold-dim)", fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}
              >
                Customize this card →
              </Link>
            ) : (
              <p className="font-mono" style={{ margin: "8px 0 0", fontSize: 10, color: "var(--vault-text-faint)", lineHeight: 1.5 }}>
                Browse-only — a leg on this card has no current price, so it can&rsquo;t seed the custom draft.
              </p>
            )}
          </div>
        ))}
      </div>
      {ladder.skipped.length > 0 ? (
        <div className="mt-2">
          <p style={{ fontSize: 11.5, color: "var(--vault-text-faint)", lineHeight: 1.6, margin: 0 }}>
            {/* Named rather than hidden: a band we could not reach is a different fact from one we
                chose not to offer, and widening the limits to fill it would be the dishonest fix. */}
            Not built today: {ladder.skipped.map((s) => s.tier).join(", ")} — no combination of today&rsquo;s prices
            lands in {ladder.skipped.length === 1 ? "that band" : "those bands"}, and the band limits are not widened to fill them.
          </p>
          {/*
            A LABELLED SUBSTITUTE, WHICH IS NOT THE SAME AS FILLING THE BAND.
            The card offered here is still stamped with its OWN band everywhere it appears; this only
            tells a reader who wanted an empty band what the closest thing on the board is, and in
            which risk direction it sits. Relabelling it would be the dishonest version.
          */}
          {substitutes.length > 0 ? (
            <ul className="mt-1" style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
              {substitutes.map((sub) => (
                <li key={sub.band} style={{ fontSize: 11.5, color: "var(--vault-text-faint)", lineHeight: 1.6 }}>
                  {sub.note}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
