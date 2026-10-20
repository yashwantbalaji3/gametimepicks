/**
 * SYNTHETIC FIXTURES for the grader-v2 tests (experimental-grading-ledger, champion-challenger, model-diagnostics,
 * grader-metrics v2). Shapes copy the committed artifacts (forecast game · box-score doc · finals record); every value
 * is invented. Nothing here is a real game, a real player or a real result.
 */
import { gradeForecastGame, LABELS } from "../experimental-forecast.mjs";

export const FIXTURE_NOTE = "SYNTHETIC FIXTURE — grader v2 tests; not a real game, player or result";
export const HOME = "101", AWAY = "202";
export const REG = LABELS[2], PRE = LABELS[1];

const q = (mean, sd) => ({ mean, sd, p10: Math.round((mean - 1.28 * sd) * 100) / 100, p50: mean, p90: Math.round((mean + 1.28 * sd) * 100) / 100 });

/** A predicted player in the artifact's shape. */
export function predPlayer(id, { em = 30, pts = 15, reb = 6, ast = 4, tpm = 2, injuryStatus = null, rates = null } = {}) {
  return {
    providerAthleteId: String(id), name: `Synthetic ${id}`, expectedMinutes: em, availability: "active", injuryStatus,
    rates: rates ?? { pts: pts / em, reb: reb / em, ast: ast / em, threePm: tpm / em },
    minutes: q(em, 3), pts: q(pts, 5), reb: q(reb, 2.5), ast: q(ast, 2), threePm: q(tpm, 1.2),
    pra: q(pts + reb + ast, 7), ptsAst: q(pts + ast, 6), ptsReb: q(pts + reb, 6),
  };
}

/** A forecast game in the artifact's shape. */
export function forecastGame(id, { pHome = 0.6, eloPHome = 0.58, marginMean = 3, totalMean = 220, label = REG, inputAsOf = "2030-01-10T12:00:00Z", dateUtc = "2030-01-11T00:00Z", home = [], away = [], overtimeRate } = {}) {
  return {
    providerEventId: String(id), label, seasonType: label === REG ? 2 : 1, population: label === REG ? "regular" : "preseason", dateUtc,
    home: { providerTeamId: HOME }, away: { providerTeamId: AWAY },
    forecast: {
      inputAsOf,
      elo: { pHome: eloPHome },
      sim: {
        pHome, tieMass: 0.04, ...(overtimeRate != null ? { overtimeRate } : {}),
        home: { mean: totalMean / 2 + marginMean / 2 }, away: { mean: totalMean / 2 - marginMean / 2 },
        margin: { mean: marginMean, p10: marginMean - 16, p50: marginMean, p90: marginMean + 16 },
        total: { mean: totalMean, p10: totalMean - 20, p50: totalMean, p90: totalMean + 20 },
      },
      players: { home, away },
    },
  };
}

/** A box-score row. */
export const boxRow = (id, team, over = {}) => ({ providerAthleteId: String(id), name: `Synthetic ${id}`, providerTeamId: team, starter: true, active: true, didNotPlay: false, dnpReason: null, minutes: 30, pts: 15, reb: 6, ast: 4, threePm: 2, threePa: 5, fgm: 6, fga: 12, ftm: 1, fta: 2, stl: 1, blk: 0, tov: 2, oreb: 1, dreb: 5, pf: 2, plusMinus: 0, ...over });

/** A box-score doc whose two sides each sum to `teamMinutes` (5 × 48 = 240 regulation). */
export function boxDoc(id, { teamMinutes = 240, homeRows = null, awayRows = null, status = "STATUS_FINAL", capturedAt = "2030-01-11T06:00:00Z", periods } = {}) {
  const fill = (team, prefix) => {
    const rows = []; let left = teamMinutes;
    for (let i = 0; i < 8; i += 1) { const m = i === 7 ? left : Math.min(left, 30); rows.push(boxRow(`${prefix}${i}`, team, { minutes: m, starter: i < 5 })); left -= m; }
    return rows;
  };
  return {
    fixture: FIXTURE_NOTE, schemaVersion: 1, providerEventId: String(id), season: null, phase: 2, dateUtc: "2030-01-11T00:00Z", capturedAt, source: "espn_summary", status,
    boxscoreAvailable: true, teams: [{ providerTeamId: HOME, homeAway: "home" }, { providerTeamId: AWAY, homeAway: "away" }],
    players: [...(homeRows ?? fill(HOME, "h")), ...(awayRows ?? fill(AWAY, "a"))],
    ...(periods ? { periods } : {}),
  };
}

