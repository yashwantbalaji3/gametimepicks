/**
 * Pregame weather from the US National Weather Service (api.weather.gov) — public domain, free, no key,
 * commercial use permitted (P257 · data sources). Pure helpers, unit-tested without a network.
 *
 * Why NWS and not Open-Meteo: Open-Meteo's free tier is non-commercial. Every NFL stadium and every MLB park
 * but one is in the US (Toronto's roof is retractable). Historical weather for backtests comes from what the
 * leagues themselves record: StatsAPI's per-game `weather` (MLB) and nflverse games.csv temp/wind (NFL).
 *
 * Nothing here is a model input until a preregistration says so — these are research tables.
 */
const COMPASS = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };

/** "8 mph" or "5 to 10 mph" → the upper number, as NWS's hourly forecast states a range. */
export function parseWindMph(text) {
  const nums = String(text ?? "").match(/\d+(\.\d+)?/g);
  return nums ? Math.max(...nums.map(Number)) : null;
}

/** "NW" → 315 (the direction the wind blows FROM, meteorological convention). */
export function compassToDegrees(dir) {
  const d = COMPASS[String(dir ?? "").trim().toUpperCase()];
  return d == null ? null : d;
}

/**
 * The wind's component along a baseball field's home-plate→center-field axis. `azimuth` (StatsAPI) is the
 * bearing from home plate to center field; `fromDeg` is where the wind blows FROM. Positive = blowing OUT
 * toward center field, negative = blowing in, rounded to 0.1 mph.
 */
export function windOutMph(speedMph, fromDeg, azimuth) {
  if (![speedMph, fromDeg, azimuth].every(Number.isFinite)) return null;
  const toward = (fromDeg + 180) % 360;
  const rad = ((toward - azimuth) * Math.PI) / 180;
  return Math.round(speedMph * Math.cos(rad) * 10) / 10 || 0; // a pure crosswind is 0, never -0
}

/** The hourly period covering an instant (NWS periods are [startTime, endTime)). */
export function periodAt(periods, iso) {
  const t = Date.parse(iso);
  return (periods ?? []).find((p) => Date.parse(p.startTime) <= t && t < Date.parse(p.endTime)) ?? null;
}

/** One NWS hourly period → our compact weather row. */
export function summarizePeriod(p) {
  if (!p) return null;
  return {
    forecastHour: p.startTime,
    tempF: p.temperatureUnit === "C" ? Math.round((p.temperature * 9) / 5 + 32) : p.temperature,
    windMph: parseWindMph(p.windSpeed), windFrom: p.windDirection ?? null, windFromDeg: compassToDegrees(p.windDirection),
    precipPct: p.probabilityOfPrecipitation?.value ?? null, humidityPct: p.relativeHumidity?.value ?? null,
    shortForecast: p.shortForecast ?? null,
  };
}

export const NWS_ATTRIBUTION = "Forecast: US National Weather Service (api.weather.gov), public domain.";
export const NWS_USER_AGENT = "gametimepicks-research (bot@users.noreply.github.com)";

/** A kickoff stated in US Eastern time ("2026-09-13", "13:00") → ISO UTC, DST-correct. */
export function easternToUtcIso(date, hhmm) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? "")); const t = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ""));
  if (!m || !t) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess)).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  const asEt = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return new Date(guess + (guess - asEt)).toISOString();
}

/** nflverse roof → whether outdoor weather applies. "" (not yet determined) is flagged, never assumed open. */
export function nflRoofState(roof) {
  const r = String(roof ?? "").toLowerCase();
  if (r === "dome" || r === "closed") return "DOME";
  if (r === "outdoors" || r === "open") return "FORECAST";
  return "FORECAST_ROOF_UNKNOWN";
}
