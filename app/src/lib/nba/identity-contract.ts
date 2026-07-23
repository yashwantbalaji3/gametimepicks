/**
 * NBA entity + game identity contract (Phase 11). A DETERMINISTIC identity layer that must sit BEFORE any NBA
 * projection when the season returns. NBA is HISTORICAL_ONLY (docs/NBA_ENGINE_FORENSIC_AUDIT.md) — nothing here
 * models, scores, surfaces, or touches money. It only decides "is this the same team / player / game?" in a way
 * that does NOT rely on name-only (or date+teams-only) joins.
 *
 * WHY this contract exists (grounded in the real 2026 artifacts, all opened and verified):
 *   - There is NO cross-provider id reconciliation anywhere in the pipeline (verified across
 *     pipeline/generate_daily_board.py, pipeline/providers/*). Each board carries whatever id space the provider
 *     that answered that day used.
 *   - GAME ids therefore live in THREE disjoint namespaces in the historical data:
 *       nba_api  10-digit  "0042500206"           (app/public/data/boards/2026-05-15.json)
 *       ESPN      9-digit  "401859967"            (app/public/data/boards/2026-06-13.json)
 *       manual             "manual-2026-05-04-NYK-PHI" (pipeline/manual_overrides/schedule_overrides.json)
 *   - PLAYER ids drift too: Mikal Bridges is nba_api PERSON_ID 1628969 on boards through 2026-06-08 (and settled
 *     rows through 2026-06-05) but ESPN athlete id 3147657 on the 2026-06-10 / 2026-06-13 boards. Same human, two
 *     ids. A naive id-equality OR name-equality join across the full record is wrong.
 *   - TEAM tricodes diverge by source: boards use ESPN-style "NY"/"SA"; manual overrides use "NYK"/"SAS".
 *   - The odds→game join in generate_daily_board.py is by team FULL-NAME pair (a name-only join) — the exact hazard
 *     this contract replaces with an explicit, auditable identity.
 *
 * Discipline: identity is a stable KEY plus an explicit CROSSWALK/LINEAGE. Unknown provider refs are treated as
 * DISTINCT (never silently merged on a name). Pure + deterministic: no clock, no network, no I/O.
 */

/** HISTORICAL_ONLY. Every consumer of this contract carries these — never public, never money-touching. */
export const NBA_CONTRACT_FLAGS = { public: false, approvedForProduction: false, productEligible: false } as const;
export const NBA_IDENTITY_CONTRACT_VERSION = "nba-identity-contract-1";

/** Which upstream system minted an id. Ids from different providers are NOT interchangeable. */
export type NbaIdProvider = "nba_api" | "espn" | "odds_api" | "manual" | "unknown";

/** NBA.com GAME_ID season-type digit (position 2 of the 10-digit id). */
export type NbaSeasonType = "preseason" | "regular" | "allstar" | "playin" | "postseason" | "unknown";

/* ────────────────────────────── TEAM IDENTITY ────────────────────────────── */

/**
 * Canonical 30-team tricode set (NBA.com / basketball-reference spelling). This is the single stable team id;
 * everything else (ESPN 2-letter codes, full names) is an alias that resolves INTO one of these.
 */
export const NBA_CANONICAL_TRICODES = [
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
  "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
  "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
] as const;
export type NbaTricode = (typeof NBA_CANONICAL_TRICODES)[number];

