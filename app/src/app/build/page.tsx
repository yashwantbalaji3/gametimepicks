/**
 * /build — THE PARLAY CENTER, Suggested Parlays mode (P208 · Release A).
 *
 * One destination, two starting intents rendered as two real routes:
 *   /build         — Suggested Parlays (this page): browse model-composed cards by risk tier, each
 *                    with its own record, swap legs, or take a card into the builder as a draft.
 *   /build/custom  — Build Your Own: construct a card leg by leg from the qualified pool.
 *
 * Suggested is the DEFAULT mode: measured entry intent is inconclusive, so the novice-friendly
 * starting point wins (charter 4A) and Build Your Own is one visible action away. Both modes share
 * ONE engine — the slip draft, one leg-identity rule, one stake/payout math, one conflict engine —
 * so "Customize this card" here and hand-building there produce the same kind of draft.
 *
 * The legacy #suggested-cards anchor (used by /picks, /parlays, /parlay-lab, /mlb/parlays,
 * /nba/parlays redirects and many in-page links) still lands here, on the section of that name.
 * The legacy #advanced-builder anchor renders an in-place signpost to /build/custom.
 */
import PicksExperience from "@/components/picks-experience";
import Link from "next/link";
import { loadSuggestedCards } from "@/lib/picks/suggested-cards";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import { currentEtDate } from "@/lib/freshness";
import PicksSurfaceHeader from "@/components/picks-surface-header";
import ParlayCenterTabs from "@/components/parlays/parlay-center-tabs";
import RiskLadderBoard from "@/components/parlays/risk-ladder-board";
import { loadRiskLadder, loadLabLedger, loadTierGrid } from "@/lib/parlays/risk-ladder";
import { loadMlbPropsBoard } from "@/lib/mlb/mlb-props";
import path from "node:path";

export const metadata = {
  title: "Parlay Center · GameTime Picks",
  description:
    "Start with a model-suggested parlay card — filtered by sport and risk, each with its own settled record — or build your own from qualified legs. Educational, paper-only.",
};

