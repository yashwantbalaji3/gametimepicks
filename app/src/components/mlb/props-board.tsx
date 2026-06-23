/**
 * MlbPropsBoard — the filterable/sortable/searchable MLB player-props board. Desktop = table, mobile =
 * cards. Honest: it shows the de-vigged MARKET-implied probability (no fabricated model %/edge until the
 * model layer is wired — those columns read "—" with a footnote). All data is the real ingested slate.
 */
"use client";

import { useMemo, useState } from "react";
import PlayerAvatar from "@/components/ui/player-avatar";
import TeamLogo from "@/components/team-logo";

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
  photoUrl?: string | null;
  teamAbbr?: string | null;
}

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const impliedPct = (a: number) => Math.round((1 / dec(a)) * 100);
const american = (a: number) => `${a > 0 ? "+" : ""}${a}`;
/** Confidence from market-implied probability (no model yet): chalkier = higher confidence. */
const confOf = (a: number): "low" | "medium" | "high" => { const p = 1 / dec(a); return p >= 0.55 ? "high" : p >= 0.35 ? "medium" : "low"; };
const CONF_PILL = {
  high: { fg: "var(--vault-success)", bg: "color-mix(in srgb, var(--vault-success) 14%, transparent)" },
  medium: { fg: "#e7b15a", bg: "rgba(231,177,90,0.13)" },
  low: { fg: "var(--vault-text-faint)", bg: "rgba(255,255,255,0.05)" },
} as const;

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
  { key: "confidence", label: "Highest confidence" },
  { key: "oddsDesc", label: "Highest odds" },
  { key: "oddsAsc", label: "Lowest odds" },
  { key: "player", label: "Player A–Z" },
];
const ODDS_RANGES: Array<{ key: string; label: string; test: (a: number) => boolean }> = [
  { key: "all", label: "Any odds", test: () => true },
  { key: "fav", label: "Favorites (≤ −110)", test: (a) => a <= -110 },
  { key: "even", label: "−110 to +200", test: (a) => a > -110 && a <= 200 },
  { key: "plus", label: "+200 to +600", test: (a) => a > 200 && a <= 600 },
  { key: "long", label: "Longshots (> +600)", test: (a) => a > 600 },
];
const CONFS = [
  { key: "all", label: "Any" }, { key: "high", label: "High" }, { key: "medium", label: "Medium" }, { key: "low", label: "Low" },
];