/** [canonical, [known aliases: divergent provider codes + full names]]. Kept as data → deterministic map below. */
const TEAM_ALIAS_GROUPS: ReadonlyArray<readonly [NbaTricode, readonly string[]]> = [
  ["ATL", ["atlanta hawks", "atlanta"]],
  ["BOS", ["boston celtics", "boston"]],
  ["BKN", ["bk", "bkn", "brooklyn nets", "brooklyn"]],
  ["CHA", ["cho", "charlotte hornets", "charlotte"]],
  ["CHI", ["chicago bulls", "chicago"]],
  ["CLE", ["cleveland cavaliers", "cleveland", "cavaliers", "cavs"]],
  ["DAL", ["dallas mavericks", "dallas"]],
  ["DEN", ["denver nuggets", "denver"]],
  ["DET", ["detroit pistons", "detroit", "pistons"]],
  ["GSW", ["gs", "gsw", "golden state warriors", "golden state"]],
  ["HOU", ["houston rockets", "houston"]],
  ["IND", ["indiana pacers", "indiana"]],
  ["LAC", ["lac", "la clippers", "los angeles clippers", "clippers"]],
  ["LAL", ["lal", "la lakers", "los angeles lakers", "lakers"]],
  ["MEM", ["memphis grizzlies", "memphis"]],
  ["MIA", ["miami heat", "miami"]],
  ["MIL", ["milwaukee bucks", "milwaukee"]],
  ["MIN", ["minnesota timberwolves", "minnesota", "timberwolves"]],
  ["NOP", ["no", "nor", "new orleans pelicans", "new orleans"]],
  ["NYK", ["ny", "new york knicks", "new york", "knicks"]],
  ["OKC", ["oklahoma city thunder", "oklahoma city", "thunder"]],
  ["ORL", ["orlando magic", "orlando"]],
  ["PHI", ["philadelphia 76ers", "philadelphia", "76ers", "sixers"]],
  ["PHX", ["pho", "phoenix suns", "phoenix", "suns"]],
  ["POR", ["portland trail blazers", "portland"]],
  ["SAC", ["sacramento kings", "sacramento"]],
  ["SAS", ["sa", "san antonio spurs", "san antonio", "spurs"]],
  ["TOR", ["toronto raptors", "toronto"]],
  ["UTA", ["utah", "utah jazz", "jazz"]],
  ["WAS", ["wsh", "washington wizards", "washington", "wizards"]],
];

const TEAM_ALIAS_TO_CANONICAL: ReadonlyMap<string, NbaTricode> = (() => {
  const m = new Map<string, NbaTricode>();
  for (const code of NBA_CANONICAL_TRICODES) m.set(code.toLowerCase(), code);
  for (const [canon, aliases] of TEAM_ALIAS_GROUPS) for (const a of aliases) m.set(a.toLowerCase(), canon);
  return m;
})();

/**
 * Resolve any team spelling seen in the historical data (canonical tricode, ESPN 2-letter code, or full name) to a
 * single canonical tricode. Returns null when unknown — never guesses. This is the ONLY sanctioned way to compare
 * teams; comparing raw board.team ("NY") to override.homeTeamAbbr ("NYK") string-wise would wrongly differ.
 */
export function canonicalTeamId(input: string | null | undefined): NbaTricode | null {
  if (!input) return null;
  return TEAM_ALIAS_TO_CANONICAL.get(input.trim().toLowerCase()) ?? null;
}

export function sameTeam(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalTeamId(a), cb = canonicalTeamId(b);
  return ca !== null && ca === cb;
}

/* ────────────────────────────── GAME-ID PROVENANCE ────────────────────────────── */

/** Detect which provider minted a raw game id purely from its shape. Never assumes; unknown ⇒ "unknown". */
export function detectGameIdProvider(rawGameId: string | null | undefined): NbaIdProvider {
  if (!rawGameId) return "unknown";
  const id = rawGameId.trim();
  if (id.startsWith("manual-")) return "manual";
  if (/^00\d{8}$/.test(id)) return "nba_api"; // 10-digit "00" + type + season + seq
  if (/^40\d{7}$/.test(id)) return "espn"; // 9-digit ESPN event id (e.g. 401859967)
  return "unknown";
}

const SEASON_TYPE_BY_DIGIT: Record<string, NbaSeasonType> = {
  "1": "preseason",
  "2": "regular",
  "3": "allstar",
  "4": "postseason",
  "5": "playin",
};

export interface ParsedNbaComGameId {
  valid: boolean;
  seasonTypeDigit: string | null;
  seasonType: NbaSeasonType;
  /** Calendar year the season STARTED (e.g. 2025 = the 2025-26 season). */
  seasonStartYear: number | null;
  /** 5-digit game sequence within the season type. */
  sequence: string | null;
}

/**
 * Decode a 10-digit NBA.com GAME_ID: "00" prefix, 1 season-type digit, 2-digit season-start-year, 5-digit sequence.
 * Verified against the real "0042500206" (app/public/data/boards/2026-05-15.json) → postseason, 2025-26, game 206.
 * ESPN and manual ids are NOT decodable this way (they carry no season-type digit) and return {valid:false}.
 */
