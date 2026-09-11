/**
 * Every NFL home stadium resolves to the United States (P257). The first geocode placed the Titans'
 * Nissan Stadium in Yokohama, Japan — a same-name venue abroad would silently forecast the wrong weather.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/nfl/stadiums-v1.json"), "utf8"));

test("home stadiums are geocoded, inside the US, and say so", () => {
  const home = d.stadiums.filter((s) => s.location === "Home");
  assert.ok(home.length >= 30);
  for (const s of home) {
    assert.ok(Number.isFinite(s.latitude) && Number.isFinite(s.longitude), `${s.stadium}: geocoded`);
    assert.ok(s.latitude > 24 && s.latitude < 50 && s.longitude > -125 && s.longitude < -66, `${s.stadium}: ${s.latitude},${s.longitude} is outside the contiguous US`);
    assert.equal(s.country, "US", `${s.stadium}: matched "${s.matched}"`); // derived from the coordinates, not the truncated address
  }
  assert.match(d.attribution, /OpenStreetMap/); assert.match(d.attribution, /ODbL/);
});
