/**
 * EPL club naming index — the one place a provider's spelling of a club becomes a canonical club.
 *
 * WHY A TABLE RATHER THAN FUZZY MATCHING
 * `pipeline/world_cup/team_aliases.py` keys fixtures on `sorted(normalized_names)` with no league and
 * no date. Two clubs meet twice a season, so a name-pair key collides by construction. The repair is
 * not a better string distance — it is (a) an enumerable table nobody has to trust a heuristic about,
 * and (b) identity that carries competition and kickoff (see `epl-identity.ts`). This file is only
 * half the repair, and deliberately does nothing else.
 *
 * SEASON MEMBERSHIP IS NOT CLAIMED HERE
 * This is a NAMING index, not a roster. Which 20 clubs contest 2026-27 depends on promotion and
 * relegation the repo has not verified against an official source, and asserting membership from
 * memory would be exactly the fabrication this platform refuses. So the table covers clubs with
 * recent Premier League participation, and the season's 20 are taken from the official fixture
 * artifact and checked by `assertSeasonMembership` — twenty distinct resolved clubs or nothing runs.
 */
import { buildAliasIndex } from "@/lib/identity/event-identity";

export interface EplClub {
  /** The name every EPL artifact and surface uses. */
  readonly canonical: string;
  readonly abbr: string;
  /** Provider spellings, including the canonical name itself. */
  readonly aliases: readonly string[];
}

/**
 * Naming variants only. An entry here is not a statement that the club is in the league this season.
 *
 * Deliberately omitted: bare "United", bare "City", bare "Albion". Each is claimed by more than one
 * club, and an ambiguous alias does not fail politely — it silently attaches one club's market to
 * another club's fixture. If a provider ever sends one, resolution returns null and the row is
 * recorded unresolved rather than guessed.
 */
export const EPL_CLUB_ALIASES: readonly EplClub[] = [
  { canonical: "Arsenal", abbr: "ARS", aliases: ["Arsenal", "Arsenal FC"] },
  { canonical: "Aston Villa", abbr: "AVL", aliases: ["Aston Villa", "Villa"] },
  { canonical: "Bournemouth", abbr: "BOU", aliases: ["Bournemouth", "AFC Bournemouth"] },
  { canonical: "Brentford", abbr: "BRE", aliases: ["Brentford", "Brentford FC"] },
  {
    canonical: "Brighton & Hove Albion",
    abbr: "BHA",
    aliases: ["Brighton & Hove Albion", "Brighton and Hove Albion", "Brighton Hove Albion", "Brighton"],
  },
  { canonical: "Burnley", abbr: "BUR", aliases: ["Burnley", "Burnley FC"] },
  { canonical: "Chelsea", abbr: "CHE", aliases: ["Chelsea", "Chelsea FC"] },
  // 2026-27 promoted clubs — added ONLY after membership was verified across two independent
  // sources on 2026-08-09: ESPN's eng.1 scoreboard lists the full opening round (COV @ ARS,
  // MAN @ HUL, 20 distinct clubs) agreeing fixture-by-fixture with openfootball's 2026-27 file
  // (kickoffs match across the BST offset). Receipts: docs/EPL_SOURCE_DECISION.md.
  { canonical: "Coventry City", abbr: "COV", aliases: ["Coventry City", "Coventry"] },
  { canonical: "Crystal Palace", abbr: "CRY", aliases: ["Crystal Palace", "Palace"] },
  { canonical: "Hull City", abbr: "HUL", aliases: ["Hull City", "Hull"] },
  { canonical: "Everton", abbr: "EVE", aliases: ["Everton", "Everton FC"] },
  { canonical: "Fulham", abbr: "FUL", aliases: ["Fulham", "Fulham FC"] },
  { canonical: "Ipswich Town", abbr: "IPS", aliases: ["Ipswich Town", "Ipswich"] },
  { canonical: "Leeds United", abbr: "LEE", aliases: ["Leeds United", "Leeds Utd", "Leeds"] },
  { canonical: "Leicester City", abbr: "LEI", aliases: ["Leicester City", "Leicester"] },
  { canonical: "Liverpool", abbr: "LIV", aliases: ["Liverpool", "Liverpool FC"] },
  { canonical: "Luton Town", abbr: "LUT", aliases: ["Luton Town", "Luton"] },
  { canonical: "Manchester City", abbr: "MCI", aliases: ["Manchester City", "Man City", "Man. City"] },
  {
    canonical: "Manchester United",
    abbr: "MUN",
    aliases: ["Manchester United", "Manchester Utd", "Man United", "Man Utd", "Man. United"],
  },
  { canonical: "Newcastle United", abbr: "NEW", aliases: ["Newcastle United", "Newcastle Utd", "Newcastle"] },
  {
    canonical: "Nottingham Forest",
    abbr: "NFO",
    aliases: ["Nottingham Forest", "Nott'm Forest", "Notts Forest", "Forest"],
  },
  { canonical: "Sheffield United", abbr: "SHU", aliases: ["Sheffield United", "Sheffield Utd", "Sheff Utd"] },
  { canonical: "Southampton", abbr: "SOU", aliases: ["Southampton", "Saints"] },
  { canonical: "Sunderland", abbr: "SUN", aliases: ["Sunderland", "Sunderland AFC"] },
  { canonical: "Tottenham Hotspur", abbr: "TOT", aliases: ["Tottenham Hotspur", "Tottenham", "Spurs"] },
  { canonical: "West Ham United", abbr: "WHU", aliases: ["West Ham United", "West Ham"] },
  {
    canonical: "Wolverhampton Wanderers",
    abbr: "WOL",
    aliases: ["Wolverhampton Wanderers", "Wolverhampton", "Wolves"],
  },
];

