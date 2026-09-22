/**
 * NBA roster parser (NBA readiness track N-4) — PURE, deterministic, no I/O.
 * NBA PRESEASON — EXPERIMENTAL · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * Turns one ESPN `teams/<id>/roster` payload into the canonical team record of roster-contract.mjs
 * and assembles the 30-team artifact with its manifest. Every rule the capture script relies on
 * lives here so it is unit-tested (roster-parse.test.mjs):
 *
 *   - missing athlete id → the row is REFUSED and listed; an id is never invented
 *   - a fetch failure, a non-success status or an athletes array that is absent/empty → the team
 *     is MISSING with a reason; `players` is null, never []
 *   - a player appearing on more than one CAPTURED team is NOT deduplicated — both rows stay and
 *     the manifest lists the id (a stale provider page is evidence, not something to hide)
 *   - duplicate display names across the league are listed with their ids; identity is the id
 *   - team size outside ROSTER_SIZE_BOUNDS is flagged, never truncated
 *   - deterministic ordering (compareTeams / compareAthleteIds) so equal inputs → identical bytes
 */
import {
  ROSTER_SCHEMA_VERSION, ROSTER_ARTIFACT, ROSTER_CONTRACT_VERSION, ROSTER_SOURCE, ROSTER_DATA_CLASS,
  ROSTER_SIZE_BOUNDS, TEAM_STATES, ESPN_NBA_TEAMS, espnTeamById, compareAthleteIds, compareTeams,
} from "./roster-contract.mjs";

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v) => (Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
const isoOrNull = (v) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);

/** Normalise one athlete entry. Returns { row } or { refused: { reason, displayName } }. */
export function normalizeAthlete(a, team, capturedAt) {
  const id = a?.id != null && String(a.id).trim() ? String(a.id).trim() : null;
  const displayName = str(a?.displayName) ?? str(a?.fullName) ?? null;
  if (id == null) return { refused: { reason: "missing athlete id", displayName } };
  if (displayName == null) return { refused: { reason: "missing display name", providerAthleteId: id } };
  const injuries = (Array.isArray(a?.injuries) ? a.injuries : [])
    .map((i) => ({ status: str(i?.status), date: isoOrNull(i?.date) }))
    .filter((i) => i.status != null)
    .sort((x, y) => (Date.parse(y.date ?? 0) || 0) - (Date.parse(x.date ?? 0) || 0) || x.status.localeCompare(y.status));
  const contracts = Array.isArray(a?.contracts) ? a.contracts.length : null;
  return {
    row: {
      providerAthleteId: id,
      displayName,
      firstName: str(a?.firstName),
      lastName: str(a?.lastName),
      shortName: str(a?.shortName),
      providerTeamId: team.providerTeamId,
      espnAbbr: team.espnAbbr,
      canonicalTricode: team.canonicalTricode,
      position: str(a?.position?.abbreviation),
      jersey: str(a?.jersey),
      rosterStatus: str(a?.status?.name),
      rosterStatusType: str(a?.status?.type),
      experienceYears: int(a?.experience?.years),
      debutYear: int(a?.debutYear),
      age: int(a?.age),
      contractSeasonsOnRecord: contracts,
      injuries,
      injuryStatus: injuries.length ? injuries[0].status : null,
      capturedAt,
    },
  };
}

/**
 * Parse one team's roster payload (or its absence) into the team record.
 *
 * @param payload   raw ESPN JSON, or null/undefined when the fetch failed
 * @param meta      { providerTeamId, capturedAt, fetchError? }
 */
export function parseRosterPayload(payload, { providerTeamId, capturedAt, fetchError = null }) {
  const reg = espnTeamById(providerTeamId);
  const team = reg ?? { providerTeamId: String(providerTeamId), espnAbbr: str(payload?.team?.abbreviation), canonicalTricode: null };
  const base = {
    providerTeamId: team.providerTeamId,
    espnAbbr: team.espnAbbr,
    canonicalTricode: team.canonicalTricode,
    name: str(payload?.team?.displayName),
    providerSeason: payload?.season && typeof payload.season === "object"
      ? { year: int(payload.season.year), type: int(payload.season.type), name: str(payload.season.name) }
      : null,
    providerTimestamp: isoOrNull(payload?.timestamp),
    capturedAt,
  };
  const missing = (reason) => ({ ...base, state: TEAM_STATES.MISSING, reason, playerCount: null, players: null, refused: [] });
  if (fetchError) return missing(`fetch failed: ${fetchError}`);
  if (payload == null || typeof payload !== "object") return missing("no payload");
  if (payload.status != null && payload.status !== "success") return missing(`provider status ${JSON.stringify(payload.status)}`);
  if (!Array.isArray(payload.athletes)) return missing("payload has no athletes array");
  if (payload.athletes.length === 0) return missing("payload athletes array is empty — refused as a roster (a team is never empty)");
  if (reg == null) return missing(`unknown ESPN team id ${providerTeamId} — not one of the 30 franchises`);

  const players = [];
  const refused = [];
  for (const a of payload.athletes) {
    const r = normalizeAthlete(a, team, capturedAt);
    if (r.row) players.push(r.row); else refused.push(r.refused);
  }
  players.sort((x, y) => compareAthleteIds(x.providerAthleteId, y.providerAthleteId));
  if (players.length === 0) return { ...missing("every row was refused"), refused };
  return { ...base, state: TEAM_STATES.CAPTURED, reason: null, playerCount: players.length, players, refused };
}

