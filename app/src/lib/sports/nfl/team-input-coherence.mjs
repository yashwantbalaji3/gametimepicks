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
 *
 * VERSION 2 (2026-11-15, founder P0 "QB-dependent forecasts"): the depth chart alone missed MIN on 11-15 (Kyler Murray,
 * MIN's passer in 3 of its last 4 games, listed Out while the chart still named Cousins QB1). An excluded passer is now
 * also material when he is the team's PRIMARY PASSER: the most pass attempts over the team's last 4 games before the
 * forecast (actual box scores, `primaryPasserOf`). Either basis suffices; each absence records which one fired. With no
 * `primaryPasserOf` the function behaves exactly as version 1. A primary passer who is now on ANOTHER team's roster
 * (`currentTeamOf`, the roster capture) is a departure (LV and ARI on 11-15: Cousins to MIN, Brissett to BAL) and is
 * material too: the team ratings were earned with him.
 */

export const TEAM_INPUT_COHERENCE_VERSION = 2; // the version this module implements; a forecast records the version applied
export const TEAM_INPUT_COHERENCE_V1 = 1;

/** PURE. The team's primary passer before `beforeIso`: most pass attempts over its last `n` games (ties → most recent game). */
export function primaryPasserFrom(games, team, beforeIso, n = 4) {
  const t = Date.parse(beforeIso);
  const abbr = (x) => { const a = typeof x === "string" ? x : x?.abbr; return a === "LA" ? "LAR" : a === "WAS" ? "WSH" : a ?? null; };
  const mine = (games ?? []).filter((g) => Date.parse(g.dateUtc) < t && (abbr(g.home) === team || abbr(g.away) === team)).sort((a, b) => Date.parse(b.dateUtc) - Date.parse(a.dateUtc)).slice(0, n);
  const att = new Map(), last = new Map(), names = new Map();
  mine.forEach((g, i) => { for (const p of g.players ?? []) if (p.teamAbbr === team && (p.passAtt ?? 0) > 0) { names.set(p.playerId, p.name ?? null); att.set(p.playerId, (att.get(p.playerId) ?? 0) + p.passAtt); if (!last.has(p.playerId)) last.set(p.playerId, i); } });
  const best = [...att.entries()].sort((a, b) => b[1] - a[1] || last.get(a[0]) - last.get(b[0]))[0];
  return best ? { playerId: best[0], name: names.get(best[0]) ?? null, attempts: best[1], games: mine.length } : null;
}

/**
 * @param {object} a
 * @param {{excludedIneligible?: Array<{playerId: string, name: string, team: string, market: string, status: string, statedAt?: string}>, injuriesAsOf?: string|null}|null} a.participation
 * @param {string[]} a.teams the game's two teams (board/ESPN spelling)
 * @param {(team: string) => {state: string, starter?: {playerId: string|number, name?: string}, snapshotAt?: string}|null} a.qb1Of
 * @param {((team: string) => {playerId: string, name?: string|null, attempts: number, games: number}|null)|null} [a.primaryPasserOf] version 2
 * @param {((playerId: string) => string|null)|null} [a.currentTeamOf] version 2: the player's team on the roster capture
 * @returns {{version: number, consumedByModel: false, state: "BLIND_TO_STARTING_QB_ABSENCE"|"NO_STARTING_QB_ABSENCE"|"UNKNOWN", absences: object[], participationAsOf: string|null, comparisonWithheld: boolean, note: string|null}}
 */
export function teamInputCoherence({ participation, teams, qb1Of, primaryPasserOf = null, currentTeamOf = null }) {
  const base = { version: primaryPasserOf ? TEAM_INPUT_COHERENCE_VERSION : TEAM_INPUT_COHERENCE_V1, consumedByModel: false, participationAsOf: participation?.injuriesAsOf ?? null };
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
    const primary = primaryPasserOf ? primaryPasserOf(e.team) : null;
    const isPrimary = primary != null && primary.playerId === e.playerId;
    const chartRead = chart && chart.state === "RESOLVED" && chart.starter?.playerId != null;
    const isQb1 = chartRead && `nfl-athlete-${chart.starter.playerId}` === e.playerId;
    if (!isQb1 && !isPrimary) { if (!chartRead) unread.push(e.team); continue; }
    absences.push({ playerId: e.playerId, name: e.name, team: e.team, status: e.status, statedAt: e.statedAt ?? null, depthChartAt: chart?.snapshotAt ?? null, ...(primaryPasserOf ? { basis: [isQb1 ? "DEPTH_CHART_QB1" : null, isPrimary ? `PRIMARY_PASSER_${primary.attempts}_ATT_LAST_${primary.games}` : null].filter(Boolean) } : {}) });
  }
  if (primaryPasserOf && currentTeamOf) {
    for (const team of teams) {
      const primary = primaryPasserOf(team);
      if (!primary || absences.some((a) => a.playerId === primary.playerId)) continue;
      const now = currentTeamOf(primary.playerId);
      if (now == null || now === team) continue;
      absences.push({ playerId: primary.playerId, name: primary.name ?? primary.playerId, team, status: `no longer on the roster (now ${now})`, statedAt: null, depthChartAt: null, basis: [`PRIMARY_PASSER_${primary.attempts}_ATT_LAST_${primary.games}`, "DEPARTED"] });
    }
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
