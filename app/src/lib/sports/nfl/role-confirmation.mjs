/**
 * NFL ROLE CONFIRMATION — the pregame role receipt, per (event, player, family). Fail-closed (Session 9 · C).
 *
 * The product gate accepts a leg only with a POSITIVE role confirmation (candidate-universe.mjs
 * ROLE_CONFIRMED_PARTICIPATION = AVAILABLE_ROLE_CONFIRMED / STARTER / CONFIRMED). Until now nothing produced
 * one, and the T-55 pass could only REMOVE players. This module is the contract a producer must satisfy to
 * emit one, and it states plainly what today's sources can and cannot prove:
 *
 *   SOURCE (in the repo)          WHAT IT PROVES                                   PREGAME?  FRESHNESS
 *   rosters (ESPN, every window)  team membership; practice squad is NOT a role     yes       capture clock only
 *   injuries (ESPN, every window) availability (Out/IR/Susp/Q/D); never a role      yes       generatedAt + statedAt
 *   depth chart (nflverse, Wed/Sat) a depth ORDER — QBs parsed; "not official        yes       snapshot `timestamp`;
 *                                  actives, not guaranteed workload"                          35–84 h old at kickoff
 *   usage / snaps (postgame)      last week's workload — history, not this game     no        lags a week
 *
 * ⚠ "NOT INACTIVE" IS NOT "CONFIRMED". Availability evidence can only take a player OUT of a role state.
 *
 * FAMILY SEMANTICS. A universal STARTER flag would be wrong: a starting WR's receptions and a starting QB's
 * passing are different claims. Each family names the role it needs and the only source that could prove it:
 *
 *   player_pass_yds      QB1 / primary passer          depth chart QB rank 1, fresh, uncontradicted
 *   player_rush_yds      lead rusher                   NO SOURCE (committees: RB1 led rushing 80/92, 2026 W1–4)
 *   player_reception_yds / player_receptions  a receiving role   NO SOURCE (depth rank is not volume)
 *   anytime_td           an active offensive role      NO SOURCE (needs post-inactives evidence; none on Sunday)
 *
 * WHAT THE QB PATH EMITS. Even when every QB condition holds, the state is PROJECTED_DEPTH_STARTER — not one of
 * the gate's accepted values. The measured miss rate of "depth-chart QB1 = the game's top passer" at our capture
 * cadence is 8 of 90 team-games (2026 W1–4), and whether a ~9% miss rate counts as "confirmed" is a methodology /
 * founder decision, not something this module may decide by naming. `ACCEPTED_BY_GATE` is therefore empty of
 * anything this module can produce today, and a test pins that.
 *
 * Pure: the caller supplies every snapshot and the clock.
 */

export const ROLE_CONFIRMATION_VERSION = "nfl-role-confirmation@1";

export const ROLE_STATE = Object.freeze({
  CONFIRMED: "ROLE_CONFIRMED",                     // reserved: no current source can produce it
  PROJECTED_DEPTH_STARTER: "PROJECTED_DEPTH_STARTER", // QB1 by a fresh, uncontradicted depth chart — NOT accepted by the gate
  UNCERTAIN: "ROLE_UNCERTAIN",
  UNAVAILABLE: "AVAILABILITY_BLOCKED",
});

/** The participation values the product gate accepts (candidate-universe.mjs) — none is emitted here. */
export const ACCEPTED_BY_GATE = Object.freeze(["AVAILABLE_ROLE_CONFIRMED", "STARTER", "CONFIRMED"]);

export const FAMILY_ROLE = Object.freeze({
  player_pass_yds: Object.freeze({ role: "QB1 / primary passer", source: "DEPTH_CHART_QB" }),
  player_rush_yds: Object.freeze({ role: "lead rusher", source: null }),
  player_reception_yds: Object.freeze({ role: "receiving role", source: null }),
  player_receptions: Object.freeze({ role: "receiving role", source: null }),
  anytime_td: Object.freeze({ role: "active offensive role", source: null }),
});

/** Freshness rules (each a bound on evidence AGE AT KICKOFF, so a receipt cannot outlive its evidence). */
export const FRESHNESS = Object.freeze({
  depthChartMaxAgeAtKickoffMs: 36 * 3600_000,
  injuriesMaxAgeMs: 24 * 3600_000,
  rosterMaxAgeMs: 7 * 24 * 3600_000,
});

