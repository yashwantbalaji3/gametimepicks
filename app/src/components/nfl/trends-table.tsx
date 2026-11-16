"use client";
/**
 * NFL TRENDS TABLE — client-side filters over the build-time rows (lib/sports/nfl/trends-rows.mjs). Nothing here fetches
 * or computes a number the server did not ship; filters and sorting are presentation only.
 * LINE GATE: a row with `lineState: null` is behind a closed line gate (trends-rows.mjs) and prints nothing about a line;
 * with no open row at all the Line column itself is not rendered.
 */
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { BOOK_AVAILABILITY_NOTE } from "@/lib/sports/odds/eligible-operators.mjs";

export type TrendRow = {
  eventId: string; kickoffUtc: string; matchup: string; opponent: string; playerId: string; name: string; team: string; eligibility: string | null;
  family: string; label: string; last5: (number | null)[]; games5: number; recorded5: number; noStatLine5: number; median5: number | null; median10: number | null; games10: number;
  tdGames5: number | null; projection: number | null; probability: number | null; vsProjection: number | null; lineState: string | null; line: string | null; badge: string | null; tier: string | null;
};

const SORTS = {
  kickoff: { label: "Kickoff", fn: (_a: TrendRow, _b: TrendRow) => 0 }, /* rows arrive in kickoff order */
  above: { label: "Recent results above projection", fn: (a: TrendRow, b: TrendRow) => (b.vsProjection ?? -1e9) - (a.vsProjection ?? -1e9) },
  below: { label: "Recent results below projection", fn: (a: TrendRow, b: TrendRow) => (a.vsProjection ?? 1e9) - (b.vsProjection ?? 1e9) },
  median: { label: "Last-5 median", fn: (a: TrendRow, b: TrendRow) => (b.median5 ?? -1) - (a.median5 ?? -1) },
} as const;
const f1 = (v: number | null) => (v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1));
const CSS = `
.nt-f{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}
.nt-f label{display:grid;gap:3px;font-size:11.5px;color:var(--vault-text-faint)}
.nt-f select{min-height:40px;background:var(--vault-bg);color:var(--vault-text);border:1px solid var(--vault-border);border-radius:8px;padding:4px 8px;font-size:13px}
.nt-n{font-size:12.5px;color:var(--vault-text-mute);margin:0 0 6px}
.nt-s{overflow-x:auto;border:1px solid var(--vault-border);border-radius:10px}
.nt-t{border-collapse:collapse;width:100%;min-width:680px;font-size:12.5px}
.nt-t th{position:sticky;top:0;background:var(--vault-bg);color:var(--vault-text-faint);font-weight:500;text-align:right;padding:6px 8px;border-bottom:1px solid var(--vault-border)}
.nt-t td{padding:6px 8px;text-align:right;border-bottom:1px solid var(--vault-border);color:var(--vault-text-mute);font-variant-numeric:tabular-nums}
.nt-t th:nth-child(-n+2),.nt-t td:nth-child(-n+2){text-align:left}
.nt-t td:first-child a{color:var(--vault-text);font-weight:600}
.nt-g{color:var(--vault-text-faint);font-size:11.5px}
.nt-up{color:var(--vault-gold-bright)}
`;

