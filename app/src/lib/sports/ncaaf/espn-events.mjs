/**
 * NCAAF · ESPN public scoreboard events → normalised research rows (NCAAF V1 · Stage 1, data capability).
 * PRIVATE_RESEARCH — nothing here is read by a public surface.
 *
 * What the provider actually does (probed 2026-10-09, docs/ncaaf/DATA_CAPABILITY_MATRIX.md):
 *   - A SCHEDULED game carries `score: "0"` for both sides. A score is therefore trusted ONLY when the
 *     provider marks the competition completed; before that it is `null` (missing ≠ zero).
 *   - A cross-division game (FBS vs FCS) is returned by BOTH the FBS (`groups=80`) and the FCS (`groups=81`)
 *     scoreboard. Rows are merged by provider event id; two copies that disagree are WITHHELD, never picked.
 *   - Overtime is not a flag: it is `status.period > 4` on a game played to a final. An unfinished game's
 *     overtime state is unknown (`null`), not "no".
 *   - A FORFEIT is marked completed with a 1-0 "score" (6 such events in 2021–2025). Only `STATUS_FINAL`
 *     is a played game; any other completed status keeps its status and an unknown score.
 *   - Finished games carry no odds and no injuries; those roles are not this module's to fill.
 *
 * Identity: team ids are namespaced `ncaaf-team-<ESPN id>` (the platform's `nfl-team-<ESPN id>` convention).
 * ESPN college and NFL team ids share one small integer space (e.g. both have a team "2"), so the prefix is
 * what keeps an NCAAF subject from ever resolving to an NFL one. Names never join anything.
 *
 * Pure: no I/O, no clock.
 */

export const NCAAF_SPORT = "ncaaf";
export const ESPN_CFB_GROUPS = Object.freeze({ FBS: "80", FCS: "81" });
export const REGULATION_PERIODS = 4;

const DIGITS = /^\d+$/;

export function ncaafTeamId(providerTeamId) {
  const id = String(providerTeamId ?? "");
  if (!DIGITS.test(id)) throw new Error(`ncaafTeamId: provider team id must be digits (got ${JSON.stringify(providerTeamId)})`);
  return `ncaaf-team-${id}`;
}

const intOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * One scoreboard event → `{ row }` or `{ refused: reason, providerEventId }`.
 * `sourceGroup` is the ESPN group the request asked for (80 / 81); it is provenance, not classification.
 */
export function normalizeScoreboardEvent(event, { capturedAt, sourceGroup } = {}) {
  const providerEventId = String(event?.id ?? "");
  if (!DIGITS.test(providerEventId)) return { refused: "event id is not a provider digit id", providerEventId: providerEventId || null };
  const comp = event?.competitions?.[0];
  if (!comp) return { refused: "no competition", providerEventId };
  const comps = comp.competitors ?? [];
  const side = (role) => comps.filter((c) => c?.homeAway === role);
  const [home] = side("home"), [away] = side("away");
  if (comps.length !== 2 || !home || !away) return { refused: "not exactly one home and one away competitor", providerEventId };
  if (!DIGITS.test(String(home.team?.id ?? "")) || !DIGITS.test(String(away.team?.id ?? ""))) {
    return { refused: "competitor without a provider team id", providerEventId };
  }
  if (String(home.team.id) === String(away.team.id)) return { refused: "home and away are the same team id", providerEventId };

  const statusType = comp.status?.type ?? event.status?.type ?? {};
  const completed = statusType.completed === true;
  const statusRaw = statusType.name ?? null;
  // Only a game PLAYED to a final carries a game score. The provider also marks forfeits completed, with a
  // 1-0 "score" (and sometimes 1-0 period scores) — that is an administrative result, never a game outcome.
  const resultType = !completed ? null : statusRaw === "STATUS_FINAL" ? "PLAYED_FINAL" : statusRaw === "STATUS_FORFEIT" ? "FORFEIT" : "OTHER_COMPLETED";
  const playedFinal = resultType === "PLAYED_FINAL";
  const period = intOrNull(comp.status?.period ?? event.status?.period);

  const team = (c) => {
    const score = playedFinal ? intOrNull(c.score) : null;
    const lines = Array.isArray(c.linescores) ? c.linescores.map((l) => intOrNull(l?.value)) : null;
    const linesUsable = playedFinal && lines && lines.length > 0 && lines.every((v) => v !== null);
    return {
      teamId: ncaafTeamId(c.team.id),
      providerTeamId: String(c.team.id),
      abbreviation: c.team.abbreviation ?? null,
      providerConferenceId: c.team.conferenceId != null ? String(c.team.conferenceId) : null,
      score,
      periodScores: linesUsable ? lines : null,
    };
  };
  const h = team(home), a = team(away);

  const overtime = playedFinal && period !== null ? period > REGULATION_PERIODS : null;
  const lineScoreConsistent = h.periodScores && a.periodScores && h.score !== null && a.score !== null
    ? h.periodScores.reduce((s, v) => s + v, 0) === h.score && a.periodScores.reduce((s, v) => s + v, 0) === a.score
    : null;

  return {
    row: {
      sport: NCAAF_SPORT,
      providerEventId,
      season: intOrNull(event.season?.year),
      seasonType: intOrNull(event.season?.type), // 2 regular · 3 postseason
      week: intOrNull(event.week?.number),
      startUtc: typeof comp.date === "string" ? comp.date : typeof event.date === "string" ? event.date : null,
      // ESPN `timeValid: false` = kickoff time not announced (TBD). Unknown stays unknown.
      kickoffTimeKnown: typeof comp.timeValid === "boolean" ? comp.timeValid : null,
      statusRaw,
      completed,
      resultType,
      periods: playedFinal ? period : null,
      overtime,
      overtimePeriods: overtime === null ? null : Math.max(0, period - REGULATION_PERIODS),
      neutralSite: typeof comp.neutralSite === "boolean" ? comp.neutralSite : null,
      conferenceGame: typeof comp.conferenceCompetition === "boolean" ? comp.conferenceCompetition : null,
      providerVenueId: comp.venue?.id != null ? String(comp.venue.id) : null,
      home: h,
      away: a,
      lineScoreConsistent,
      sourceGroups: sourceGroup != null ? [String(sourceGroup)] : [],
      capturedAt: capturedAt ?? null,
    },
  };
}

