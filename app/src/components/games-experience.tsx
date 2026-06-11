"use client";
/**
 * GamesExperience — the unified "tonight's games" board across every sport (World Cup, MLB, NBA,
 * UFC) in one place. Sport chips filter; each game card links into the right sport hub tab + the
 * Build betslip. Mobile-first: chips scroll horizontally, cards stack one column.
 */
import { useMemo, useState } from "react";
import Link from "next/link";

export interface GameRow {
  id: string;
  sport: "world_cup" | "mlb" | "nba" | "ufc";
  sportLabel: string;
  accent: string;
  matchup: string;
  timeLabel: string;
  statusLabel: string;
  projections: number;
  href: string;
  buildHref: string;
}

const CHIPS = [
  { key: "all", label: "All" },
  { key: "world_cup", label: "World Cup" },
  { key: "mlb", label: "MLB" },
  { key: "nba", label: "NBA" },
  { key: "ufc", label: "UFC" },
] as const;

export default function GamesExperience({ games }: { games: GameRow[] }) {
  const [sport, setSport] = useState<string>("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of games) c[g.sport] = (c[g.sport] ?? 0) + 1;
    return c;
  }, [games]);
  const filtered = sport === "all" ? games : games.filter((g) => g.sport === sport);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {CHIPS.map((ch) => {
          const on = sport === ch.key;
          const n = ch.key === "all" ? games.length : counts[ch.key] ?? 0;
          return (
            <button key={ch.key} type="button" onClick={() => setSport(ch.key)}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors shrink-0"
              style={{ background: on ? "var(--vault-gold-dim)" : "transparent", border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`, color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
              {ch.label}
              {n > 0 ? <span className="font-mono" style={{ fontSize: 10, opacity: 0.8 }}>{n}</span> : null}
            </button>
          );
        })}
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((g) => (
            <article key={g.id} className="rounded-[10px] px-4 py-4 flex flex-col gap-3" style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)", borderLeft: `3px solid ${g.accent}` }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full" style={{ color: g.accent, border: `1px solid ${g.accent}`, fontSize: 9 }}>{g.sportLabel}</span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{g.statusLabel}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{g.matchup}</span>
                <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{g.timeLabel}{g.projections > 0 ? ` · ${g.projections} projection${g.projections === 1 ? "" : "s"}` : ""}</span>
              </div>
              <div className="flex items-center gap-2 pt-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
                <Link href={g.href} className="vault-press flex-1 text-center rounded-[6px] py-1.5 font-mono uppercase tracking-[0.1em]" style={{ background: "var(--vault-gold-dim)", border: "1px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)", fontSize: 10.5, textDecoration: "none" }}>
                  View {g.sportLabel}
                </Link>
                <Link href={g.buildHref} className="vault-press flex-1 text-center rounded-[6px] py-1.5 font-mono uppercase tracking-[0.1em]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 10.5, textDecoration: "none" }}>
                  Build
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] px-4 py-8 text-center" style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No games for this filter</p>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>Check back closer to game time — schedules post as the day fills in.</p>
        </div>
      )}
      <p style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>Educational / paper only — not betting advice.</p>
    </div>
  );
}
