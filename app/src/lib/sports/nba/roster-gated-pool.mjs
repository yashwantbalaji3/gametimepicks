/**
 * NBA roster-gated player pool v0.1 (v1.8 Track A · A1) — PURE, deterministic, no I/O.
 * NBA PRESEASON — EXPERIMENTAL · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * v0 simulates "everyone who appeared in a box score for this team" — blind to every offseason
 * move. Measured on the 2026-10-03 artifact: 22 of 40 simulated players were no longer on the two
 * rosters and 16 rostered players were absent. This module is the versioned correction, run BESIDE
 * v0 (its own artifact family, its own ledger) so the two can be graded side by side from Oct 3.
 *
 * THE RULES (each is a pinned test; each has a mutation probe in roster-gated-pool.test.mjs):
 *   1. A simulated player must be on the captured roster AS OF THE FORECAST INSTANT. Box-score
 *      membership is history, not authority: a departed player is EXCLUDED and listed.
 *   2. A rostered player with no usable history is present with state INSUFFICIENT_HISTORY:
 *      expectedMinutes null (never 0), rates null, listed — the sim skips them visibly.
 *   3. A rostered player whose history is on ANOTHER team (a trade, a signing) keeps that history
 *      (per-minute rates travel with the player; the minutes are a prior, not a role certainty):
 *      historyBasis "other-team", historyTeam recorded, availability re-read under the NEW team.
 *   4. No roster capture → the forecast REFUSES (fails closed). It never falls back to history.
 *   5. A roster captured AFTER the forecast instant is leakage → REFUSED. A roster older than
 *      ROSTER_MAX_AGE_HOURS → REFUSED (the capture is daily; 48 h tolerates one missed run).
 *   6. Two-way status is not exposed by the free source and is never inferred here.
 *   7. Deterministic ordering (expected minutes desc, then athlete id) so the seeded simulation
 *      consumes its uniforms in the same order on every run.
 */
import { expectedMinutes, availabilityFromInjuries } from "./minutes-model.mjs";
import { rosterForTeam } from "./roster-contract.mjs";

export const POOL_VERSION = "nba-roster-gated-pool-v0.1";
export const ROSTER_MAX_AGE_HOURS = 48;
export const MINUTES_STATES = Object.freeze({ MODELLED: "MODELLED", INSUFFICIENT_HISTORY: "INSUFFICIENT_HISTORY", OUT: "OUT" });
export const HISTORY_BASES = Object.freeze({ SAME_TEAM: "same-team", OTHER_TEAM: "other-team", NONE: "none" });
export const GATE_REFUSALS = Object.freeze({
  ROSTER_CAPTURE_MISSING: "ROSTER_CAPTURE_MISSING",
  ROSTER_AS_OF_UNKNOWN: "ROSTER_AS_OF_UNKNOWN",
  ROSTER_FROM_THE_FUTURE: "ROSTER_FROM_THE_FUTURE",
  ROSTER_STALE: "ROSTER_STALE",
  ROSTER_TEAM_MISSING: "ROSTER_TEAM_MISSING",
  ROSTER_TEAM_EMPTY: "ROSTER_TEAM_EMPTY",
});

const r2 = (x) => (x == null ? null : Number(x.toFixed(2)));

/** Is the roster capture usable at `now`? Pure. */
export function checkRosterFreshness(rosters, now, { maxAgeHours = ROSTER_MAX_AGE_HOURS } = {}) {
  const t = Date.parse(now);
  if (!Number.isFinite(t)) throw new Error("checkRosterFreshness: now (ISO) is required");
  if (!rosters || typeof rosters !== "object") return { ok: false, reason: GATE_REFUSALS.ROSTER_CAPTURE_MISSING, asOf: null, ageHours: null };
  const asOf = rosters.asOf ?? rosters.capturedAt ?? null;
  const a = Date.parse(asOf ?? "");
  if (!Number.isFinite(a)) return { ok: false, reason: GATE_REFUSALS.ROSTER_AS_OF_UNKNOWN, asOf, ageHours: null };
  const ageHours = (t - a) / 3_600_000;
  if (ageHours < 0) return { ok: false, reason: GATE_REFUSALS.ROSTER_FROM_THE_FUTURE, asOf, ageHours: r2(ageHours) };
  if (ageHours > maxAgeHours) return { ok: false, reason: GATE_REFUSALS.ROSTER_STALE, asOf, ageHours: r2(ageHours), maxAgeHours };
  return { ok: true, reason: null, asOf, ageHours: r2(ageHours), maxAgeHours };
}

