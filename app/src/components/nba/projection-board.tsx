"use client";
/**
 * /nba/projections — the projection-only player board's client island (§13 amendment A, founder decision 2026-10-20).
 *
 * Filters (matchup / team / player / stat group) and a reader's sort over rows the SERVER copied from the canonical lane
 * snapshot. The island changes which rows show and in what order — never a number. No position numbers, no highlight,
 * no badge; the default order is expected minutes. It imports only React and the import-free view ops, so nothing from
 * the snapshot producer (receipt hashing) reaches the browser (projection-board-client-imports.test.mjs).
 *
 * Postgame (overnight sprint 2026-10-23): when the packed board carries actuals (`a`, projection-board-ops.mjs), each
 * shown stat becomes a pair of columns — the Official Forecast (frozen pregame) and the Actual from the final box score
 * — and Min shows expected and actual minutes. The actual columns are tinted by a <colgroup> (once per table, not per
 * cell — page weight). A missing actual (did not play, not in the box score, no final yet) is a dash, never 0.
 *
 * Public-readiness pass (founder mandate 2026-10-24):
 *   - game navigation: one chip per game (short matchup + status on the reader's clock + its actual state) toggles the
 *     game filter; the chips scroll sideways in their own row;
 *   - every column sorts, minutes included (expected and, postgame, actual);
 *   - the table scrolls in its own bounded box, so its header row and the player column stay in view (sticky), and
 *     every sort button is a 44 px target;
 *   - postgame, a row whose game has no official final yet reads "awaiting final" in its actual-minutes cell — an
 *     explicit state, never a blank, never a zero.
 *
 * Layout: controls stack on a phone; the table scrolls inside its own container, so the page never scrolls sideways at
 * 320 px. No transitions or animation (prefers-reduced-motion has nothing to reduce).
 */
import React, { useEffect, useId, useMemo, useState } from "react";

import { filterRows, sortRows, unpackBoard, gameStatusOnClock, GAME_STATUS_LABEL } from "@/lib/sports/nba/projection-board-ops.mjs";

export type BoardRow = { id: string; game: string; name: string; injury: string | null; team: string; teamName: string; min: number | null; v: (number | null)[]; am?: number | "DNP" | null; aw?: boolean };
/** One game chip: id, short matchup ("BOS @ DET"), build-time status code, tip-off instant, optional actual-state note. */
export type BoardGameNav = [string, string, "upcoming" | "started" | "final" | "postponed", string, string?];
type SortKey = number | "min" | "am";
export type BoardOption = { id: string; label: string };
/** packBoard's wire format: teams once, rows as arrays (page weight — see projection-board-ops.mjs). */
export type PackedBoard = { t: [string, string, string][]; r: (string | number | null)[][]; a?: (0 | 1 | (number | string | null)[])[] };
export type StatGroup = { id: string; label: string; cols: number[] };

const fmt = (v: number | string | null | undefined) => (v == null ? "—" : String(v));
const FIELD = "flex flex-col gap-1 min-w-0 text-[12px]";
const INPUT = "w-full min-w-0 min-h-[40px] rounded-md px-2 text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
const INPUT_STYLE = { border: "1px solid var(--vault-border)", background: "var(--vault-panel)", color: "var(--vault-text)", outlineColor: "var(--vault-gold-bright)" };
// Row and cell styling lives on the table (one class string), not on each of the slate's ~250 rows: the row rule,
// the left-aligned player name (row header) and team code (first data cell) are table-level selectors. Sticky: every
// header cell sticks to the top of the table's own scroll box and the player column to its left edge, on opaque panels.
const TABLE = "w-full text-[13px] [&_th]:font-medium [&_th]:text-right [&_td]:text-right [&_td]:tabular-nums [&_th]:px-2 [&_td]:px-2 [&_td]:py-1 [&_tbody_th]:py-1 [&_th]:whitespace-nowrap [&_tbody_tr]:border-t [&_tbody_tr]:border-[color:var(--vault-border)] [&_tbody_th]:text-left [&_tbody_th]:font-normal [&_tbody_th]:min-w-[8rem] [&_tbody_th]:!whitespace-normal [&_tbody_td:first-of-type]:text-left [&_thead_th]:sticky [&_thead_th]:z-10 [&_thead_th]:h-11 [&_thead_th]:bg-[var(--vault-panel-elevated)] [&_tbody_th]:sticky [&_tbody_th]:left-0 [&_tbody_th]:z-[5] [&_tbody_th]:bg-[var(--vault-panel)]";
const STICKY_CORNER = "!text-left left-0 !z-20";
// Header rows stick at the box's block start; the postgame second row sits under the first (h-11 = 2.75rem).
const ROW1 = "[inset-block-start:0]";
const ROW2 = "[inset-block-start:2.75rem]";

