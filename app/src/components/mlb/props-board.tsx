"use client";

import { useMemo, useState } from "react";
import PlayerAvatar from "@/components/ui/player-avatar";
import TeamLogo from "@/components/team-logo";
import AddToSlip from "@/components/slip/add-to-slip";
import { tierFromProb, homerTierFromProb, tierMeta, type ConfTier } from "@/lib/mlb/confidence";

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
  opponentAbbr?: string | null;
  homeAway?: "home" | "away" | null;
}

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const impliedPct = (a: number) => Math.round((1 / dec(a)) * 100);
const american = (a: number) => `${a > 0 ? "+" : ""}${a}`;
/** Market-aware 4-tier confidence: HR markets sit on a lower probability band than batter favorites. */
const tierForProp = (p: BoardProp): ConfTier => {
  const prob = 1 / dec(p.americanOdds);
  return p.market === "batter_home_runs" ? homerTierFromProb(prob) : tierFromProb(prob);
};
const TIER_RANK: Record<ConfTier, number> = { elite: 3, strong: 2, playable: 1, avoid: 0 };

/** Market quick-filters (real Odds API market keys). Only those present in the data render. */
const MARKETS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "batter_home_runs", label: "HR" },
  { key: "batter_hits", label: "Hits" },
  { key: "batter_total_bases", label: "Bases" },
  { key: "batter_rbis", label: "RBI" },
  { key: "batter_runs_scored", label: "Runs" },
  { key: "pitcher_strikeouts", label: "Strikeouts" },
  { key: "pitcher_outs", label: "Outs" },
  { key: "pitcher_earned_runs", label: "Earned Runs" },
];
const SORTS: Array<{ key: string; label: string }> = [
  { key: "prob", label: "Highest probability" },
  { key: "price", label: "Best price" },
  { key: "confidence", label: "Highest confidence" },
  { key: "team", label: "Team" },
  { key: "game", label: "Game" },
];
const ODDS_RANGES: Array<{ key: string; label: string; short: string; test: (a: number) => boolean }> = [
  { key: "all", label: "Any odds", short: "Any odds", test: () => true },
  { key: "fav", label: "Favorites (≤ −110)", short: "Favorites", test: (a) => a <= -110 },
  { key: "even", label: "−110 to +200", short: "−110…+200", test: (a) => a > -110 && a <= 200 },
  { key: "plus", label: "+200 to +600", short: "+200…+600", test: (a) => a > 200 && a <= 600 },
  { key: "long", label: "Longshots (> +600)", short: "Longshots", test: (a) => a > 600 },
];
const CONFS: Array<{ key: string; label: string }> = [
  { key: "all", label: "Any confidence" }, { key: "elite", label: "Elite" }, { key: "strong", label: "Strong" }, { key: "playable", label: "Playable" }, { key: "avoid", label: "Avoid" },
];

const selStyle = { background: "rgba(255,255,255,0.03)", border: "1px solid var(--vault-border)", color: "var(--vault-text)" } as const;

