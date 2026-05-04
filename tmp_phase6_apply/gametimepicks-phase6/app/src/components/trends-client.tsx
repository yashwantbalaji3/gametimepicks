"use client";

/**
 * TrendsClient — client-side player search + market toggle for /trends.
 *
 * Receives all players (from the server page reading trends.json) and
 * filters/sorts them client-side. Each player card shows L5/L10/season
 * averages with a sparkline of their recent games for the selected market.
 */
import { useMemo, useState, type ChangeEvent } from "react";
import type { PlayerTrend } from "@/lib/types";
import { formatStat } from "@/lib/format";
import TrendSparkline from "./trend-sparkline";

interface Props {
  players: PlayerTrend[];
}

type MarketFilter = "PTS" | "REB" | "AST";

export default function TrendsClient({ players }: Props) {
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState<MarketFilter>("PTS");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) =>
        p.playerName.toLowerCase().includes(q) ||
        p.team.toLowerCase().includes(q) ||
        (p.position || "").toLowerCase().includes(q)
    );
  }, [players, search]);

  return (
    <>
      {/* Controls */}
      <div className="surface p-4 md:p-5 mt-8 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5 flex-1 min-w-[220px]">
          <label
            htmlFor="search"
            className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]"
          >
            search players
          </label>
          <input
            id="search"
            type="text"
            value={search}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="curry, jokic, tatum..."
            className="bg-[var(--surface-elevated)] border border-[var(--border)] rounded-[2px] px-3 py-1.5 font-mono text-[13px] text-[var(--text)] placeholder:text-[var(--text-faint)] hover:border-[var(--border-strong)] focus:outline-none focus:border-[var(--lime)] transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
            sparkline market
          </span>
          <div className="flex gap-1">
            {(["PTS", "REB", "AST"] as const).map((m) => {
              const active = market === m;
              return (
                <button
                  key={m}
                  onClick={() => setMarket(m)}
                  className={`px-3 py-1.5 rounded-[2px] font-mono text-[11px] tracking-wider uppercase transition-colors ${
                    active
                      ? "bg-[var(--lime)] text-[var(--bg)]"
                      : "bg-[var(--surface-elevated)] text-[var(--text-mute)] hover:text-[var(--text)] border border-[var(--border)]"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="surface px-6 py-12 text-center">
          <div className="font-mono text-[11px] tracking-wider uppercase text-[var(--text-faint)] mb-2">
            no players match
          </div>
          <p className="text-[14px] text-[var(--text-mute)]">
            Try a different search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((p, i) => (
            <PlayerCard
              key={p.playerId}
              player={p}
              market={market}
              delay={(i % 6) + 1}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// PlayerCard
// ---------------------------------------------------------------------------
function PlayerCard({
  player,
  market,
  delay,
}: {
  player: PlayerTrend;
  market: MarketFilter;
  delay: number;
}) {
  const sparkValues = useMemo(() => {
    // Most-recent first → reverse so sparkline reads left-to-right oldest-to-newest
    const reversed = [...(player.recentGames || [])].reverse();
    const key = market.toLowerCase() as "pts" | "reb" | "ast";
    return reversed.map((g) => g[key]);
  }, [player.recentGames, market]);

  const last5 = player.last5;
  const last10 = player.last10;
  const season = player.season;

  return (
    <article
      className={`surface p-5 transition-all duration-200 hover:border-[var(--line-strong)] hover:-translate-y-px reveal reveal-d${Math.min(delay, 6)}`}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-display text-[20px] font-semibold tracking-tight truncate">
            {player.playerName}
          </h3>
          <span className="font-mono text-[11px] tracking-wider uppercase text-[var(--text-faint)]">
            {player.team}{player.position ? ` · ${player.position}` : ""}
          </span>
        </div>
        <div className="shrink-0">
          <TrendSparkline
            values={sparkValues}
            ariaLabel={`${player.playerName} ${market} trend`}
          />
        </div>
      </div>

      {/* Window averages table */}
      <div className="grid grid-cols-4 gap-3 font-mono text-[13px] mt-4 border-t border-[var(--border)] pt-3">
        <Header />
        <Row label="L5" stats={last5} highlight={market.toLowerCase() as "pts" | "reb" | "ast"} />
        <Row label="L10" stats={last10} highlight={market.toLowerCase() as "pts" | "reb" | "ast"} />
        <Row label="Season" stats={season} highlight={market.toLowerCase() as "pts" | "reb" | "ast"} />
      </div>

      {/* Splits */}
      {(player.homeAvg || player.awayAvg) && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11px]">
          <span className="text-[var(--text-faint)] uppercase tracking-wider">splits</span>
          {player.homeAvg && (
            <span>
              <span className="text-[var(--text-faint)]">home</span>{" "}
              <span className="text-[var(--text)] tabular">
                {formatStat(player.homeAvg[market.toLowerCase() as "pts" | "reb" | "ast"])}
              </span>
            </span>
          )}
          {player.awayAvg && (
            <span>
              <span className="text-[var(--text-faint)]">away</span>{" "}
              <span className="text-[var(--text)] tabular">
                {formatStat(player.awayAvg[market.toLowerCase() as "pts" | "reb" | "ast"])}
              </span>
            </span>
          )}
          {player.status && player.status !== "Active" && (
            <span className="text-[var(--amber)]">status: {player.status}</span>
          )}
        </div>
      )}

      {/* Recent games preview */}
      {player.recentGames && player.recentGames.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-2">
            recent games
          </div>
          <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
            {player.recentGames.slice(0, 5).map((g, i) => (
              <div key={i} className="text-center">
                <div className="text-[var(--text-faint)] text-[10px]">
                  {g.homeAway === "Home" ? "vs" : "@"} {g.opponent}
                </div>
                <div className="tabular text-[var(--text)] mt-0.5">
                  {g[market.toLowerCase() as "pts" | "reb" | "ast"]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function Header() {
  return (
    <>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">window</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] text-right">PTS</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] text-right">REB</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] text-right">AST</div>
    </>
  );
}

function Row({
  label,
  stats,
  highlight,
}: {
  label: string;
  stats: { pts: number; reb: number; ast: number };
  highlight: "pts" | "reb" | "ast";
}) {
  const cell = (k: "pts" | "reb" | "ast") => (
    <div
      className="text-right tabular"
      style={{
        color: k === highlight ? "var(--lime)" : "var(--text)",
      }}
    >
      {formatStat(stats[k])}
    </div>
  );
  return (
    <>
      <div className="text-[var(--text-mute)] uppercase text-[11px] tracking-wider">{label}</div>
      {cell("pts")}
      {cell("reb")}
      {cell("ast")}
    </>
  );
}