export function parseNbaComGameId(rawGameId: string | null | undefined): ParsedNbaComGameId {
  const none: ParsedNbaComGameId = { valid: false, seasonTypeDigit: null, seasonType: "unknown", seasonStartYear: null, sequence: null };
  if (!rawGameId || detectGameIdProvider(rawGameId) !== "nba_api") return none;
  const id = rawGameId.trim();
  const typeDigit = id[2];
  const yy = id.slice(3, 5);
  const seq = id.slice(5, 10);
  const seasonType = SEASON_TYPE_BY_DIGIT[typeDigit] ?? "unknown";
  const yearNum = Number(yy);
  if (!Number.isFinite(yearNum)) return none;
  return { valid: true, seasonTypeDigit: typeDigit, seasonType, seasonStartYear: 2000 + yearNum, sequence: seq };
}

/* ────────────────────────────── PLAYER IDENTITY ────────────────────────────── */

/** A provider-scoped reference to an entity. `id` is always stringified so "1628969" and 1628969 compare equal. */
export interface NbaProviderRef {
  provider: NbaIdProvider;
  id: string;
}

export function providerRef(provider: NbaIdProvider, id: string | number | null | undefined): NbaProviderRef {
  return { provider, id: id === null || id === undefined ? "" : String(id) };
}

/** The safe, name-free scoped key for a provider ref. Two refs are equal ONLY if provider AND id match. */
export function providerRefKey(ref: NbaProviderRef): string {
  return `${ref.provider}:${ref.id}`;
}

/**
 * Name normalization is provided for DISPLAY / crosswalk-building HINTS only — it is explicitly NOT an identity key.
 * (Two different humans can share a normalized name; the same human appears under different provider ids.)
 */
export function normalizePlayerName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[.'`’-]/g, "") // periods, straight + smart apostrophes, hyphens
    .replace(/\s+/g, " ")
    .trim();
}

/** One resolved human: a stable canonical id and the set of provider refs proven (by the operator) to be them. */
export interface NbaPlayerLink {
  canonicalPlayerId: string;
  refs: NbaProviderRef[];
  /** Human-readable primary name (display only — not an identity key). */
  primaryName?: string;
}

/**
 * A crosswalk is an EXPLICIT, operator-curated linking of provider refs to canonical ids. The data does not provide
 * one, so a reactivation must build it (e.g. from an authoritative roster with both nba_api + ESPN ids). Anything not
 * in the crosswalk stays provider-scoped and distinct — the safe default.
 */
export class NbaPlayerCrosswalk {
  private byRef = new Map<string, string>();
  private names = new Map<string, string>();

  constructor(links: readonly NbaPlayerLink[] = []) {
    for (const link of links) {
      if (link.primaryName) this.names.set(link.canonicalPlayerId, link.primaryName);
      for (const r of link.refs) this.byRef.set(providerRefKey(r), link.canonicalPlayerId);
    }
  }

  /** Canonical id if this ref is linked; otherwise a provider-scoped fallback so unknowns never collide. */
  resolve(ref: NbaProviderRef): string {
    return this.byRef.get(providerRefKey(ref)) ?? `provref:${providerRefKey(ref)}`;
  }

  isLinked(ref: NbaProviderRef): boolean {
    return this.byRef.has(providerRefKey(ref));
  }

  primaryName(canonicalPlayerId: string): string | null {
    return this.names.get(canonicalPlayerId) ?? null;
  }
}

/**
 * Are two provider refs the same human? Resolved through the crosswalk — NEVER by name and NEVER by raw id equality
 * across providers. Without a crosswalk, only identical provider refs are the same player.
 */
export function samePlayer(a: NbaProviderRef, b: NbaProviderRef, crosswalk: NbaPlayerCrosswalk = new NbaPlayerCrosswalk()): boolean {
  return crosswalk.resolve(a) === crosswalk.resolve(b);
}

/** A player's identity is team-INDEPENDENT — a trade changes team assignment (a per-game fact), not the player id. */
export interface NbaPlayerIdentity {
  canonicalPlayerId: string;
  primaryRef: NbaProviderRef;
  primaryName: string | null;
}

export function makePlayerIdentity(ref: NbaProviderRef, crosswalk: NbaPlayerCrosswalk = new NbaPlayerCrosswalk()): NbaPlayerIdentity {
  const canonicalPlayerId = crosswalk.resolve(ref);
  return { canonicalPlayerId, primaryRef: ref, primaryName: crosswalk.primaryName(canonicalPlayerId) };
}

/* ────────────────────────────── GAME IDENTITY ────────────────────────────── */

export interface NbaGameLineage {
  /** Canonical key of the game this one replaced (a reschedule / postponement). */
  rescheduledFromKey?: string;
  /** Free-text reason (e.g. "postponed - weather", "moved to neutral site"). Display only. */
  note?: string;
}

