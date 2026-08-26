/**
 * GLOBAL ENTITY SYSTEM (Sprint 012 · Phase 3). ONE canonical set of visual primitives for the two entities
 * the product talks about — teams and players — so every surface (game reports, simulation cards, Picks Lab,
 * results, strategy tools) renders them identically.
 *
 * These WRAP the existing, proven primitives rather than duplicating them:
 *   • TeamLogo      → components/ui/team-mark (logo with initials fallback)
 *   • GameHeader    → components/ui/matchup-identity (away @ home crests) + identity line
 *   • PlayerPortrait→ components/player-avatar (official MLB/NBA headshot CDN + initials disc)
 *
 * RULES (enforced by entity-system.test.mjs):
 *   • Graceful missing-image states everywhere — a null logo / unknown id renders initials, never a broken
 *     image and never a WRONG player's photo.
 *   • Sport-aware: "mlb" and "nba" resolve real headshots; "ufc" (and anything else) falls back to initials
 *     because no portrait CDN is wired for it — we never guess a photo.
 *   • Presentational only. No data fetching, no prediction logic, no recomputation.
 */
import type { ReactNode } from "react";
import TeamMark from "@/components/ui/team-mark";
import CdnTeamLogo from "@/components/team-logo";
import MatchupIdentity from "@/components/ui/matchup-identity";
import PlayerAvatar from "@/components/player-avatar";

export type EntitySport = "mlb" | "nba" | "ufc" | "world_cup" | string;
export type EntitySize = "xs" | "sm" | "md" | "lg" | "xl";

/** Portrait CDNs we actually have. Anything else falls back to initials — never a guessed photo. */
const PORTRAIT_SPORTS = new Set(["mlb", "nba"]);

/**
 * A team's visual mark — the ONE import every surface should use.
 *
 * Two genuinely different sources of a team logo exist in this product, and they are not interchangeable:
 *
 *   • ARTIFACT URL (`logoUrl`) — the provider logo a data artifact already carries (World Cup crests, board
 *     logos). Server-renderable, falls back to a flag or initials. → `ui/team-mark`.
 *   • CDN DERIVATION (`team` + `sport`) — no URL exists in the data, so the ESPN CDN path is derived from the
 *     abbreviation. That needs a runtime `onError` swap to a monogram when a logo 404s, which requires a
 *     client component. → `components/team-logo`.
 *
 * This is a FACADE, not a rewrite: it unifies the import surface so every call site says
 * `import { TeamLogo } from "@/components/entity"`, while each keeps the behaviour its data can actually
 * support. Collapsing the two implementations further would mean either losing the 404 fallback on ~37 CDN
 * call sites or making every artifact-URL logo a client component — a behaviour change, not a cleanup, and
 * deliberately out of scope here (see docs/SPRINT_016_ENTITY_MIGRATION.md).
 *
 * Pass `logoUrl` when the data has one; pass `team` + `sport` when it does not. Passing neither renders
 * initials — never a broken image, never a guessed logo.
 */
export function TeamLogo({
  name,
  logoUrl,
  team,
  sport,
  size = "md",
  highlight,
}: {
  name?: string | null;
  logoUrl?: string | null;
  /** Team abbreviation, when the logo must be derived from the CDN rather than read from an artifact. */
  team?: string | null;
  /** Required alongside `team` — the CDN is sport-scoped. */
  sport?: "mlb" | "nba" | "nhl";
  size?: "sm" | "md" | "lg" | "xl";
  /** CDN path only: gold ring for the favored side. */
  highlight?: boolean;
}) {
  // An explicit artifact URL always wins — it is the real provider asset.
  if (!logoUrl && team && sport) {
    return <CdnTeamLogo team={team} sport={sport} size={size} highlight={highlight} ariaLabel={name ?? undefined} />;
  }
  return <TeamMark name={name ?? team} logoUrl={logoUrl} size={size} />;
}

/** A player's official portrait, with a safe initials disc when the sport/id can't resolve one. */
export function PlayerPortrait({
  playerId,
  name,
  team,
  sport = "mlb",
  size = "sm",
  flat,
}: {
  playerId?: number | null;
  name: string;
  team?: string | null;
  sport?: EntitySport;
  size?: EntitySize;
  flat?: boolean;
}) {
  // Only pass an id for sports whose headshot CDN we actually support; otherwise the avatar renders initials.
  const resolvedId = PORTRAIT_SPORTS.has(sport) ? playerId ?? null : null;
  const cdnSport = sport === "nba" ? "nba" : "mlb";
  return <PlayerAvatar playerId={resolvedId} playerName={name} team={team ?? undefined} sport={cdnSport} size={size} flat={flat} />;
}

