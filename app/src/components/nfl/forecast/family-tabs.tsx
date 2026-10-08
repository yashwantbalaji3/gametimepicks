"use client";
/**
 * Tabbed player lists, one tab per statistical family — the SAME component for the game dashboard's player
 * projections and the hub's Top boards, so a family reads identically in both places. Rows come pre-computed from
 * forecast-view.mjs (the client never ranks, rounds differently or recomputes). A family with no published model shows
 * its reason, never a placeholder number.
 *
 * Optional, per surface:
 *   filters   (hub) team chips with the follow star and a player search. They narrow the rows that were published —
 *             never re-rank, never reach past the top N (P251-F5's rule, carried over from the retired weekly board).
 *   live      (game page) the factual in-game stat for each row, from the live gateway through `useLiveEvent` — the
 *             single poller. Read, never derived: no on-track %, no projected finish; a blank box-score cell stays
 *             blank. With NFL live off the hook fetches nothing and no live text renders.
 */
import { useMemo, useState } from "react";

import FollowToggle from "@/components/follow/follow-toggle";
import type { FollowRef } from "@/lib/follow/follow-store";
import { useLiveEvent } from "@/components/live/use-live-event";
import { etDateOf } from "@/lib/live/client";
import { indexLiveProps, liveRowsFromEnvelope } from "@/lib/prediction-presentation/nfl";
import { SEARCH_PLAYERS, SEARCH_PLAYERS_LABEL } from "@/lib/ui/search-labels";

import PlayerRow, { type RowEntry, type RowFamily, type RowPlayer } from "./player-row";

export interface TabFamily extends RowFamily { withheld: string | null; metric: string; sourceLabel: string | null; asOf: string | null }
export interface TabRow { player: RowPlayer; entry: RowEntry; rank?: number }

/** Forecast-view family → the live gateway's market key. */
const LIVE_MARKET: Record<string, string> = { passingYards: "player_pass_yds", rushingYards: "player_rush_yds", receivingYards: "player_reception_yds", receptions: "player_receptions", anytimeTd: "anytime_td" };
const fmtAsOf = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : null);

export default function FamilyTabs({ families, lists, linkToGame, label, emptyText, filters, live, staticPanels = "all" }: {
  families: TabFamily[]; lists: Record<string, TabRow[]>; linkToGame?: boolean; label: string; emptyText: string;
  filters?: { teamRefs?: Record<string, FollowRef> };
  live?: { eventId: string; kickoffUtc: string };
  /** "all": every panel is in the static page (game page — every captured price is on the page); "active": only the
   *  selected panel (hub — inside its page-weight budget; each row is also on its game page, prices included). */
  staticPanels?: "all" | "active";
}) {
  const [active, setActive] = useState(families[0]?.key);
  const [team, setTeam] = useState("All");
  const [q, setQ] = useState("");
  const fam = families.find((f) => f.key === active) ?? families[0];
  const rowsOf = (key: string) => {
    const a = lists[key] ?? [];
    return filters ? a.filter((r) => (team === "All" || r.player.team === team) && (query === "" || r.player.name.toLowerCase().includes(query))) : a;
  };

  const feed = useLiveEvent("nfl", live?.eventId ?? null, { players: true, etDate: live ? etDateOf(live.kickoffUtc) : undefined });
  const liveIndex = useMemo(() => indexLiveProps({ rows: liveRowsFromEnvelope(feed.envelope) }), [feed.envelope]);

  const teams = useMemo(() => [...new Set(Object.values(lists).flat().map((r) => r.player.team))].sort(), [lists]);
  const query = q.trim().toLowerCase();
  const narrowed = !!filters && (team !== "All" || query !== "");

  return (
    <div>
      {filters ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 }}>
          <div className="nf-tabs" style={{ marginTop: 0 }} aria-label="Filter by team">
            <button type="button" className="nf-tab" aria-pressed={team === "All"} data-on={team === "All"} onClick={() => setTeam("All")} style={team === "All" ? { borderColor: "var(--vault-gold-bright)", color: "var(--vault-text)" } : undefined}>All teams</button>
            {teams.map((t) => (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 2, flex: "0 0 auto" }}>
                <button type="button" className="nf-tab" aria-pressed={team === t} onClick={() => setTeam(t)} style={team === t ? { borderColor: "var(--vault-gold-bright)", color: "var(--vault-text)" } : undefined}>{t}</button>
                {/* Follow from where a reader is already looking at their club — canonical ESPN team id, never a name. */}
                <FollowToggle entity={filters.teamRefs?.[t] ?? null} variant="compact" size={13} />
              </span>
            ))}
          </div>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={SEARCH_PLAYERS} aria-label={SEARCH_PLAYERS_LABEL}
            style={{ minHeight: 36, padding: "0 10px", borderRadius: 8, fontSize: 13, border: "1px solid var(--vault-border-strong)", background: "transparent", color: "var(--vault-text)", minWidth: 160 }} />
        </div>
      ) : null}
      <div className="nf-tabs" role="tablist" aria-label={label}>
        {families.map((f) => (
          <button key={f.key} type="button" role="tab" id={`tab-${label}-${f.key}`} aria-selected={f.key === fam.key} aria-controls={`panel-${label}-${f.key}`} className="nf-tab" onClick={() => setActive(f.key)}>
            {f.title}
          </button>
        ))}
      </div>
      {/* Every family's panel is in the static page; only the selected one is shown. A row (and the market beside it)
          never exists only after a click — the export carries all of them, as the one-market-truth guard requires. */}
      {families.filter((f) => staticPanels === "all" || f.key === fam.key).map((f) => {
        const rows = rowsOf(f.key);
        const total = (lists[f.key] ?? []).length;
        return (
          <div key={f.key} role="tabpanel" id={`panel-${label}-${f.key}`} aria-labelledby={`tab-${label}-${f.key}`} hidden={f.key !== fam.key}>
            {f.withheld ? (
              <p className="nf-withheld" data-withheld={f.key}><strong style={{ color: "var(--vault-text)" }}>Not published yet.</strong> {f.withheld}</p>
            ) : rows.length ? (
              <>
                <ol className="nf-rows">
                  {rows.map((r) => {
                    const lr = live ? liveIndex.get(`${r.player.playerId}|${LIVE_MARKET[f.key]}`)?.live : null;
                    const factual = lr && lr.phase !== "PRE" && lr.statValue != null ? { phase: lr.phase, value: lr.statValue } : null;
                    return <PlayerRow key={`${r.player.playerId}-${f.key}`} player={r.player} entry={r.entry} family={f} rank={r.rank} linkToGame={linkToGame} live={factual} />;
                  })}
                </ol>
                <p className="nf-faint" style={{ margin: "8px 0 0" }}>
                  {narrowed ? `${rows.length} of ${total} shown · ` : ""}{f.metric}{f.sourceLabel ? ` · ${f.sourceLabel}` : ""}{f.asOf ? ` · as of ${fmtAsOf(f.asOf)}` : ""}
                </p>
              </>
            ) : (
              <p className="nf-withheld">{narrowed ? "No published row matches this filter." : emptyText}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
