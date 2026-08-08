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

export const metadata = {
  title: "Build · GameTime Picks",
  description:
    "Build a custom paper card from parlay-eligible legs across MLB and more. Filter, add legs, enter any stake, see the projected paper return. Educational, paper-only.",
};

export default function BuildPage() {
  // Canonical methodology engine — the SAME gated, not-started, leakage-safe eligible-leg pool that
  // /today, /picks and /parlays use (World Cup team markets + MLB pitcher/hitter props). No stale source.
  const enginePool = buildEngineLegs(loadTodaySlate().eligibleLegs);
  // World Cup PLAYER props (anytime goalscorer / shots on target): the engine leakage-rejects them for
  // lack of a per-record kickoff, but they ARE fixture-joined + odds-backed + pre-event (gated by team
  // kickoff here) and limited-data/market-implied — so they're surfaced from the WC artifact instead.
  const wcPlayerLegs = buildWcPlayerLegs(loadWorldCupProjections(), loadWorldCupPlayerProjections());
  const seen = new Set(enginePool.map((l) => l.id));
  const pool: BuildLeg[] = [...enginePool, ...wcPlayerLegs.filter((l) => !seen.has(l.id))];

  // Same slate framing /picks uses, so both surfaces agree on which day is current.
  const suggestedCards = loadSuggestedCards(currentSlateDate() ?? currentEtDate());
  // Same canonical slate the optimizer marketplace read on /picks — one loader, not a rebuild.
  const engineSlate = loadTodaySlate();

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <PicksSurfaceHeader
        eyebrow="Advanced builder · secondary tool"
        title="Advanced Builder"
        status={pool.length > 0 ? "pregame" : "data_pending"}
        counts={{ eligibleLegs: pool.length }}
        primaryAction={{ label: "Suggested cards", href: "#suggested-cards" }}
        secondaryAction={{ label: "How it works", href: "/methodology" }}
        note="The advanced, full-leg builder — start with Picks Lab for the model's top picks, or use this to add legs across sports to a paper card and see the projected paper return — model-qualified legs only (odds-backed, pre-event, role-quality screened); raw sportsbook inventory and research-only views are intentionally excluded. Paper-only."
      />
      {pool.length > 0 ? (
        <BuildExperience pool={pool} />
      ) : (
        <div className="rounded-[10px] px-4 py-8 text-center" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
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
          <h2
            id="suggested-cards-heading"
            className="font-semibold"
            style={{ color: "var(--vault-text)", fontSize: 17 }}
          >
            Suggested cards
          </h2>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6, maxWidth: "72ch" }}>
            Cards the model already assembled for today, by sport and risk tier. Enter any stake to see
            the projected paper return. Paper-only and educational — nothing here is placed, and a
            projected return is arithmetic on the odds, not an expectation of profit.
          </p>
        </div>
        {suggestedCards.length > 0 ? (
          <PicksExperience cards={suggestedCards} />
        ) : (
          <div className="rounded-[10px] px-4 py-8 text-center" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
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
