/**
 * One player line, shared by the game dashboard and the Top boards so a player looks — and reads — the same
 * everywhere: portrait (ESPN headshot by athlete id; initials disc when there is none — never an invented face), name,
 * team logo, opponent, the projected value with its range, and an availability flag when it matters.
 */
import Link from "next/link";

import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import { formatValue } from "@/lib/sports/nfl/forecast-view.mjs";
import { capturedLabel, compareModelToMarket, displayedModelValue, signed, MARKET_ABSENT_SHORT } from "@/lib/sports/nfl/market-comparison.mjs";
import { bookmakerLabel } from "@/lib/sportsbook-comparison";

export interface RowFamily { key: string; kind: string; unit: string; title: string }
export interface RowPlayer {
  playerId: string; name: string; position: string | null; team: string; opponent: string; providerEventId: string;
  matchup: string; kickoffUtc: string; availabilityLabel: string | null;
}
export interface RowMarket { sportsbook: string; line: number | null; overOdds: number | null; underOdds: number | null; yesOdds: number | null; capturedAt: string | null }
export interface RowEntry { value: number; p10?: number | null; p90?: number | null; mean?: number | null; marketKey?: string | null; market?: RowMarket | null; marketState?: string | null }
const odds = (o: number) => (o > 0 ? `+${o}` : String(o));

const espnId = (id: string) => { const m = /^nfl-athlete-(\d+)$/.exec(id); return m ? Number(m[1]) : null; };
const kickoff = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";

export default function PlayerRow({ player: p, entry: e, family: f, rank, linkToGame, live }: { player: RowPlayer; entry: RowEntry; family: RowFamily; rank?: number; linkToGame?: boolean; live?: { phase: string; value: number } | null }) {
  const range = f.kind !== "probability" && e.p10 != null && e.p90 != null ? `80%: ${formatValue(f.kind === "count" ? "yards" : f.kind, e.p10)}–${formatValue(f.kind === "count" ? "yards" : f.kind, e.p90)}` : f.kind === "probability" ? "chance to score, if he plays" : null;
  const cmp = compareModelToMarket(f.kind, displayedModelValue(f.kind, e.value), e.market ?? null);
  const name = linkToGame ? <Link href={`/nfl/game/${p.providerEventId}/#players`}>{p.name}</Link> : <b>{p.name}</b>;
  return (
    <li className={`gtp-pred-row nf-row${rank != null ? " nf-ranked" : ""}`} data-player={p.playerId} data-family={e.marketKey ?? f.key} data-view-family={f.key} data-event={p.providerEventId}>
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
      {/*
        * The market half (founder directive 2026-10-12). Book, line and prices as captured; WHEN, in words a reader sees
        * (a hover title is invisible on a phone, and an undated price reads as a live one); and how far the displayed
        * projection sits from the line — a comparison, never a side. No market → the producer's stated reason, or nothing
        * when it states none (a row is never told "no line" on a guess).
        */}
      {e.market ? (
        <span className="nf-mkt" data-market={e.market.sportsbook} data-captured-at={e.market.capturedAt ?? undefined}>
          Sportsbook · {bookmakerLabel(e.market.sportsbook)}{e.market.line != null ? ` ${e.market.line}` : ""}
          {e.market.overOdds != null ? ` · o ${odds(e.market.overOdds)}` : ""}{e.market.underOdds != null ? ` / u ${odds(e.market.underOdds)}` : ""}{e.market.yesOdds != null ? ` · yes ${odds(e.market.yesOdds)}` : ""}
          {e.market.capturedAt ? <span className="nf-mkt-when"> · last captured {capturedLabel(e.market.capturedAt)}</span> : null}
          {cmp ? (
            <span className="nf-mkt-cmp" data-compare={cmp.type}>
              {cmp.type === "LINE"
                ? `Model ${formatValue(f.kind, cmp.model)} vs line ${cmp.line}: ${signed(cmp.diff, f.unit)}`
                : `Model ${(cmp.model * 100).toFixed(1)}% vs ${(cmp.implied * 100).toFixed(1)}% implied by the price (book margin included): ${signed(cmp.diffPts, "pts")}`}
            </span>
          ) : null}
        </span>
      ) : e.marketState && MARKET_ABSENT_SHORT[e.marketState as keyof typeof MARKET_ABSENT_SHORT] ? (
        <span className="nf-mkt nf-mkt-absent" data-market-state={e.marketState}>{MARKET_ABSENT_SHORT[e.marketState as keyof typeof MARKET_ABSENT_SHORT]}</span>
      ) : null}
    </li>
  );
}
