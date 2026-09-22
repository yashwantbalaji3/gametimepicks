/**
 * NBA roster contract (NBA readiness track N-4, free roster owner) — PURE, no I/O.
 * NBA PRESEASON — EXPERIMENTAL · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * The box-score corpus knows a player only as "appeared in a box score for this team", which is
 * blind to every offseason move (Giannis Antetokounmpo on MIA with no MIA box-score row; 2026
 * draftees with no history at all). This contract is the canonical shape of the roster capture
 * that closes that gap from ESPN's keyless team roster endpoint
 * (site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/<id>/roster).
 *
 * VERIFIED PROVIDER SEMANTICS (2026-09-22, 30/30 teams, 561 rows — docs/V17_NBA_READINESS_RECEIPT.md):
 *   - The payload is the CURRENT roster. `?season=2026` relabels `season` but returns the same
 *     athletes (MIA: identical 20 rows under 2026-27 Preseason and 2025-26 Regular Season labels).
 *     There is NO historical roster here — `asOf` is the capture instant and nothing else.
 *   - `status` is `Active` on every row (561/561). Two-way / Exhibit-10 designation is NOT exposed
 *     on this endpoint (nor on the core athlete record); `rosterStatus` carries ESPN's word verbatim
 *     and a consumer must never infer two-way from `contracts.length === 0` (rookies and camp
 *     invitees both arrive with no contract rows).
 *   - `jersey` is absent for 137/561 rows (unassigned camp numbers) → null, never "0".
 *   - Injuries ride along per athlete (`injuries[]` with status + date); the injuries FEED
 *     (data/internal/research/injuries/nba) stays the availability owner — this is a mirror only.
 *
 * Rules that never bend:
 *   - A row without an athlete id is REFUSED (recorded in the manifest), never given an invented id.
 *   - A team whose fetch failed or whose payload carries no athletes is MISSING, never an empty
 *     roster (an empty pool would silently zero a team's minutes — the P247 absent-as-zero class).
 *   - Ordering is deterministic (team by canonical tricode, then numeric athlete id): the same
 *     inputs serialise byte-identically.
 *   - Team identity is ESPN's providerTeamId PLUS the canonical tricode of lib/nba/identity-contract
 *     (mirrored in boxscore-parse.mjs); exhibition clubs never appear here (30 franchises only).
 */
import { canonicalTricodeFromEspnAbbr } from "./boxscore-parse.mjs";

export const ROSTER_SCHEMA_VERSION = 1;
export const ROSTER_ARTIFACT = "nba-roster-capture";
export const ROSTER_CONTRACT_VERSION = "nba-roster-contract-v1";
export const ROSTER_SOURCE = "espn_site_roster";
export const ROSTER_DATA_CLASS = "PRIVATE_RESEARCH";
/** Regular-season roster limits (15 standard + 3 two-way = 18); camp rosters run to 21. Outside → flagged. */
export const ROSTER_SIZE_BOUNDS = Object.freeze({ min: 13, max: 21 });
export const TEAM_STATES = Object.freeze({ CAPTURED: "CAPTURED", MISSING: "MISSING" });

/**
 * The 30 ESPN NBA team ids with ESPN's own abbreviation — verified against
 * site.api.espn.com/apis/site/v2/sports/basketball/nba/teams on 2026-09-22. Canonical tricodes come
 * from the identity contract; the two are recorded side by side so a consumer never joins on a name.
 */
export const ESPN_NBA_TEAMS = Object.freeze([
  ["1", "ATL"], ["2", "BOS"], ["17", "BKN"], ["30", "CHA"], ["4", "CHI"], ["5", "CLE"], ["6", "DAL"],
  ["7", "DEN"], ["8", "DET"], ["9", "GS"], ["10", "HOU"], ["11", "IND"], ["12", "LAC"], ["13", "LAL"],
  ["29", "MEM"], ["14", "MIA"], ["15", "MIL"], ["16", "MIN"], ["3", "NO"], ["18", "NY"], ["25", "OKC"],
  ["19", "ORL"], ["20", "PHI"], ["21", "PHX"], ["22", "POR"], ["23", "SAC"], ["24", "SA"], ["28", "TOR"],
  ["26", "UTAH"], ["27", "WSH"],
].map(([providerTeamId, espnAbbr]) => Object.freeze({ providerTeamId, espnAbbr, canonicalTricode: canonicalTricodeFromEspnAbbr(espnAbbr) })));

const TEAM_BY_ID = new Map(ESPN_NBA_TEAMS.map((t) => [t.providerTeamId, t]));

/** Team registry entry for an ESPN team id, or null (never guessed). */
export function espnTeamById(providerTeamId) {
  return TEAM_BY_ID.get(String(providerTeamId)) ?? null;
}

/** Numeric-aware, deterministic athlete-id ordering ("6475" < "3032977" < "5107157"). */
export function compareAthleteIds(a, b) {
  const na = /^\d+$/.test(a) ? Number(a) : null;
  const nb = /^\d+$/.test(b) ? Number(b) : null;
  if (na != null && nb != null) return na - nb;
  if (na != null) return -1;
  if (nb != null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Deterministic team ordering: canonical tricode, then provider id (unknown tricodes last). */
export function compareTeams(a, b) {
  const ta = a.canonicalTricode ?? "~", tb = b.canonicalTricode ?? "~";
  return ta < tb ? -1 : ta > tb ? 1 : compareAthleteIds(String(a.providerTeamId), String(b.providerTeamId));
}

/** The canonical roster row — every key present, null where the provider gave nothing. */
export const ROSTER_ROW_KEYS = Object.freeze([
  "providerAthleteId", "displayName", "firstName", "lastName", "shortName",
  "providerTeamId", "espnAbbr", "canonicalTricode",
  "position", "jersey", "rosterStatus", "rosterStatusType",
  "experienceYears", "debutYear", "age", "contractSeasonsOnRecord",
  "injuries", "injuryStatus",
  "capturedAt",
]);

/** Index a roster artifact by athlete id → { providerTeamId, canonicalTricode, displayName }. Pure. */
export function rosterIndex(artifact) {
  const idx = new Map();
  for (const t of artifact?.teams ?? []) {
    if (t.state !== TEAM_STATES.CAPTURED) continue;
    for (const p of t.players ?? []) idx.set(String(p.providerAthleteId), { providerTeamId: t.providerTeamId, canonicalTricode: t.canonicalTricode, displayName: p.displayName });
  }
  return idx;
}

/** Captured team record for an ESPN team id, or null when the team is MISSING / absent. Pure. */
export function rosterForTeam(artifact, providerTeamId) {
  const t = (artifact?.teams ?? []).find((x) => String(x.providerTeamId) === String(providerTeamId));
  return t && t.state === TEAM_STATES.CAPTURED ? t : null;
}
