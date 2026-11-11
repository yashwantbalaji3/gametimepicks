/**
 * NFL PARTICIPATION · WHO MAY HOLD AN OPPORTUNITY SHARE (eligibility contract v1). PURE.
 *
 * build-nfl-participation.mjs used to read the injuries feed in one direction only: a listed blocking designation removed
 * a player, and anyone the feed did not list was AVAILABLE_ROLE_UNCERTAIN. Absence was read as health (INC-2026-11-08-01,
 * Achane). Now a player keeps a share only when the contract resolves him ELIGIBLE from the injuries AND roster captures;
 * INELIGIBLE and UNKNOWN players are removed before ranking and recorded with the contract's own record.
 */
import { eligibilityRecord, resolveEligibility } from "../../availability/eligibility.mjs";

/**
 * @param {{ playerId: string }} player          a role-shares player ("nfl-athlete-<id>")
 * @param {string} teamAbbr                      the schedule's team code
 * @param {{ asOf: string, injuries: object|null, roster: object|null, teamIdByAbbr: Record<string, string> }} ctx
 */
export function opportunityEligibility(player, teamAbbr, ctx) {
  const r = resolveEligibility({ sport: "nfl", playerId: player.playerId, teamId: ctx.teamIdByAbbr?.[teamAbbr] ?? null, asOf: ctx.asOf, injuries: ctx.injuries, roster: ctx.roster });
  return { eligible: r.state === "ELIGIBLE", eligibility: eligibilityRecord(r) };
}

/**
 * The role-share players of one team who may NOT hold an opportunity share at `ctx.asOf` (sim-v2 shadow build and its
 * replay, player-run.mjs — the two must agree or a receipt cannot be re-derived).
 * @param {object|null} teamBlock  role-shares-v1 team block ({ passAttempts, targets, rushAttempts: { players } })
 */
export function shareExclusions(teamBlock, teamAbbr, ctx) {
  const ids = new Set();
  for (const k of ["passAttempts", "targets", "rushAttempts"]) for (const p of teamBlock?.[k]?.players ?? []) if (!ids.has(p.playerId) && !opportunityEligibility(p, teamAbbr, ctx).eligible) ids.add(p.playerId);
  return ids;
}

/** team code → provider team id, from the roster capture itself. */
export const teamIdsFromRoster = (roster) => Object.fromEntries((roster?.teams ?? []).filter((t) => t?.teamAbbr && t?.providerTeamId != null).map((t) => [t.teamAbbr, String(t.providerTeamId)]));
