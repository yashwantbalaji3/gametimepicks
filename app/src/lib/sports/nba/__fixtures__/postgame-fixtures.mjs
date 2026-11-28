/**
 * Synthetic inputs for postgame-evaluation tests. Shapes follow the committed artifacts (nba-forecast-receipt@1 games,
 * the finals record, boxscore-parse docs); every number is invented and labelled synthetic.
 */
import { FAMILIES, LABELS } from "../experimental-forecast.mjs";

export const DATE = "2026-11-02";
const HOME = { abbr: "DET", name: "Detroit Pistons", providerTeamId: "8" };
const AWAY = { abbr: "BOS", name: "Boston Celtics", providerTeamId: "2" };

const q = (mean) => ({ mean, sd: 3, p10: mean - 5, p50: mean, p90: mean + 5 });
export const synthPlayer = (id, teamSide) => ({
  providerAthleteId: id, name: `Synthetic ${teamSide} ${id}`, expectedMinutes: 30, rates: { pts: 0.6, reb: 0.2, ast: 0.15, threePm: 0.08 },
  pts: q(18), reb: q(6), ast: q(4.5), threePm: q(2.4),
});

/** One frozen game. `frozenAt` defaults to 6 h before tip. */
export function synthGame({ id, tip = `${DATE}T23:00Z`, frozenAt = null, pElo = 0.6, pSim = 0.55, family = "v0.1", home = HOME, away = AWAY } = {}) {
  const gen = frozenAt ?? new Date(Date.parse(tip) - 6 * 3_600_000).toISOString().replace(/\.000Z$/, "Z");
  return {
    providerEventId: String(id), label: LABELS[2], seasonType: 2, population: "regular", dateUtc: tip, etDate: DATE,
    home, away,
    forecast: {
      inputAsOf: gen,
      elo: { pHome: pElo, pAway: 1 - pElo },
      sim: { pHome: pSim, pAway: 1 - pSim, home: q(110), away: q(106), margin: q(4), total: q(216) },
      players: { home: [synthPlayer(`${id}1`, "home")], away: [synthPlayer(`${id}2`, "away")] },
      publishedSide: pElo === 0.5 ? "TOO_CLOSE" : pElo > 0.5 ? "HOME" : "AWAY",
      sideRule: { id: "nba-winner-side@1", head: "elo", tooClose: "exact 0.5 only", generation: FAMILIES[family]?.modelVersion ?? null },
    },
    receipt: { schema: "nba-forecast-receipt@1", eventId: String(id), family, modelVersion: FAMILIES[family]?.modelVersion ?? family, generatedAt: gen, tipUtc: tip, preTip: true, payloadSha256: "synthetic" },
  };
}

export function synthDoc(family, games) {
  return { schemaVersion: 1, artifact: "nba-experimental-forecasts", family, modelVersion: FAMILIES[family].modelVersion, date: DATE, games };
}

/** A finals record row; `homeWins` decides the score. */
export function synthFinal(id, { homeWins = true, dateUtc = `${DATE}T23:00Z`, home = HOME, away = AWAY } = {}) {
  return {
    providerEventId: String(id), dateUtc, dateEt: DATE, season: "2026-27", seasonType: 2, phase: "REGULAR",
    home: { tricode: home.abbr, providerTeamId: home.providerTeamId }, away: { tricode: away.abbr, providerTeamId: away.providerTeamId },
    ftHome: homeWins ? 112 : 101, ftAway: homeWins ? 104 : 109, winnerSide: homeWins ? "home" : "away", statusRaw: "STATUS_FINAL",
  };
}
export const synthRecord = (finals, conflicts = []) => ({ schemaVersion: 1, contract: "nba-finals-record-v1", season: "2026-27", updatedAt: "synthetic", finals, conflicts, refused: [] });

/** A final box score for a synthetic game: both predicted players played. */
export function synthBox(id, { status = "STATUS_FINAL" } = {}) {
  const row = (pid, teamId, pts) => ({ providerAthleteId: pid, providerTeamId: teamId, name: `p${pid}`, didNotPlay: false, minutes: 31, pts, reb: 7, ast: 4, threePm: 2 });
  return { providerEventId: String(id), boxscoreAvailable: true, status, players: [row(`${id}1`, HOME.providerTeamId, 21), row(`${id}2`, AWAY.providerTeamId, 12)] };
}

export function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}
