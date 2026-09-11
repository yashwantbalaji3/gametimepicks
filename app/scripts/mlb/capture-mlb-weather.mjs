#!/usr/bin/env node
/**
 * Pregame weather for every MLB game on a date (P257 · data sources). $0, public-domain sources.
 *
 *   node scripts/mlb/capture-mlb-weather.mjs --date YYYY-MM-DD --now <ISO>
 *
 * StatsAPI gives each park's exact coordinates, its home-plate→center-field bearing (azimuth) and roof
 * type; the National Weather Service gives the hourly forecast for that grid point. A dome is recorded as
 * such (no weather applies). Output — research only, never a model input until preregistered:
 *   data/internal/research/mlb/weather/<date>.json   (wind OUT toward center field is the headline number)
 * Re-running the same date replaces the file with the fresher forecast; each row states its capture time.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { periodAt, summarizePeriod, windOutMph, NWS_ATTRIBUTION, NWS_USER_AGENT } from "../../src/lib/sports/weather/nws.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now") ?? new Date().toISOString();
const DATE = arg("--date") ?? NOW.slice(0, 10);
const headers = { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" };

const sched = await (await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}&hydrate=venue(location,fieldInfo)`)).json();
const games = (sched.dates ?? []).flatMap((d) => d.games ?? []);
const gridCache = new Map();
async function hourly(lat, lon) {
  const k = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (gridCache.has(k)) return gridCache.get(k);
  let periods = null;
  try {
    const pt = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers });
    if (pt.ok) {
      const url = (await pt.json())?.properties?.forecastHourly;
      const fc = url ? await fetch(url, { headers }) : null;
      if (fc?.ok) periods = (await fc.json())?.properties?.periods ?? null;
    }
  } catch { periods = null; }
  gridCache.set(k, periods);
  return periods;
}

const rows = [];
for (const g of games) {
  const v = g.venue ?? {}; const loc = v.location?.defaultCoordinates; const roof = v.fieldInfo?.roofType ?? null;
  const base = { gamePk: g.gamePk, firstPitch: g.gameDate, venue: v.name ?? null, roof, azimuth: v.location?.azimuthAngle ?? null, capturedAt: NOW };
  if (roof === "Dome") { rows.push({ ...base, state: "DOME", weather: null }); continue; }
  if (!loc) { rows.push({ ...base, state: "NO_COORDINATES", weather: null }); continue; }
  const periods = await hourly(loc.latitude, loc.longitude);
  if (!periods) { rows.push({ ...base, state: "NO_FORECAST", weather: null, note: "NWS covers US points only, or the forecast was unavailable" }); continue; }
  const w = summarizePeriod(periodAt(periods, g.gameDate));
  if (!w) { rows.push({ ...base, state: "OUTSIDE_HORIZON", weather: null }); continue; }
  rows.push({ ...base, state: roof === "Retractable" ? "FORECAST_ROOF_MAY_CLOSE" : "FORECAST", weather: { ...w, windOutMph: windOutMph(w.windMph, w.windFromDeg, base.azimuth) } });
}
const out = path.join(ROOT, "data/internal/research/mlb/weather", `${DATE}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ schemaVersion: 1, artifact: "mlb-pregame-weather", dataClass: "PRIVATE_RESEARCH", date: DATE, capturedAt: NOW, attribution: NWS_ATTRIBUTION + " Venues: MLB StatsAPI.", games: rows }, null, 1) + "\n");
const by = rows.reduce((m, r) => ((m[r.state] = (m[r.state] ?? 0) + 1), m), {});
console.log(`[mlb-weather] ${DATE}: ${rows.length} games · ${JSON.stringify(by)}`);
