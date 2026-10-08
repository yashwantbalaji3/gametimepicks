/**
 * One player line, shared by the game dashboard and the Top boards so a player looks — and reads — the same
 * everywhere: portrait (ESPN headshot by athlete id; initials disc when there is none — never an invented face), name,
 * team logo, opponent, the projected value with its range, and an availability flag when it matters.
 */
import Link from "next/link";

import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import { formatValue } from "@/lib/sports/nfl/forecast-view.mjs";

export interface RowFamily { key: string; kind: string; unit: string; title: string }
export interface RowPlayer {
  playerId: string; name: string; position: string | null; team: string; opponent: string; providerEventId: string;
  matchup: string; kickoffUtc: string; availabilityLabel: string | null;
}
export interface RowEntry { value: number; p10?: number; p90?: number; mean?: number }

const espnId = (id: string) => { const m = /^nfl-athlete-(\d+)$/.exec(id); return m ? Number(m[1]) : null; };
const kickoff = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";

export default function PlayerRow({ player: p, entry: e, family: f, rank, linkToGame, live }: { player: RowPlayer; entry: RowEntry; family: RowFamily; rank?: number; linkToGame?: boolean; live?: { phase: string; value: number } | null }) {
  const range = f.kind !== "probability" && e.p10 != null && e.p90 != null ? `80%: ${formatValue(f.kind === "count" ? "yards" : f.kind, e.p10)}–${formatValue(f.kind === "count" ? "yards" : f.kind, e.p90)}` : f.kind === "probability" ? "chance to score, if he plays" : null;
  const name = linkToGame ? <Link href={`/nfl/game/${p.providerEventId}/#players`}>{p.name}</Link> : <b>{p.name}</b>;
  return (
    <li className={`nf-row${rank != null ? " nf-ranked" : ""}`} data-player={p.playerId} data-family={f.key}>
      {rank != null ? <span className="nf-rank" aria-label={`Rank ${rank}`}>{rank}</span> : null}
      <PlayerAvatar sport="nfl" playerId={espnId(p.playerId)} playerName={p.name} team={p.team} size="md" />
      <div className="nf-who">
        {name}
        <span className="nf-meta">
          <TeamLogo team={p.team} sport="nfl" size="sm" ariaLabel={`${p.team} logo`} />
          {p.position ? `${p.position} · ` : ""}{p.team} vs {p.opponent}
          {linkToGame ? <> · {kickoff(p.kickoffUtc)}</> : null}
          {p.availabilityLabel ? <span className="nf-flag">{p.availabilityLabel}</span> : null}
        </span>
      </div>
      <div className="nf-val">
        <b className="nf-num">{formatValue(f.kind, e.value)}{f.kind === "yards" ? <span style={{ fontSize: 11, marginLeft: 3 }}>{f.unit}</span> : null}</b>
        {range ? <span>{range}</span> : null}
        {live ? <span className="nf-num" data-live={live.phase} style={{ color: "var(--vault-text)" }}>{live.phase === "FINAL" ? "Final" : "Live"} {f.kind === "probability" ? `${live.value} TD` : live.value}</span> : null}
      </div>
    </li>
  );
}