/**
 * A generic entity header — a mark/portrait, a title, and a subtitle line. Used wherever a page or card is
 * "about" one entity (a team, a player, a matchup section).
 */
export function EntityHeader({
  mark,
  title,
  subtitle,
  trailing,
}: {
  mark?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {mark ? <span className="shrink-0">{mark}</span> : null}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="truncate font-display" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800, lineHeight: 1.15 }}>{title}</span>
        {subtitle ? <span className="truncate font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{subtitle}</span> : null}
      </div>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </div>
  );
}

/**
 * The canonical player card — portrait + name + team/opponent + a market line and its simulated read.
 * Every field is passed in from a canonical object; the card computes nothing.
 */
export function PlayerCard({
  playerId,
  name,
  team,
  opponent,
  sport = "mlb",
  marketLabel,
  pick,
  line,
  probabilityPct,
  simulationCount,
  rank,
  href,
}: {
  playerId?: number | null;
  name: string;
  team?: string | null;
  opponent?: string | null;
  sport?: EntitySport;
  marketLabel?: string | null;
  pick?: string | null;
  line?: number | null;
  /** Already-computed percentage (0–100) from a canonical object. */
  probabilityPct?: number | null;
  /** Total simulations behind the probability (e.g. 10000) — renders the honest "N / 10,000 games" frequency. */
  simulationCount?: number | null;
  rank?: number;
  href?: string;
}) {
  // Simulation FREQUENCY, not a new number: the canonical probability expressed as the count of simulated
  // games it came from ("8,400 / 10,000 games"). Pure formatting — nothing is recomputed here.
  const frequency =
    probabilityPct != null && simulationCount != null && simulationCount > 0
      ? `${Math.round((probabilityPct / 100) * simulationCount).toLocaleString()} / ${simulationCount.toLocaleString()} games`
      : null;
  const body = (
    <>
      {rank != null ? (
        <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 10, width: 14, textAlign: "right" }}>{rank}</span>
      ) : null}
      <PlayerPortrait playerId={playerId} name={name} team={team} sport={sport} size="sm" />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{name}</span>
        <span className="truncate font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {team ?? ""}{opponent ? ` vs ${opponent}` : ""}
        </span>
      </div>
      {pick || line != null || probabilityPct != null ? (
        <div className="flex flex-col items-end shrink-0">
          {pick || line != null ? (
            <span className="font-semibold whitespace-nowrap" style={{ color: "var(--vault-text)", fontSize: 12 }}>
              {pick ?? ""}{line != null ? ` ${line}` : ""}{marketLabel ? ` ${marketLabel}` : ""}
            </span>
          ) : null}
          {probabilityPct != null ? <span className="font-mono" style={{ color: "var(--vault-gold)", fontSize: 11 }}>{Math.round(probabilityPct)}%</span> : null}
          {frequency ? <span className="font-mono whitespace-nowrap" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{frequency}</span> : null}
        </div>
      ) : null}
    </>
  );
  const className = "flex items-center gap-2.5 rounded-[10px] px-2.5 py-2";
  const style = { background: "var(--vault-wash-faint)", border: "1px solid var(--vault-rule)", textDecoration: "none" } as const;
  return href ? (
    <a href={href} className={`vault-glow-hover ${className}`} style={style}>{body}</a>
  ) : (
    <div className={className} style={style}>{body}</div>
  );
}

/** The canonical game header — away @ home crests plus the identity line (date · venue) and a status slot. */
export function GameHeader({
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  homeCode,
  awayCode,
  identityLine,
  status,
  size = "lg",
}: {
  homeName?: string | null;
  awayName?: string | null;
  homeLogo?: string | null;
  awayLogo?: string | null;
  homeCode?: string | null;
  awayCode?: string | null;
  identityLine?: ReactNode;
  status?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <MatchupIdentity homeName={homeName} awayName={awayName} homeLogo={homeLogo} awayLogo={awayLogo} size={size} />
        <div className="flex flex-col min-w-0">
          <span className="truncate font-display" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 800 }}>
            {awayCode ?? awayName} <span style={{ color: "var(--vault-text-faint)", fontWeight: 500 }}>@</span> {homeCode ?? homeName}
          </span>
          {identityLine ? <span className="truncate font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-mute)", fontSize: 9.5 }}>{identityLine}</span> : null}
        </div>
      </div>
      {status ? <div className="shrink-0">{status}</div> : null}
    </div>
  );
}
