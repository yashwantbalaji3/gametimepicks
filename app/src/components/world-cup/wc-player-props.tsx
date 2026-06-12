/**
 * WcPlayerProps — pre-lineup World Cup player projections grouped by market (shots, shots on
 * target, assists, anytime goalscorer). Uses the sportsbook's listed players (real prop odds) +
 * API-Football identity (real photo/position) + recent-stat evidence. Clearly labeled PRE-LINEUP
 * (starter status pending) until official lineups post. A "Lean" badge appears only for a
 * parlay-eligible edge. Never invents players, photos, or stats.
 */
import type { WcPlayerProjections, WcPlayerProjection } from "@/lib/world-cup/projections";
import { fmtAmerican, playerMarketLabel } from "@/lib/world-cup/projections";

const MARKET_ORDER = ["player_shots", "player_shots_on_target", "player_assists", "player_goal_scorer_anytime"];
const PER_MARKET = 6;

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function PlayerChip({ p }: { p: WcPlayerProjection }) {
  const lineLabel = p.market === "player_goal_scorer_anytime"
    ? "Anytime"
    : `${p.pick === "over" ? "Over" : p.pick} ${p.line ?? ""}`.trim();
  return (
    <div
      className="rounded-[7px] px-3 py-2.5 flex items-center gap-2.5 min-w-0"
      style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}
    >
      {p.player.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.player.photo} alt="" width={34} height={34}
             className="rounded-full shrink-0" style={{ objectFit: "cover", border: "1px solid var(--vault-rule)" }} />
      ) : (
        <div className="rounded-full shrink-0 flex items-center justify-center"
             style={{ width: 34, height: 34, background: "rgba(240,199,94,0.12)", border: "1px solid var(--vault-rule)", color: "var(--vault-gold-bright)", fontSize: 11, fontWeight: 700 }}>
          {initials(p.player.name)}
        </div>
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>
            {p.player.name}
          </span>
          <span className="font-mono shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
            {fmtAmerican(p.americanOdds)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            {lineLabel} · {p.player.team}{p.player.position ? ` · ${p.player.position.slice(0, 3)}` : ""}
          </span>
          <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            mdl {pct(p.modelProbability)} · mkt {pct(p.marketProbability)}
          </span>
        </div>
      </div>
      {p.parlayEligible ? (
        <span className="font-mono uppercase tracking-[0.08em] shrink-0 px-1.5 py-0.5 rounded-[3px]"
              style={{ color: "var(--vault-success)", border: "1px solid var(--vault-success)", fontSize: 10 }}>
          Lean
        </span>
      ) : null}
    </div>
  );
}

export default function WcPlayerProps({ projections }: { projections: WcPlayerProjections }) {
  const byMarket = new Map<string, WcPlayerProjection[]>();
  for (const p of projections.matches) {
    const arr = byMarket.get(p.market) ?? [];
    arr.push(p);
    byMarket.set(p.market, arr);
  }
  const lineupNote = projections.lineupsPosted
    ? "Official lineups posted — starter status is confirmed where shown."
    : "Pre-lineup: starter status pending. These are sportsbook-listed players (a strong predicted-XI signal), not confirmed starters — they update automatically when official lineups post ~1 hour before kickoff.";

  return (
    <section className="mt-10" aria-label="Player projections">
      <div className="mb-3">
        <span className="font-mono uppercase tracking-[0.18em]" style={{ color: "var(--vault-gold)", fontSize: 10 }}>
          Player props · {projections.lineupsPosted ? "lineups posted" : "pre-lineup"}
        </span>
        <h2 className="font-display tracking-tight mt-1" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 700 }}>
          Player projections — {projections.matchedPlayers} players
        </h2>
        <p className="text-[12.5px] leading-relaxed mt-1" style={{ color: "var(--vault-text-mute)", maxWidth: "72ch" }}>
          {lineupNote} Model = recent national-team rate, heavily anchored to the market (small
          pre-lineup sample). A &ldquo;Lean&rdquo; marks a parlay-eligible edge; anytime goalscorer is never
          a low-risk pick. Educational / paper only.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5">
        {MARKET_ORDER.filter((m) => byMarket.has(m)).map((m) => {
          const rows = (byMarket.get(m) ?? [])
            .sort((a, b) => b.marketProbability - a.marketProbability)
            .slice(0, PER_MARKET);
          return (
            <div key={m} className="flex flex-col gap-2">
              <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                {playerMarketLabel(m)}
              </span>
              {rows.map((p) => (
                <PlayerChip key={p.id} p={p} />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
