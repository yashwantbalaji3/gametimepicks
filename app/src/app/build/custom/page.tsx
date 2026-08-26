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
import { buildEngineLegs, buildWcPlayerLegs, type BuildLeg } from "@/lib/build-legs";
import { loadTodaySlate, currentSlateDate } from "@/lib/parlays/ui-loader";
import { loadWorldCupProjections, loadWorldCupPlayerProjections } from "@/lib/world-cup/projections";
import BuildExperience, { type SeedableCard } from "@/components/build-experience";
import ParlaysExplorer from "@/components/parlays/parlays-explorer";
import { buildCoverageMatrix } from "@/lib/parlays/coverage-matrix";
import { loadMoonshotLane } from "@/lib/moonshot/moonshot-lane";
import { currentEtDate } from "@/lib/freshness";
import PicksSurfaceHeader from "@/components/picks-surface-header";
import ParlayCenterTabs from "@/components/parlays/parlay-center-tabs";
import { loadRiskLadder } from "@/lib/parlays/risk-ladder";
import { mlbHeadshotUrl } from "@/lib/player-headshots";
import path from "node:path";

export const metadata = {
  title: "Build Your Own · Parlay Center · GameTime Picks",
  description:
    "Build a custom paper card from qualified legs across sports. Filter, search, add legs, enter any stake, see the projected paper return — or start from a suggested card and edit it. Educational, paper-only.",
};

export default function ParlayCenterCustomPage() {
  // Canonical methodology engine — the SAME gated, not-started, leakage-safe eligible-leg pool that
  // /today, /markets and /build use (team markets + MLB pitcher/hitter props). No stale source.
  const engineSlateForLegs = loadTodaySlate();
  const enginePool = buildEngineLegs(engineSlateForLegs.eligibleLegs, engineSlateForLegs.date || null);
  // World Cup PLAYER props: leakage-rejected by the engine for lack of a per-record kickoff, but
  // fixture-joined + odds-backed + pre-event gated — surfaced from the WC artifact instead.
  const wcPlayerLegs = buildWcPlayerLegs(loadWorldCupProjections(), loadWorldCupPlayerProjections());
  const seen = new Set(enginePool.map((l) => l.id));
  const pool: BuildLeg[] = [...enginePool, ...wcPlayerLegs.filter((l) => !seen.has(l.id))];

  const engineSlate = engineSlateForLegs;
  const dataRoot = path.join(process.cwd(), "public", "data");
  const ladderDate = currentSlateDate() ?? currentEtDate();

  /* ?card= seed map: today's ladder cards, keyed by their published slipId, with legs in the slip's
     own shape. Built from the SAME artifact the Suggested page renders, so the draft a Customize
     link seeds is the card of record — never a re-derivation. Unpriced legs are passed through and
     disclosed at seed time rather than silently dropped here. */
  const riskLadder = loadRiskLadder(dataRoot, ladderDate);
  const seedableCards: Record<string, SeedableCard> = {};
  for (const card of riskLadder?.cards ?? []) {
    seedableCards[card.slipId] = {
      label: `the ${card.tierLabel} card`,
      legs: card.legs.map((l) => ({
        sport: "mlb", player: l.player, marketLabel: l.marketLabel, side: l.side, line: l.line,
        /* 0 = "no current price" sentinel (JSON-safe, unlike NaN); the seeder discloses and skips it. */
        americanOdds: l.odds ?? 0,
        matchup: l.team && l.opponent ? `${l.team} vs ${l.opponent}` : (l.opponent ?? null),
        photoUrl: l.playerId ? mlbHeadshotUrl(l.playerId) : null,
        teamAbbr: l.team, opponentAbbr: l.opponent,
      })),
    };
  }

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

      {pool.length > 0 ? (
        <BuildExperience pool={pool} productDate={currentEtDate()} cards={seedableCards} />
      ) : (
        <div className="rounded-[10px] px-4 py-8 text-center" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No eligible legs right now</p>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
            Legs appear here only when a real projection clears the suggested-card gates. Check back closer to game time.
          </p>
        </div>
      )}

      {/* ── OPTIMIZER COVERAGE & ELIGIBLE-LEG MARKETPLACE ────────────────────────────────────────
          The deepest research surface, kept with the builder it feeds: build a card, then inspect
          the raw eligible-leg inventory and the optimizer's coverage. Same components, same
          loaders, same collapsed-by-default disclosure as always. */}
      <section id="optimizer-coverage" aria-labelledby="optimizer-coverage-heading" className="scroll-mt-6">
        <h2 id="optimizer-coverage-heading" className="sr-only">Optimizer coverage and eligible-leg marketplace</h2>
        <details className="rounded-xl" style={{ border: "1px solid var(--vault-border)", background: "var(--vault-wash-faint)" }}>
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