/**
 * Most recent team (in this population, strictly before asOf) each athlete appeared for.
 * Only non-DNP appearances count: a player who was only ever listed DNP for a team has no history there.
 */
export function lastAppearanceTeamIndex(boxscores, asOfDateUtc, population = "regular") {
  const cutoff = Date.parse(asOfDateUtc);
  const wantPre = population === "preseason";
  const idx = new Map(); // athleteId → { providerTeamId, dateUtc }
  for (const d of Array.isArray(boxscores) ? boxscores : []) {
    if (!d?.boxscoreAvailable || typeof d.dateUtc !== "string" || !(Date.parse(d.dateUtc) < cutoff)) continue;
    if ((d.phase === 1) !== wantPre) continue;
    for (const p of d.players ?? []) {
      if (p.providerAthleteId == null || p.didNotPlay || !Number.isInteger(p.minutes)) continue;
      const id = String(p.providerAthleteId);
      const prev = idx.get(id);
      if (!prev || Date.parse(d.dateUtc) > Date.parse(prev.dateUtc)) idx.set(id, { providerTeamId: String(p.providerTeamId), dateUtc: d.dateUtc });
    }
  }
  return idx;
}

/**
 * Build the roster-gated minutes-model result for one team. Returns
 *   { state: "GATED", rows, gate, ...minutes-model fields }   — rows are minutes-model-shaped, so
 *                                                               game-sim.prepareRoster consumes them unchanged
 *   { state: "REFUSED", reason, gate }                        — fail closed; the caller must not simulate
 *
 * @param rosters         roster capture artifact (roster-parse.mjs) — REQUIRED (null → REFUSED)
 * @param providerTeamId  ESPN team id
 * @param boxscores       box-score docs
 * @param asOfDateUtc     the forecast instant (leakage cutoff for history AND the roster)
 * @param injuries        injuries feed entries[] or null
 * @param population      "regular" | "preseason"
 * @param teamMinutesCache optional Map(teamId → expectedMinutes() result) shared across sides/games
 */
