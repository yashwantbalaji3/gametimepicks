/**
 * FREE DATA-FEED HEALTH (P258).
 *
 * The prediction engines lean on free feeds nobody pays for and nobody watches: ESPN (injuries,
 * scoreboards), MLB StatsAPI, nflverse, football-data.co.uk, the National Weather Service. A feed
 * that changes shape or goes dark does not fail loudly — the capture writes an empty file and the
 * model quietly runs on less. This names each feed, what it must contain, and whether it did.
 * Pure: the runner does the fetching.
 */

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";

/** football-data.co.uk season code: "2627" for the season that starts in August 2026. */
export function footballDataSeason(etDate) {
  const [y, m] = etDate.split("-").map(Number);
  const start = m >= 8 ? y : y - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}

const json = (pred) => (body) => { let j; try { j = JSON.parse(body); } catch { return "not JSON"; } return pred(j); };
const csv = (cols, minRows) => (body) => {
  const lines = body.split(/\r?\n/).filter(Boolean);
  const head = (lines[0] ?? "").replace(/^﻿/, "");
  const missing = cols.filter((c) => !head.split(",").includes(c));
  if (missing.length) return `header missing ${missing.join(", ")}`;
  return lines.length - 1 >= minRows ? null : `only ${lines.length - 1} row(s), expected ≥ ${minRows}`;
};

/** Each check returns null when the body is healthy, or a short reason. */
export function feedTargets({ etDate }) {
  const fd = footballDataSeason(etDate);
  return [
    { id: "mlb-statsapi-schedule", sport: "mlb", url: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${etDate}`,
      check: json((j) => (Array.isArray(j.dates) ? null : "no dates array")) },
    { id: "espn-nfl-injuries", sport: "nfl", url: `${ESPN}/football/nfl/injuries`,
      check: json((j) => (Array.isArray(j.injuries) && j.injuries.length ? null : "no injuries")) },
    { id: "espn-nfl-scoreboard", sport: "nfl", url: `${ESPN}/football/nfl/scoreboard`,
      check: json((j) => (Array.isArray(j.events) ? null : "no events array")) },
    { id: "nflverse-games", sport: "nfl", url: "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv",
      check: csv(["game_id", "gameday", "gametime", "roof"], 1000) },
    { id: "espn-ufc-scoreboard", sport: "ufc", url: `${ESPN}/mma/ufc/scoreboard`,
      check: json((j) => (Array.isArray(j.events) ? null : "no events array")) },
    { id: "espn-epl-scoreboard", sport: "soccer", url: `${ESPN}/soccer/eng.1/scoreboard`,
      check: json((j) => (Array.isArray(j.events) ? null : "no events array")) },
    { id: "espn-ligue1-scoreboard", sport: "soccer", url: `${ESPN}/soccer/fra.1/scoreboard`,
      check: json((j) => (Array.isArray(j.events) ? null : "no events array")) },
    { id: "football-data-epl", sport: "soccer", url: `https://www.football-data.co.uk/mmz4281/${fd}/E0.csv`,
      check: csv(["HomeTeam", "AwayTeam", "FTR"], 1) },
    { id: "football-data-ligue1", sport: "soccer", url: `https://www.football-data.co.uk/mmz4281/${fd}/F1.csv`,
      check: csv(["HomeTeam", "AwayTeam", "FTR"], 1) },
    { id: "nws-points", sport: "weather", url: "https://api.weather.gov/points/39.0489,-94.4839", nws: true,
      check: json((j) => (typeof j?.properties?.forecastHourly === "string" ? null : "no forecastHourly link")) },
  ];
}

/** @param {{status?:number, body?:string, error?:string, ms?:number}} res */
export function judgeFeed(target, res) {
  if (res.error) return { id: target.id, sport: target.sport, ok: false, detail: `request failed: ${res.error}`, ms: res.ms ?? null };
  if (res.status !== 200) return { id: target.id, sport: target.sport, ok: false, detail: `HTTP ${res.status}`, ms: res.ms ?? null };
  const why = target.check(res.body ?? "");
  return { id: target.id, sport: target.sport, ok: why === null, detail: why ?? "ok", ms: res.ms ?? null };
}

/** OK = all healthy; DEGRADED = some failed; DOWN = every one failed (usually the runner's network). */
export function summarizeFeeds(results) {
  const failed = results.filter((r) => !r.ok);
  const state = !results.length ? "UNKNOWN" : !failed.length ? "OK" : failed.length === results.length ? "DOWN" : "DEGRADED";
  return { state, total: results.length, failed: failed.map((r) => r.id) };
}
