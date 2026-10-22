/**
 * NCAAF · scores-only historical corpus (NCAAF-001.7). PRIVATE_RESEARCH.
 *
 * One row per game PLAYED to a final, in a deterministic chronological order, with every exclusion counted by
 * reason. It is the only input the NCAAF-002 baselines may read. It carries facts that were final after the
 * game, so its point-in-time rule lives with it:
 *
 *   A game's result is usable as a feature only for games on a LATER slate day. A slate day is the game's
 *   calendar date in America/New_York (`slateDateEt`). A forecast for slate day D reads only rows with
 *   slateDate < D, which is a morning-of-slate forecast: no same-day result can leak into it, whatever
 *   order the games finished in.
 *
 * Division: a team is FBS / FCS for a season by the provider's season-scoped group membership, reconciled to
 * teams that actually played (the FBS group carries 10–12 never-playing ids). Anything else is NON_D1. The
 * request filter that returned a game is provenance, never classification.
 *
 * Refusals (never repairs): a game not played to a final, a final without both scores, an event whose
 * season disagrees with the season requested, and two event ids that describe the same matchup on the same
 * slate day (both quarantined; picking one would be guessing).
 *
 * Pure: no I/O, no clock.
 */

export const CORPUS_SCHEMA_VERSION = "ncaaf-corpus@1";
export const DIVISIONS = Object.freeze(["FBS", "FCS", "NON_D1"]);

/** The fields of a corpus row, in serialisation order (order is part of determinism). */
export const CORPUS_ROW_FIELDS = Object.freeze([
  "eventId", "season", "seasonType", "week", "startUtc", "slateDate",
  "homeTeamId", "awayTeamId", "homeConferenceId", "awayConferenceId", "homeDivision", "awayDivision", "pairing",
  "neutralSite", "conferenceGame", "homeScore", "awayScore", "overtimePeriods",
]);

const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** `YYYY-MM-DD` of an instant in America/New_York (handles DST), or null for an unparseable time. */
export function slateDateEt(startUtc) {
  const t = Date.parse(startUtc ?? "");
  return Number.isFinite(t) ? ET_DATE.format(new Date(t)) : null;
}

/** Season division sets from provider membership, keeping only ids that appear in a game that season. */
export function reconcileMembership({ fbs = [], fcs = [] }, events) {
  const playing = new Set(events.flatMap((e) => [e.home.providerTeamId, e.away.providerTeamId]));
  const keep = (ids) => new Set([...ids].map(String).filter((id) => playing.has(id)));
  const f = keep(fbs), c = keep(fcs);
  const both = [...f].filter((id) => c.has(id)).sort();
  if (both.length) throw new Error(`membership: team id(s) ${both.join(",")} in both FBS and FCS for one season`);
  return { fbs: f, fcs: c };
}

const divisionOf = (providerTeamId, m) => (m.fbs.has(providerTeamId) ? "FBS" : m.fcs.has(providerTeamId) ? "FCS" : "NON_D1");

const ORDER = { FBS: 0, FCS: 1, NON_D1: 2 };

/**
 * Build one season's corpus from merged normalised events (`espn-events.mjs` rows) and its raw membership.
 * Returns `{ rows, excluded, membership }`; `excluded` is `[{ eventId, reason, statusRaw }]`.
 */
