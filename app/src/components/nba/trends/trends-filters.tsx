"use client";
/**
 * /trends filters (slice 2, 2026-11-10): team, position, stat, home/away, and the sort — tonight's expected minutes (the
 * table's own order, the default) or a stat's MODEL PROJECTION median. Acts on the server-rendered rows' data attributes
 * (data-team / data-pos / data-home / data-pts|reb|ast / data-trn-i); it computes no figure and fetches nothing. The
 * numbered rank (#) is always the minutes order — sorting by a median never renumbers anyone, and never sorts by the
 * history counts. With JavaScript off the full table simply shows, in its default order.
 */
import { useEffect, useState } from "react";

type Stat = "pts" | "reb" | "ast";
const STATS: readonly [Stat, string][] = [["pts", "PTS"], ["reb", "REB"], ["ast", "AST"]];

export default function TrendsFilters({ teams, positions }: { teams: string[]; positions: string[] }) {
  const [team, setTeam] = useState("");
  const [pos, setPos] = useState("");
  const [stat, setStat] = useState<"" | Stat>("");
  const [side, setSide] = useState("");
  const [sort, setSort] = useState<"min" | Stat>("min");
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const table = document.getElementById("trends-table");
    const body = table?.querySelector("tbody");
    if (!table || !body) return;
    if (stat) table.setAttribute("data-trn-only", stat); else table.removeAttribute("data-trn-only");
    const rows = [...body.querySelectorAll<HTMLTableRowElement>("tr[data-trn-player]")];
    let n = 0;
    for (const r of rows) {
      const d = r.dataset;
      const on = (!team || d.team === team) && (!pos || d.pos === pos) && (!side || d.home === side);
      r.hidden = !on;
      if (on) n += 1;
    }
    const idx = (r: HTMLTableRowElement) => Number(r.dataset.trnI);
    const med = (r: HTMLTableRowElement) => (sort === "min" || r.dataset[sort] === "" ? NaN : Number(r.dataset[sort]));
    rows.sort((a, b) => {
      if (sort === "min") return idx(a) - idx(b);
      const x = med(a), y = med(b);
      if (Number.isNaN(x) !== Number.isNaN(y)) return Number.isNaN(x) ? 1 : -1;
      return (Number.isNaN(x) ? 0 : y - x) || idx(a) - idx(b);
    });
    for (const r of rows) body.appendChild(r);
    setShown(n);
  }, [team, pos, stat, side, sort]);

  const sel = (label: string, value: string, set: (v: string) => void, opts: [string, string][]) => (
    <label className="trn-filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  return (
    <form className="trn-filters" aria-label="Filter and sort players" onSubmit={(e) => e.preventDefault()}>
      {sel("Team", team, setTeam, [["", "All teams"], ...teams.map((t): [string, string] => [t, t])])}
      {sel("Position", pos, setPos, [["", "All"], ...positions.map((p): [string, string] => [p, p])])}
      {sel("Stat", stat, (v) => setStat(v as "" | Stat), [["", "PTS · REB · AST"], ...STATS])}
      {sel("Venue", side, setSide, [["", "Home and away"], ["1", "Home"], ["0", "Away"]])}
      {sel("Sort", sort, (v) => setSort(v as "min" | Stat), [["min", "Expected minutes"], ...STATS.map(([k, l]): [string, string] => [k, `${l} projection`])])}
      <output className="trn-sub" aria-live="polite">{shown == null ? "" : `${shown} player${shown === 1 ? "" : "s"} shown`}</output>
    </form>
  );
}
