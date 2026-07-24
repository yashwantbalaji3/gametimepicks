/**
 * TodayTopPicksByCategory (Sprint 010) — the Top Model Picks dashboard, grouped by prop MARKET (Strikeouts,
 * Hits, Total Bases, H+R+RBI, Home Runs, …). Each pick is a canonical player prediction (same object the game
 * report shows), rendered with an official player portrait (graceful initials fallback), team + matchup, the
 * OVER/UNDER pick, and its simulated probability. Presentational only — the ranking + picks are pre-derived.
 */
import { PlayerCard } from "@/components/entity";
import type { CategoryDashboard } from "@/lib/mlb/prediction/slate";

/** One ranked pick row — the CANONICAL PlayerCard from the global entity system (Sprint 012). */
function PickRow({ rank, pick }: { rank: number; pick: CategoryDashboard["picks"][number] }) {
  return (
    <PlayerCard
      rank={rank}
      playerId={pick.playerId ?? null}
      name={pick.player}
      team={pick.team}
      opponent={pick.opponent}
      sport="mlb"
      pick={pick.pick}
      line={pick.line}
      probabilityPct={pick.simulationProbability * 100}
      simulationCount={pick.simulationCount}
      href={pick.href}
    />
  );
}

export default function TodayTopPicksByCategory({ categories }: { categories: CategoryDashboard[] }) {
  if (!categories.length) return null;
  return (
    <section aria-labelledby="top-model-picks" id="top-model-picks" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>Top model picks by market</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>strongest player predictions · % of 10,000 simulations</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {categories.map((c) => (
          <div key={c.market} className="rounded-[12px] px-3 py-3 flex flex-col gap-2" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-mute)", fontSize: 9.5 }}>{c.label}</span>
            <div className="flex flex-col gap-1.5">
              {c.picks.map((p, i) => (
                <PickRow key={`${p.gamePk}-${p.player}-${p.market}`} rank={i + 1} pick={p} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="font-mono m-0" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        Direction = the side the simulation favors (not model-vs-market gap). Legacy prop engine · paper-only research · not a bet.
      </p>
    </section>
  );
}
