/**
 * Soccer V2 · C-2 — ONE season rule per season model (and it is byte-for-byte the rule both old copies used),
 * and ONE module that reads both published event-id schemes without renaming a single published id.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { augMaySeason, seasonOf } from "./season.mjs";
import { seasonOfDate } from "./openfootball.mjs";
import { espnSoccerEventId, parseSoccerEventId } from "./event-id.mjs";
import { SOCCER_LEAGUES } from "./leagues.mjs";

const APP = process.cwd();

test("🔴 the shared August–May rule equals the two copies it replaced, on every day 2010–2030", () => {
  const oldOpenfootball = (iso) => { const [y, m] = String(iso).slice(0, 7).split("-").map(Number); const s = m >= 7 ? y : y - 1; return `${s}-${String(s + 1).slice(2)}`; };
  const oldElo = (iso) => { const y = Number(iso.slice(0, 4)); const m = Number(iso.slice(5, 7)); const s = m >= 7 ? y : y - 1; return `${s}-${String(s + 1).slice(2)}`; };
  for (let t = Date.UTC(2010, 0, 1); t <= Date.UTC(2030, 11, 31); t += 86_400_000) {
    const iso = new Date(t).toISOString();
    const want = oldOpenfootball(iso);
    assert.equal(augMaySeason(iso), want, iso); assert.equal(oldElo(iso), want, iso); assert.equal(seasonOfDate(iso), want, iso);
  }
  const elo = fs.readFileSync(path.join(APP, "src/lib/sports/epl/elo-poisson.mjs"), "utf8");
  assert.match(elo, /const seasonOfIso = augMaySeason;/, "the model reads the shared rule, not a copy");
});

test("seasonOf follows the registry: MLS is a calendar season, EPL rolls over in July", () => {
  assert.equal(seasonOf("epl", "2026-09-06"), "2026-27");
  assert.equal(seasonOf("epl", "2026-06-30"), "2025-26");
  assert.equal(seasonOf("mls", "2026-03-01"), "2026");
  assert.equal(seasonOf("mls", "2026-11-30"), "2026", "no July rollover for a calendar season");
  assert.equal(seasonOf("world-cup", "2026-07-19"), "2026");
});

function publishedIds() {
  const ids = new Set();
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) for (const m of fs.readFileSync(p, "utf8").matchAll(/"eventId":\s*"(soccer:[^"]+)"/g)) ids.add(m[1]);
    }
  };
  for (const d of ["public/data/soccer", "public/data/parlays", "public/data/epl"]) walk(path.join(APP, d));
  return [...ids];
}

test("🔴 every published soccer event id reads back under its league's registered scheme — nothing to rename", () => {
  const ids = publishedIds();
  assert.ok(ids.length > 0, "the scan found published ids (a scan over nothing is vacuous)");
  const bad = ids.filter((id) => parseSoccerEventId(id) == null);
  assert.deepEqual(bad, [], "ids whose shape disagrees with their league's scheme");
  const schemes = new Set(ids.map((id) => `${parseSoccerEventId(id).league}:${parseSoccerEventId(id).scheme}`));
  assert.ok(schemes.has("epl:derived") && schemes.has("ligue-1:espn"), [...schemes].join(" "));
});

test("🔴 the forecast builder's ids are reproduced exactly by the shared helper (Ligue 1, every committed row)", () => {
  const dir = path.join(APP, "public/data/soccer/ligue-1/forecasts");
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    for (const r of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).rows ?? []) {
      if (!r.providerEventId) continue;
      assert.equal(espnSoccerEventId("ligue-1", r.providerEventId), r.eventId, `${f} ${r.eventId}`); n++;
    }
  }
  assert.ok(n > 0, "rows were checked");
  const src = fs.readFileSync(path.join(APP, "scripts/soccer/build-league-forecasts.mjs"), "utf8");
  assert.match(src, /eventId: espnSoccerEventId\(L\.key, e\.id\)/);
  assert.doesNotMatch(src, /`soccer:\$\{L\.key\}:/, "no hand-built id");
});

test("the helper refuses what would mint a wrong id", () => {
  assert.throws(() => espnSoccerEventId("epl", "740123"), /derived/, "EPL publishes derived ids — never an ESPN-scheme EPL id");
  assert.throws(() => espnSoccerEventId("ligue-1", "abc"));
  assert.equal(parseSoccerEventId("soccer:epl:740123"), null, "an ESPN-shaped EPL id is refused, not guessed");
  assert.equal(parseSoccerEventId("soccer:nope:1"), null);
  for (const l of SOCCER_LEAGUES) assert.ok(["derived", "espn"].includes(l.idScheme), `${l.key}: idScheme`);
});
