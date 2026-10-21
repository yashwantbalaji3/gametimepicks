"use client";
/**
 * /nba/projections — the projection-only player board's client island (§13 amendment A, founder decision 2026-10-20).
 *
 * Filters (matchup / team / player / stat group) and a reader's sort over rows the SERVER copied from the canonical lane
 * snapshot. The island changes which rows show and in what order — never a number. No position numbers, no highlight,
 * no badge; the default order is expected minutes. It imports only React and the import-free view ops, so nothing from
 * the snapshot producer (receipt hashing) reaches the browser (projection-board-client-imports.test.mjs).
 *
 * Layout: controls stack on a phone; the table scrolls inside its own container, so the page never scrolls sideways at
 * 320 px. No transitions or animation (prefers-reduced-motion has nothing to reduce).
 */
import React, { useId, useMemo, useState } from "react";

import { filterRows, sortRows, unpackBoard } from "@/lib/sports/nba/projection-board-ops.mjs";

export type BoardRow = { id: string; game: string; name: string; injury: string | null; team: string; teamName: string; min: number | null; v: (number | null)[] };
export type BoardOption = { id: string; label: string };
/** packBoard's wire format: teams once, rows as arrays (page weight — see projection-board-ops.mjs). */
export type PackedBoard = { t: [string, string, string][]; r: (string | number | null)[][] };
export type StatGroup = { id: string; label: string; cols: number[] };

const fmt = (v: number | null | undefined) => (v == null ? "—" : String(v));
const FIELD = "flex flex-col gap-1 min-w-0 text-[12px]";
const INPUT = "w-full min-w-0 min-h-[40px] rounded-md px-2 text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
const INPUT_STYLE = { border: "1px solid var(--vault-border)", background: "var(--vault-panel)", color: "var(--vault-text)", outlineColor: "var(--vault-gold-bright)" };
// Row and cell styling lives on the table (one class string), not on each of the slate's ~250 rows: the row rule,
// the left-aligned player name (row header) and team code (first data cell) are table-level selectors.
const TABLE = "w-full text-[13px] [&_th]:font-medium [&_th]:text-right [&_td]:text-right [&_td]:tabular-nums [&_th]:px-2 [&_td]:px-2 [&_td]:py-1 [&_th]:py-1 [&_th]:whitespace-nowrap [&_tbody_tr]:border-t [&_tbody_tr]:border-[color:var(--vault-border)] [&_tbody_th]:text-left [&_tbody_th]:font-normal [&_tbody_td:first-of-type]:text-left";

export default function ProjectionBoard({ board, stats, groups, matchups, teams }: {
  board: PackedBoard;
  stats: (readonly [string, string])[];
  groups: StatGroup[];
  matchups: BoardOption[];
  teams: BoardOption[];
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rows: BoardRow[] = useMemo(() => unpackBoard(board), [board]);
  const [matchup, setMatchup] = useState("");
  const [team, setTeam] = useState("");
  const [player, setPlayer] = useState("");
  const [group, setGroup] = useState(groups[0]?.id ?? "all");
  const [sortKey, setSortKey] = useState<number | null>(null);
  const [dir, setDir] = useState<"desc" | "asc">("desc");

  const cols = useMemo(() => groups.find((g) => g.id === group)?.cols ?? [], [groups, group]);
  const shown = useMemo(() => sortRows(filterRows(rows, { matchup, team, player }), { key: sortKey != null && cols.includes(sortKey) ? sortKey : null, dir }), [rows, matchup, team, player, sortKey, dir, cols]);
  const activeSort = sortKey != null && cols.includes(sortKey) ? sortKey : null;
  const sortBy = (i: number) => {
    if (activeSort === i) setDir(dir === "desc" ? "asc" : "desc");
    else { setSortKey(i); setDir("desc"); }
  };
  const teamOptions = matchup ? teams.filter((t) => rows.some((r) => r.game === matchup && r.team === t.id)) : teams;

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <form className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 min-w-0" role="search" aria-label="Filter the player board" onSubmit={(e) => e.preventDefault()}>
        <label className={FIELD} htmlFor={`${uid}-m`} style={{ color: "var(--vault-text-mute)" }}>
          Matchup
          <select id={`${uid}-m`} className={INPUT} style={INPUT_STYLE} value={matchup} onChange={(e) => { setMatchup(e.target.value); setTeam(""); }}>
            <option value="">All games</option>
            {matchups.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className={FIELD} htmlFor={`${uid}-t`} style={{ color: "var(--vault-text-mute)" }}>
          Team
          <select id={`${uid}-t`} className={INPUT} style={INPUT_STYLE} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">All teams</option>
            {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className={FIELD} htmlFor={`${uid}-p`} style={{ color: "var(--vault-text-mute)" }}>
          Player
          <input id={`${uid}-p`} type="search" className={INPUT} style={INPUT_STYLE} value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Name" autoComplete="off" />
        </label>
        <label className={FIELD} htmlFor={`${uid}-s`} style={{ color: "var(--vault-text-mute)" }}>
          Stat
          <select id={`${uid}-s`} className={INPUT} style={INPUT_STYLE} value={group} onChange={(e) => setGroup(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
        <p className="m-0" aria-live="polite">
          {shown.length} of {rows.length} players · order: {activeSort == null ? "expected minutes" : `${stats[activeSort][1]}, ${dir === "desc" ? "high to low" : "low to high"} (your sort)`}
        </p>
        {activeSort != null ? (
          <button type="button" className="underline min-h-[32px] px-1 focus-visible:outline focus-visible:outline-2" style={{ color: "var(--vault-text)", outlineColor: "var(--vault-gold-bright)" }} onClick={() => setSortKey(null)}>
            Back to expected-minutes order
          </button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="m-0 rounded-md p-3 text-[13px]" role="status" style={{ border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}>No player matches these filters.</p>
      ) : (
        <div className="overflow-x-auto max-w-full rounded-md focus-visible:outline focus-visible:outline-2" style={{ border: "1px solid var(--vault-border)", outlineColor: "var(--vault-gold-bright)" }} tabIndex={0} role="region" aria-label="Player board table (scrolls sideways on narrow screens)">
          <table className={TABLE}>
            <caption className="sr-only">Frozen pregame experimental medians, {rows.length} players. Sort buttons are in the column headers.</caption>
            <thead style={{ color: "var(--vault-text-mute)" }}>
              <tr>
                <th scope="col" className="!text-left">Player</th>
                <th scope="col" className="!text-left">Team</th>
                <th scope="col">Min</th>
                {cols.map((i) => (
                  <th key={stats[i][0]} scope="col" aria-sort={activeSort === i ? (dir === "desc" ? "descending" : "ascending") : "none"}>
                    <button type="button" className="font-medium min-h-[32px] px-1 underline decoration-dotted focus-visible:outline focus-visible:outline-2" style={{ color: "var(--vault-text)", outlineColor: "var(--vault-gold-bright)" }} onClick={() => sortBy(i)} aria-label={`Sort by ${stats[i][1]}`}>
                      {stats[i][1]}{activeSort === i ? (dir === "desc" ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ color: "var(--vault-text)" }}>
              {shown.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}{r.injury ? ` · ${r.injury}` : ""}</th>
                  <td title={r.teamName}>{r.team}</td>
                  <td>{fmt(r.min)}</td>
                  {cols.map((i) => <td key={stats[i][0]}>{fmt(r.v[i])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