/** A finals-record doc (finals-record.mjs shape) holding the given finals. */
export function finalsRecord(season, finals, conflicts = []) {
  return {
    fixture: FIXTURE_NOTE, schemaVersion: 1, sport: "nba", dataClass: "FINALS_RECORD", contract: "nba-finals-record-v1", season,
    finals: finals.map(([id, ftHome, ftAway, dateUtc = "2030-01-11T00:00Z"]) => ({ providerEventId: String(id), dateUtc, ftHome, ftAway, winnerSide: ftHome > ftAway ? "home" : "away", home: { tricode: "HHH", providerTeamId: HOME }, away: { tricode: "AAA", providerTeamId: AWAY }, phase: "REGULAR" })),
    conflicts, refused: [],
  };
}

/**
 * An ESPN `summary` payload that parseSummary turns back into `doc` (the inverse of boxscore-parse.mjs) — used to
 * replay a stat correction offline. `period` is the header status period (4 = regulation).
 */
export function summaryFromDoc(doc, { period = 4 } = {}) {
  const LABELS = ["MIN", "PTS", "FG", "3PT", "FT", "REB", "AST", "TO", "STL", "BLK", "OREB", "DREB", "PF", "+/-"];
  const s = (v) => (v == null ? "--" : String(v));
  const ma = (m, a) => (m == null || a == null ? "--" : `${m}-${a}`);
  const teamObj = (t) => ({ id: t.providerTeamId, abbreviation: t.abbr ?? null, displayName: t.name ?? null });
  const stats = (p) => {
    if (p.didNotPlay) return [];
    if (p.minutes == null) return ["--", "0", "0-0", "0-0", "0-0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
    const pm = p.plusMinus == null ? "--" : p.plusMinus > 0 ? `+${p.plusMinus}` : String(p.plusMinus);
    return [s(p.minutes), s(p.pts), ma(p.fgm, p.fga), ma(p.threePm, p.threePa), ma(p.ftm, p.fta), s(p.reb), s(p.ast), s(p.tov), s(p.stl), s(p.blk), s(p.oreb), s(p.dreb), s(p.pf), pm];
  };
  const athlete = (p) => ({
    athlete: p.providerAthleteId == null ? { shortName: p.name } : { id: p.providerAthleteId, displayName: p.name },
    starter: p.starter, ...(p.active == null ? {} : { active: p.active }), didNotPlay: p.didNotPlay, ...(p.dnpReason ? { reason: p.dnpReason } : {}),
    stats: stats(p),
  });
  return {
    fixture: FIXTURE_NOTE,
    header: { competitions: [{ status: { period, type: { name: doc.status } }, competitors: doc.teams.map((t) => ({ homeAway: t.homeAway, team: teamObj(t) })) }] },
    boxscore: {
      teams: doc.teams.map((t) => ({ homeAway: t.homeAway, team: teamObj(t) })),
      players: doc.teams.map((t) => ({ team: teamObj(t), statistics: [{ labels: LABELS, athletes: doc.players.filter((p) => String(p.providerTeamId) === String(t.providerTeamId)).map(athlete) }] })),
    },
  };
}

/** A graded game through the REAL grader. */
export function graded(id, { final = [110, 100], box = null, ...over } = {}) {
  return gradeForecastGame(forecastGame(id, over), { ftHome: final[0], ftAway: final[1], source: "fixture" }, box);
}