export function gatePool({ rosters, providerTeamId, boxscores, asOfDateUtc, injuries = null, population = "regular", teamMinutesCache = new Map() }) {
  const teamId = String(providerTeamId);
  const fresh = checkRosterFreshness(rosters, asOfDateUtc);
  const gateBase = { poolVersion: POOL_VERSION, rosterAsOf: fresh.asOf, rosterAgeHours: fresh.ageHours, maxAgeHours: ROSTER_MAX_AGE_HOURS };
  if (!fresh.ok) return { state: "REFUSED", reason: fresh.reason, gate: { ...gateBase, refusal: fresh.reason } };

  const team = rosterForTeam(rosters, teamId);
  if (!team) {
    const listed = (rosters.teams ?? []).find((t) => String(t.providerTeamId) === teamId);
    return { state: "REFUSED", reason: GATE_REFUSALS.ROSTER_TEAM_MISSING, gate: { ...gateBase, refusal: GATE_REFUSALS.ROSTER_TEAM_MISSING, detail: listed?.reason ?? "team not in roster capture" } };
  }
  if (!Array.isArray(team.players) || team.players.length === 0) {
    return { state: "REFUSED", reason: GATE_REFUSALS.ROSTER_TEAM_EMPTY, gate: { ...gateBase, refusal: GATE_REFUSALS.ROSTER_TEAM_EMPTY } };
  }

  const minutesFor = (tid) => {
    const key = `${tid}|${population}`;
    if (!teamMinutesCache.has(key)) teamMinutesCache.set(key, expectedMinutes({ boxscores, teamProviderId: tid, asOfDateUtc, injuries, population }));
    return teamMinutesCache.get(key);
  };
  const same = minutesFor(teamId);
  const sameById = new Map(same.rows.map((r) => [String(r.providerAthleteId), r]));
  const lastTeam = lastAppearanceTeamIndex(boxscores, asOfDateUtc, population);

  const rows = [];
  const insufficientHistory = [];
  const otherTeamHistory = [];
  const out = [];
  for (const p of team.players) {
    const id = String(p.providerAthleteId);
    const avail = availabilityFromInjuries(injuries, teamId, id);
    let row = sameById.get(id) ?? null;
    let historyBasis = row ? HISTORY_BASES.SAME_TEAM : HISTORY_BASES.NONE;
    let historyTeam = row ? teamId : null;
    if (!row) {
      const last = lastTeam.get(id);
      if (last && last.providerTeamId !== teamId) {
        const other = minutesFor(last.providerTeamId).rows.find((r) => String(r.providerAthleteId) === id) ?? null;
        if (other) { row = other; historyBasis = HISTORY_BASES.OTHER_TEAM; historyTeam = last.providerTeamId; }
      }
    }
    const isOut = avail.availability === "out";
    const modelled = row != null && Number.isFinite(row.expectedMinutes);
    const gated = {
      providerAthleteId: id,
      name: row?.name ?? p.displayName ?? null,
      expectedMinutes: isOut || !modelled ? null : row.expectedMinutes,
      minutesSd: isOut || !modelled ? null : (row.minutesSd ?? null),
      starterRate: row?.starterRate ?? null,
      gamesUsed: row?.gamesUsed ?? 0,
      dnpCount: row?.dnpCount ?? 0,
      nullMinutesCount: row?.nullMinutesCount ?? 0,
      basis: row?.basis ?? "insufficient",
      availability: avail.availability,          // re-read under the CURRENT team (a traded player's Out is filed under his new club)
      injuryStatus: avail.injuryStatus,
      rates: modelled ? (row.rates ?? null) : null,
      rateSd: modelled ? (row.rateSd ?? null) : null,
      lastSeenDateUtc: row?.lastSeenDateUtc ?? null,
      minutesState: isOut ? MINUTES_STATES.OUT : modelled ? MINUTES_STATES.MODELLED : MINUTES_STATES.INSUFFICIENT_HISTORY,
      historyBasis,
      historyTeam,
      rosterPosition: p.position ?? null,
      rosterExperienceYears: p.experienceYears ?? null,
    };
    rows.push(gated);
    if (isOut) out.push({ providerAthleteId: id, name: gated.name, injuryStatus: gated.injuryStatus });
    else if (!modelled) insufficientHistory.push({ providerAthleteId: id, name: gated.name, position: gated.rosterPosition, experienceYears: gated.rosterExperienceYears, gamesUsed: gated.gamesUsed, dnpCount: gated.dnpCount, historyBasis });
    if (historyBasis === HISTORY_BASES.OTHER_TEAM) otherTeamHistory.push({ providerAthleteId: id, name: gated.name, historyTeam, expectedMinutes: gated.expectedMinutes, basis: gated.basis });
  }
  rows.sort((a, b) => (b.expectedMinutes ?? -1) - (a.expectedMinutes ?? -1) || (Number(a.providerAthleteId) - Number(b.providerAthleteId)) || a.providerAthleteId.localeCompare(b.providerAthleteId));

  const onRoster = new Set(team.players.map((p) => String(p.providerAthleteId)));
  const excludedNotOnRoster = same.rows.filter((r) => !onRoster.has(String(r.providerAthleteId)))
    .map((r) => ({ providerAthleteId: String(r.providerAthleteId), name: r.name ?? null, expectedMinutes: r.expectedMinutes ?? null, basis: r.basis, lastSeenDateUtc: r.lastSeenDateUtc ?? null }));

  return {
    state: "GATED",
    // minutes-model fields (so the sim's assumptions block reads the same keys as v0)
    modelVersion: same.modelVersion,
    teamProviderId: teamId,
    asOfDateUtc,
    population,
    trailingN: same.trailingN,
    seasonUsed: same.seasonUsed,
    teamGamesInSeason: same.teamGamesInSeason,
    teamGamesInWindow: same.teamGamesInWindow,
    windowFromDateUtc: same.windowFromDateUtc,
    windowToDateUtc: same.windowToDateUtc,
    injuriesProvided: same.injuriesProvided,
    rows,
    // Re-derived against the GATED rows: an injured rookie is on the roster (so matched), a departed player's
    // stale injury row is not a miss of ours. v0's list is team-history-based and would misreport both.
    unmatchedInjuries: (Array.isArray(injuries) ? injuries : [])
      .filter((e) => String(e?.providerTeamId) === teamId && !rows.some((r) => r.providerAthleteId === String(e?.athleteId)))
      .map((e) => ({ athleteId: String(e.athleteId), athleteName: e.athleteName ?? null, status: e.status ?? null })),
    gate: {
      ...gateBase,
      rule: "pool = captured roster as of the forecast instant; history looked up by athlete (same team, else last team); no roster → refuse; no history → INSUFFICIENT_HISTORY (null, never 0); two-way never inferred",
      rosterSize: team.players.length,
      rosterCapturedAt: team.capturedAt ?? null,
      simulated: rows.filter((r) => r.minutesState === MINUTES_STATES.MODELLED).length,
      insufficientHistory,
      out,
      otherTeamHistory,
      excludedNotOnRoster,
      v0PoolSize: same.rows.length,
      v0PoolRetained: same.rows.length - excludedNotOnRoster.length,
    },
  };
}
