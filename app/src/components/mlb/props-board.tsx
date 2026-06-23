/**
 * MlbPropsBoard — the filterable/sortable/searchable MLB player-props board. Desktop = table, mobile =
 * cards. Honest: it shows the de-vigged MARKET-implied probability (no fabricated model %/edge until the
 * model layer is wired — those columns read "—" with a footnote). All data is the real ingested slate.
 */
"use client";

import { useMemo, useState } from "react";
import PlayerAvatar from "@/components/ui/player-avatar";

export interface BoardProp {
  player: string;
  market: string;
  marketLabel: string;
  group: string;
  selection: string;
  point: number | null;
  americanOdds: number;
  provider: string | null;
  matchup: string;
  gameId: string;
}

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const impliedPct = (a: number) => Math.round((1 / dec(a)) * 100);
const american = (a: number) => `${a > 0 ? "+" : ""}${a}`;

const GROUPS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "hr", label: "HR" },
  { key: "hits", label: "Hits" },
  { key: "bases", label: "Bases" },
  { key: "runs", label: "Runs/RBI" },
  { key: "pitchers", label: "Pitchers" },
];
const SORTS: Array<{ key: string; label: string }> = [
  { key: "implied", label: "Highest market %" },
  { key: "oddsDesc", label: "Highest odds" },
  { key: "oddsAsc", label: "Lowest odds" },
  { key: "player", label: "Player A–Z" },
];

export default function MlbPropsBoard({ props }: { props: BoardProp[] }) {
  const [group, setGroup] = useState("all");
  const [game, setGame] = useState("all");
  const [sort, setSort] = useState("implied");
  const [q, setQ] = useState("");

  const games = useMemo(() => Array.from(new Set(props.map((p) => p.matchup))).sort(), [props]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = props.filter((p) =>
      (group === "all" || p.group === group) &&
      (game === "all" || p.matchup === game) &&
      (!needle || p.player.toLowerCase().includes(needle) || p.matchup.toLowerCase().includes(needle)));
    r = [...r].sort((a, b) =>
      sort === "oddsDesc" ? b.americanOdds - a.americanOdds :
      sort === "oddsAsc" ? a.americanOdds - b.americanOdds :
      sort === "player" ? a.player.localeCompare(b.player) :
      impliedPct(b.americanOdds) - impliedPct(a.americanOdds));
    return r.slice(0, 150); // cap the rendered rows; filters narrow further
  }, [props, group, game, sort, q]);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {GROUPS.map((g) => (
            <button key={g.key} onClick={() => setGroup(g.key)} className="rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.08em]"
              style={{ fontSize: 9.5, cursor: "pointer", color: group === g.key ? "#120A07" : "var(--vault-text-mute)", background: group === g.key ? "var(--gtp-bank-heat)" : "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player or team…" aria-label="Search player or team"
            className="flex-1 min-w-[160px] rounded-[8px] px-3 py-1.5 text-[12px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--vault-border)", color: "var(--vault-text)" }} />
          <select value={game} onChange={(e) => setGame(e.target.value)} aria-label="Filter by game" className="rounded-[8px] px-2 py-1.5 text-[11.5px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--vault-border)", color: "var(--vault-text)", maxWidth: 200 }}>
            <option value="all">All games</option>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="rounded-[8px] px-2 py-1.5 text-[11.5px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--vault-border)", color: "var(--vault-text)" }}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          {rows.length} shown · market-implied % from real odds · model % / edge online when the model layer is wired · paper-only
        </span>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto rounded-[12px]" style={{ border: "1px solid var(--vault-rule)" }}>
        <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              {["Player", "Market", "Line", "Odds", "Market %", "Edge", "Conf", "Provider", "Game"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={`${p.player}:${p.market}:${i}`} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                <td className="px-3 py-2"><span className="flex items-center gap-2 min-w-0"><PlayerAvatar name={p.player} size={20} /><span className="break-words" style={{ color: "var(--vault-text)", fontWeight: 600 }}>{p.player}</span></span></td>
                <td className="px-3 py-2" style={{ color: "var(--vault-text-mute)" }}>{p.marketLabel}</td>
                <td className="px-3 py-2 font-mono tabular" style={{ color: "var(--vault-text-mute)" }}>{p.point != null ? p.point : "—"}</td>
                <td className="px-3 py-2 font-mono tabular" style={{ color: "var(--vault-text)" }}>{american(p.americanOdds)}</td>
                <td className="px-3 py-2 font-mono tabular" style={{ color: "var(--gtp-bank-heat)" }}>{impliedPct(p.americanOdds)}%</td>
                <td className="px-3 py-2 font-mono" style={{ color: "var(--vault-text-faint)" }}>—</td>
                <td className="px-3 py-2 font-mono" style={{ color: "var(--vault-text-faint)" }}>—</td>
                <td className="px-3 py-2 font-mono" style={{ color: "var(--vault-text-faint)" }}>{p.provider ?? "—"}</td>
                <td className="px-3 py-2 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{p.matchup}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden flex flex-col gap-2">
        {rows.map((p, i) => (
          <div key={`${p.player}:${p.market}:${i}`} className="rounded-[10px] px-3 py-2.5 flex items-start gap-2 min-w-0" style={{ background: "rgba(12,8,6,0.45)", border: "1px solid var(--vault-rule)" }}>
            <span className="mt-0.5 shrink-0"><PlayerAvatar name={p.player} size={22} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2"><span className="break-words font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{p.player}</span><span className="font-mono tabular shrink-0" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{american(p.americanOdds)}</span></span>
              <span className="block font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>{p.marketLabel}{p.point != null ? ` ${p.point}` : ""} · <span style={{ color: "var(--gtp-bank-heat)" }}>{impliedPct(p.americanOdds)}% mkt</span></span>
              <span className="block font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{p.matchup}{p.provider ? ` · ${p.provider}` : ""}</span>
            </span>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-center text-[12px] py-4" style={{ color: "var(--vault-text-faint)" }}>No props match these filters.</p> : null}
      </div>
    </div>
  );
}
