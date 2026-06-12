/**
 * sport-identity.ts — the single source of truth for a sport's VISUAL
 * identity across the site: label, short label, icon glyph, accent color,
 * and a gradient derived from that accent.
 *
 * Before this, sport emoji and colors were hand-rolled in 6+ components
 * (parlay-lab, guided-start, market-ticker, homepage-sports-rail, the
 * /today sport cards, each sport page hero), drifting apart over time.
 * This centralises the mapping so every surface that shows a sport —
 * /today, game cards, sport shells, the Bank Builder legs and previous
 * hits — reads one identity and stays consistent.
 *
 * Pure: no fetches, no fs, no fabrication. Colors reference the CSS
 * custom properties already defined in globals.css (the established
 * `--sport-*` palette is preserved; new keys were added there for the
 * sports that previously had none). Importable from a server component or
 * a "use client" component.
 *
 * Honesty: an identity is decorative only. The glyph/color say "this is a
 * soccer card", never "this is likely to win".
 */

export type SportIdentityKey =
  | "soccer"
  | "mlb"
  | "nba"
  | "ufc"
  | "nhl"
  | "ipl"
  | "mixed"
  | "bank_builder";

export interface SportIdentity {
  /** Canonical identity key. */
  key: SportIdentityKey;
  /** Full display label, e.g. "World Cup". */
  label: string;
  /** Compact label for chips/badges, e.g. "WC". */
  shortLabel: string;
  /** Decorative glyph (emoji). Tasteful, single-glyph. */
  icon: string;
  /** CSS accent color expression, e.g. "var(--sport-soccer)". */
  accentVar: string;
  /** CSS linear-gradient built from the accent, for headers/orbs. */
  gradient: string;
  /** Human description of the icon, for alt text. */
  ballLabel: string;
}

/**
 * The canonical identities. `label` for soccer is "World Cup" because the
 * only soccer competition the site currently surfaces is the World Cup;
 * `getSportIdentity` still resolves generic soccer/MLS/EPL aliases here so
 * the mapping degrades gracefully if more competitions are added.
 */
const IDENTITIES: Record<SportIdentityKey, SportIdentity> = {
  soccer: {
    key: "soccer",
    label: "World Cup",
    shortLabel: "WC",
    icon: "⚽",
    accentVar: "var(--sport-soccer)",
    gradient: "linear-gradient(135deg, rgba(52,211,153,0.22) 0%, rgba(45,212,191,0.10) 55%, transparent 100%)",
    ballLabel: "soccer ball",
  },
  mlb: {
    key: "mlb",
    label: "MLB",
    shortLabel: "MLB",
    icon: "⚾",
    accentVar: "var(--sport-mlb)",
    gradient: "linear-gradient(135deg, rgba(86,194,240,0.22) 0%, rgba(86,194,240,0.08) 55%, transparent 100%)",
    ballLabel: "baseball",
  },
  nba: {
    key: "nba",
    label: "NBA",
    shortLabel: "NBA",
    icon: "🏀",
    accentVar: "var(--sport-nba)",
    gradient: "linear-gradient(135deg, rgba(251,113,133,0.22) 0%, rgba(251,113,133,0.08) 55%, transparent 100%)",
    ballLabel: "basketball",
  },
  ufc: {
    key: "ufc",
    label: "UFC",
    shortLabel: "UFC",
    icon: "🥊",
    accentVar: "var(--sport-ufc)",
    gradient: "linear-gradient(135deg, rgba(248,113,113,0.22) 0%, rgba(248,113,113,0.08) 55%, transparent 100%)",
    ballLabel: "boxing glove",
  },
  nhl: {
    key: "nhl",
    label: "NHL",
    shortLabel: "NHL",
    icon: "🏒",
    accentVar: "var(--sport-nhl)",
    gradient: "linear-gradient(135deg, rgba(147,197,253,0.22) 0%, rgba(147,197,253,0.08) 55%, transparent 100%)",
    ballLabel: "hockey stick",
  },
  ipl: {
    key: "ipl",
    label: "IPL",
    shortLabel: "IPL",
    icon: "🏏",
    accentVar: "var(--sport-ipl)",
    gradient: "linear-gradient(135deg, rgba(251,191,36,0.22) 0%, rgba(251,191,36,0.08) 55%, transparent 100%)",
    ballLabel: "cricket bat",
  },
  mixed: {
    key: "mixed",
    label: "Mixed",
    shortLabel: "MIX",
    icon: "🔀",
    accentVar: "var(--sport-mixed)",
    gradient: "linear-gradient(135deg, rgba(45,212,191,0.22) 0%, rgba(45,212,191,0.08) 55%, transparent 100%)",
    ballLabel: "cross-sport",
  },
  bank_builder: {
    key: "bank_builder",
    label: "Bank Builder",
    shortLabel: "BANK",
    icon: "🏦",
    accentVar: "var(--sport-bank)",
    gradient: "linear-gradient(135deg, rgba(240,199,94,0.24) 0%, rgba(212,175,55,0.10) 55%, transparent 100%)",
    ballLabel: "vault",
  },
};

/**
 * Maps the many sport spellings used across data + UI to a canonical
 * identity key. Unknown/empty input falls through to `mixed` (the neutral
 * cross-sport identity) so a missing sport never renders a broken glyph.
 */
const ALIASES: Record<string, SportIdentityKey> = {
  // soccer family
  soccer: "soccer",
  football: "soccer",
  world_cup: "soccer",
  worldcup: "soccer",
  "world cup": "soccer",
  wc: "soccer",
  fifa: "soccer",
  "fifa-world-cup": "soccer",
  fifa_world_cup: "soccer",
  mls: "soccer",
  epl: "soccer",
  // baseball
  mlb: "mlb",
  baseball: "mlb",
  // basketball
  nba: "nba",
  wnba: "nba",
  basketball: "nba",
  // combat
  ufc: "ufc",
  mma: "ufc",
  // hockey
  nhl: "nhl",
  hockey: "nhl",
  // cricket
  ipl: "ipl",
  cricket: "ipl",
  // cross-sport
  mixed: "mixed",
  multi: "mixed",
  "multi-sport": "mixed",
  cross: "mixed",
  // bank builder
  bank_builder: "bank_builder",
  "bank-builder": "bank_builder",
  bankbuilder: "bank_builder",
  ladder: "bank_builder",
};

/** Normalise a sport string: lowercase, trim, collapse internal whitespace. */
export function normalizeSportIdentityKey(sport: string | null | undefined): string {
  return (sport ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve a sport identity for any sport spelling. Always returns an
 * identity — unknown input resolves to the neutral `mixed` identity rather
 * than throwing, so callers can render unconditionally.
 */
export function getSportIdentity(sport: string | null | undefined): SportIdentity {
  const norm = normalizeSportIdentityKey(sport);
  const key = ALIASES[norm] ?? ALIASES[norm.replace(/[ _]/g, "-")] ?? "mixed";
  return IDENTITIES[key];
}

/** Whether a sport string maps to a known (non-fallback) identity. */
export function hasSportIdentity(sport: string | null | undefined): boolean {
  const norm = normalizeSportIdentityKey(sport);
  return norm in ALIASES || norm.replace(/[ _]/g, "-") in ALIASES;
}

/** All canonical identities, stable order — handy for legends/directories. */
export const SPORT_IDENTITIES: ReadonlyArray<SportIdentity> = Object.freeze(
  Object.values(IDENTITIES),
);
