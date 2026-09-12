/**
 * /build/custom — THE PARLAY CENTER, Build Your Own mode (P208 · Release A).
 *
 * The custom card builder: the qualified leg pool with sport/game/market/risk filters and search,
 * a persistent draft summary, and the advanced eligible-leg marketplace below. The draft is the
 * shared slip store — the same state a suggested card seeds via "Customize this card"
 * (?card=<slipId>), the same legs the props board and risk ladder add, one identity rule, one
 * payout math, one conflict engine. See /build for the Suggested Parlays mode.
 *
 * ?card=<slipId> seeds the draft from that suggested ladder card, resolved server-side from the
 * published artifact — so the link is shareable and the seed is exactly the card of record.
 * ?sport= / ?game= / ?q= prefilter the pool ("Build from this game" deep links).
 */
import { buildEngineLegAtoms } from "@/lib/build-legs";
import type { BuildLegAtoms } from "@/lib/build/leg-atoms";
import { loadTodaySlate, currentSlateDate } from "@/lib/parlays/ui-loader";
import BuildExperience, { type SeedableCard } from "@/components/build-experience";
import LazyParlaysExplorer from "@/components/parlays/lazy-parlays-explorer";
import { currentEtDate } from "@/lib/freshness";
import PicksSurfaceHeader from "@/components/picks-surface-header";
import ParlayCenterTabs from "@/components/parlays/parlay-center-tabs";
import { buildSeedableCards } from "@/lib/parlays/seedable-cards";
import { loadRiskLadderRecord, loadGradedLegRecord } from "@/lib/parlays/risk-ladder";
import path from "node:path";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/build/custom/", {
  title: "Build Your Own · Parlay Center · GameTime Picks",
  description:
    "Build a custom paper card from qualified legs across sports. Filter, search, add legs, enter any stake, see the projected paper return — or start from a suggested card and edit it. Educational, paper-only.",
});

export default function ParlayCenterCustomPage() {
  // Canonical methodology engine — the SAME gated, not-started, leakage-safe eligible-leg pool that
  // /today, /markets and /build use (team markets + MLB pitcher/hitter props). No stale source.
  const engineSlateForLegs = loadTodaySlate();
  /* P210 · Release B (World Cup disposition): the WC player-prop producer left ACTIVE composition.
     The 2026 tournament is complete, so its future-kickoff gate had made the call permanently
     return [] — dead weight presenting as an active source. The archive keeps everything: settled
     WC cards render on their own historical surfaces (game-detail), and the producer functions
     remain for those pages. Active pools are engine-only. */
  /* ATOMS cross the server→client boundary; `BuildExperience` hydrates them (P230 · Release 0).
     This call used to hydrate here and serialize 1010 B/leg of mostly-derived strings, which is why
     it was capped at 180 legs — silently dropping 193 of the 373 the marketplace heading counted. */
  const pool: BuildLegAtoms[] = buildEngineLegAtoms(engineSlateForLegs.eligibleLegs, engineSlateForLegs.date || null);

  const engineSlate = engineSlateForLegs;
  const dataRoot = path.join(process.cwd(), "public", "data");
  const ladderDate = currentSlateDate() ?? currentEtDate();

  /* ?card= seed map — ONE owner (lib/parlays/seedable-cards, P210 Release B): the MLB tier
     ladder, every sport lane ladder (UFC/EPL/NFL via the same loader the lane pages render), and
     every identity-complete suggested card. Cards whose producer does not decompose legs never
     enter the map, and their UI says so instead of offering a dead Customize. */
  const seedableCards = buildSeedableCards(dataRoot, ladderDate);
  /* P261: the lab's settled record by price band. A built card has no record of its own; the published
     cards at the same price are the honest comparison, and the builder labels it as exactly that. */
  const bandByTier = loadRiskLadderRecord(dataRoot)?.byTier ?? null;
  /* P268 · the settled record of the leg families our cards have used, aggregated at build time so
     the page ships eight rows rather than 74 days of graded legs. */
  const legRecord = loadGradedLegRecord(dataRoot);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <PicksSurfaceHeader
        eyebrow="Parlay Center"
        title="Build Your Own"
        status={pool.length > 0 ? "pregame" : "data_pending"}
        counts={{ builderLegs: pool.length }}
        primaryAction={{ label: "Browse suggested parlays", href: "/build" }}
        secondaryAction={{ label: "How it works", href: "/methodology" }}
        note="Every leg here is model-qualified — odds-backed, pre-event, role-quality screened. Add legs, set a paper stake, and see the combined return live. Your card stays in this browser; nothing is placed or recorded."
      />

      <ParlayCenterTabs active="custom" />

      {/* The builder ALWAYS mounts (P209 · Release F): the reader's draft and card seeding live in
          it, and both must survive an empty pool — late at night every leg has started and the pool
          is legitimately zero, but a Customize link or a saved draft still needs its surface. The
          pool column renders its own honest empty state. */}
      <BuildExperience pool={pool} productDate={currentEtDate()} cards={seedableCards} bandByTier={bandByTier} legRecord={legRecord} />

      {/* ── OPTIMIZER COVERAGE & ELIGIBLE-LEG MARKETPLACE ────────────────────────────────────────
          The deepest research surface, kept with the builder it feeds: build a card, then inspect
          the raw eligible-leg inventory and the optimizer's coverage. Same components, same
          loaders, same collapsed-by-default disclosure as always. */}
      <section id="optimizer-coverage" aria-labelledby="optimizer-coverage-heading" className="scroll-mt-6">
        <h2 id="optimizer-coverage-heading" className="sr-only">Card-builder coverage and the full eligible-leg pool</h2>
        {/* P257: the explorer loads on first open (data/build/explorer-slate.json, emitted at build time) —
            embedding it made this page grow with every game on the slate (886KB on 598 legs). */}
        <LazyParlaysExplorer eligibleCount={engineSlate.eligibleLegs?.length ?? 0} />
      </section>
    </div>
  );
}