export default function NflTrendsTable({ rows }: { rows: TrendRow[] }) {
  const games = useMemo(() => [...new Map(rows.map((r) => [r.eventId, r.matchup])).entries()], [rows]);
  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].sort(), [rows]);
  const markets = useMemo(() => [...new Map(rows.map((r) => [r.family, r.label])).entries()], [rows]);
  const [game, setGame] = useState("");
  const [team, setTeam] = useState("");
  const [market, setMarket] = useState("player_reception_yds");
  const [full, setFull] = useState("5");
  const [sort, setSort] = useState<keyof typeof SORTS>("kickoff");
  const shown = useMemo(() => {
    const out = rows.filter((r) => (!game || r.eventId === game) && (!team || r.team === team) && (!market || r.family === market) && (full !== "5" || (r.games5 === 5 && r.noStatLine5 === 0)));
    return sort === "kickoff" ? out : [...out].sort(SORTS[sort].fn);
  }, [rows, game, team, market, full, sort]);
  const isTd = market === "anytime_td";
  /* a row whose line caption names a sportsbook is on screen ⇒ the required availability disclosure prints with it */
  const namesBook = shown.some((r) => r.line);
  /* any row behind an OPEN line gate ⇒ the Line column exists; none ⇒ no line column, no line wording */
  const lineCol = rows.some((r) => r.lineState != null);
  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="nt-f" role="group" aria-label="Filters">
        <label>Game<select value={game} onChange={(e) => setGame(e.target.value)}><option value="">All games</option>{games.map(([id, m]) => <option key={id} value={id}>{m}</option>)}</select></label>
        <label>Team<select value={team} onChange={(e) => setTeam(e.target.value)}><option value="">All teams</option>{teams.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Market<select value={market} onChange={(e) => setMarket(e.target.value)}>{markets.map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="">All markets</option></select></label>
        <label>Sample<select value={full} onChange={(e) => setFull(e.target.value)}><option value="5">5 complete games only</option><option value="any">Any sample</option></select></label>
        <label>Sort<select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}>{Object.entries(SORTS).filter(([k]) => !(isTd && (k === "above" || k === "below"))).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
      </div>
      <p className="nt-n" aria-live="polite">{shown.length} row{shown.length === 1 ? "" : "s"}</p>
      <div className="nt-s">
        <table className="nt-t">
          <caption className="sr-only">Recent results and official projection by player</caption>
          <thead><tr><th>Player</th><th>Market</th><th>Last 5 (newest first)</th><th>L5 median</th><th>L10 median</th><th>Official projection</th><th>L5 − projection</th>{lineCol ? <th>Line</th> : null}</tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.eventId}:${r.playerId}:${r.family}`} data-trend-row={r.playerId}>
                <td><Link href={`/nfl/game/${r.eventId}/#recent-form`}>{r.name}</Link><div className="nt-g">{r.team} vs {r.opponent}{r.eligibility && r.eligibility !== "ELIGIBLE" ? ` · ${r.eligibility.toLowerCase()}` : ""}</div></td>
                <td>{r.label}</td>
                <td>{r.last5.map((v) => (v == null ? "–" : v)).join(" · ") || "—"}{r.games5 < 5 ? <div className="nt-g">{r.games5} game{r.games5 === 1 ? "" : "s"} on record</div> : r.noStatLine5 ? <div className="nt-g">{r.noStatLine5} without a stat line</div> : null}</td>
                <td>{r.family === "anytime_td" ? `${r.tdGames5 ?? 0} of ${r.recorded5}` : f1(r.median5)}</td>
                <td>{r.family === "anytime_td" ? "" : f1(r.median10)}</td>
                <td>{r.family === "anytime_td" ? (r.probability != null ? `${(r.probability * 100).toFixed(0)}% to score` : "—") : f1(r.projection)}</td>
                <td className={r.vsProjection != null && r.vsProjection > 0 ? "nt-up" : undefined}>{r.vsProjection == null ? "—" : `${r.vsProjection > 0 ? "+" : ""}${f1(r.vsProjection)}`}</td>
                {!lineCol ? null : r.lineState == null ? <td>—</td> : <td>{r.line
                  ? <>{r.badge ? `${r.badge} over` : <span className="nt-g">partial record</span>}<div className="nt-g">vs {r.line}</div></>
                  : <span className="nt-g">{r.lineState === "WITHHELD" ? "withheld" : r.lineState === "NOT_BEFORE_KICKOFF" ? "no pre-kickoff capture" : "not captured"}</span>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {namesBook ? <p className="nt-g" data-book-availability-note style={{ marginTop: 6 }}>{BOOK_AVAILABILITY_NOTE}</p> : null}
    </div>
  );
}