/** The Premier League contests a 20-club season. Used as a completeness check on a fixture artifact. */
export const EPL_SEASON_CLUB_COUNT = 20;

/**
 * Reduce a provider spelling to a comparison token.
 *
 * Strips accents, punctuation, the "FC"/"AFC" affixes and the conjunction providers render as either
 * "&" or "and", so "AFC Bournemouth" and "Bournemouth", or "Brighton & Hove Albion" and "Brighton and
 * Hove Albion", are one token rather than entries that must each be remembered. Nothing else is
 * inferred: no substring matching, no distance.
 */
export function normalizeClubToken(raw: string | null | undefined): string {
  const base = String(raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!base) return "";
  return base
    .split(" ")
    .filter((w) => w !== "fc" && w !== "afc" && w !== "and")
    .join("");
}

/** One alias claimed by more than one club, with every claimant named. */
export interface ClubAliasCollision {
  readonly alias: string;
  readonly claimants: readonly string[];
}

export interface EplClubIndex {
  /** The club for a provider spelling, or null when unknown OR ambiguous. Never guesses. */
  resolve(name: string | null | undefined): EplClub | null;
  readonly collisions: readonly ClubAliasCollision[];
  /** True when every alias in the table resolves to exactly one club. */
  readonly isSound: boolean;
  readonly clubs: readonly EplClub[];
}

/**
 * Build the naming index, refusing every alias a second club also claims.
 *
 * The ambiguity detection runs through the canonical `buildAliasIndex`, whose `ambiguousAliases` is
 * exactly "one alias, more than one target". Its `resolve()` is NOT the read path here on purpose:
 * that function additionally refuses any target claimed by two aliases, which is right for a
 * provider-id join (an id names one event) and wrong for a naming table (a club has many spellings
 * by design). The provider-id side of this lane does use `buildAliasIndex.resolve` — see
 * `buildEplProviderIndex` in `epl-identity.ts`.
 */
export function buildEplClubIndex(clubs: readonly EplClub[] = EPL_CLUB_ALIASES): EplClubIndex {
  const pairs: [string, EplClub][] = [];
  for (const club of clubs) {
    for (const alias of club.aliases) {
      const token = normalizeClubToken(alias);
      if (token) pairs.push([token, club]);
    }
  }

  const detector = buildAliasIndex(pairs, (c) => c.canonical);
  const claimantsByAlias = new Map<string, Set<string>>();
  for (const [token, club] of pairs) {
    if (!claimantsByAlias.has(token)) claimantsByAlias.set(token, new Set());
    claimantsByAlias.get(token)!.add(club.canonical);
  }

  const collisions: ClubAliasCollision[] = detector.ambiguousAliases.map((alias) => ({
    alias,
    claimants: [...(claimantsByAlias.get(alias) ?? [])].sort(),
  }));
  const blocked = new Set(collisions.map((c) => c.alias));

  const byToken = new Map<string, EplClub>();
  for (const [token, club] of pairs) if (!blocked.has(token)) byToken.set(token, club);

  return {
    resolve(name) {
      const token = normalizeClubToken(name);
      if (!token || blocked.has(token)) return null;
      return byToken.get(token) ?? null;
    },
    collisions,
    isSound: collisions.length === 0,
    clubs,
  };
}

/**
 * Refuse a colliding table outright.
 *
 * Sprint 043 blocks BOTH sides of a collision rather than picking a winner; the table-level analogue
 * is that a table containing an ambiguous alias does not ingest at all. Half a naming table is worse
 * than none: the fixtures it does resolve look complete.
 */
export function assertClubTableSound(index: EplClubIndex): void {
  if (index.isSound) return;
  const lines = index.collisions
    .map((c) => `  alias "${c.alias}" is claimed by: ${c.claimants.join(", ")}`)
    .join("\n");
  throw new Error(
    `EPL club alias table is ambiguous — refusing to resolve any club:\n${lines}\n\n` +
      `An ambiguous alias attaches one club's market to another club's fixture. See lib/soccer/epl-clubs.ts.`,
  );
}

/**
 * Check that a season's fixture artifact names exactly 20 distinct clubs.
 *
 * This is where season membership is established — from the official fixture list, not from this
 * file. Returns the resolved clubs plus anything the table could not name, so a caller can report
 * both "wrong number of clubs" and "these spellings are unknown" instead of one vague failure.
 */
export function assertSeasonMembership(
  clubNames: readonly string[],
  index: EplClubIndex = buildEplClubIndex(),
): { clubs: readonly EplClub[]; unresolved: readonly string[] } {
  assertClubTableSound(index);
  const resolved = new Map<string, EplClub>();
  const unresolved: string[] = [];
  for (const name of clubNames) {
    const club = index.resolve(name);
    if (club) resolved.set(club.canonical, club);
    else unresolved.push(name);
  }
  const clubs = [...resolved.values()].sort((a, b) => a.canonical.localeCompare(b.canonical));
  if (unresolved.length > 0 || clubs.length !== EPL_SEASON_CLUB_COUNT) {
    throw new Error(
      `EPL season membership check failed: resolved ${clubs.length} distinct clubs ` +
        `(expected ${EPL_SEASON_CLUB_COUNT})` +
        (unresolved.length ? `; unresolved spellings: ${[...new Set(unresolved)].join(", ")}` : ""),
    );
  }
  return { clubs, unresolved };
}
