/**
 * TodayTopPicksByCategory (Sprint 010, reframed Program 058) — largest simulated probabilities grouped by prop
 * MARKET (Strikeouts, Hits, H+R+RBI, …). Each row is a canonical player prediction (same object the game
 * report shows), rendered with an official player portrait (graceful initials fallback), team + matchup, the
 * OVER/UNDER side, and its simulated share. Presentational only — the ordering + rows are pre-derived, the
 * ordering is a factual simulated-share sort labeled as such, and calibration-failed families carry their
 * settled-record status inline. Prediction-disabled families never reach this component.
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
        <h2 className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>Largest simulated probabilities by market</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>share of 10,000 simulations · research display, not picks</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {categories.map((c) => (
          <div key={c.market} className="rounded-[12px] px-3 py-3 flex flex-col gap-2" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
            <span className="flex items-center gap-2 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-mute)", fontSize: 9.5 }}>
              {c.label}
              {c.calibrationFailed ? (
                <span className="rounded px-1.5 py-0.5" style={{ background: "rgba(242,54,69,0.12)", color: "var(--vault-text-faint)", fontSize: 8 }}>settled record: model behind market</span>
              ) : null}
            </span>
            <div className="flex flex-col gap-1.5">
              {c.picks.map((p, i) => (
                <PickRow key={`${p.gamePk}-${p.player}-${p.market}`} rank={i + 1} pick={p} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="font-mono m-0" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        Direction = the side the simulation favors (not model-vs-market gap). Ordered by simulated share, a factual sort — the settled record shows our most confident calls are our worst, so nothing here is ranked by trust. Paper-only research · not a bet.
      </p>
    </section>
  );
}