export default function MlbPropsBoard({ props }: { props: BoardProp[] }) {
  const [market, setMarket] = useState("all");
  const [game, setGame] = useState("all");
  const [sort, setSort] = useState("prob");
  const [oddsRange, setOddsRange] = useState("all");
  const [conf, setConf] = useState("all");
  const [q, setQ] = useState("");

  const games = useMemo(() => Array.from(new Set(props.map((p) => p.matchup))).sort(), [props]);
  const presentMarkets = useMemo(() => new Set(props.map((p) => p.market)), [props]);
  const visibleMarkets = useMemo(() => MARKETS.filter((m) => m.key === "all" || presentMarkets.has(m.key)), [presentMarkets]);
  const oddsTest = ODDS_RANGES.find((r) => r.key === oddsRange)?.test ?? (() => true);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = props.filter((p) =>
      (market === "all" || p.market === market) &&
      (game === "all" || p.matchup === game) &&
      (oddsRange === "all" || oddsTest(p.americanOdds)) &&
      (conf === "all" || tierForProp(p) === conf) &&
      (!needle || p.player.toLowerCase().includes(needle) || p.matchup.toLowerCase().includes(needle) || (p.teamAbbr ?? "").toLowerCase().includes(needle)));
    r = [...r].sort((a, b) =>
      sort === "price" ? b.americanOdds - a.americanOdds :
      sort === "team" ? (a.teamAbbr ?? "zzz").localeCompare(b.teamAbbr ?? "zzz") || impliedPct(b.americanOdds) - impliedPct(a.americanOdds) :
      sort === "game" ? a.matchup.localeCompare(b.matchup) || impliedPct(b.americanOdds) - impliedPct(a.americanOdds) :
      sort === "confidence" ? (TIER_RANK[tierForProp(b)] - TIER_RANK[tierForProp(a)]) || impliedPct(b.americanOdds) - impliedPct(a.americanOdds) :
      impliedPct(b.americanOdds) - impliedPct(a.americanOdds)); // prob (default)
    return r.slice(0, 150);
  }, [props, market, game, sort, oddsRange, conf, oddsTest, q]);

  // Active filter chips (removable). Each has a label and a clear fn.
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (market !== "all") chips.push({ key: "market", label: MARKETS.find((m) => m.key === market)?.label ?? market, clear: () => setMarket("all") });
  if (game !== "all") chips.push({ key: "game", label: game, clear: () => setGame("all") });
  if (oddsRange !== "all") chips.push({ key: "odds", label: ODDS_RANGES.find((r) => r.key === oddsRange)?.short ?? oddsRange, clear: () => setOddsRange("all") });
  if (conf !== "all") chips.push({ key: "conf", label: CONFS.find((c) => c.key === conf)?.label ?? conf, clear: () => setConf("all") });
  if (q.trim()) chips.push({ key: "q", label: `"${q.trim()}"`, clear: () => setQ("") });
  const reset = () => { setMarket("all"); setGame("all"); setSort("prob"); setOddsRange("all"); setConf("all"); setQ(""); };

  return (
    <div className="flex flex-col gap-3">
      {/* Controls — sticky so filters stay reachable while scrolling the board. */}
      <div className="flex flex-col gap-2 rounded-[12px] px-2.5 py-2.5" style={{ position: "sticky", top: 4, zIndex: 5, background: "rgba(18,11,8,0.96)", backdropFilter: "blur(6px)", border: "1px solid var(--vault-rule)" }}>
        {/* Quick filter chips (market) */}
        <div className="flex flex-wrap gap-1.5">
          {visibleMarkets.map((m) => (
            <button key={m.key} onClick={() => setMarket(m.key)} className="rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.08em]"
              style={{ fontSize: 9.5, cursor: "pointer", color: market === m.key ? "#120A07" : "var(--vault-text-mute)", background: market === m.key ? "var(--gtp-bank-heat)" : "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>
              {m.label}
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
            {CONFS.map((c) => <option key={c.key} value={c.key}>{c.key === "all" ? c.label : `${c.label} confidence`}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="rounded-[8px] px-2 py-1.5 text-[11.5px]" style={selStyle}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
          </select>
        </div>
        {/* Active filter chips + count */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
            {rows.length} shown
            {chips.length ? <span style={{ color: "var(--gtp-bank-heat)" }}> · {chips.length} filter{chips.length > 1 ? "s" : ""}</span> : null}
          </span>
          {chips.map((c) => (
            <button key={c.key} onClick={c.clear} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono" style={{ fontSize: 9, cursor: "pointer", color: "var(--vault-text)", background: "rgba(225,29,42,0.12)", border: "1px solid color-mix(in srgb, var(--gtp-bank-heat) 35%, transparent)" }}>
              {c.label}<span aria-hidden style={{ color: "var(--vault-text-faint)" }}>✕</span>
            </button>
          ))}
          {chips.length ? <button onClick={reset} className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ fontSize: 8.5, cursor: "pointer", color: "var(--vault-text-mute)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>Clear all</button> : null}
        </div>
        <span className="font-mono uppercase tracking-[0.07em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>market-implied % from real odds · confidence is a market read (model edge pending) · paper-only</span>
      </div>

      {/* Desktop table — sticky header, striped rows, pill badges. */}
      <div className="hidden lg:block overflow-auto rounded-[12px]" style={{ border: "1px solid var(--vault-rule)", maxHeight: 560 }}>
        <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              {["Player", "Market", "Line", "Odds", "Market %", "Confidence", "Book", "Game"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 text-left font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-mute)", fontSize: 9.5, position: "sticky", top: 0, zIndex: 1, background: "#1a100b", borderBottom: "1px solid var(--vault-rule)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const m = tierMeta(tierForProp(p));
              return (
              <tr key={`${p.player}:${p.market}:${i}`} style={{ background: i % 2 ? "rgba(255,255,255,0.018)" : "transparent" }}>
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="relative shrink-0"><PlayerAvatar name={p.player} photo={p.photoUrl} size={22} />{p.teamAbbr ? <span className="absolute -bottom-1 -right-1"><TeamLogo team={p.teamAbbr} sport="mlb" size="sm" /></span> : null}</span>
                    <span className="min-w-0"><span className="break-words" style={{ color: "var(--vault-text)", fontWeight: 600 }}>{p.player}</span>{p.opponentAbbr ? <span className="flex items-center gap-1" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{p.homeAway === "home" ? "vs" : "@"}<TeamLogo team={p.opponentAbbr} sport="mlb" size="sm" /></span> : null}</span>
                  </span>
                </td>
                <td className="px-3 py-1.5" style={{ color: "var(--vault-text-mute)" }}>{p.marketLabel}</td>
                <td className="px-3 py-1.5 font-mono tabular" style={{ color: "var(--vault-text-mute)" }}>{p.point != null ? p.point : "—"}</td>
                <td className="px-3 py-1.5"><span className="inline-block rounded-[5px] px-1.5 py-0.5 font-mono tabular" style={{ color: "var(--vault-text)", background: "rgba(255,255,255,0.06)", border: "1px solid var(--vault-rule)" }}>{american(p.americanOdds)}</span></td>
                <td className="px-3 py-1.5"><span className="inline-block rounded-[5px] px-1.5 py-0.5 font-mono tabular" style={{ color: "var(--gtp-bank-heat)", background: "var(--gtp-bank-heat-dim)" }}>{impliedPct(p.americanOdds)}%</span></td>
                <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 font-mono uppercase tracking-[0.06em]" style={{ fontSize: 9, color: m.fg, background: m.bg }}><span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: m.fg }} />{m.label}</span></td>
                <td className="px-3 py-1.5"><span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{p.provider ?? "—"}</span></td>
                <td className="px-3 py-1.5 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{p.matchup}</td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>

      {/* Mobile cards — native feel: headshot + team/opp logos, badges row. */}
      <div className="lg:hidden flex flex-col gap-2">
        {rows.map((p, i) => {
          const m = tierMeta(tierForProp(p));
          return (
          <div key={`${p.player}:${p.market}:${i}`} className="rounded-[10px] px-3 py-2.5 flex items-start gap-2.5 min-w-0" style={{ background: "rgba(7, 11, 9,0.45)", border: "1px solid var(--vault-rule)" }}>
            <span className="mt-0.5 relative shrink-0"><PlayerAvatar name={p.player} photo={p.photoUrl} size={28} />{p.teamAbbr ? <span className="absolute -bottom-1 -right-1"><TeamLogo team={p.teamAbbr} sport="mlb" size="sm" /></span> : null}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0"><span className="break-words font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{p.player}</span>{p.opponentAbbr ? <span className="inline-flex items-center gap-0.5 shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{p.homeAway === "home" ? "vs" : "@"}<TeamLogo team={p.opponentAbbr} sport="mlb" size="sm" /></span> : null}</span>
                <span className="inline-block rounded-[5px] px-1.5 py-0.5 font-mono tabular shrink-0" style={{ color: "var(--vault-text)", fontSize: 12, background: "rgba(255,255,255,0.06)", border: "1px solid var(--vault-rule)" }}>{american(p.americanOdds)}</span>
              </span>
              <span className="block font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>{p.marketLabel}{p.point != null ? ` ${p.point}` : ""}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <AddToSlip leg={{ sport: "mlb", player: p.player, photoUrl: p.photoUrl ?? null, teamAbbr: p.teamAbbr ?? null, opponentAbbr: p.opponentAbbr ?? null, marketLabel: p.marketLabel, side: p.selection, line: p.point, americanOdds: p.americanOdds, matchup: p.matchup }} />
                <span className="inline-block rounded-[4px] px-1.5 py-0.5 font-mono tabular" style={{ color: "var(--gtp-bank-heat)", background: "var(--gtp-bank-heat-dim)", fontSize: 9.5 }}>{impliedPct(p.americanOdds)}% mkt</span>
                <span className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 font-mono uppercase tracking-[0.06em]" style={{ fontSize: 8.5, color: m.fg, background: m.bg }}><span aria-hidden style={{ width: 4, height: 4, borderRadius: 999, background: m.fg }} />{m.label}</span>
                {p.provider ? <span className="inline-block rounded-[4px] px-1.5 py-0.5 font-mono" style={{ color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.04)", fontSize: 8.5 }}>{p.provider}</span> : null}
              </span>
              <span className="mt-0.5 block font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{p.matchup}</span>
            </span>
          </div>
        );})}
        {rows.length === 0 ? <p className="text-center text-[12px] py-4" style={{ color: "var(--vault-text-faint)" }}>No props match these filters.</p> : null}
      </div>
    </div>
  );
}
