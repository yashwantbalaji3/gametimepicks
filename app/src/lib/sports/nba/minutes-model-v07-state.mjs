/**
 * NBA v0.7 CANDIDATE: the player-state rule shared by the fit and the runtime, so both classify identically. PURE, no I/O.
 * NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * Same seven states as the v0.5 gate. Re-implemented here because that gate is unregistered on this branch and may only be
 * read from research scripts, and a test pins this rule to the v0.5 table's counts, so the two cannot drift silently.
 * A state is a description of the box-score record. In v0.7 it sets a play probability. It never removes a player.
 */
import { corpusSeasonOfDate, inPopulation } from "./sim-v1-profile.mjs";

export const STATES = Object.freeze({
  NONE: "NONE",
  NO_APPEARANCE: "NO_APPEARANCE",
  LAST_PLAYED: "LAST_PLAYED",
  MISSED_1_COACH: "MISSED_1_COACH",
  MISSED_1_OTHER: "MISSED_1_OTHER",
  MISSED_2PLUS_COACH: "MISSED_2PLUS_COACH",
  MISSED_2PLUS_OTHER: "MISSED_2PLUS_OTHER",
});
export const FITTED_STATES = Object.freeze([STATES.NO_APPEARANCE, STATES.LAST_PLAYED, STATES.MISSED_1_COACH, STATES.MISSED_1_OTHER, STATES.MISSED_2PLUS_COACH, STATES.MISSED_2PLUS_OTHER]);

/** One player's line in one box score → "played" | "dnp_coach" | "dnp_other". */
export function lineStatus(p) {
  if (p?.didNotPlay || !Number.isInteger(p?.minutes) || p.minutes <= 0) return /COACH/i.test(String(p?.dnpReason ?? "")) ? "dnp_coach" : "dnp_other";
  return "played";
}

/**
 * @param teamGames  the team's current-season regular games before the instant, oldest first: [{ statusOf: Map(athleteId → status) }]
 * @param lastTeamBefore  team of the athlete's most recent current-season box appearance before the instant, or null
 */
export function classifyState({ teamGames, athleteId, lastTeamBefore, teamId }) {
  if (!teamGames.length) return { state: STATES.NONE, streak: 0, tenureGames: 0 };
  if (lastTeamBefore == null) return { state: STATES.NO_APPEARANCE, streak: teamGames.length, tenureGames: 0 };
  if (String(lastTeamBefore) !== String(teamId)) return { state: STATES.NONE, streak: 0, tenureGames: 0 };
  let start = -1;
  for (let i = teamGames.length - 1; i >= 0; i -= 1) if (teamGames[i].statusOf.has(athleteId)) start = i;
  const tenure = teamGames.slice(start);
  let streak = 0;
  for (let i = tenure.length - 1; i >= 0; i -= 1) {
    if ((tenure[i].statusOf.get(athleteId) ?? "absent") === "played") break;
    streak += 1;
  }
  const last = tenure.at(-1).statusOf.get(athleteId) ?? "absent";
  if (streak === 0) return { state: STATES.LAST_PLAYED, streak, tenureGames: tenure.length };
  const coach = last === "dnp_coach";
  if (streak === 1) return { state: coach ? STATES.MISSED_1_COACH : STATES.MISSED_1_OTHER, streak, tenureGames: tenure.length };
  return { state: coach ? STATES.MISSED_2PLUS_COACH : STATES.MISSED_2PLUS_OTHER, streak, tenureGames: tenure.length };
}

/** Regular-season docs of one corpus season, oldest first. */
export function regularSeasonDocs(boxscores, season) {
  return (Array.isArray(boxscores) ? boxscores : [])
    .filter((d) => d?.boxscoreAvailable && typeof d.dateUtc === "string" && inPopulation(d.phase, "regular")
      && (Number.isInteger(d.season) ? d.season : corpusSeasonOfDate(d.dateUtc)) === season)
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
}

export const teamStatusMap = (d, team) => new Map((d.players ?? []).filter((p) => p?.providerAthleteId != null && String(p.providerTeamId) === team).map((p) => [String(p.providerAthleteId), lineStatus(p)]));
export const teamIdsOf = (d) => (d.teams ?? []).map((t) => String(t.providerTeamId));

/** Runtime index over docs that already passed the as-of door. Reads nothing else. Pure. */
export function indexCurrentSeasonStatus(docs, { asOfDateUtc }) {
  const season = corpusSeasonOfDate(asOfDateUtc);
  const ordered = regularSeasonDocs(docs, season);
  const byTeam = new Map();
  const lastTeam = new Map();
  for (const d of ordered) {
    for (const id of teamIdsOf(d)) {
      if (!byTeam.has(id)) byTeam.set(id, []);
      byTeam.get(id).push({ providerEventId: String(d.providerEventId), dateUtc: d.dateUtc, statusOf: teamStatusMap(d, id) });
    }
    for (const p of d.players ?? []) if (p?.providerAthleteId != null) lastTeam.set(String(p.providerAthleteId), String(p.providerTeamId));
  }
  return { asOfDateUtc, season, docsRead: ordered.length, byTeam, lastTeam };
}

export function stateFor(index, teamId, athleteId) {
  return classifyState({ teamGames: index.byTeam.get(String(teamId)) ?? [], athleteId: String(athleteId), lastTeamBefore: index.lastTeam.get(String(athleteId)) ?? null, teamId: String(teamId) });
}
