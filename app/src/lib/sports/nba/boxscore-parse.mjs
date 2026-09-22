/**
 * NBA player box-score parser (NBA readiness track N1) — PURE, deterministic, no I/O.
 *
 * Turns one ESPN `summary?event=<id>` payload into the canonical per-game box-score document that
 * `data/internal/research/nba/boxscores/<providerEventId>.json` stores. Rules that must never bend:
 *
 *   - A missing or unparseable stat is `null`, NEVER 0. Zero-filling absent data was the defect
 *     class behind the official-stats platform incident (v1.2) — a "0 rebounds" that really means
 *     "no row" poisons every downstream rate. `null` is the only honest value.
 *   - A DNP athlete keeps `didNotPlay: true` with EVERY stat null (ESPN sends `stats: []`), and the
 *     `reason` is recorded only for DNPs: ESPN stamps "COACH'S DECISION" on players who DID play.
 *   - ESPN's label order is asserted against the expected 14 and the parse THROWS on any difference
 *     (position-indexed stats are meaningless the moment the columns move). The caller decides
 *     whether to abort; nothing here guesses a column by name.
 *   - Team identity: the raw ESPN abbreviation is kept verbatim and ALSO resolved to the canonical
 *     tricode of `lib/nba/identity-contract.ts` (mirrored here because that contract is TypeScript
 *     and this parser runs under plain node). Non-NBA exhibition clubs (Real Madrid, Cairns
 *     Taipans …) resolve to `null` — never fuzzy-joined onto a franchise.
 */

export const BOXSCORE_SCHEMA_VERSION = 1;
export const BOXSCORE_SOURCE = "espn_summary";

/** ESPN NBA box-score column order, verified on event 401812480. Position-indexed; guarded below. */
export const EXPECTED_LABELS = Object.freeze([
  "MIN", "PTS", "FG", "3PT", "FT", "REB", "AST", "TO", "STL", "BLK", "OREB", "DREB", "PF", "+/-",
]);

/**
 * ESPN abbreviation → canonical tricode. Mirrors TEAM_ALIAS_GROUPS in lib/nba/identity-contract.ts
 * (ESPN's divergent codes are BK/BKN, CHA, GS, NO, NY, PHX, SA, UTAH, WSH). Keys are lower-case.
 */
const ESPN_ABBR_TO_CANONICAL = new Map(Object.entries({
  atl: "ATL", bos: "BOS", bk: "BKN", bkn: "BKN", cha: "CHA", cho: "CHA", chi: "CHI", cle: "CLE",
  dal: "DAL", den: "DEN", det: "DET", gs: "GSW", gsw: "GSW", hou: "HOU", ind: "IND", lac: "LAC",
  lal: "LAL", mem: "MEM", mia: "MIA", mil: "MIL", min: "MIN", no: "NOP", nor: "NOP", nop: "NOP",
  ny: "NYK", nyk: "NYK", okc: "OKC", orl: "ORL", phi: "PHI", pho: "PHX", phx: "PHX", por: "POR",
  sac: "SAC", sa: "SAS", sas: "SAS", tor: "TOR", uta: "UTA", utah: "UTA", wsh: "WAS", was: "WAS",
}));

/** Canonical tricode for an ESPN abbreviation, or null (exhibition club / unknown — never guessed). */
export function canonicalTricodeFromEspnAbbr(abbr) {
  if (typeof abbr !== "string") return null;
  return ESPN_ABBR_TO_CANONICAL.get(abbr.trim().toLowerCase()) ?? null;
}

export class LabelOrderError extends Error {
  constructor(actual) {
    super(`ESPN box-score label order differs from the expected 14: got ${JSON.stringify(actual)}`);
    this.name = "LabelOrderError";
    this.actual = actual;
  }
}

/** Throws LabelOrderError unless `labels` is exactly EXPECTED_LABELS in order. */
export function assertLabelOrder(labels) {
  const ok = Array.isArray(labels)
    && labels.length === EXPECTED_LABELS.length
    && labels.every((l, i) => l === EXPECTED_LABELS[i]);
  if (!ok) throw new LabelOrderError(labels);
}

/** "12" → 12, "+9" → 9, "-12" → -12, "--"/""/undefined/"2-5" → null. Integers only; never 0 by default. */
export function parseIntStat(v) {
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!/^[+-]?\d+$/.test(s)) return null;
  return Number(s);
}

/** "2-5" → { made: 2, attempted: 5 }; anything else → { made: null, attempted: null }. */
export function parseMadeAttempted(v) {
  const none = { made: null, attempted: null };
  if (typeof v !== "string") return none;
  const m = /^\s*(\d+)-(\d+)\s*$/.exec(v);
  if (!m) return none;
  return { made: Number(m[1]), attempted: Number(m[2]) };
}

const NULL_STATS = Object.freeze({
  minutes: null, pts: null, reb: null, ast: null, threePm: null, threePa: null, fgm: null, fga: null,
  ftm: null, fta: null, stl: null, blk: null, tov: null, oreb: null, dreb: null, pf: null, plusMinus: null,
});

/**
 * Parse one athlete row (already known to be in EXPECTED_LABELS order). `stats` shorter than 14
 * yields nulls for the missing tail; DNP yields all-null regardless of what `stats` carries.
 */
