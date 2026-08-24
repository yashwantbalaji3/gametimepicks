/**
 * /build — custom paper-card builder. Exposes ONLY parlay-eligible legs across sports (via the
 * shared leg-pool adapters + public-visibility), lets users filter/search, add/remove into a
 * betslip, and see combined odds + paper payout + correlation/pre-lineup/regulation/Bank-Builder
 * warnings. Public-data only; nothing here is betting advice.
 */
import { buildEngineLegs, buildWcPlayerLegs, type BuildLeg } from "@/lib/build-legs";
import { loadTodaySlate } from "@/lib/parlays/ui-loader";
import { loadWorldCupProjections, loadWorldCupPlayerProjections } from "@/lib/world-cup/projections";
import BuildExperience from "@/components/build-experience";
import PicksExperience from "@/components/picks-experience";
import ParlaysExplorer from "@/components/parlays/parlays-explorer";
import { buildCoverageMatrix } from "@/lib/parlays/coverage-matrix";
import { loadMoonshotLane } from "@/lib/moonshot/moonshot-lane";
import Link from "next/link";
import { loadSuggestedCards } from "@/lib/picks/suggested-cards";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import { currentEtDate } from "@/lib/freshness";
import PicksSurfaceHeader from "@/components/picks-surface-header";
import RiskLadderBoard from "@/components/parlays/risk-ladder-board";
import { loadRiskLadder, loadLabLedger, loadTierGrid } from "@/lib/parlays/risk-ladder";
import { loadMlbPropsBoard } from "@/lib/mlb/mlb-props";
import path from "node:path";

export const metadata = {
  title: "Build · GameTime Picks",
  description:
    "Build a custom paper card from parlay-eligible legs across MLB and more. Filter, add legs, enter any stake, see the projected paper return. Educational, paper-only.",
};

