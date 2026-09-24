/**
 * FREE DATA-FEED HEALTH (P258).
 *
 * The prediction engines lean on free feeds nobody pays for and nobody watches: ESPN (injuries,
 * scoreboards), MLB StatsAPI, nflverse, openfootball, the National Weather Service. A feed
 * that changes shape or goes dark does not fail loudly — the capture writes an empty file and the
 * model quietly runs on less. This names each feed, what it must contain, and whether it did.
 * Pure: the runner does the fetching.
 *
 * ⚠ B6 · THE PROBE MUST REQUEST THE SHAPE THE CAPTURES REQUEST. Until 2026-09-23 the three ESPN
 * scoreboard checks fetched the BARE endpoint while every capture fetched `?dates=<YYYYMM>&limit=1000`
 * through `espn-scoreboard-window`. From 2026-09-15 the captures' form answered 400 and the bare form
 * answered 200, so this watchdog reported the feeds healthy for a WEEK while EPL, NFL, UFC and NBA
 * results captures wrote nothing. Verified again on 2026-09-23: bare 200 · range 400 · month 200.
 * A probe that tests a different request from the one it is watching cannot see that request fail —
 * so the URLs below are built from the SAME plan the captures use, and a test pins that.
 */

import { scoreboardMonthUrls } from "../sports/espn-scoreboard-window.mjs";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";

/**
 * The scoreboard URL a CAPTURE would request for `etDate`, from the shared plan — never a hand-built
 * one. Probing today's month is enough: the failure mode is the request FORM being refused, not a
 * particular month being absent.
 */
function captureScoreboardUrl(sportPath, etDate) {
  const d = new Date(`${etDate}T12:00:00Z`);
  const [url] = scoreboardMonthUrls(sportPath, d, d);
  return url;
}

/** openfootball season folder: "2026-27" for the season that starts in August 2026. */
export function openfootballSeason(etDate) {
  const [y, m] = etDate.split("-").map(Number);
  const start = m >= 8 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}
const OPENFOOTBALL = "https://raw.githubusercontent.com/openfootball/football.json/master";

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
  const of = openfootballSeason(etDate);
  return [
    { id: "mlb-statsapi-schedule", sport: "mlb", url: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${etDate}`,
      check: json((j) => (Array.isArray(j.dates) ? null : "no dates array")) },
    { id: "espn-nfl-injuries", sport: "nfl", url: `${ESPN}/football/nfl/injuries`,
      check: json((j) => (Array.isArray(j.injuries) && j.injuries.length ? null : "no injuries")) },
    { id: "espn-nfl-scoreboard", sport: "nfl", url: captureScoreboardUrl("football/nfl", etDate),
      check: json((j) => (Array.isArray(j.events) ? null : "no events array")) },
    { id: "nflverse-games", sport: "nfl", url: "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv",
      check: csv(["game_id", "gameday", "gametime", "roof"], 1000) },
    { id: "espn-ufc-scoreboard", sport: "ufc", url: captureScoreboardUrl("mma/ufc", etDate),
      check: json((j) => (Array.isArray(j.events) ? null : "no events array")) },
    { id: "espn-epl-scoreboard", sport: "soccer", url: captureScoreboardUrl("soccer/eng.1", etDate),
      check: json((j) => (Array.isArray(j.events) ? null : "no events array")) },
    { id: "espn-ligue1-scoreboard", sport: "soccer", url: captureScoreboardUrl("soccer/fra.1", etDate),
      check: json((j) => (Array.isArray(j.events) ? null : "no events array")) },
    { id: "openfootball-epl", sport: "soccer", url: `${OPENFOOTBALL}/${of}/en.1.json`,
      check: json((j) => (Array.isArray(j.matches) && j.matches.length ? null : "no matches")) },
    { id: "openfootball-ligue1", sport: "soccer", url: `${OPENFOOTBALL}/${of}/fr.1.json`,
      check: json((j) => (Array.isArray(j.matches) && j.matches.length ? null : "no matches")) },
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
