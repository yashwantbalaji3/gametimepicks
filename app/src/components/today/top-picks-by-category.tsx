/**
 * TodayTopPicksByCategory (Sprint 010) — the Top Model Picks dashboard, grouped by prop MARKET (Strikeouts,
 * Hits, Total Bases, H+R+RBI, Home Runs, …). Each pick is a canonical player prediction (same object the game
 * report shows), rendered with an official player portrait (graceful initials fallback), team + matchup, the
 * OVER/UNDER pick, and its simulated probability. Presentational only — the ranking + picks are pre-derived.
 */
import Link from "next/link";
import PlayerAvatar from "@/components/player-avatar";
import type { CategoryDashboard } from "@/lib/mlb/prediction/slate";

const pct = (p: number): string => `${Math.round(p * 100)}%`;

function PickRow({ rank, pick }: { rank: number; pick: CategoryDashboard["picks"][number] }) {
  return (
    <Link href={pick.href} className="vault-glow-hover flex items-center gap-2.5 rounded-[10px] px-2.5 py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-rule)", textDecoration: "none" }}>
      <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 10, width: 14, textAlign: "right" }}>{rank}</span>
      <PlayerAvatar playerId={pick.playerId ?? null} playerName={pick.player} team={pick.team} sport="mlb" size="sm" />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{pick.player}</span>
        <span className="truncate font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {pick.team}{pick.opponent ? ` vs ${pick.opponent}` : ""}
        </span>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="font-semibold whitespace-nowrap" style={{ color: "var(--vault-text)", fontSize: 12 }}>{pick.pick} {pick.line}</span>
        <span className="font-mono" style={{ color: "var(--vault-gold)", fontSize: 11 }}>{pct(pick.simulationProbability)}</span>
      </div>
    </Link>
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