/** Fields that must agree when the same event arrives from two requests (capture metadata excluded). */
const contentKey = (r) => JSON.stringify({ ...r, sourceGroups: undefined, capturedAt: undefined });

/**
 * Merge rows from several requests by provider event id.
 * Identical copies collapse (their source groups are unioned); copies that disagree are WITHHELD as a
 * conflict — choosing one would be guessing which response was right.
 */
export function mergeEventRows(rows) {
  const byId = new Map();
  const conflicted = new Set();
  for (const r of rows) {
    const prev = byId.get(r.providerEventId);
    if (!prev) { byId.set(r.providerEventId, { ...r, sourceGroups: [...r.sourceGroups] }); continue; }
    if (contentKey(prev) !== contentKey(r)) { conflicted.add(r.providerEventId); continue; }
    prev.sourceGroups = [...new Set([...prev.sourceGroups, ...r.sourceGroups])].sort();
  }
  const conflicts = [...conflicted].sort();
  for (const id of conflicts) byId.delete(id);
  const events = [...byId.values()].sort((x, y) => (x.startUtc ?? "").localeCompare(y.startUtc ?? "") || x.providerEventId.localeCompare(y.providerEventId));
  return { events, conflicts };
}

/** `FBS-FBS` / `FBS-FCS` / `FCS-FCS` / `UNKNOWN` from a season's membership sets (provider team ids). */
export function divisionPairing(row, membership) {
  if (!membership) return "UNKNOWN";
  const cls = (t) => (membership.fbs?.has(t.providerTeamId) ? "FBS" : membership.fcs?.has(t.providerTeamId) ? "FCS" : null);
  const a = cls(row.home), b = cls(row.away);
  if (!a || !b) return "UNKNOWN";
  return [a, b].sort().join("-");
}

const inc = (o, k) => { o[k] = (o[k] ?? 0) + 1; };

/** Coverage counts for one season's merged rows. Counts only — no row content leaves this function. */
export function summarizeSeasonCoverage(events, membership = null) {
  const s = {
    events: events.length,
    completed: 0,
    playedFinal: 0,
    forfeits: 0,
    otherCompleted: 0,
    byStatus: {},
    bySeasonType: {},
    divisionPairing: {},
    overtime: 0,
    overtimePeriods: {},
    neutralSite: 0,
    neutralSiteUnknown: 0,
    kickoffTimeUnknown: 0,
    completedMissingScore: 0,
    lineScoreInconsistent: 0,
    lineScoreMissing: 0,
    tiesAtFinal: 0,
    teams: 0,
  };
  const teams = new Set();
  for (const e of events) {
    inc(s.byStatus, e.statusRaw ?? "UNKNOWN");
    inc(s.bySeasonType, String(e.seasonType ?? "UNKNOWN"));
    inc(s.divisionPairing, divisionPairing(e, membership));
    teams.add(e.home.providerTeamId); teams.add(e.away.providerTeamId);
    if (e.neutralSite === true) s.neutralSite++;
    if (e.neutralSite === null) s.neutralSiteUnknown++;
    if (e.kickoffTimeKnown === false || e.kickoffTimeKnown === null) s.kickoffTimeUnknown++;
    if (!e.completed) continue;
    s.completed++;
    if (e.resultType === "FORFEIT") { s.forfeits++; continue; }
    if (e.resultType !== "PLAYED_FINAL") { s.otherCompleted++; continue; }
    s.playedFinal++;
    if (e.home.score === null || e.away.score === null) { s.completedMissingScore++; continue; }
    if (e.home.score === e.away.score) s.tiesAtFinal++;
    if (e.overtime) { s.overtime++; inc(s.overtimePeriods, String(e.overtimePeriods)); }
    if (e.lineScoreConsistent === false) s.lineScoreInconsistent++;
    if (e.lineScoreConsistent === null) s.lineScoreMissing++;
  }
  s.teams = teams.size;
  return s;
}
