/**
 * /build — custom paper-card builder. Exposes ONLY parlay-eligible legs across sports (via the
 * shared leg-pool adapters + public-visibility), lets users filter/search, add/remove into a
 * betslip, and see combined odds + paper payout + correlation/pre-lineup/regulation/Bank-Builder
 * warnings. Public-data only; nothing here is betting advice.
 */
import { currentEtDate } from "@/lib/freshness";
import {
  loadWorldCupProjections,
  loadWorldCupPlayerProjections,
} from "@/lib/world-cup/projections";
import { getSuggestedParlaysForDate } from "@/lib/data-parlays";
import { buildWcLegs, buildOptimizerLegs, type BuildLeg } from "@/lib/build-legs";
import BuildExperience from "@/components/build-experience";
import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "Build · GameTime Picks",
  description:
    "Build a custom paper card from parlay-eligible legs across World Cup, MLB and more. Filter, add legs, enter any stake, see the projected paper return. Educational, paper-only.",
};

export default function BuildPage() {
  const today = currentEtDate();
  const pool: BuildLeg[] = [
    ...buildWcLegs(loadWorldCupProjections(), loadWorldCupPlayerProjections()),
    ...buildOptimizerLegs(getSuggestedParlaysForDate(today)?.slips ?? null),
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <SectionHeader
        eyebrow={`Build a card · ${pool.length} eligible legs`}
        title="Build"
        sub="Add parlay-eligible legs across sports to a paper card, then enter any stake to see the projected paper return. Only legs that cleared our card gates appear here — never research-only views."
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