export const REASON = Object.freeze({
  POST_START_EVALUATION: "POST_START_EVALUATION",   // evaluated at/after kickoff: not a pregame receipt
  POST_START_SOURCE: "POST_START_SOURCE",           // a source stamped at/after kickoff
  NOT_ON_ROSTER: "NOT_ON_ROSTER",
  WRONG_TEAM: "WRONG_TEAM",                         // the board's team ≠ the current roster's team (a transaction)
  PRACTICE_SQUAD: "PRACTICE_SQUAD",
  ROSTER_STALE: "ROSTER_STALE",
  INJURIES_STALE: "INJURIES_STALE",
  DESIGNATED_OUT: "DESIGNATED_OUT",
  DESIGNATED_QUESTIONABLE: "DESIGNATED_QUESTIONABLE",
  NO_POSITIVE_ROLE_SOURCE: "NO_POSITIVE_ROLE_SOURCE",
  DEPTH_CHART_MISSING: "DEPTH_CHART_MISSING",
  DEPTH_CHART_STALE: "DEPTH_CHART_STALE",
  DEPTH_CHART_AMBIGUOUS: "DEPTH_CHART_AMBIGUOUS",   // zero or several rank-1 QBs
  NOT_DEPTH_QB1: "NOT_DEPTH_QB1",
  DEPTH_CHART_PREDATES_DESIGNATION: "DEPTH_CHART_PREDATES_DESIGNATION", // a QB designation landed after the chart
});

const BLOCKING = new Set(["out", "injured reserve", "suspension", "inactive"]);
const QUESTIONABLE = new Set(["questionable", "doubtful"]);
const ms = (iso) => Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));

/**
 * @param {object} o
 * @param {string} o.eventId
 * @param {string} o.eventStartUtc
 * @param {string} o.family
 * @param {{playerId:string, team:string}} o.player          board identity (`nfl-athlete-<espnId>`, team abbr)
 * @param {{generatedAt:string, teams:Array}} o.roster        rosters/latest.json
 * @param {{generatedAt:string, entries:Array}} o.injuries   injuries/nfl/latest.json
 * @param {{timestamp:string, team:string, quarterbacks:Array}|null} o.depth  the team's newest depth snapshot
 * @param {string} o.asOf                                     the evaluation instant
 */