export default function ParlayCenterSuggestedPage() {
  // Same slate framing the rest of the site uses, so every surface agrees on which day is current.
  const suggestedCards = loadSuggestedCards(currentSlateDate() ?? currentEtDate());
  const dataRoot = path.join(process.cwd(), "public", "data");
  const ladderDate = currentSlateDate() ?? currentEtDate();
  const riskLadder = loadRiskLadder(dataRoot, ladderDate);
  /* What the page can actually show today, independent of the builder's own pool. */
  const ladderCardCount = riskLadder?.cards?.length ?? 0;
  /* The precomputed 4x4 tier grid — server-resolved, so every reader with the same bankroll sees
     the same set and the mapping is auditable rather than re-derived per browser. */
  const tierGrid = loadTierGrid(dataRoot, "mlb");
  const labLedger = loadLabLedger(dataRoot);
  /* Substitution bench: the same eligible legs the boards render, so a swap can only reach a leg
     the site already publishes. */
  const swapPool = loadMlbPropsBoard(dataRoot, ladderDate).map((p) => ({
    player: p.player, photoUrl: p.photoUrl ?? null, teamAbbr: p.teamAbbr ?? null, opponentAbbr: p.opponentAbbr ?? null,
    market: p.marketLabel, marketLabel: p.marketLabel, side: p.selection, line: p.point,
    americanOdds: p.americanOdds, gameId: p.gameId, matchup: p.matchup,
  }));

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <PicksSurfaceHeader
        eyebrow="Parlay Center"
        title="Suggested Parlays"
        /* P185 scoping, restated for the split page: THIS page's status is decided by what THIS
           page can show — the ladder and the optimizer's cards. The builder's pool now has its own
           page (/build/custom) whose header speaks for it. */
        status={ladderCardCount > 0 || suggestedCards.length > 0 ? "pregame" : "data_pending"}
        counts={{ suggestedCards: ladderCardCount }}
        primaryAction={{ label: "Build your own card", href: "/build/custom" }}
        secondaryAction={{ label: "How it works", href: "/methodology" }}
        note="Model-built cards at every risk level, each carrying its own settled record. Start from one and customize it, swap any leg you do not like, or switch to Build Your Own. Paper-only — no stake is ever filled in for you."
      />

      <ParlayCenterTabs active="suggested" />

      {/* The guided entry, first. */}
      <RiskLadderBoard
        entryShowsTitle={false}
        cards={riskLadder?.cards ?? []}
        skipped={riskLadder?.skipped ?? []}
        overallRoi={riskLadder?.record.overall.roi ?? null}
        gradedDays={riskLadder?.record.gradedDays ?? 0}
        bettorTiers={riskLadder?.bettorTiers ?? []}
        ledger={labLedger}
        pool={swapPool}
        grid={tierGrid}
      />

      {/* ── EVERY LANE, ONE DESTINATION (P201 · D2) ─────────────────────────────────────────────
          The board above is MLB's ladder. The other lanes publish their own cards (or typed
          refusals) to their own pages, and the Lab's settled history is a separate record page —
          links only: each lane page owns its rendering, and this section can never blend the lanes. */}
      <section aria-label="Other suggested-card lanes and history" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] px-4 py-3" style={{ border: "1px solid var(--vault-border-strong)", fontSize: 12.5 }}>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>
          Other lanes
        </span>
        <Link href="/cards/epl" style={{ color: "var(--gtp-bank-cta)", fontWeight: 600 }}>Premier League cards</Link>
        <Link href="/cards/ufc" style={{ color: "var(--gtp-bank-cta)", fontWeight: 600 }}>UFC cards</Link>
        <Link href="/cards/nfl" style={{ color: "var(--gtp-bank-cta)", fontWeight: 600 }}>NFL cards</Link>
        <span style={{ color: "var(--vault-text-faint)" }}>·</span>
        <Link href="/results/parlay-lab" style={{ color: "var(--vault-text-mute)" }}>Every settled card (history)</Link>
      </section>

      {/* ── SUGGESTED CARDS (shared loader; the optimizer's full pool) ───────────────────────────
          Addressable at /build#suggested-cards — the anchor every legacy alias and in-page link
          targets — so those links land exactly here with no redirect chain. */}
      <section id="suggested-cards" aria-labelledby="suggested-cards-heading" className="flex flex-col gap-3 scroll-mt-6">
        <div>
          <h2
            id="suggested-cards-heading"
            className="font-semibold"
            style={{ color: "var(--vault-text)", fontSize: 17 }}
          >
            Every card the model built
          </h2>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6, maxWidth: "72ch" }}>
            Every model-built card behind the ladder above, by sport and risk tier. Enter any stake to see the
            projected paper return. Paper-only and educational — nothing here is placed, and a
            projected return is arithmetic on the odds, not an expectation of profit.
          </p>
        </div>
        {suggestedCards.length > 0 ? (
          <PicksExperience cards={suggestedCards} />
        ) : (
          <div className="rounded-[10px] px-4 py-8 text-center" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
            <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No suggested cards for today</p>
            <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
              The slate was assessed and nothing cleared the card gates. That is the model&rsquo;s answer for
              today, not a missing update — <Link href="/build/custom" style={{ color: "var(--vault-gold-bright)" }}>build your own card</Link>,
              or see the ranked markets on{" "}
              <Link href="/markets" style={{ color: "var(--vault-gold-bright)" }}>Picks</Link>.
            </p>
          </div>
        )}
      </section>

      {/* ── LEGACY ANCHOR SIGNPOST ───────────────────────────────────────────────────────────────
          /build#advanced-builder was the builder's address for months. The builder now lives in
          Build Your Own; a link that lands on this id gets a one-line pointer instead of silence. */}
      <section id="advanced-builder" aria-label="The builder moved" className="scroll-mt-6 rounded-[10px] px-4 py-3 flex flex-wrap items-center gap-2" style={{ border: "1px solid var(--vault-border)", background: "var(--vault-wash-faint)" }}>
        <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
          Looking for the leg-by-leg builder?
        </span>
        <Link href="/build/custom" className="vault-press inline-flex items-center rounded-full px-4 no-underline" style={{ minHeight: 40, border: "1px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)", fontSize: 12.5, fontWeight: 700 }}>
          Open Build Your Own →
        </Link>
      </section>
    </div>
  );
}