export default function MlbPropsBoard({ props }: { props: BoardProp[] }) {
  const [group, setGroup] = useState("all");
  const [game, setGame] = useState("all");
  const [sort, setSort] = useState("implied");
  const [oddsRange, setOddsRange] = useState("all");
  const [conf, setConf] = useState("all");
  const [q, setQ] = useState("");

  const games = useMemo(() => Array.from(new Set(props.map((p) => p.matchup))).sort(), [props]);
  const oddsTest = ODDS_RANGES.find((r) => r.key === oddsRange)?.test ?? (() => true);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = props.filter((p) =>
      (group === "all" || p.group === group) &&
      (game === "all" || p.matchup === game) &&
      (oddsRange === "all" || oddsTest(p.americanOdds)) &&
      (conf === "all" || confOf(p.americanOdds) === conf) &&
      (!needle || p.player.toLowerCase().includes(needle) || p.matchup.toLowerCase().includes(needle) || (p.teamAbbr ?? "").toLowerCase().includes(needle)));
    r = [...r].sort((a, b) =>
      sort === "oddsDesc" ? b.americanOdds - a.americanOdds :
      sort === "oddsAsc" ? a.americanOdds - b.americanOdds :
      sort === "player" ? a.player.localeCompare(b.player) :
      impliedPct(b.americanOdds) - impliedPct(a.americanOdds)); // implied + confidence both rank by prob
    return r.slice(0, 150); // cap the rendered rows; filters narrow further
  }, [props, group, game, sort, oddsRange, conf, oddsTest, q]);

  const selStyle = { background: "rgba(255,255,255,0.03)", border: "1px solid var(--vault-border)", color: "var(--vault-text)" } as const;
  const reset = () => { setGroup("all"); setGame("all"); setSort("implied"); setOddsRange("all"); setConf("all"); setQ(""); };
  const activeFilters = (group !== "all" ? 1 : 0) + (game !== "all" ? 1 : 0) + (oddsRange !== "all" ? 1 : 0) + (conf !== "all" ? 1 : 0) + (q.trim() ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls — sticky so filters stay reachable while scrolling the board. */}
      <div className="flex flex-col gap-2 rounded-[12px] px-2.5 py-2.5" style={{ position: "sticky", top: 4, zIndex: 5, background: "rgba(18,11,8,0.96)", backdropFilter: "blur(6px)", border: "1px solid var(--vault-rule)" }}>
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
            className="flex-1 min-w-[150px] rounded-[8px] px-3 py-1.5 text-[12px]" style={selStyle} />
          <select value={game} onChange={(e) => setGame(e.target.value)} aria-label="Filter by game" className="rounded-[8px] px-2 py-1.5 text-[11.5px]" style={{ ...selStyle, maxWidth: 200 }}>
            <option value="all">All games</option>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={oddsRange} onChange={(e) => setOddsRange(e.target.value)} aria-label="Filter by odds range" className="rounded-[8px] px-2 py-1.5 text-[11.5px]" style={selStyle}>
            {ODDS_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <select value={conf} onChange={(e) => setConf(e.target.value)} aria-label="Filter by confidence" className="rounded-[8px] px-2 py-1.5 text-[11.5px]" style={selStyle}>
            {CONFS.map((c) => <option key={c.key} value={c.key}>{c.key === "all" ? "Any confidence" : `${c.label} confidence`}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="rounded-[8px] px-2 py-1.5 text-[11.5px]" style={selStyle}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            {rows.length} shown · market-implied % from real odds · confidence from de-vigged prob · paper-only
          </span>
          {activeFilters ? <button onClick={reset} className="rounded-full px-2.5 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 8.5, cursor: "pointer", color: "var(--vault-text-mute)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}</button> : null}
        </div>
      </div>

      {/* Desktop table — sticky header, striped rows, pill badges. */}
      <div className="hidden lg:block overflow-auto rounded-[12px]" style={{ border: "1px solid var(--vault-rule)", maxHeight: 560 }}>
        <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              {["Player", "Market", "Line", "Odds", "Market %", "Edge", "Conf", "Provider", "Game"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9, position: "sticky", top: 0, zIndex: 1, background: "#1a100b", borderBottom: "1px solid var(--vault-rule)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const c = confOf(p.americanOdds);
              return (
              <tr key={`${p.player}:${p.market}:${i}`} style={{ background: i % 2 ? "rgba(255,255,255,0.018)" : "transparent" }}>
                <td className="px-3 py-1.5"><span className="flex items-center gap-2 min-w-0"><span className="relative shrink-0"><PlayerAvatar name={p.player} photo={p.photoUrl} size={22} />{p.teamAbbr ? <span className="absolute -bottom-1 -right-1"><TeamLogo team={p.teamAbbr} sport="mlb" size="sm" /></span> : null}</span><span className="break-words" style={{ color: "var(--vault-text)", fontWeight: 600 }}>{p.player}</span></span></td>
                <td className="px-3 py-1.5" style={{ color: "var(--vault-text-mute)" }}>{p.marketLabel}</td>
                <td className="px-3 py-1.5 font-mono tabular" style={{ color: "var(--vault-text-mute)" }}>{p.point != null ? p.point : "—"}</td>
                <td className="px-3 py-1.5"><span className="inline-block rounded-[5px] px-1.5 py-0.5 font-mono tabular" style={{ color: "var(--vault-text)", background: "rgba(255,255,255,0.06)", border: "1px solid var(--vault-rule)" }}>{american(p.americanOdds)}</span></td>
                <td className="px-3 py-1.5"><span className="inline-block rounded-[5px] px-1.5 py-0.5 font-mono tabular" style={{ color: "var(--gtp-bank-heat)", background: "var(--gtp-bank-heat-dim)" }}>{impliedPct(p.americanOdds)}%</span></td>
                <td className="px-3 py-1.5 font-mono" style={{ color: "var(--vault-text-faint)" }}>—</td>
                <td className="px-3 py-1.5"><span className="inline-block rounded-[5px] px-1.5 py-0.5 font-mono uppercase tracking-[0.06em]" style={{ fontSize: 9, color: CONF_PILL[c].fg, background: CONF_PILL[c].bg }}>{c}</span></td>
                <td className="px-3 py-1.5 font-mono" style={{ color: "var(--vault-text-faint)" }}>{p.provider ?? "—"}</td>
                <td className="px-3 py-1.5 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{p.matchup}</td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden flex flex-col gap-2">
        {rows.map((p, i) => {
          const c = confOf(p.americanOdds);
          return (
          <div key={`${p.player}:${p.market}:${i}`} className="rounded-[10px] px-3 py-2.5 flex items-start gap-2 min-w-0" style={{ background: "rgba(12,8,6,0.45)", border: "1px solid var(--vault-rule)" }}>
            <span className="mt-0.5 relative shrink-0"><PlayerAvatar name={p.player} photo={p.photoUrl} size={26} />{p.teamAbbr ? <span className="absolute -bottom-1 -right-1"><TeamLogo team={p.teamAbbr} sport="mlb" size="sm" /></span> : null}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2"><span className="break-words font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{p.player}</span><span className="font-mono tabular shrink-0" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{american(p.americanOdds)}</span></span>
              <span className="block font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>{p.marketLabel}{p.point != null ? ` ${p.point}` : ""} · <span style={{ color: "var(--gtp-bank-heat)" }}>{impliedPct(p.americanOdds)}% mkt</span> · <span style={{ color: CONF_PILL[c].fg }}>{c}</span></span>
              <span className="block font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{p.matchup}{p.provider ? ` · ${p.provider}` : ""}</span>
            </span>
          </div>
        );})}
        {rows.length === 0 ? <p className="text-center text-[12px] py-4" style={{ color: "var(--vault-text-faint)" }}>No props match these filters.</p> : null}
      </div>
    </div>
  );
}
