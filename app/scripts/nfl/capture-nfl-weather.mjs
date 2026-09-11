#!/usr/bin/env node
/**
 * Pregame weather for every NFL game in the next seven days (P257 · data sources). $0, public-domain forecast.
 *
 *   node scripts/nfl/capture-nfl-weather.mjs --now <ISO> [--days 7]
 *
 * The schedule comes from nflverse's public games file (kickoff in ET, stadium id, roof); the stadium's
 * coordinates from data/internal/research/nfl/stadiums-v1.json; the forecast from the National Weather Service
 * hourly grid at that point. Domes and closed roofs are recorded as such; a roof nflverse has not yet
 * determined is flagged rather than assumed open; a stadium outside the US gets no forecast.
 * Output — research only: data/internal/research/nfl/weather/<season>-wk<week>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../../src/lib/sports/nfl/nflverse.mjs";
import { periodAt, summarizePeriod, easternToUtcIso, nflRoofState, NWS_ATTRIBUTION, NWS_USER_AGENT } from "../../src/lib/sports/weather/nws.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const NOW = arg("--now") ?? new Date().toISOString();
const DAYS = Number(arg("--days", "7"));
const headers = { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" };
const stadiums = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/stadiums-v1.json"), "utf8")).stadiums.map((s) => [s.stadiumId, s]));

const res = await fetch("https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv");
if (!res.ok) { console.error(`REFUSED: games.csv HTTP ${res.status}`); process.exit(3); }
const from = Date.parse(NOW), to = from + DAYS * 86_400_000;
const upcoming = parseCsv(await res.text())
  .map((g) => ({ ...g, kickoffUtc: easternToUtcIso(g.gameday, g.gametime) }))
  .filter((g) => g.kickoffUtc && Date.parse(g.kickoffUtc) > from && Date.parse(g.kickoffUtc) <= to && g.home_score === "");

const cache = new Map();
async function hourly(lat, lon) {
  const k = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (cache.has(k)) return cache.get(k);
  let periods = null;
  try {
    const pt = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers });
    const url = pt.ok ? (await pt.json())?.properties?.forecastHourly : null;
    const fc = url ? await fetch(url, { headers }) : null;
    periods = fc?.ok ? (await fc.json())?.properties?.periods ?? null : null;
  } catch { periods = null; }
  cache.set(k, periods);
  return periods;
}

const byWeek = new Map();
for (const g of upcoming) {
  const st = stadiums.get(g.stadium_id);
  const state = nflRoofState(g.roof || st?.roof);
  const base = { gameId: g.game_id, espnEventId: g.espn || null, kickoffUtc: g.kickoffUtc, home: g.home_team, away: g.away_team, stadium: g.stadium, roof: g.roof || st?.roof || null, capturedAt: NOW };
  let row;
  if (state === "DOME") row = { ...base, state, weather: null };
  else if (!st?.latitude) row = { ...base, state: "NO_COORDINATES", weather: null };
  else {
    const periods = await hourly(st.latitude, st.longitude);
    const w = periods ? summarizePeriod(periodAt(periods, g.kickoffUtc)) : null;
    row = { ...base, state: periods ? (w ? state : "OUTSIDE_HORIZON") : "NO_FORECAST", weather: w };
  }
  const key = `${g.season}-wk${String(g.week).padStart(2, "0")}`;
  byWeek.set(key, [...(byWeek.get(key) ?? []), row]);
}
const dir = path.join(ROOT, "data/internal/research/nfl/weather");
fs.mkdirSync(dir, { recursive: true });
for (const [key, games] of byWeek) {
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify({ schemaVersion: 1, artifact: "nfl-pregame-weather", dataClass: "PRIVATE_RESEARCH", week: key, capturedAt: NOW, attribution: `${NWS_ATTRIBUTION} Schedule: nflverse (CC BY 4.0). Coordinates: © OpenStreetMap contributors (ODbL).`, games }, null, 1) + "\n");
  const by = games.reduce((m, r) => ((m[r.state] = (m[r.state] ?? 0) + 1), m), {});
  console.log(`[nfl-weather] ${key}: ${games.length} games · ${JSON.stringify(by)}`);
}
if (!byWeek.size) console.log("[nfl-weather] no NFL game in the window");
