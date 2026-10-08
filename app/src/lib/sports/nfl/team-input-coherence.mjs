/**
 * TEAM-INPUT COHERENCE — is the published team forecast blind to a starting quarterback's absence?
 * (NFL World Model V2 · Week 5 readiness, 2026-10-08.)
 *
 * The team heads (margin-of-victory Elo win head, refit-home-advantage margin head, v3 totals) rate
 * teams from results and play efficiency. They take no availability input, and giving them one is a
 * model change that needs its own evidence (the pregame QB-availability study was refused for want of
 * capture instants: reports/pregame-availability-margin-refusal.json). This module does NOT adjust a
 * number. It states, per game, when the forecast was produced without knowing that a team's depth-chart
 * QB1 is unavailable — the case where the sportsbook price has absorbed information our number has not.
 *
 * Measured on TB @ DAL (2026-10-08): Baker Mayfield Out since 10-05; our DAL 61.8% sat 16.6 points under
 * the no-vig 78.4% and was published as an "experimental lean" toward Tampa. That gap is the missing
 * input, not a view about the game, so a model-vs-market comparison is WITHHELD on such games and the
 * reader is told why. The win chance itself still publishes under its own label.
 *
 * MATERIALITY IS A ROLE FACT: the excluded player held pass-attempt opportunity (the participation
 * artifact's own family) AND is his team's depth-chart QB1 at the forecast's generation time. A backup on
 * IR is not material; no name enters by opinion. An unreadable chart or participation record yields
 * UNKNOWN, which withholds nothing and says so.
 */

export const TEAM_INPUT_COHERENCE_VERSION = 1;

/**
 * @param {object} a
 * @param {{excludedIneligible?: Array<{playerId: string, name: string, team: string, market: string, status: string, statedAt?: string}>, injuriesAsOf?: string|null}|null} a.participation
 * @param {string[]} a.teams the game's two teams (board/ESPN spelling)
 * @param {(team: string) => {state: string, starter?: {playerId: string|number, name?: string}, snapshotAt?: string}|null} a.qb1Of
 * @returns {{version: number, consumedByModel: false, state: "BLIND_TO_STARTING_QB_ABSENCE"|"NO_STARTING_QB_ABSENCE"|"UNKNOWN", absences: object[], participationAsOf: string|null, comparisonWithheld: boolean, note: string|null}}
 */
export function teamInputCoherence({ participation, teams, qb1Of }) {
  const base = { version: TEAM_INPUT_COHERENCE_VERSION, consumedByModel: false, participationAsOf: participation?.injuriesAsOf ?? null };
  if (!participation || !Array.isArray(participation.excludedIneligible)) {
    return { ...base, state: "UNKNOWN", absences: [], comparisonWithheld: false, note: null, reason: "no participation record for this game" };
  }
  const passers = new Map();
  for (const e of participation.excludedIneligible) {
    if (e.market !== "passAttempts" || !teams.includes(e.team)) continue;
    passers.set(e.playerId, e);
  }
  const absences = [];
  const unread = [];
  for (const e of passers.values()) {
    const chart = qb1Of(e.team);
    if (!chart || chart.state !== "RESOLVED" || chart.starter?.playerId == null) { unread.push(e.team); continue; }
    if (`nfl-athlete-${chart.starter.playerId}` !== e.playerId) continue;
    absences.push({ playerId: e.playerId, name: e.name, team: e.team, status: e.status, statedAt: e.statedAt ?? null, depthChartAt: chart.snapshotAt ?? null });
  }
  if (absences.length) {
    const who = absences.map((x) => `${x.name} (${x.team}, ${x.status})`).join(" and ");
    return {
      ...base,
      state: "BLIND_TO_STARTING_QB_ABSENCE",
      absences,
      comparisonWithheld: true,
      note: `This forecast does not account for ${who}. Our team model rates teams from past results and does not adjust for who plays quarterback, so it is not compared with the sportsbooks for this game — their price already reflects the absence.`,
    };
  }
  if (unread.length) {
    return { ...base, state: "UNKNOWN", absences: [], comparisonWithheld: false, note: null, reason: `no readable depth chart for ${[...new Set(unread)].join(", ")}` };
  }
  return { ...base, state: "NO_STARTING_QB_ABSENCE", absences: [], comparisonWithheld: false, note: null };
}