export function parseAthlete(entry, providerTeamId) {
  const a = entry?.athlete ?? {};
  const didNotPlay = entry?.didNotPlay === true;
  const active = typeof entry?.active === "boolean" ? entry.active : null;
  const base = {
    providerAthleteId: a.id != null ? String(a.id) : null,
    name: typeof a.displayName === "string" ? a.displayName : typeof a.shortName === "string" ? a.shortName : null,
    providerTeamId: providerTeamId != null ? String(providerTeamId) : null,
    starter: entry?.starter === true,
    active,
    didNotPlay,
    dnpReason: didNotPlay && typeof entry?.reason === "string" && entry.reason.trim() ? entry.reason.trim() : null,
  };
  if (didNotPlay) return { ...base, ...NULL_STATS };
  const s = Array.isArray(entry?.stats) ? entry.stats : [];
  const minutes = parseIntStat(s[0]);
  // ESPN QUIRK (verified on events 401584742 and 401810184; 316 rows across 2023-26): a non-DNP row
  // can arrive with MIN "--" and every other column a literal "0"/"0-0". Two shapes: an INACTIVE
  // roster player (active:false, e.g. James Harden pre-trade) and a PHANTOM roster placeholder
  // (active:true, athlete has no id/displayName, only a shortName). Those zeros are ESPN's zero-fill
  // of an absent row, not observations — passing them through is exactly the absent-as-zero defect
  // this corpus exists to avoid. Minutes are the participation evidence (ESPN writes a literal "0"
  // for a real sub-minute stint): no minutes on a non-DNP row ⇒ null across the board.
  if (minutes === null) return { ...base, ...NULL_STATS };
  const fg = parseMadeAttempted(s[2]);
  const tp = parseMadeAttempted(s[3]);
  const ft = parseMadeAttempted(s[4]);
  return {
    ...base,
    minutes,
    pts: parseIntStat(s[1]),
    fgm: fg.made, fga: fg.attempted,
    threePm: tp.made, threePa: tp.attempted,
    ftm: ft.made, fta: ft.attempted,
    reb: parseIntStat(s[5]),
    ast: parseIntStat(s[6]),
    tov: parseIntStat(s[7]),
    stl: parseIntStat(s[8]),
    blk: parseIntStat(s[9]),
    oreb: parseIntStat(s[10]),
    dreb: parseIntStat(s[11]),
    pf: parseIntStat(s[12]),
    plusMinus: parseIntStat(s[13]),
  };
}

/**
 * Parse a full ESPN summary payload into the stored document.
 *
 * @param summary   raw JSON from site.api.espn.com .../summary?event=<id>
 * @param meta      { providerEventId, season, phase, dateUtc, capturedAt } — from the research corpus row
 * @returns         { doc, labelSets: string[] }  (labelSets = distinct JSON-encoded label arrays seen)
 * @throws          LabelOrderError when any team block's labels differ from EXPECTED_LABELS
 */
export function parseSummary(summary, meta) {
  const comp = summary?.header?.competitions?.[0] ?? {};
  const status = comp?.status?.type?.name ?? summary?.header?.status?.type?.name ?? null;

  // Team identity from boxscore.teams (carries homeAway); header competitors are the fallback.
  const sideById = new Map();
  for (const t of summary?.boxscore?.teams ?? []) if (t?.team?.id != null) sideById.set(String(t.team.id), t.homeAway ?? null);
  for (const c of comp?.competitors ?? []) if (c?.team?.id != null && !sideById.has(String(c.team.id))) sideById.set(String(c.team.id), c.homeAway ?? null);

  const teamsById = new Map();
  const noteTeam = (team) => {
    if (team?.id == null) return;
    const id = String(team.id);
    if (teamsById.has(id)) return;
    const abbr = typeof team.abbreviation === "string" ? team.abbreviation : null;
    teamsById.set(id, {
      providerTeamId: id,
      abbr,
      canonicalTricode: canonicalTricodeFromEspnAbbr(abbr),
      name: typeof team.displayName === "string" ? team.displayName : null,
      homeAway: sideById.get(id) ?? null,
    });
  };
  for (const c of comp?.competitors ?? []) noteTeam(c?.team);
  for (const t of summary?.boxscore?.teams ?? []) noteTeam(t?.team);

  const playerBlocks = Array.isArray(summary?.boxscore?.players) ? summary.boxscore.players : [];
  const labelSets = new Set();
  const players = [];
  for (const block of playerBlocks) {
    noteTeam(block?.team);
    const teamId = block?.team?.id != null ? String(block.team.id) : null;
    for (const stat of block?.statistics ?? []) {
      const labels = stat?.labels ?? null;
      labelSets.add(JSON.stringify(labels));
      assertLabelOrder(labels);
      for (const entry of stat?.athletes ?? []) players.push(parseAthlete(entry, teamId));
    }
  }

  const teams = [...teamsById.values()].sort((a, b) => (a.homeAway === "home" ? -1 : 1) - (b.homeAway === "home" ? -1 : 1));
  const boxscoreAvailable = players.length > 0;

  return {
    doc: {
      schemaVersion: BOXSCORE_SCHEMA_VERSION,
      providerEventId: String(meta.providerEventId),
      season: meta.season ?? null,
      phase: meta.phase ?? null,
      dateUtc: meta.dateUtc ?? null,
      capturedAt: meta.capturedAt,
      source: BOXSCORE_SOURCE,
      status,
      boxscoreAvailable,
      teams,
      players,
    },
    labelSets: [...labelSets],
  };
}

/** Non-DNP rows with null minutes (each one nulled across the board by the no-minutes rule). */
export function countNullMinutes(doc) {
  return (doc?.players ?? []).filter((p) => !p.didNotPlay && p.minutes === null).length;
}

/** Breakdown of countNullMinutes by ESPN shape: inactive roster player · phantom row (no athlete id) · other. */
export function noMinutesBreakdown(doc) {
  const out = { inactive: 0, noAthleteId: 0, other: 0 };
  for (const p of doc?.players ?? []) {
    if (p.didNotPlay || p.minutes !== null) continue;
    if (p.active === false) out.inactive += 1;
    else if (p.providerAthleteId == null) out.noAthleteId += 1;
    else out.other += 1;
  }
  return out;
}
