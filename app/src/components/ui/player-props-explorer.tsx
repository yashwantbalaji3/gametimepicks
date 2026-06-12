"use client";
/**
 * PlayerPropsExplorer — the fixture-page player-props browser. Replaces the old
 * wall of flat rows with a guided view:
 *   - "Top picks" default: the strongest model edges across all markets (the
 *     recommended side only — never every possible outcome);
 *   - market tabs (Shots / Shots on target / Assists / Anytime goalscorer / …);
 *   - team filter + player search.
 * Pure presentation over real artifact projections; each row is the expandable
 * PlayerPropCard (portrait, book badge, model vs market, last-5 drawer).
 */
import { useMemo, useState } from "react";
import type { PublicProjection } from "@/lib/normalize";
import PlayerPropCard from "@/components/ui/player-prop-card";
import PlayerPropGroup, { groupByPlayer } from "@/components/ui/player-prop-group";

const TOP_N = 12;

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="gtp-pressable rounded-full px-3 py-1.5 transition-colors shrink-0"
      style={{
        background: on ? "var(--vault-gold-dim)" : "transparent",
        border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
        color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
        fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export default function PlayerPropsExplorer({ props }: { props: PublicProjection[] }) {
  const [market, setMarket] = useState<string>("top");
  const [team, setTeam] = useState<string>("All");
  const [q, setQ] = useState("");

  const markets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of props) counts.set(p.marketLabel, (counts.get(p.marketLabel) ?? 0) + 1);
    return [...counts.entries()];
  }, [props]);
  const teams = useMemo(
    () => [...new Set(props.map((p) => p.player?.team).filter(Boolean))] as string[],
    [props],
  );

  // Team + search filtered, before any market/view selection.
  const scoped = useMemo(() => {
    let list = props;
    if (team !== "All") list = list.filter((p) => p.player?.team === team);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((p) => (p.player?.name ?? "").toLowerCase().includes(needle));
    }
    return list;
  }, [props, team, q]);

  const filtered = useMemo(() => {
    if (market === "top") {
      // The recommended view: strongest model-vs-market edges across markets.
      return [...scoped].sort((a, b) => (b.edgePct ?? -99) - (a.edgePct ?? -99)).slice(0, TOP_N);
    }
    return scoped
      .filter((p) => p.marketLabel === market)
      .sort((a, b) => (b.edgePct ?? -99) - (a.edgePct ?? -99));
  }, [scoped, market]);

  // "By player" view: every market each player has, collapsed into one card per player.
  const playerGroups = useMemo(() => (market === "byplayer" ? groupByPlayer(scoped) : []), [scoped, market]);

  const anyPreLineup = props.some((p) => (p.lineupStatus ?? "").startsWith("pre_lineup") || p.lineupStatus === "waiting_on_lineups");

  return (
    <div className="flex flex-col gap-3">
      {anyPreLineup ? (
        <div className="flex items-center gap-2 rounded-[8px] px-3 py-2" style={{ background: "rgba(240,199,94,0.06)", border: "1px solid rgba(240,199,94,0.25)" }}>
          <span aria-hidden style={{ fontSize: 12 }}>ⓘ</span>
          <span style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
            Lineups usually confirm closer to kickoff — player props stay projection-based until then.
          </span>
        </div>
      ) : null}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <Pill on={market === "top"} onClick={() => setMarket("top")}>★ Top picks</Pill>
        <Pill on={market === "byplayer"} onClick={() => setMarket("byplayer")}>👤 By player</Pill>
        {markets.map(([m, n]) => (
          <Pill key={m} on={market === m} onClick={() => setMarket(m)}>
            {m} <span className="font-mono" style={{ fontSize: 10, opacity: 0.8 }}>{n}</span>
          </Pill>
        ))}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <Pill on={team === "All"} onClick={() => setTeam("All")}>Both teams</Pill>
        {teams.map((t) => (
          <Pill key={t} on={team === t} onClick={() => setTeam(t)}>{t}</Pill>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player…"
          className="ml-1 rounded-full px-3 py-1.5 min-w-[140px]"
          style={{ background: "rgba(26, 16, 11,0.7)", border: "1px solid var(--vault-rule)", color: "var(--vault-text)", fontSize: 12 }}
        />
      </div>

      {market === "top" ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)" }}>
          Top {filtered.length} model edges across all markets — tap a row for the evidence. Use the market tabs for everything else.
        </span>
      ) : market === "byplayer" ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)" }}>
          {playerGroups.length} player{playerGroups.length === 1 ? "" : "s"} — each card opens to show all of that player&apos;s markets, strongest edge first.
        </span>
      ) : null}

      {market === "byplayer" ? (
        playerGroups.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {playerGroups.map((g, i) => (
              <PlayerPropGroup key={`${g.name}-${g.team ?? ""}`} group={g} defaultOpen={i === 0} />
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] px-4 py-6 text-center" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
            <p style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>No players match this filter</p>
            <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 11.5 }}>Clear the team filter or search to see everyone.</p>
          </div>
        )
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.map((p) => <PlayerPropCard key={p.id} p={p} />)}
        </div>
      ) : (
        <div className="rounded-[10px] px-4 py-6 text-center" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>No props match this filter</p>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 11.5 }}>Try another market or clear the search.</p>
        </div>
      )}
    </div>
  );
}