const ACTUAL_COL = { background: "color-mix(in srgb, var(--vault-gold-bright) 9%, transparent)" };

export default function ProjectionBoard({ board, stats, groups, matchups, teams, defaultGroup, games = [] }: {
  board: PackedBoard;
  /** Game chips (server-built from the snapshot + the build-time status): short, one per game. */
  games?: BoardGameNav[];
  stats: (readonly [string, string])[];
  groups: StatGroup[];
  matchups: BoardOption[];
  teams: BoardOption[];
  /** The stat group shown first (the postgame board opens on PTS · REB · AST · 3PM beside their actuals). */
  defaultGroup?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rows: BoardRow[] = useMemo(() => unpackBoard(board), [board]);
  const [matchup, setMatchup] = useState("");
  const [team, setTeam] = useState("");
  const [player, setPlayer] = useState("");
  const [group, setGroup] = useState(defaultGroup ?? groups[0]?.id ?? "all");
  const post = Array.isArray(board.a);
  const n = stats.length;
  const label = (i: SortKey) => (i === "min" ? "expected minutes" : i === "am" ? "actual minutes" : i < n ? stats[i][1] : `${stats[i - n][1]} actual`);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  // The reader's clock for the game chips (a build-time "Upcoming" may become "Started"; the first render is the build's).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!games.some((g) => g[2] === "upcoming")) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [games]);
  const [dir, setDir] = useState<"desc" | "asc">("desc");

  const cols = useMemo(() => groups.find((g) => g.id === group)?.cols ?? [], [groups, group]);
  // Postgame: every shown stat is a pair (frozen value i, actual i + n); either may be the reader's sort.
  const sortable = useMemo<SortKey[]>(() => ["min", ...(post ? ["am" as const, ...cols.flatMap((i) => [i, i + n])] : cols)], [cols, post, n]);
  const shown = useMemo(() => sortRows(filterRows(rows, { matchup, team, player }), { key: sortKey != null && sortable.includes(sortKey) ? sortKey : null, dir }), [rows, matchup, team, player, sortKey, dir, sortable]);
  const activeSort = sortKey != null && sortable.includes(sortKey) ? sortKey : null;
  const sortBy = (i: SortKey) => {
    if (activeSort === i) setDir(dir === "desc" ? "asc" : "desc");
    else { setSortKey(i); setDir("desc"); }
  };
  // One sortable column header (the frozen value or, postgame, its actual). A plain call, not a component, so a
  // re-render keeps the same button element (and the keyboard focus on it).
  const sortHead = (i: SortKey, text: string, row2 = false) => (
    <th key={i} scope="col" className={row2 ? ROW2 : ROW1} aria-sort={activeSort === i ? (dir === "desc" ? "descending" : "ascending") : "none"}>
      <button type="button" className="font-medium min-h-[44px] min-w-[44px] px-1 underline decoration-dotted focus-visible:outline focus-visible:outline-2" style={{ color: "var(--vault-text)", outlineColor: "var(--vault-gold-bright)" }} onClick={() => sortBy(i)} aria-label={`Sort by ${label(i)}`}>
        {text}{activeSort === i ? (dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
  const teamOptions = matchup ? teams.filter((t) => rows.some((r) => r.game === matchup && r.team === t.id)) : teams;

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {games.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto min-w-0 pb-1" role="group" aria-label="Games: show one game">
          {games.map(([id, short, built, tip, note]) => (
            <button key={id} type="button" aria-pressed={matchup === id} onClick={() => { setMatchup(matchup === id ? "" : id); setTeam(""); }}
              className="shrink-0 min-h-[44px] rounded-full px-3 text-[12.5px] text-left focus-visible:outline focus-visible:outline-2"
              style={{ border: `1px solid ${matchup === id ? "var(--vault-gold-bright)" : "var(--vault-border)"}`, color: "var(--vault-text)", outlineColor: "var(--vault-gold-bright)" }}>
              <strong>{short}</strong> · {GAME_STATUS_LABEL[gameStatusOnClock(built, tip, now) as keyof typeof GAME_STATUS_LABEL]}{note ? ` · ${note}` : ""}
            </button>
          ))}
        </div>
      ) : null}
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
          {shown.length} of {rows.length} players · order: {activeSort == null ? "expected minutes" : `${label(activeSort)}, ${dir === "desc" ? "high to low" : "low to high"}`}
        </p>
        {activeSort != null ? (
          <button type="button" className="underline min-h-[44px] px-1 focus-visible:outline focus-visible:outline-2" style={{ color: "var(--vault-text)", outlineColor: "var(--vault-gold-bright)" }} onClick={() => setSortKey(null)}>
            Back to expected-minutes order
          </button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="m-0 rounded-md p-3 text-[13px]" role="status" style={{ border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}>No player matches these filters.</p>
      ) : (
        <div className="overflow-auto max-h-[75vh] max-w-full rounded-md focus-visible:outline focus-visible:outline-2" style={{ border: "1px solid var(--vault-border)", outlineColor: "var(--vault-gold-bright)" }} tabIndex={0} role="region" aria-label="Player board table (scrolls inside this box; the header row and player column stay in view)">
          <table className={TABLE}>
            <caption className="sr-only">{post ? `Forecast vs. Actual: Official Forecast (frozen pregame) medians beside each player's actual figures from the final box score, ${rows.length} players.` : `Official Forecast (frozen pregame) medians, ${rows.length} players.`} Sort buttons are in the column headers.</caption>
            {post ? (
              <colgroup>
                <col span={3} /><col style={ACTUAL_COL} />
                {cols.map((i) => <React.Fragment key={stats[i][0]}><col /><col style={ACTUAL_COL} /></React.Fragment>)}
              </colgroup>
            ) : null}
            <thead style={{ color: "var(--vault-text-mute)" }}>
              <tr>
                <th scope="col" className={`${STICKY_CORNER} ${ROW1}`} rowSpan={post ? 2 : undefined}>Player</th>
                <th scope="col" className={`!text-left ${ROW1}`} rowSpan={post ? 2 : undefined}>Team</th>
                {post ? <th scope="colgroup" colSpan={2} className={`!text-center ${ROW1}`}>Min</th> : sortHead("min", "Min")}
                {post
                  ? cols.map((i) => <th key={stats[i][0]} scope="colgroup" colSpan={2} className={`!text-center ${ROW1}`}>{stats[i][1]}</th>)
                  : cols.map((i) => sortHead(i, stats[i][1]))}
              </tr>
              {post ? (
                <tr>
                  {sortHead("min", "Exp.", true)}
                  {sortHead("am", "Actual", true)}
                  {cols.flatMap((i) => [sortHead(i, "Forecast", true), sortHead(i + n, "Actual", true)])}
                </tr>
              ) : null}
            </thead>
            <tbody style={{ color: "var(--vault-text)" }}>
              {shown.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}{r.injury ? ` · ${r.injury}` : ""}</th>
                  <td title={r.teamName}>{r.team}</td>
                  <td>{fmt(r.min)}</td>
                  {post ? <td>{r.aw ? "awaiting final" : fmt(r.am)}</td> : null}
                  {post
                    ? cols.map((i) => <React.Fragment key={stats[i][0]}><td>{fmt(r.v[i])}</td><td>{fmt(r.v[i + n])}</td></React.Fragment>)
                    : cols.map((i) => <td key={stats[i][0]}>{fmt(r.v[i])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
