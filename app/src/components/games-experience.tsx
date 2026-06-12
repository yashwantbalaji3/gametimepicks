"use client";
/**
 * GamesExperience — the unified "tonight's games" board across every sport (World Cup, MLB, NBA,
 * UFC) in one place. Sport chips filter; each game card links into the fixture detail + the Build
 * betslip. Mobile-first: chips scroll horizontally, cards stack one column.
 *
 * Visual identity comes from the central sport-identity system (orb glyph + accent); World Cup
 * cards show real provider team logos (api-sports) with flag/monogram fallback via TeamMark.
 */
import { useMemo, useState } from "react";
import Link from "next/link";

import { getSportIdentity } from "@/lib/sport-identity";
import TeamMark from "@/components/ui/team-mark";

export interface GameRow {
  id: string;
  sport: "world_cup" | "mlb" | "nba" | "ufc";
  sportLabel: string;
  matchup: string;
  timeLabel: string;
  statusLabel: string;
  projections: number;
  /** Player-prop count for the fixture (0 = none published). */
  props?: number;
  href: string;
  buildHref: string;
  detailHref?: string;
  /** ISO flag codes for soccer fixtures (real teams.json codes). */
  homeCode?: string;
  awayCode?: string;
  /** Real provider team-logo URLs (api-sports) when the artifact carries them. */
  homeLogo?: string | null;
  awayLogo?: string | null;
}

const CHIPS = ["all", "world_cup", "mlb", "nba", "ufc"] as const;

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
        {CHIPS.map((key) => {
          const on = sport === key;
          const id = key === "all" ? null : getSportIdentity(key);
          const n = key === "all" ? games.length : counts[key] ?? 0;
          return (
            <button key={key} type="button" onClick={() => setSport(key)}
              className={`gtp-pressable flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors shrink-0${on ? " gtp-chip-heat" : ""}`}
              style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
              {id ? <span aria-hidden style={{ fontSize: 12 }}>{id.icon}</span> : null}
              {id ? id.label : "All"}
              {n > 0 ? <span className="font-mono" style={{ fontSize: 10, opacity: 0.8 }}>{n}</span> : null}
            </button>
          );
        })}
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((g) => {
            const id = getSportIdentity(g.sport);
            return (
              <article key={g.id} className="gtp-card-hover rounded-[10px] px-4 py-4 flex flex-col gap-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)", borderLeft: `3px solid ${id.accentVar}` }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full" style={{ color: id.accentVar, border: `1px solid ${id.accentVar}`, fontSize: 10 }}>
                    <span aria-hidden role="img" style={{ fontSize: 10 }}>{id.icon}</span>
                    {g.sportLabel}
                  </span>
                  <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{g.statusLabel}</span>
                </div>
                <div className="flex items-center gap-2.5 min-w-0">
                  {g.homeCode || g.awayCode || g.homeLogo || g.awayLogo ? (
                    <span className="inline-flex items-center gap-1 shrink-0" aria-hidden>
                      <TeamMark logoUrl={g.homeLogo} flagCode={g.homeCode} size="md" />
                      <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>v</span>
                      <TeamMark logoUrl={g.awayLogo} flagCode={g.awayCode} size="md" />
                    </span>
                  ) : null}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{g.matchup}</span>
                    <span className="font-mono truncate" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
                      {g.timeLabel}
                      {g.projections > 0 ? ` · ${g.projections} projection${g.projections === 1 ? "" : "s"}` : ""}
                      {g.props ? ` · ${g.props} props` : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
                  <Link href={g.detailHref ?? g.href} className="gtp-cta-lava vault-press flex-1 text-center rounded-[6px] py-1.5 font-mono uppercase tracking-[0.1em]" style={{ fontSize: 10.5, fontWeight: 700, textDecoration: "none" }}>
                    {g.detailHref ? "View game" : `View ${g.sportLabel}`}
                  </Link>
                  <Link href={g.buildHref} className="vault-press flex-1 text-center rounded-[6px] py-1.5 font-mono uppercase tracking-[0.1em]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 10.5, textDecoration: "none" }}>
                    Build
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[10px] px-4 py-8 text-center" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
          <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No games for this filter</p>
          <p className="mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>Check back closer to game time — schedules post as the day fills in.</p>
        </div>
      )}
      <p style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>Educational / paper only — not betting advice.</p>
    </div>
  );
}