export default function BuildPage() {
  // Canonical methodology engine — the SAME gated, not-started, leakage-safe eligible-leg pool that
  // /today, /picks and /parlays use (World Cup team markets + MLB pitcher/hitter props). No stale source.
  const engineSlateForLegs = loadTodaySlate();
  const enginePool = buildEngineLegs(engineSlateForLegs.eligibleLegs, engineSlateForLegs.date || null);
  // World Cup PLAYER props (anytime goalscorer / shots on target): the engine leakage-rejects them for
  // lack of a per-record kickoff, but they ARE fixture-joined + odds-backed + pre-event (gated by team
  // kickoff here) and limited-data/market-implied — so they're surfaced from the WC artifact instead.
  const wcPlayerLegs = buildWcPlayerLegs(loadWorldCupProjections(), loadWorldCupPlayerProjections());
  const seen = new Set(enginePool.map((l) => l.id));
  const pool: BuildLeg[] = [...enginePool, ...wcPlayerLegs.filter((l) => !seen.has(l.id))];

  // Same slate framing /picks uses, so both surfaces agree on which day is current.
  const suggestedCards = loadSuggestedCards(currentSlateDate() ?? currentEtDate());
  // Same canonical slate the optimizer marketplace read on /picks — one loader, not a rebuild.
  const engineSlate = engineSlateForLegs;
  const dataRoot = path.join(process.cwd(), "public", "data");
  const ladderDate = currentSlateDate() ?? currentEtDate();
  const riskLadder = loadRiskLadder(dataRoot, ladderDate);
  /* What the page can actually show today, independent of the advanced builder's own pool. */
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
      {/*
       * PARLAY LAB LEADS THIS PAGE.
       *
       * The header used to introduce an "Advanced Builder" and offer the Lab as a jump link at the
       * bottom — which put a 180-leg marketplace in front of everyone and the guided two-question
       * entry behind a scroll. That is backwards: the Lab is the way most readers should arrive, and
       * the full leg pool is the tool you graduate to.
       */}
      {/*
        P185-E · THE PAGE HEADER DESCRIBES THE PAGE, NOT ONE SECTION OF IT.

        Both the status badge and the count were derived from `pool` — the ADVANCED BUILDER's gated
        leg pool. That pool is legitimately empty on a slate where no projection clears the
        suggested-card gates, and the advanced builder already says so in its own words further down
        ("No eligible legs right now"). But reading it at page level badged the whole surface
        "Data pending" and printed "0 Eligible legs" directly above a risk ladder rendering seven
        real legs across two tiers. A reader is told the page has nothing while looking at its cards.

        The status now reflects whether the PAGE has something to show, and the count says which
        pool it is counting. The advanced builder's empty state is unchanged — it is the right place
        for that fact.
      */}
      <PicksSurfaceHeader
        eyebrow="Build"
        title="Parlay Lab"
        status={pool.length > 0 || ladderCardCount > 0 ? "pregame" : "data_pending"}
        counts={{ builderLegs: pool.length, suggestedCards: ladderCardCount }}
        primaryAction={{ label: "Advanced builder", href: "#advanced-builder" }}
        secondaryAction={{ label: "How it works", href: "/methodology" }}
        note="Tell it your daily paper bankroll and how much variance you can sit through, and it leads with the tier that matches — each carrying its own settled record. Swap any leg you do not like. Paper-only, and no stake is ever filled in for you."
      />

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
          none of which was reachable from here, the canonical Suggested Parlays destination. Links
          only: each lane page owns its rendering, and this section can never blend the lanes. */}
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

      <section id="advanced-builder" aria-labelledby="advanced-builder-heading" className="flex flex-col gap-2 scroll-mt-6">
        <h2 id="advanced-builder-heading" className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>
          Advanced builder
        </h2>
        <p className="m-0 max-w-[70ch]" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>
          Every leg here is model-qualified legs only — odds-backed, pre-event, role-quality screened.
          Build a card leg by leg when the Lab&rsquo;s tiers are not what you are after.
        </p>
      </section>
      {pool.length > 0 ? (
        <BuildExperience pool={pool} productDate={currentEtDate()} />
      ) : (
        <div className="rounded-[10px] px-4 py-8 text-center" style={{ background: "rgba(11, 18, 14,0.55)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No eligible legs right now</p>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
            Legs appear here only when a real projection clears the suggested-card gates. Check back closer to game time.
          </p>
        </div>
      )}

      {/* ── SUGGESTED CARDS (Program 142, Train 1 step 3C · Deployment A) ────────────────────────
          The prebuilt-card job that until now existed only on /picks. It calls the SHARED
          loadSuggestedCards loader and reuses PicksExperience directly — no second composition, no
          cloned gating, no third stake implementation. Retiring /picks requires this to exist first;
          this deployment is purely additive and /picks stays live and unchanged.

          Manual Builder above remains the default: /build's job is card construction, and a reader
          who came here to assemble one should not land in a browsing list. This section is
          addressable at /build#suggested-cards for a shareable, refresh-stable link that needs no
          client-side routing state. */}
      <section id="suggested-cards" aria-labelledby="suggested-cards-heading" className="flex flex-col gap-3 scroll-mt-6">
        <div>
          {/* Named for what it is RELATIVE to the ladder above. Calling this "Parlay Lab" too left
              the page with three headings of that name — the title, the entry panel, and this — and
              no way to tell which one a reader had arrived at. The ladder is the curated few; this
              is everything the optimizer built. */}
          <h2
            id="suggested-cards-heading"
            className="font-semibold"
            style={{ color: "var(--vault-text)", fontSize: 17 }}
          >
            Every card the optimizer built
          </h2>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6, maxWidth: "72ch" }}>
            The full pool behind the ladder above, by sport and risk tier. Swap out any leg you
            do not like, or add legs to your slip and size them yourself. Paper-only and educational —
            nothing here is placed, and a projected return is arithmetic on the odds, not an
            expectation of profit.
          </p>
        </div>
        {suggestedCards.length > 0 ? (
          <PicksExperience cards={suggestedCards} />
        ) : (
          <div className="rounded-[10px] px-4 py-8 text-center" style={{ background: "rgba(11, 18, 14,0.55)", border: "1px solid var(--vault-border)" }}>
            <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No suggested cards for today</p>
            <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
              The slate was assessed and nothing cleared the card gates. That is the model&rsquo;s answer for
              today, not a missing update — build your own above, or see the ranked markets on{" "}
              <Link href="/markets" style={{ color: "var(--vault-gold-bright)" }}>Market Center</Link>.
            </p>
          </div>
        )}
      </section>

      {/* ── OPTIMIZER COVERAGE & ELIGIBLE-LEG MARKETPLACE (Program 143 · capability parity) ───────
          Migrated verbatim from /picks. These two — ParlaysExplorer and buildCoverageMatrix — were
          the capabilities the first Deployment B attempt would have deleted: they rendered ONLY on
          /picks, and retiring the route without a destination would have removed them from the
          product with nothing pointing at a replacement.

          Same components, same loaders, same collapsed-by-default disclosure, so this is a move
          rather than a rebuild. It sits last on /build because it is the deepest research surface:
          build a card, browse the model's cards, then inspect the raw eligible-leg inventory. */}
      <section id="optimizer-coverage" aria-labelledby="optimizer-coverage-heading" className="scroll-mt-6">
        <h2 id="optimizer-coverage-heading" className="sr-only">Optimizer coverage and eligible-leg marketplace</h2>
        <details className="rounded-xl" style={{ border: "1px solid var(--vault-border)", background: "rgba(255,255,255,0.02)" }}>
          <summary className="cursor-pointer select-none px-4 py-3 text-[13px]" style={{ color: "var(--vault-text-mute)", minHeight: 44 }}>
            Advanced — optimizer coverage &amp; the full eligible-leg marketplace (by risk). Tap to expand.
          </summary>
          <div className="px-1 pb-2 pt-1">
            <ParlaysExplorer slate={engineSlate} coverage={buildCoverageMatrix(engineSlate, loadMoonshotLane(), new Date().toISOString())} />
          </div>
        </details>
      </section>
    </div>
  );
}
