/**
 * LIVE-F (UX Release 2B) — THE ONE LIVE EVENT CARD, shared by every sport /live covers.
 *
 * /live rendered NFL and MLB with two different cards: NFL with logos, full club names and a visible link
 * to the report; MLB with bare abbreviations inside a card that was ONE big link (no visible action, a
 * screen reader got the whole card as a single link name). Two chip palettes, two time formats, two radii.
 * This is the shell both now use (docs/UX_DESIGN_STANDARDS.md §2, §5, §6, §8):
 *
 *   status chip (lifecycle owner's words) · time or period (period only while live) · two team rows
 *   (logo + full name + tabular score, "—" when unreported) · sport-specific content slot · a visible
 *   "Open game report →" link with a 44px hit area.
 *
 * Presentational only. It receives facts; it computes no state and fetches nothing. The accessible
 * summary is passed in, because each sport knows what its card says.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import TeamLogo from "@/components/team-logo";
import PlayerAvatar from "@/components/ui/player-avatar";

const SANS = "var(--font-display)";

/** Lifecycle state → chip colours. The LABEL carries the state; colour only reinforces it. */
const CHIP: Record<string, { fg: string; border: string; bg: string }> = {
  LIVE: { fg: "var(--vault-bg)", border: "var(--vault-success)", bg: "var(--vault-success)" },
  DELAYED: { fg: "var(--vault-warn)", border: "var(--vault-warn)", bg: "transparent" },
  PRE: { fg: "var(--vault-text-mute)", border: "var(--vault-border)", bg: "transparent" },
  FINAL_PENDING_SETTLEMENT: { fg: "var(--vault-text-mute)", border: "var(--vault-border-strong)", bg: "transparent" },
  SETTLED: { fg: "var(--vault-text-mute)", border: "var(--vault-border-strong)", bg: "transparent" },
  POSTPONED: { fg: "var(--vault-warn)", border: "var(--vault-warn)", bg: "transparent" },
  CANCELLED: { fg: "var(--vault-text-mute)", border: "var(--vault-border-strong)", bg: "transparent" },
  UNAVAILABLE: { fg: "var(--vault-text-faint)", border: "var(--vault-border)", bg: "transparent" },
  /* Live Hub V2 status names (lib/live/v2/event-view.mjs) map onto the same palette. */
  PREGAME: { fg: "var(--vault-text-mute)", border: "var(--vault-border)", bg: "transparent" },
  FINAL_PROVISIONAL: { fg: "var(--vault-text-mute)", border: "var(--vault-border-strong)", bg: "transparent" },
  FINAL_CANONICAL: { fg: "var(--vault-text-mute)", border: "var(--vault-border-strong)", bg: "transparent" },
  DATA_UNAVAILABLE: { fg: "var(--vault-text-faint)", border: "var(--vault-border)", bg: "transparent" },
  UNKNOWN: { fg: "var(--vault-text-mute)", border: "var(--vault-border)", bg: "transparent" },
};

export function LiveStateChip({ state, label }: { state: string; label: string }) {
  const c = CHIP[state] ?? CHIP.UNKNOWN;
  return (
    <span style={{
      fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
      color: c.fg, background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

/** "Wed · 8:00 PM ET" from a schedule instant, in a fixed zone — identical on server and client. */
export function liveEtTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  return `${day} · ${time} ET`;
}

export type LiveLogoSport = "nfl" | "mlb" | "nba" | "soccer";

export function LiveTeamRow({ abbr, name, score, sport, imageUrl, person = false }: { abbr: string; name: string; score: number | null; sport: LiveLogoSport | "ufc"; imageUrl?: string | null; person?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0", minWidth: 0 }}>
      {/* A team gets its crest; a person (a fighter) gets the artifact's portrait for that exact id, or initials. */}
      {person || sport === "ufc"
        ? <PlayerAvatar name={name} photo={imageUrl ?? null} size={36} decorative />
        : <TeamLogo team={abbr} sport={sport} size="md" ariaLabel="" />}
      {/* The full name wraps rather than truncating: "Washington Commanders" is the fact, "Washington Comm…" is not. */}
      <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: "var(--vault-text)", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
        {name}
      </span>
      <span style={{ fontFamily: SANS, fontSize: 26, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: score === null ? "var(--vault-text-faint)" : "var(--vault-text)", flexShrink: 0, minWidth: 28, textAlign: "right" }}>
        {/* An absent score is an em dash. A 0 before the start would be a score nobody reported. */}
        {score === null ? "—" : score}
      </span>
    </div>
  );
}

export interface LiveEventCardProps {
  /** The whole card in words, read once by assistive tech (the visual rows are aria-hidden). */
  spoken: string;
  state: string;
  label: string;
  /** Start time before the event, the period line while live, nothing once final. */
  when: string | null;
  started: boolean;
  sport: LiveLogoSport | "ufc";
  away: { abbr: string; name: string; score: number | null; imageUrl?: string | null };
  home: { abbr: string; name: string; score: number | null; imageUrl?: string | null };
  /** Beside the chip (e.g. the followed-entity mark). */
  marks?: ReactNode;
  /** Sport-specific body: frozen forecast line, featured forecasts, freshness. */
  children?: ReactNode;
  reportHref: string;
  reportLabel?: string;
}

export default function LiveEventCard({ spoken, state, label, when, started, sport, away, home, marks, children, reportHref, reportLabel = "Open game report" }: LiveEventCardProps) {
  return (
    <li style={{ listStyle: "none" }}>
      <div style={{ border: "1px solid var(--vault-border)", borderRadius: 12, background: "var(--vault-panel)", padding: "14px 16px 10px", height: "100%", display: "flex", flexDirection: "column" }}>
        <span className="sr-only">{spoken}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <LiveStateChip state={state} label={label} />
          {marks}
          {when ? <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: started ? "var(--vault-text)" : "var(--vault-text-mute)" }}>{when}</span> : null}
        </div>
        <div aria-hidden="true">
          <LiveTeamRow sport={sport} {...away} />
          <LiveTeamRow sport={sport} {...home} />
        </div>
        {children}
        <p style={{ margin: "auto 0 0", paddingTop: 8 }}>
          <Link href={reportHref} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: "var(--vault-accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 44 }}>
            {reportLabel} →
          </Link>
        </p>
      </div>
    </li>
  );
}
