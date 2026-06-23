/**
 * HomerNukesBoard — renders the day's top-5 MLB home-run picks (player portrait + team, market, odds,
 * model probability, edge, provider) or an honest data-gated empty state when no real home-run board is
 * posted. Server component; pure presentational. Portraits degrade to initials — never fabricated.
 */
import Link from "next/link";
import PlayerAvatar from "@/components/ui/player-avatar";
import OddsPill from "@/components/tickets/odds-pill";
import type { HomerNukesResult } from "@/lib/mlb/homer-nukes";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const signed = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

export default function HomerNukesBoard({ board }: { board: HomerNukesResult }) {
  if (!board.available || board.picks.length === 0) {
    return (
      <div className="rounded-2xl px-5 py-10 text-center" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
        <div aria-hidden style={{ fontSize: 34 }}>💣⚾</div>
        <p className="mt-2 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>Tonight&rsquo;s Homer Nukes board isn&rsquo;t posted yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          {board.note} The top 5 home-run picks light up here the moment real MLB home-run props are posted — no fabricated picks in the meantime.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link href="/mlb" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
            MLB board
          </Link>
          <Link href="/mr-dub" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ background: "var(--gtp-bank-lava)", color: "#1A0E06", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
            Mr. Dub portfolio →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold" style={{ color: "var(--gtp-bank-heat)", fontSize: 12.5 }}>
          Top {board.picks.length} home-run {board.picks.length === 1 ? "pick" : "picks"} · ${board.stakePerPick} each · ${board.dailyAllocation}/day
        </span>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{board.evaluated} HR markets evaluated · paper-only</span>
      </div>
      <ol className="flex flex-col gap-2 list-none">
        {board.picks.map((p, i) => (
          <li key={p.id} className="rounded-[12px] px-3.5 py-3 flex items-start gap-3 min-w-0" style={{ background: "rgba(12,8,6,0.45)", border: "1px solid var(--vault-rule)", borderLeft: "2px solid var(--gtp-bank-heat)" }}>
            <span className="shrink-0 mt-0.5 flex items-center gap-2">
              <span className="font-display tabular" style={{ color: "var(--vault-text-faint)", fontSize: 13, fontWeight: 800, width: 14 }}>{i + 1}</span>
              <PlayerAvatar name={p.player} photo={p.photoUrl} size={34} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 min-w-0">
                <span className="font-display tracking-tight break-words leading-tight" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700 }}>{p.player}</span>
                <OddsPill odds={p.odds} size="sm" tone="lava" />
              </span>
              <span className="block font-mono text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{p.marketLabel}{p.matchup ? ` · ${p.matchup}` : ""}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                <span>model {pct(p.modelProbability)}</span>
                <span style={{ color: p.edge >= 0 ? "var(--vault-success)" : "var(--vault-text-faint)" }}>edge {signed(p.edge)}</span>
                {p.provider ? <span>{p.provider}</span> : null}
                {p.kickoffEt ? <span>{p.kickoffEt}</span> : null}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
