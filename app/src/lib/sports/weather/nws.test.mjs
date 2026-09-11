import test from "node:test";
import assert from "node:assert/strict";
import { parseWindMph, compassToDegrees, windOutMph, periodAt, summarizePeriod } from "./nws.mjs";

test("NWS wind strings and compass points", () => {
  assert.equal(parseWindMph("8 mph"), 8);
  assert.equal(parseWindMph("5 to 10 mph"), 10, "a range states its upper bound");
  assert.equal(parseWindMph(""), null);
  assert.equal(compassToDegrees("NW"), 315);
  assert.equal(compassToDegrees("ssw"), 202.5);
  assert.equal(compassToDegrees("??"), null);
});

test("wind out to center: from behind home plate is OUT, from center field is IN", () => {
  // A field whose home→center bearing is 45° (NE). Wind FROM 225° (SW) blows toward 45° — straight out.
  assert.equal(windOutMph(10, 225, 45), 10);
  assert.equal(windOutMph(10, 45, 45), -10, "from center field ⇒ blowing in");
  assert.equal(windOutMph(10, 135, 45), 0, "a crosswind has no out/in component");
  assert.equal(windOutMph(10, null, 45), null);
});

test("the forecast hour covering first pitch, and the compact row", () => {
  const periods = [
    { startTime: "2026-09-12T13:00:00-04:00", endTime: "2026-09-12T14:00:00-04:00", temperature: 70, temperatureUnit: "F", windSpeed: "6 mph", windDirection: "S", probabilityOfPrecipitation: { value: 10 }, relativeHumidity: { value: 60 }, shortForecast: "Sunny" },
    { startTime: "2026-09-12T14:00:00-04:00", endTime: "2026-09-12T15:00:00-04:00", temperature: 72, temperatureUnit: "F", windSpeed: "8 mph", windDirection: "SW", probabilityOfPrecipitation: { value: 5 }, relativeHumidity: { value: 55 }, shortForecast: "Sunny" },
  ];
  const p = periodAt(periods, "2026-09-12T18:10:00Z"); // 14:10 EDT
  assert.equal(p.temperature, 72);
  assert.deepEqual(summarizePeriod(p), { forecastHour: "2026-09-12T14:00:00-04:00", tempF: 72, windMph: 8, windFrom: "SW", windFromDeg: 225, precipPct: 5, humidityPct: 55, shortForecast: "Sunny" });
  assert.equal(periodAt(periods, "2026-09-13T18:00:00Z"), null, "outside the forecast horizon ⇒ nothing, never the nearest hour");
});

import { easternToUtcIso, nflRoofState } from "./nws.mjs";
test("Eastern kickoff times become the right UTC instant across DST", () => {
  assert.equal(easternToUtcIso("2026-09-13", "13:00"), "2026-09-13T17:00:00.000Z", "EDT = UTC−4");
  assert.equal(easternToUtcIso("2026-12-20", "13:00"), "2026-12-20T18:00:00.000Z", "EST = UTC−5");
  assert.equal(easternToUtcIso("bad", "13:00"), null);
});
test("NFL roofs: a dome gets no weather; an undetermined roof is flagged, never assumed open", () => {
  assert.equal(nflRoofState("dome"), "DOME");
  assert.equal(nflRoofState("closed"), "DOME");
  assert.equal(nflRoofState("outdoors"), "FORECAST");
  assert.equal(nflRoofState(""), "FORECAST_ROOF_UNKNOWN");
});