export function evaluateRole({ eventId, eventStartUtc, family, player, roster, injuries, depth = null, asOf }) {
  const reasons = [];
  const kick = ms(eventStartUtc), now = ms(asOf);
  const espnId = /^nfl-athlete-(\d+)$/.exec(String(player?.playerId ?? ""))?.[1] ?? null;
  const rule = FAMILY_ROLE[family] ?? { role: "unknown family", source: null };
  const receipt = (state, extra = {}) => ({
    version: ROLE_CONFIRMATION_VERSION, eventId, eventStartUtc, playerId: player?.playerId ?? null, team: player?.team ?? null,
    family, role: rule.role, state, reasons, source: extra.source ?? null, capturedAt: asOf ?? null,
    sourceAsOf: extra.sourceAsOf ?? null, expiresAt: Number.isFinite(kick) ? new Date(kick).toISOString() : null,
  });

  if (!Number.isFinite(kick) || !Number.isFinite(now) || now >= kick) { reasons.push(REASON.POST_START_EVALUATION); return receipt(ROLE_STATE.UNCERTAIN); }
  for (const [name, iso] of [["roster", roster?.generatedAt], ["injuries", injuries?.generatedAt], ["depth", depth?.timestamp]]) {
    if (iso != null && ms(iso) >= kick) { reasons.push(`${REASON.POST_START_SOURCE}:${name}`); }
  }
  if (reasons.length) return receipt(ROLE_STATE.UNCERTAIN);

  // Membership: on the CURRENT roster of the board's team, and not on the practice squad.
  const teams = roster?.teams ?? [];
  const onTeam = teams.find((t) => (t.players ?? []).some((p) => String(p.id) === espnId));
  const rosterRow = onTeam?.players?.find((p) => String(p.id) === espnId) ?? null;
  if (!(Number.isFinite(ms(roster?.generatedAt)) && now - ms(roster.generatedAt) <= FRESHNESS.rosterMaxAgeMs)) reasons.push(REASON.ROSTER_STALE);
  if (!onTeam) reasons.push(REASON.NOT_ON_ROSTER);
  else if (onTeam.teamAbbr !== player?.team) reasons.push(REASON.WRONG_TEAM);
  else if (String(rosterRow?.status?.type ?? "").toLowerCase() === "practice-squad") reasons.push(REASON.PRACTICE_SQUAD);
  if (reasons.length) return receipt(ROLE_STATE.UNCERTAIN, { source: "espn-roster", sourceAsOf: roster?.generatedAt ?? null });

  // Availability: fresh injuries; a blocking designation removes, a Q/D designation never confirms.
  if (!(Number.isFinite(ms(injuries?.generatedAt)) && now - ms(injuries.generatedAt) <= FRESHNESS.injuriesMaxAgeMs)) {
    reasons.push(REASON.INJURIES_STALE);
    return receipt(ROLE_STATE.UNCERTAIN, { source: "espn-injuries", sourceAsOf: injuries?.generatedAt ?? null });
  }
  const mine = (injuries.entries ?? []).filter((e) => String(e.athleteId) === espnId).sort((a, b) => ms(b.statedAt) - ms(a.statedAt))[0];
  const status = String(mine?.status ?? "").toLowerCase();
  if (BLOCKING.has(status)) { reasons.push(REASON.DESIGNATED_OUT); return receipt(ROLE_STATE.UNAVAILABLE, { source: "espn-injuries", sourceAsOf: mine.statedAt }); }
  if (QUESTIONABLE.has(status)) { reasons.push(REASON.DESIGNATED_QUESTIONABLE); return receipt(ROLE_STATE.UNAVAILABLE, { source: "espn-injuries", sourceAsOf: mine.statedAt }); }

  // Role: only a family with a positive source can go further.
  if (rule.source !== "DEPTH_CHART_QB") { reasons.push(REASON.NO_POSITIVE_ROLE_SOURCE); return receipt(ROLE_STATE.UNCERTAIN); }
  if (!depth || depth.team !== player.team) { reasons.push(REASON.DEPTH_CHART_MISSING); return receipt(ROLE_STATE.UNCERTAIN); }
  const chartMs = ms(depth.timestamp);
  if (!Number.isFinite(chartMs) || kick - chartMs > FRESHNESS.depthChartMaxAgeAtKickoffMs) {
    reasons.push(REASON.DEPTH_CHART_STALE);
    return receipt(ROLE_STATE.UNCERTAIN, { source: "nflverse-depth-chart", sourceAsOf: depth.timestamp ?? null });
  }
  const ones = (depth.quarterbacks ?? []).filter((q) => Number(q.rank) === 1);
  if (ones.length !== 1) { reasons.push(REASON.DEPTH_CHART_AMBIGUOUS); return receipt(ROLE_STATE.UNCERTAIN, { source: "nflverse-depth-chart", sourceAsOf: depth.timestamp }); }
  if (String(ones[0].playerId) !== espnId) { reasons.push(REASON.NOT_DEPTH_QB1); return receipt(ROLE_STATE.UNCERTAIN, { source: "nflverse-depth-chart", sourceAsOf: depth.timestamp }); }
  // The chart must postdate every QB designation on this team: a chart older than "QB1 is Out" proves nothing.
  const teamId = onTeam.providerTeamId != null ? String(onTeam.providerTeamId) : null;
  const qbIds = new Set((depth.quarterbacks ?? []).map((q) => String(q.playerId)));
  const lastQbDesignation = Math.max(-Infinity, ...(injuries.entries ?? [])
    .filter((e) => qbIds.has(String(e.athleteId)) && (teamId == null || String(e.providerTeamId) === teamId))
    .map((e) => ms(e.statedAt)).filter(Number.isFinite));
  if (lastQbDesignation > chartMs) { reasons.push(REASON.DEPTH_CHART_PREDATES_DESIGNATION); return receipt(ROLE_STATE.UNCERTAIN, { source: "nflverse-depth-chart", sourceAsOf: depth.timestamp }); }
  return receipt(ROLE_STATE.PROJECTED_DEPTH_STARTER, { source: "nflverse-depth-chart + espn-roster + espn-injuries", sourceAsOf: depth.timestamp });
}

/** Does a receipt satisfy the product gate's positive role requirement? (Never true for anything emitted today.) */
export const satisfiesGate = (receipt) => ACCEPTED_BY_GATE.includes(receipt?.state);
