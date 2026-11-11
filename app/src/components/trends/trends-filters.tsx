"use client";
/**
 * Shared Trends filters (NBA slice 2 2026-11-10; shared 2026-11-11): team, position, stat, home/away, and the sort — the
 * sport's own order (NBA expected minutes, NFL projected attempts; the table's order, the default) or a stat's MODEL
 * PROJECTION. NFL adds "5 of 5 / 4+ of 5 / 3+ of 5": games above the chosen stat's threshold in the last 5 (rows carry
 * data-h5-<stat>; history, never a probability). Acts on the server-rendered rows' data attributes (data-team / data-pos /
 * data-home / data-<stat> / data-trn-i); it computes no figure and fetches nothing. The numbered rank (#) is always the
 * sport's order — sorting by a projection never renumbers anyone, and never sorts by the history counts. With JavaScript
 * off the full table simply shows, in its default order.
 */
import { useEffect, useState } from "react";
import type { TrendsFilterSpec } from "@/lib/trends/contract";

export default function TrendsFilters({ teams, positions, spec }: { teams: string[]; positions: string[]; spec: TrendsFilterSpec }) {
  const STATS = spec.stats;
  const [team, setTeam] = useState("");
  const [pos, setPos] = useState("");
  const [stat, setStat] = useState("");
  const [side, setSide] = useState("");
  const [sort, setSort] = useState("min");
  const [hits, setHits] = useState("");
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const table = document.getElementById("trends-table");
    const body = table?.querySelector("tbody");
    if (!table || !body) return;
    if (stat) table.setAttribute("data-trn-only", stat); else table.removeAttribute("data-trn-only");
    const need = stat && hits ? Number(hits) : 0;
    const rows = [...body.querySelectorAll<HTMLTableRowElement>("tr[data-trn-player]")];
    let n = 0;
    for (const r of rows) {
      const d = r.dataset;
      const h5 = need ? d[`h5${stat.toLowerCase().replace(/^./, (c) => c.toUpperCase())}`] : "";
      const on = (!team || d.team === team) && (!pos || d.pos === pos) && (!side || d.home === side) && (!need || (h5 !== "" && h5 != null && Number(h5) >= need));
      r.hidden = !on;
      if (on) n += 1;
    }
    const idx = (r: HTMLTableRowElement) => Number(r.dataset.trnI);
    const key = sort.toLowerCase();
    const med = (r: HTMLTableRowElement) => (sort === "min" || !r.dataset[key] ? NaN : Number(r.dataset[key]));
    rows.sort((a, b) => {
      if (sort === "min") return idx(a) - idx(b);
      const x = med(a), y = med(b);
      if (Number.isNaN(x) !== Number.isNaN(y)) return Number.isNaN(x) ? 1 : -1;
      return (Number.isNaN(x) ? 0 : y - x) || idx(a) - idx(b);
    });
    for (const r of rows) body.appendChild(r);
    setShown(n);
  }, [team, pos, stat, side, sort, hits]);

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
      {sel("Stat", stat, setStat, [["", STATS.map(([, l]) => l).join(" · ")], ...STATS.map(([k, l]): [string, string] => [k, l])])}
      {sel("Venue", side, setSide, [["", "Home and away"], ["1", "Home"], ["0", "Away"]])}
      {sel("Sort", sort, setSort, [["min", spec.orderLabel], ...STATS.map(([k, l]): [string, string] => [k, `${l} projection`])])}
      {spec.hitFilter ? sel("Last 5", hits, setHits, stat ? [["", "Any"], ["5", "5 of 5 above"], ["4", "4+ of 5 above"], ["3", "3+ of 5 above"]] : [["", "Choose a stat first"]]) : null}
      <output className="trn-sub" aria-live="polite">{shown == null ? "" : `${shown} player${shown === 1 ? "" : "s"} shown`}</output>
    </form>
  );
}
