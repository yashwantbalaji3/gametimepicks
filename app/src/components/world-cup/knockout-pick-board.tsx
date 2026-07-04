"use client";
/**
 * Knockout PICK BOARD — the sportsbook-style scan surface. One row per game: score lean, best result /
 * protection / total / BTTS picks, best posted player prop, confidence + knockout risk, CTA. Filter chips,
 * sorting, mobile card layout, and row expansion with the same-game parlay PREVIEWS (real combined prices,
 * correlation-warned, "preview only" — no wagering functionality).
 *
 * Pure display of the server-derived view-model. The ONE thing recomputed here is time: after hydration
 * the component re-derives each game's effective status + the "Today" filter from the REAL browser clock,
 * so a stale static build never shows a finished game as bettable (the frozen-clock fix for this page).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FlagBadge from "@/components/flag-badge";
import type { KnockoutBoardRow } from "@/lib/world-cup/knockout-board-view";

const GAME_LENGTH_MS = 2.5 * 60 * 60 * 1000; // mirrors lib/world-cup/round-of-32 (server lib imports fs)
type Status = KnockoutBoardRow["status"];
function liveStatus(r: KnockoutBoardRow, nowMs: number): Status {
  const ko = Date.parse(r.kickoffUtc);
  if (Number.isFinite(ko) && ko <= nowMs) return nowMs - ko >= GAME_LENGTH_MS ? "completed" : "started";
  return r.status === "started" || r.status === "completed" ? "live_odds" : r.status;
}

const fmtOdds = (n: number | null | undefined) => typeof n === "number" && Number.isFinite(n) ? (n > 0 ? `+${n}` : `${n}`) : "—";
const pct = (p: number | null | undefined) => typeof p === "number" ? `${Math.round(p * 100)}%` : "—";
const STATUS_META: Record<Status, { label: string; color: string }> = {
  live_odds: { label: "Live odds", color: "var(--vault-success)" },
  started: { label: "Started", color: "var(--vault-text-mute)" },
  completed: { label: "Completed · awaiting settlement", color: "var(--vault-text-faint)" },
  odds_pending: { label: "Odds pending", color: "var(--vault-warn)" },
};
const CONF_COLOR: Record<string, string> = { Strong: "var(--vault-success)", Solid: "var(--vault-gold)", Lean: "var(--vault-warn)", "Coin-flip": "var(--vault-text-mute)" };
const RISK_COLOR: Record<string, string> = { Low: "var(--vault-success)", Medium: "var(--vault-warn)", High: "var(--gtp-bank-heat)" };
const CONF_RANK: Record<string, number> = { Strong: 0, Solid: 1, Lean: 2, "Coin-flip": 3 };
const RISK_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

type FilterId = "all" | "today" | "upcoming" | "completed" | "high_conf" | "props_posted" | "high_risk" | "market_pending";
const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" }, { id: "today", label: "Today" }, { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" }, { id: "high_conf", label: "High confidence" },
  { id: "props_posted", label: "Props posted" }, { id: "high_risk", label: "High KO risk" },
  { id: "market_pending", label: "Market pending" },
];
type SortId = "kickoff" | "confidence" | "risk";

function Pick({ c, accent }: { c: { label: string; odds: number; prob: number | null } | null; accent?: string }) {
  if (!c) return <span className="font-mono text-[10px]" style={{ color: "var(--vault-warn)" }}>Market pending</span>;
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      <span className="truncate text-[12px] font-semibold" style={{ color: accent ?? "var(--vault-text)" }}>{c.label}</span>
      <span className="font-mono tabular text-[10.5px] shrink-0" style={{ color: "var(--vault-text-faint)" }}>{fmtOdds(c.odds)} · {pct(c.prob)}</span>
    </span>
  );
}

function Chip({ text, color, title }: { text: string; color: string; title?: string }) {
  return <span title={title} className="font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[3px] inline-block" style={{ color, border: `1px solid ${color}`, fontSize: 9, whiteSpace: "nowrap" }}>{text}</span>;
}

function Expansion({ r }: { r: KnockoutBoardRow }) {
  return (
    <div className="flex flex-col gap-2.5 px-3.5 py-3" style={{ background: "rgba(255,255,255,0.015)", borderTop: "1px dashed var(--vault-rule)" }}>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <div className="font-mono uppercase tracking-[0.1em] text-[9px] mb-1" style={{ color: "var(--vault-text-faint)" }}>Top team picks</div>
          <ul className="flex flex-col gap-1">
            {r.teamPicks.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-[11.5px]" style={{ color: "var(--vault-text)" }}>
                <span className="min-w-0 truncate">{c.market} · <strong>{c.label}</strong></span>
                <span className="font-mono tabular text-[10.5px] shrink-0" style={{ color: "var(--vault-text-mute)" }}>{fmtOdds(c.odds)} · {pct(c.prob)}</span>
              </li>
            ))}
            {r.bestPlayerProp
              ? <li className="flex items-center justify-between gap-2 text-[11.5px]" style={{ color: "var(--vault-text)" }}><span className="min-w-0 truncate">Player prop · <strong>{r.bestPlayerProp.label}</strong></span><span className="font-mono tabular text-[10.5px] shrink-0" style={{ color: "var(--vault-text-mute)" }}>{fmtOdds(r.bestPlayerProp.odds)} · {pct(r.bestPlayerProp.prob)}</span></li>
              : <li className="font-mono text-[10px]" style={{ color: "var(--vault-warn)" }}>Player props · Market pending</li>}
          </ul>
        </div>
        <div>
          <div className="font-mono uppercase tracking-[0.1em] text-[9px] mb-1" style={{ color: "var(--vault-text-faint)" }}>Why the model likes it / what breaks it</div>
          {r.whyHit ? <p className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>✓ {r.whyHit}</p> : null}
          {r.whyFail ? <p className="mt-1 text-[11.5px] leading-snug" style={{ color: "var(--gtp-bank-heat)" }}>⚠ {r.whyFail}</p> : null}
        </div>
      </div>
      {r.parlays.length ? (
        <div>
          <div className="font-mono uppercase tracking-[0.1em] text-[9px] mb-1.5" style={{ color: "var(--vault-text-faint)" }}>Same-game parlay previews · preview only — paper, not a bet slip</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {r.parlays.map((p) => p.available ? (
              <div key={p.tier} className="rounded-lg px-2.5 py-2" style={{ border: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono uppercase text-[9px]" style={{ color: "var(--vault-gold)" }}>{p.tier}</span>
                  <span className="font-mono tabular text-[11px] font-bold" style={{ color: "var(--vault-text)" }}>{fmtOdds(p.combinedOdds)}</span>
                </div>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {p.legs.map((l, i) => <li key={i} className="text-[10.5px] truncate" style={{ color: "var(--vault-text-mute)" }}>· {l.pick} <span className="font-mono" style={{ color: "var(--vault-text-faint)" }}>{fmtOdds(l.americanOdds)}</span></li>)}
                </ul>
                <p className="mt-1 text-[8.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>{p.correlationNote}</p>
              </div>
            ) : (
              <div key={p.tier} className="rounded-lg px-2.5 py-2 font-mono text-[9.5px]" style={{ border: "1px dashed var(--vault-rule)", color: "var(--vault-text-faint)" }}>{p.tier} · {p.reason}</div>
            ))}
          </div>
        </div>
      ) : null}
      {r.ctaHref ? <Link href={r.ctaHref} className="gtp-pressable self-start rounded-full px-3 py-1 font-mono uppercase tracking-[0.08em] text-[10px]" style={{ color: "var(--vault-gold)", border: "1px solid var(--vault-gold-dim)", textDecoration: "none" }}>Open game dashboard →</Link> : null}
    </div>
  );
}

export default function KnockoutPickBoard({ rows, serverToday }: { rows: KnockoutBoardRow[]; serverToday: string }) {
  // Real-clock re-derivation after hydration (SSR-safe: first render matches the server).
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    setNowMs(Date.now());
    setToday(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()));
  }, []);
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("kickoff");
  const [open, setOpen] = useState<string | null>(null);

  const live = useMemo(() => rows.map((r) => ({ ...r, status: nowMs ? liveStatus(r, nowMs) : r.status })).map((r) => ({ ...r, bettable: r.status === "live_odds" })), [rows, nowMs]);

  const shown = useMemo(() => {
    let out = live.filter((r) => {
      switch (filter) {
        case "today": return r.matchDate === today;
        case "upcoming": return r.status === "live_odds" || r.status === "odds_pending";
        case "completed": return r.status === "completed" || r.status === "started";
        case "high_conf": return r.confidence === "Strong" || r.confidence === "Solid";
        case "props_posted": return r.propsPosted;
        case "high_risk": return r.knockoutRisk?.label === "High";
        case "market_pending": return r.status === "odds_pending" || !r.totalPick || !r.bttsPick;
        default: return true;
      }
    });
    out = [...out].sort((a, b) => {
      if (sort === "confidence") return (CONF_RANK[a.confidence] ?? 9) - (CONF_RANK[b.confidence] ?? 9);
      if (sort === "risk") return (RISK_RANK[a.knockoutRisk?.label ?? ""] ?? 9) - (RISK_RANK[b.knockoutRisk?.label ?? ""] ?? 9);
      return Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc);
    });
    return out;
  }, [live, filter, sort, today]);

  const chip = (active: boolean) => ({
    cursor: "pointer", color: active ? "var(--vault-bg)" : "var(--vault-text-mute)",
    background: active ? "var(--vault-gold)" : "transparent",
    border: `1px solid ${active ? "var(--vault-gold)" : "var(--vault-rule)"}`,
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Filters + sort — sticky on scroll so the board stays navigable. */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-1.5 px-1 py-2" style={{ background: "var(--vault-bg, #100b08)" }}>
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className="gtp-pressable rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.05em]" style={chip(filter === f.id)}>{f.label}</button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <span className="font-mono text-[9px] uppercase" style={{ color: "var(--vault-text-faint)" }}>Sort</span>
          {(["kickoff", "confidence", "risk"] as SortId[]).map((s) => (
            <button key={s} onClick={() => setSort(s)} className="gtp-pressable rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase" style={chip(sort === s)}>{s}</button>
          ))}
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl px-4 py-6 text-center text-[12.5px]" style={{ border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}>
          No games match this filter right now — nothing is hidden; the slate simply has no fixtures in this state.
        </div>
      ) : null}

      {/* One expandable row/card per game — table-like on desktop, card on mobile, same DOM. */}
      {shown.map((r) => {
        const sm = STATUS_META[r.status];
        const isOpen = open === r.slug;
        return (
          <div key={r.slug} className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--vault-border)", background: "var(--gtp-card, rgba(26,16,11,0.35))" }}>
            <button onClick={() => setOpen(isOpen ? null : r.slug)} aria-expanded={isOpen} className="flex w-full flex-col gap-2 px-3.5 py-2.5 text-left lg:grid lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto] lg:items-center lg:gap-3" style={{ cursor: "pointer", background: "transparent" }}>
              {/* Game / kickoff / status */}
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <FlagBadge code={r.homeCode ?? ""} size="sm" />
                  <span className="truncate text-[13px] font-bold" style={{ color: "var(--vault-text)" }}>{r.home}</span>
                  <span className="text-[10px]" style={{ color: "var(--vault-text-faint)" }}>v</span>
                  <FlagBadge code={r.awayCode ?? ""} size="sm" />
                  <span className="truncate text-[13px] font-bold" style={{ color: "var(--vault-text)" }}>{r.away}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>{r.kickoffEt}{r.stage ? ` · ${r.stage}` : ""}</span>
                  <Chip text={sm.label} color={sm.color} />
                </span>
              </span>
              {/* Score lean */}
              <span className="flex flex-col">
                <span className="font-mono uppercase text-[8.5px]" style={{ color: "var(--vault-text-faint)" }}>Score lean</span>
                <span className="text-[12px] font-semibold" style={{ color: "var(--vault-gold)" }}>{r.scoreLean ?? "—"}</span>
              </span>
              {/* Result + protection */}
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="font-mono uppercase text-[8.5px]" style={{ color: "var(--vault-text-faint)" }}>Result / protection</span>
                <Pick c={r.resultPick} />
                <Pick c={r.protectionPick} />
              </span>
              {/* Total / BTTS */}
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="font-mono uppercase text-[8.5px]" style={{ color: "var(--vault-text-faint)" }}>Total / BTTS</span>
                <Pick c={r.totalPick} />
                <Pick c={r.bttsPick} />
              </span>
              {/* Player prop */}
              <span className="flex flex-col min-w-0">
                <span className="font-mono uppercase text-[8.5px]" style={{ color: "var(--vault-text-faint)" }}>Best player prop</span>
                {r.bestPlayerProp
                  ? <Pick c={r.bestPlayerProp} />
                  : <span className="font-mono text-[10px]" style={{ color: "var(--vault-warn)" }}>Props pending</span>}
              </span>
              {/* Confidence / risk / expand */}
              <span className="flex items-center gap-1.5 lg:flex-col lg:items-end">
                <Chip text={r.confidence} color={CONF_COLOR[r.confidence] ?? "var(--vault-text-mute)"} />
                {r.knockoutRisk ? <Chip text={`KO risk ${r.knockoutRisk.label}`} color={RISK_COLOR[r.knockoutRisk.label]} title={r.knockoutRisk.reason} /> : null}
                <span aria-hidden className="ml-auto lg:ml-0 text-[10px] transition-transform" style={{ color: "var(--vault-text-faint)", transform: isOpen ? "rotate(180deg)" : "none" }}>▾</span>
              </span>
            </button>
            {isOpen ? <Expansion r={r} /> : null}
          </div>
        );
      })}
    </div>
  );
}
