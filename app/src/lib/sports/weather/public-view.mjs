/**
 * WEATHER AS CONTEXT, NOT AS A MODEL INPUT (P277).
 *
 * The NWS forecast for every NFL stadium has been captured since the September pipeline review and
 * has fed nothing: the regular-season input registry declares `weather: NONE — not ingested`, and
 * the totals head carries no weather term. That is the correct state — folding an unevaluated
 * signal into a published number is the one thing this repo's rules refuse — but "not in the model"
 * is not the same as "not worth knowing". A reader looking at a 40-point total in a 20 mph wind is
 * entitled to the wind.
 *
 * So it publishes as a FACT WITH ATTRIBUTION, beside the forecast and never inside it, and every
 * surface that renders it says the model does not use it. The preregistration that would let it
 * into a number is a separate, forward-scored question.
 *
 * THREE STATES, AND A ROOF WE DO NOT KNOW IS ONE OF THEM:
 *   FORECAST                open-air venue; the hourly grid nearest kickoff
 *   DOME                    roofed; there is no weather to report and none is invented
 *   FORECAST_ROOF_UNKNOWN   the schedule carries no roof for this venue. The forecast is the
 *                           open-air condition and is labelled as such — guessing "dome" from a
 *                           stadium's name would be a venue fact asserted from nowhere.
 *
 * A capture taken AFTER kickoff is not a pregame forecast, and a capture far older than the game is
 * not the conditions either. Both refuse rather than render.
 */

export const WEATHER_PUBLIC_VERSION = 1;

/** Beyond this, a pregame forecast is too old to describe the game it is shown against. */
export const MAX_FORECAST_AGE_HOURS = 48;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** Wind matters to a total mostly above a threshold; below it the number is noise a reader misreads. */
export const NOTABLE_WIND_MPH = 15;

/**
 * One game's public weather row, or null when there is nothing honest to show.
 *
 * @param {Record<string, any>} game   a row of the private capture
 * @param {string} nowIso
 */
export function publicWeatherRow(game, nowIso) {
  if (!game) return null;
  const kickoff = Date.parse(game.kickoffUtc ?? "");
  const captured = Date.parse(game.capturedAt ?? "");
  const now = Date.parse(nowIso ?? "");
  if (!Number.isFinite(kickoff) || !Number.isFinite(captured)) return null;
  /* A forecast captured after the game started describes nothing anyone can act on, and one taken
     days earlier is not these conditions. Neither is a reason to show a number. */
  if (captured >= kickoff) return null;
  if (Number.isFinite(now) && now - captured > MAX_FORECAST_AGE_HOURS * 3.6e6) return null;

  const base = {
    espnEventId: game.espnEventId ? String(game.espnEventId) : null,
    kickoffUtc: game.kickoffUtc,
    stadium: game.stadium ?? null,
    state: game.state ?? null,
    capturedAt: game.capturedAt,
  };
  if (game.state === "DOME") {
    return { ...base, indoors: true, summary: "Indoors — roofed stadium, no weather to report", tempF: null, windMph: null, precipPct: null };
  }
  const w = game.weather ?? null;
  if (!w) return null;
  const tempF = num(w.tempF);
  const windMph = num(w.windMph);
  const precipPct = num(w.precipPct);
  const parts = [];
  if (tempF != null) parts.push(`${Math.round(tempF)}°F`);
  if (windMph != null) parts.push(`${Math.round(windMph)} mph wind${w.windFrom ? ` from the ${w.windFrom}` : ""}`);
  if (precipPct != null) parts.push(`${Math.round(precipPct)}% chance of rain`);
  if (w.shortForecast) parts.push(String(w.shortForecast).toLowerCase());
  if (!parts.length) return null;
  return {
    ...base,
    indoors: false,
    tempF, windMph, precipPct,
    notableWind: windMph != null && windMph >= NOTABLE_WIND_MPH,
    /* The roof caveat travels IN the summary, so a surface cannot render the numbers and drop it. */
    summary: game.state === "FORECAST_ROOF_UNKNOWN"
      ? `${parts.join(" · ")} — the schedule carries no roof for this stadium, so this is the open-air forecast`
      : parts.join(" · "),
  };
}

/**
 * The public artifact: the week's rows, its attribution, and the sentence that must travel with it.
 *
 * @param {{capturedAt?: string, attribution?: string, games?: Array<Record<string, any>>}} capture
 * @param {{nowIso: string, week?: string|null}} opts
 */
export function buildPublicWeather(capture, { nowIso, week = null }) {
  const rows = (capture?.games ?? []).map((g) => publicWeatherRow(g, nowIso)).filter(Boolean);
  return {
    schemaVersion: WEATHER_PUBLIC_VERSION,
    artifact: "nfl-pregame-weather-public",
    dataClass: "PUBLIC_DERIVED",
    week: week ?? capture?.week ?? null,
    capturedAt: capture?.capturedAt ?? null,
    generatedAt: nowIso,
    attribution: capture?.attribution ?? null,
    /* Said once, in the artifact itself, so it cannot be dropped by a surface that forgets. */
    modelUse: "NOT_INGESTED — the forecast model does not use weather; these are conditions shown beside it, never inside it",
    eventCount: rows.length,
    rows,
  };
}