/**
 * Assemble the artifact from per-team results. Teams absent from `teamResults` are MISSING
 * ("not attempted"), so the artifact always carries all 30 franchises.
 *
 * @param teamResults  [{ providerTeamId, payload, fetchError? }]
 * @param capturedAt   ISO — the as-of instant of every row
 */
export function buildRosterArtifact({ teamResults, capturedAt }) {
  if (typeof capturedAt !== "string" || !Number.isFinite(Date.parse(capturedAt))) throw new Error("buildRosterArtifact: capturedAt (ISO) is required");
  const byId = new Map((Array.isArray(teamResults) ? teamResults : []).map((r) => [String(r.providerTeamId), r]));
  const teams = ESPN_NBA_TEAMS.map((t) => {
    const r = byId.get(t.providerTeamId);
    return r ? parseRosterPayload(r.payload, { providerTeamId: t.providerTeamId, capturedAt, fetchError: r.fetchError ?? null })
      : parseRosterPayload(null, { providerTeamId: t.providerTeamId, capturedAt, fetchError: "not attempted" });
  }).sort(compareTeams);

  const captured = teams.filter((t) => t.state === TEAM_STATES.CAPTURED);
  const idTeams = new Map();
  const nameIds = new Map();
  for (const t of captured) {
    for (const p of t.players) {
      if (!idTeams.has(p.providerAthleteId)) idTeams.set(p.providerAthleteId, []);
      idTeams.get(p.providerAthleteId).push(t.canonicalTricode ?? t.providerTeamId);
      const key = p.displayName.toLowerCase();
      if (!nameIds.has(key)) nameIds.set(key, []);
      nameIds.get(key).push({ providerAthleteId: p.providerAthleteId, team: t.canonicalTricode ?? t.providerTeamId });
    }
  }
  const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const manifest = {
    capturedAt,
    teamsInRegistry: ESPN_NBA_TEAMS.length,
    teamsCaptured: captured.length,
    teamsMissing: teams.length - captured.length,
    missingTeams: teams.filter((t) => t.state === TEAM_STATES.MISSING).map((t) => ({ providerTeamId: t.providerTeamId, canonicalTricode: t.canonicalTricode, reason: t.reason })),
    players: captured.reduce((s, t) => s + t.playerCount, 0),
    playersPerTeam: Object.fromEntries(captured.map((t) => [t.canonicalTricode ?? t.providerTeamId, t.playerCount])),
    rowsRefused: teams.flatMap((t) => t.refused.map((r) => ({ providerTeamId: t.providerTeamId, canonicalTricode: t.canonicalTricode, ...r }))),
    athletesOnMultipleTeams: [...idTeams.entries()].filter(([, ts]) => ts.length > 1).map(([id, ts]) => ({ providerAthleteId: id, teams: [...ts].sort(sortStr) })).sort((a, b) => compareAthleteIds(a.providerAthleteId, b.providerAthleteId)),
    duplicateDisplayNames: [...nameIds.entries()].filter(([, l]) => l.length > 1).map(([name, l]) => ({ displayName: name, rows: [...l].sort((a, b) => compareAthleteIds(a.providerAthleteId, b.providerAthleteId)) })).sort((a, b) => sortStr(a.displayName, b.displayName)),
    teamsOutOfBounds: captured.filter((t) => t.playerCount < ROSTER_SIZE_BOUNDS.min || t.playerCount > ROSTER_SIZE_BOUNDS.max).map((t) => ({ providerTeamId: t.providerTeamId, canonicalTricode: t.canonicalTricode, playerCount: t.playerCount, bounds: { ...ROSTER_SIZE_BOUNDS } })),
    playersWithoutJersey: captured.reduce((s, t) => s + t.players.filter((p) => p.jersey == null).length, 0),
    rosterStatusCounts: Object.fromEntries([...captured.flatMap((t) => t.players.map((p) => p.rosterStatus ?? "null")).reduce((m, s) => m.set(s, (m.get(s) ?? 0) + 1), new Map()).entries()].sort(([a], [b]) => sortStr(a, b))),
    providerSeasons: [...new Set(captured.map((t) => JSON.stringify(t.providerSeason)))].sort().map((s) => JSON.parse(s)),
  };

  return {
    schemaVersion: ROSTER_SCHEMA_VERSION,
    artifact: ROSTER_ARTIFACT,
    contractVersion: ROSTER_CONTRACT_VERSION,
    dataClass: ROSTER_DATA_CLASS,
    productEligible: false,
    neverReadBy: "app/src/app/** (public routes) — internal research only; sport-capability-registry keeps NBA HISTORICAL_ONLY",
    source: {
      id: ROSTER_SOURCE,
      name: "ESPN public team roster endpoint (site.api.espn.com)",
      urlPattern: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/<providerTeamId>/roster",
      license: "public JSON endpoint, no key; point-in-time snapshot with attribution",
    },
    capturedAt,
    asOf: capturedAt,
    asOfSemantics: "CURRENT roster at capture time. The provider's ?season= parameter relabels the payload without changing membership (verified 2026-09-22); no historical roster exists at this source. Two-way / Exhibit-10 status is not exposed.",
    teams,
    manifest,
  };
}

/** Canonical byte serialisation (stable key order is guaranteed by construction; 1-space indent like the corpus). */
export function serializeRosterArtifact(artifact) {
  return JSON.stringify(artifact, null, 1);
}

/** Content identity for change detection: the artifact with every capture instant stripped. Pure. */
export function rosterContentKey(artifact) {
  const strip = (v) => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v)) if (k !== "capturedAt" && k !== "asOf" && k !== "providerTimestamp") o[k] = strip(v[k]);
      return o;
    }
    return v;
  };
  return JSON.stringify(strip(artifact));
}