export function buildSeasonCorpus(season, events, rawMembership) {
  const membership = reconcileMembership(rawMembership, events);
  const excluded = [];
  const candidates = [];
  for (const e of events) {
    const base = { eventId: e.providerEventId, statusRaw: e.statusRaw ?? null };
    if (e.season !== season) { excluded.push({ ...base, reason: "SEASON_MISMATCH" }); continue; }
    if (e.resultType !== "PLAYED_FINAL") { excluded.push({ ...base, reason: e.completed ? `NOT_PLAYED_${e.resultType}` : "NOT_COMPLETED" }); continue; }
    if (e.home.score === null || e.away.score === null) { excluded.push({ ...base, reason: "MISSING_SCORE" }); continue; }
    const slateDate = slateDateEt(e.startUtc);
    if (!slateDate) { excluded.push({ ...base, reason: "MISSING_START_TIME" }); continue; }
    const homeDivision = divisionOf(e.home.providerTeamId, membership);
    const awayDivision = divisionOf(e.away.providerTeamId, membership);
    if (homeDivision === "NON_D1" && awayDivision === "NON_D1") { excluded.push({ ...base, reason: "NO_D1_TEAM" }); continue; }
    candidates.push({
      eventId: e.providerEventId,
      season,
      seasonType: e.seasonType,
      week: e.week,
      startUtc: e.startUtc,
      slateDate,
      homeTeamId: e.home.teamId,
      awayTeamId: e.away.teamId,
      homeConferenceId: e.home.providerConferenceId,
      awayConferenceId: e.away.providerConferenceId,
      homeDivision,
      awayDivision,
      pairing: [homeDivision, awayDivision].sort((a, b) => ORDER[a] - ORDER[b]).join("-"),
      neutralSite: e.neutralSite,
      conferenceGame: e.conferenceGame,
      homeScore: e.home.score,
      awayScore: e.away.score,
      overtimePeriods: e.overtimePeriods,
    });
  }

  // Two ids, same two teams, same slate day: a duplicated provider record or a data error — quarantine both.
  const key = (r) => `${r.slateDate}|${[r.homeTeamId, r.awayTeamId].sort().join("|")}`;
  const seen = new Map();
  for (const r of candidates) seen.set(key(r), (seen.get(key(r)) ?? 0) + 1);
  // A team playing twice on one slate day is equally impossible in college football.
  const teamDay = new Map();
  for (const r of candidates) for (const t of [r.homeTeamId, r.awayTeamId]) teamDay.set(`${r.slateDate}|${t}`, (teamDay.get(`${r.slateDate}|${t}`) ?? 0) + 1);

  const rows = [];
  for (const r of candidates) {
    if (seen.get(key(r)) > 1) { excluded.push({ eventId: r.eventId, statusRaw: "STATUS_FINAL", reason: "DUPLICATE_MATCHUP_SAME_DAY" }); continue; }
    if (teamDay.get(`${r.slateDate}|${r.homeTeamId}`) > 1 || teamDay.get(`${r.slateDate}|${r.awayTeamId}`) > 1) {
      excluded.push({ eventId: r.eventId, statusRaw: "STATUS_FINAL", reason: "TEAM_TWICE_SAME_DAY" }); continue;
    }
    rows.push(Object.fromEntries(CORPUS_ROW_FIELDS.map((k) => [k, r[k] ?? null])));
  }
  rows.sort((a, b) => a.startUtc.localeCompare(b.startUtc) || a.eventId.localeCompare(b.eventId));
  excluded.sort((a, b) => a.eventId.localeCompare(b.eventId));
  return { rows, excluded, membership };
}

/** Deterministic JSONL serialisation (field order fixed, trailing newline). */
export function serializeRows(rows) {
  return rows.map((r) => JSON.stringify(Object.fromEntries(CORPUS_ROW_FIELDS.map((k) => [k, r[k]])))).join("\n") + (rows.length ? "\n" : "");
}

/** Counts for the manifest. Counts only. */
export function summarizeCorpus(rows, excluded) {
  const by = (f) => rows.reduce((o, r) => ((o[f(r)] = (o[f(r)] ?? 0) + 1), o), {});
  return {
    games: rows.length,
    byPairing: by((r) => r.pairing),
    bySeasonType: by((r) => String(r.seasonType)),
    neutralSite: rows.filter((r) => r.neutralSite === true).length,
    overtime: rows.filter((r) => r.overtimePeriods > 0).length,
    teams: new Set(rows.flatMap((r) => [r.homeTeamId, r.awayTeamId])).size,
    firstSlate: rows[0]?.slateDate ?? null,
    lastSlate: rows.at(-1)?.slateDate ?? null,
    excluded: excluded.length,
    excludedByReason: excluded.reduce((o, x) => ((o[x.reason] = (o[x.reason] ?? 0) + 1), o), {}),
  };
}

/**
 * The as-of guard every model must use: rows strictly before `slateDate`. Throws on a malformed date so a
 * typo cannot silently select everything.
 */
export function rowsKnownBefore(rows, slateDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(slateDate))) throw new Error(`rowsKnownBefore: slateDate must be YYYY-MM-DD (got ${slateDate})`);
  return rows.filter((r) => r.slateDate < slateDate);
}
