/**
 * NBA minutes · PLAYER-TYPE TAGS (pregame, may overlap), shared by the exploratory evaluation
 * (scripts/nba/research/evaluate-nba-minutes-by-player-type.mjs) and the v0.3 preregistered scorer (minutes-v03-prereg.mjs).
 * PURE over the box-score docs it is given. Definitions are frozen (fixed before any number was computed):
 *   rookie     no NBA regular-season appearance before this season
 *   traded     appeared for another team this season, or last prior-season team ≠ this team; ≤ 10 games here
 *   returning  missed the team's last ≥ 3 games (injury DNP or not listed) after appearing for it this season
 *   star       prior-season regular mean ≥ 30 min (current season if ≥ 5 games and no prior season)
 *   starter    started ≥ 50% of current-season appearances (prior season if < 5 current), not a star
 *   bench      none of star / starter
 *   promoted   started ≥ 2 of the team's last 3 games, with a starter share < 20% before those 3
 */
export const PLAYER_TYPES = Object.freeze(["star", "starter", "bench", "rookie", "traded", "returning", "promoted"]);

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** @param {any[]} box  box-score docs, each with an integer `season` (corpus label) @returns {(id: string, teamId: string, t: number, season: number) => string[]} */
export function buildPlayerTagger(box) {
  const regular = (d) => d?.boxscoreAvailable && d.phase === 2;
  const appsByAthlete = new Map();
  for (const d of [...box].sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc))) {
    if (!regular(d)) continue;
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null) continue;
      const id = String(p.providerAthleteId);
      if (!appsByAthlete.has(id)) appsByAthlete.set(id, []);
      appsByAthlete.get(id).push({ t: Date.parse(d.dateUtc), season: d.season ?? null, eventId: String(d.providerEventId), teamId: String(p.providerTeamId), played: !p.didNotPlay && p.minutes > 0, minutes: p.minutes, starter: p.starter === true });
    }
  }
  const tgCache = new Map();
  const teamGamesBefore = (teamId, t, season) => {
    const k = `${teamId}:${t}:${season}`;
    if (!tgCache.has(k)) tgCache.set(k, box.filter((d) => regular(d) && d.season === season && Date.parse(d.dateUtc) < t && d.teams.some((x) => String(x.providerTeamId) === teamId)).sort((a, b) => Date.parse(b.dateUtc) - Date.parse(a.dateUtc)));
    return tgCache.get(k);
  };
  return function tagsOf(id, teamId, t, season) {
    const apps = (appsByAthlete.get(id) ?? []).filter((a) => a.t < t && a.played);
    const cur = apps.filter((a) => a.season === season), prior = apps.filter((a) => a.season === season - 1);
    const tags = new Set();
    if (!apps.some((a) => a.season < season)) tags.add("rookie");
    const here = cur.filter((a) => a.teamId === teamId).length;
    if (here <= 10 && (cur.some((a) => a.teamId !== teamId) || (prior.length && prior.at(-1).teamId !== teamId))) tags.add("traded");
    const tg = teamGamesBefore(teamId, t, season);
    if (here > 0 && tg.length >= 3 && tg.slice(0, 3).every((d) => !d.players.some((p) => String(p.providerAthleteId) === id && !p.didNotPlay && p.minutes > 0))) tags.add("returning");
    const basis = prior.length ? prior : cur.length >= 5 ? cur : [];
    if (basis.length && mean(basis.map((a) => a.minutes)) >= 30) tags.add("star");
    const sBasis = cur.length >= 5 ? cur : prior;
    if (!tags.has("star") && sBasis.length && sBasis.filter((a) => a.starter).length / sBasis.length >= 0.5) tags.add("starter");
    if (!tags.has("star") && !tags.has("starter")) tags.add("bench");
    const last3 = tg.slice(0, 3).map((d) => d.players.find((p) => String(p.providerAthleteId) === id));
    const before3 = cur.filter((a) => a.teamId === teamId && !tg.slice(0, 3).some((d) => String(d.providerEventId) === a.eventId));
    if (tg.length >= 3 && last3.filter((p) => p?.starter === true && !p.didNotPlay).length >= 2 && (before3.length === 0 || before3.filter((a) => a.starter).length / before3.length < 0.2)) tags.add("promoted");
    return [...tags];
  };
}
