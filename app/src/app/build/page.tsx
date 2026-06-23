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
import PicksSurfaceHeader from "@/components/picks-surface-header";

export const metadata = {
  title: "Build · GameTime Picks",
  description:
    "Build a custom paper card from parlay-eligible legs across World Cup, MLB and more. Filter, add legs, enter any stake, see the projected paper return. Educational, paper-only.",
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

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <PicksSurfaceHeader
        eyebrow="Build a card"
        title="Build"
        status={pool.length > 0 ? "pregame" : "data_pending"}
        counts={{ eligibleLegs: pool.length }}
        primaryAction={{ label: "Browse Parlay Lab", href: "/picks" }}
        secondaryAction={{ label: "How it works", href: "/methodology" }}
        note="Add model-qualified legs across sports to a paper card, then enter any stake to see the projected paper return. The pool defaults to model-qualified legs only (odds-backed, pre-event, role-quality screened) — raw sportsbook inventory and research-only views are intentionally excluded."
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
    </div>
  );
}