export interface NbaGameIdentityInput {
  provider: NbaIdProvider;
  providerGameId: string;
  /** Scheduled calendar date (YYYY-MM-DD) of THIS instance of the game. */
  scheduledDate: string;
  homeTeam: string;
  awayTeam: string;
  /** Optional ISO tip-off instant. A display-only string ("8:30 PM ET") is NOT a proven instant — pass it as null. */
  scheduledTipoffIso?: string | null;
  /** Optional explicit season type (else decoded from an nba_api id when possible). */
  seasonType?: NbaSeasonType;
  lineage?: NbaGameLineage;
}

export interface NbaGameIdentity {
  /** Provider-scoped, globally stable within a provider. Cross-provider linking needs a crosswalk (below). */
  canonicalGameKey: string;
  provider: NbaIdProvider;
  providerGameId: string;
  homeTeamId: NbaTricode | null;
  awayTeamId: NbaTricode | null;
  scheduledDate: string;
  seasonType: NbaSeasonType;
  seasonStartYear: number | null;
  /** ISO tip-off instant if PROVEN, else null (display-only tip-offs are not proven — see feature-timing-contract). */
  tipoffIso: string | null;
  lineage: NbaGameLineage;
}

const isProvenInstant = (v: string | null | undefined): boolean => !!v && Number.isFinite(Date.parse(v)) && /\d{4}-\d\d-\d\dT/.test(v);

export function makeGameIdentity(x: NbaGameIdentityInput): NbaGameIdentity {
  const decoded = parseNbaComGameId(x.providerGameId);
  const seasonType = x.seasonType ?? (decoded.valid ? decoded.seasonType : "unknown");
  return {
    canonicalGameKey: `${x.provider}:${x.providerGameId}`,
    provider: x.provider,
    providerGameId: x.providerGameId,
    homeTeamId: canonicalTeamId(x.homeTeam),
    awayTeamId: canonicalTeamId(x.awayTeam),
    scheduledDate: x.scheduledDate,
    seasonType,
    seasonStartYear: decoded.valid ? decoded.seasonStartYear : null,
    tipoffIso: isProvenInstant(x.scheduledTipoffIso) ? (x.scheduledTipoffIso as string) : null,
    lineage: x.lineage ?? {},
  };
}

/**
 * A FALLBACK "logical" key from season + matchup + date. Useful to PROPOSE a cross-provider link, but it is unsafe as
 * an identity on its own: it mis-links a rescheduled game to a different-date instance and collides if the same
 * matchup ever occurs twice on one date. Always confirm a logical match through the crosswalk / lineage.
 */
export function logicalMatchupKey(g: NbaGameIdentity): string {
  return `${g.seasonType}:${g.seasonStartYear ?? "?"}:${g.awayTeamId ?? "?"}@${g.homeTeamId ?? "?"}:${g.scheduledDate}`;
}

/** Explicit cross-provider game linking, mirroring the player crosswalk. The data provides none. */
export class NbaGameCrosswalk {
  private byKey = new Map<string, string>();
  constructor(links: readonly { canonicalGameId: string; keys: readonly string[] }[] = []) {
    for (const link of links) for (const k of link.keys) this.byKey.set(k, link.canonicalGameId);
  }
  resolve(g: NbaGameIdentity): string {
    return this.byKey.get(g.canonicalGameKey) ?? `gamekey:${g.canonicalGameKey}`;
  }
}

/** True when B is a reschedule of A (B's lineage points at A's canonical key). */
export function isRescheduleOf(newer: NbaGameIdentity, older: NbaGameIdentity): boolean {
  return newer.lineage.rescheduledFromKey === older.canonicalGameKey && newer.canonicalGameKey !== older.canonicalGameKey;
}

/**
 * Are two identities the same logical game? Same canonical key, OR linked by the crosswalk, OR connected by a
 * reschedule lineage. NEVER inferred from (date, teams) alone — that is only a proposal via logicalMatchupKey.
 */
export function sameGame(a: NbaGameIdentity, b: NbaGameIdentity, crosswalk: NbaGameCrosswalk = new NbaGameCrosswalk()): boolean {
  if (a.canonicalGameKey === b.canonicalGameKey) return true;
  if (crosswalk.resolve(a) === crosswalk.resolve(b)) return true;
  return isRescheduleOf(a, b) || isRescheduleOf(b, a);
}
