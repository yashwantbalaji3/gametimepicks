/**
 * TodaySimulationLeans — Section 4 of the Daily Model Hub. A small module of 3–5 simulation-ready games
 * from the REAL featured-simulation selector: team logos via MatchupIdentity (real mlbstatic URLs → flag
 * → monogram fallback), the matchup, a "Simulation Ready" badge, an honest run-count label ONLY when the
 * artifact carries one, the game's top lean/headline when present, and a "Generate Simulation" CTA to the
 * game page. No fabricated soccer sim — only games whose artifact is genuinely ready reach this list.
 *
 * Presentational only: it renders the `FeaturedSimulation[]` the server page derived via
 * featuredSimulations(buildAllGameDetails()). It reads no data and fabricates nothing.
 */
import Link from "next/link";
import MatchupIdentity from "@/components/ui/matchup-identity";
import type { FeaturedSimulation } from "@/lib/simulate-lobby-featured";

function SimCard({ sim }: { sim: FeaturedSimulation }) {
  return (
    <div className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3" style={{ background: "rgba(11, 18, 14,0.55)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <MatchupIdentity homeName={sim.teams.home} awayName={sim.teams.away} homeLogo={sim.homeLogo} awayLogo={sim.awayLogo} size="sm" />
        <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 8.5, color: "var(--vault-success)", background: "var(--vault-success-dim)" }}>
          Simulation Ready
        </span>
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>
          {sim.teams.away} @ {sim.teams.home}
        </span>
        {sim.headline ? (
          <span className="truncate" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{sim.headline}</span>
        ) : null}
        {sim.runCountLabel ? (
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{sim.runCountLabel}</span>
        ) : null}
      </div>
      <Link
        href={sim.href}
        className="vault-press inline-flex w-fit items-center rounded-full px-3.5 font-mono uppercase tracking-[0.1em]"
        style={{ minHeight: 34, fontSize: 10, fontWeight: 700, textDecoration: "none", background: "var(--gtp-bank-lava-cta)", color: "#1A0E06" }}
      >
        Generate Simulation →
      </Link>
    </div>
  );
}

export default function TodaySimulationLeans({ featured, readyCount }: { featured: FeaturedSimulation[]; readyCount: number }) {
  return (
    <section aria-label="Simulation-backed leans" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Simulation-backed games</h2>
        <Link href="/simulate" className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>Open Simulate →</Link>
      </div>
      {featured.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {featured.map((s) => <SimCard key={s.slug} sim={s} />)}
          </div>
          {readyCount > featured.length ? (
            <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
              +{readyCount - featured.length} more simulation-ready {readyCount - featured.length === 1 ? "game" : "games"} in the Simulate lobby.
            </span>
          ) : null}
        </>
      ) : (
        <p className="rounded-lg px-3 py-3 text-[11.5px]" style={{ border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}>
          No simulation-ready games on this slate yet — deterministic simulations return with the next generated slate. Never faked.
        </p>
      )}
    </section>
  );
}
