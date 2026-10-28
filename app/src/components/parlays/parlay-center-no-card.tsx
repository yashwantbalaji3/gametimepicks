import type { ReactNode } from "react";
import Link from "next/link";
import MoreDisclosure from "@/components/ui/more-disclosure";
import { etDayLabel } from "@/lib/et-stamp.mjs";

/**
 * ONE EMPTY STATE FOR THE PARLAY CENTER (overnight 2026-10-28, CONSOLIDATE).
 *
 * On a day when nothing qualifies, /build printed ~13 separate "no card" boxes — four risk tiers, four model
 * suggestions, four NBA game-winner tiers, a "no risk tier" panel and "No suggested cards for today" — while
 * real future cards in another sport (Premier League, Oct 31) sat behind a link at the bottom. This is the
 * one answer: no card today, when the last one was, what comes next and where to go — and every real card
 * that does exist in another lane is named here (tiers and a link; its prices stay on the linked card page), never hidden.
 *
 * The per-tier reasons are not removed: the page passes the same blocks (risk ladder, model suggestions,
 * empty-tier context, every-suggested-card list) as `children`, and they render, unchanged and server-side,
 * inside one collapsed disclosure. The page renders this ONLY when it has no card of its own to show.
 */
export type OtherLaneCards = {
  sport: string;
  label: string;
  href: string;
  date: string;
  cards: Array<{ tier: string; combinedAmerican: number }>;
};

export default function ParlayCenterNoCard({
  lastCardDate,
  otherLanes,
  reason,
  children,
}: {
  /** Why there is no card, from the page's own owners (the off-season reason, or the producer's ran-with-no-card state). */
  reason: string;
  /** The most recent published card in any risk tier (lastCardPerTier), or null when none was ever published. */
  lastCardDate: string | null;
  /** Lanes holding a current or future published ladder (loadCurrentSportLabLadder — today or later, never stale). */
  otherLanes: OtherLaneCards[];
  children: ReactNode;
}) {
  const next = otherLanes.length ? [...otherLanes].sort((a, b) => a.date.localeCompare(b.date))[0] : null;
  return (
    <section aria-labelledby="parlay-center-no-card-heading" data-parlay-center-no-card="" className="flex flex-col gap-3 rounded-[12px] px-4 py-4" style={{ border: "1px solid var(--vault-border-strong)", background: "var(--vault-panel)" }}>
      <h2 id="parlay-center-no-card-heading" className="m-0 font-semibold" style={{ color: "var(--vault-text)", fontSize: 16 }}>No card today</h2>
      <p className="m-0 text-[13px]" style={{ color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
        {lastCardDate ? <>Last card {etDayLabel(lastCardDate) ?? lastCardDate}, {lastCardDate.slice(0, 4)}</> : <>No card has been published in these tiers yet</>}
        {next ? <> · next expected: {next.label} cards for {etDayLabel(next.date) ?? next.date}</> : null}
        {" · "}see <Link href="/build/custom" style={{ color: "var(--vault-gold-bright)" }}>Build your own card</Link> or the ranked markets on{" "}
        <Link href="/markets" style={{ color: "var(--vault-gold-bright)" }}>Picks</Link>.
      </p>
      <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        {reason}
      </p>
      {otherLanes.length ? (
        <ul className="m-0 flex flex-col gap-1 p-0" role="list" aria-label="Published cards in other sports">
          {otherLanes.map((l) => (
            <li key={l.sport} className="flex flex-wrap items-center justify-between gap-x-3 text-[13px]">
              <span style={{ color: "var(--vault-text)" }}>
                {/* Tiers only, no prices: whether sportsbook prices may be displayed more widely is a pending founder decision
                   (provider display terms). The prices stay where they already were — on the linked card page. */}
                <strong>{l.label}</strong> · {etDayLabel(l.date) ?? l.date} · {l.cards.length} card{l.cards.length === 1 ? "" : "s"}
                <span style={{ color: "var(--vault-text-mute)" }}> ({l.cards.map((c) => c.tier).join(" · ")})</span>
              </span>
              <Link href={l.href} className="inline-flex items-center" style={{ color: "var(--gtp-bank-heat)", fontWeight: 600, minHeight: 44 }}>See the cards →</Link>
            </li>
          ))}
        </ul>
      ) : null}
      <MoreDisclosure title="Why each tier is empty today" summary="The reason for every risk tier and model suggestion, and the last card in each tier">
        {children}
      </MoreDisclosure>
    </section>
  );
}
