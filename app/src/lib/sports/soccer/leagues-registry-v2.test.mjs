/**
 * Soccer V2 · C-1 — the league registry says what each competition IS, every claim it makes is backed by a
 * file, the openfootball table is derived from it (not a second hand-kept list), and nothing new publishes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SOCCER_LEAGUES, league, soccerLeaguePages } from "./leagues.mjs";
import { OPENFOOTBALL_LEAGUES } from "./openfootball.mjs";
import { SOURCES } from "../source-registry.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const exists = (rel) => fs.existsSync(path.join(REPO, rel));

const STAGES = new Set(["LIVE", "ACCEPTED_V1", "REJECTED_V1", "RESEARCH", "PLANNED", "HOLD", "ARCHIVE"]);
const KINDS = new Set(["club-league", "club-cup", "national"]);
const SEASONS = new Set(["aug-may", "calendar", "tournament"]);

test("🔴 every competition says what it is — kind, season model, format — with no guessed counts", () => {
  const keys = new Set();
  for (const l of SOCCER_LEAGUES) {
    assert.ok(!keys.has(l.key), `duplicate key ${l.key}`); keys.add(l.key);
    assert.ok(STAGES.has(l.stage), `${l.key}: stage ${l.stage}`);
    assert.ok(KINDS.has(l.kind), `${l.key}: kind`);
    assert.ok(SEASONS.has(l.season?.model), `${l.key}: season.model`);
    for (const n of ["fixtures", "clubs"]) assert.ok(l.season[n] === null || (Number.isInteger(l.season[n]) && l.season[n] > 0), `${l.key}: season.${n} is a count or null`);
    for (const b of ["relegation", "playoffs", "knockout", "extraTime", "neutral"]) assert.equal(typeof l.format?.[b], "boolean", `${l.key}: format.${b}`);
    assert.ok([1, 2].includes(l.format.legs), `${l.key}: legs`);
    assert.ok(l.route === null || /^\/[a-z0-9/-]+$/.test(l.route), `${l.key}: route`);
  }
  assert.equal(league("mls").season.model, "calendar", "MLS is a calendar-year season — the July rollover does not apply");
});

test("🔴 the openfootball table is DERIVED from the registry and equals the table it replaced", () => {
  assert.deepEqual({ ...OPENFOOTBALL_LEAGUES }, {
    epl: { code: "en.1", timeZone: "Europe/London" },
    "ligue-1": { code: "fr.1", timeZone: "Europe/Paris" },
    laliga: { code: "es.1", timeZone: "Europe/Madrid" },
    "serie-a": { code: "it.1", timeZone: "Europe/Rome" },
    bundesliga: { code: "de.1", timeZone: "Europe/Berlin" },
  });
  const src = fs.readFileSync(path.join(APP, "src/lib/sports/soccer/openfootball.mjs"), "utf8");
  assert.match(src, /SOCCER_LEAGUES\.filter\(\(l\) => l\.openfootball\)/, "no second hand-kept list");
});

test("🔴 every file the registry cites exists: odds receipts, validation evidence, public routes", () => {
  for (const l of SOCCER_LEAGUES) {
    if (l.oddsReceipt) assert.ok(exists(l.oddsReceipt), `${l.key}: receipt ${l.oddsReceipt}`);
    for (const p of Object.values(l.validation ?? {})) assert.ok(exists(p), `${l.key}: evidence ${p}`);
    // A /soccer/<key> route is served by the shared [league] page when the registry generates it (C-3).
    const shared = l.route === `/soccer/${l.key}` && soccerLeaguePages().some((x) => x.key === l.key) && fs.existsSync(path.join(APP, "src/app/soccer/[league]/page.tsx"));
    if (l.route) assert.ok(shared || fs.existsSync(path.join(APP, "src/app", l.route, "page.tsx")), `${l.key}: route ${l.route} has a page`);
  }
});

test("🔴 paid odds are authorized for the Premier League ONLY — any other receipt is a founder decision that must update this pin", () => {
  assert.deepEqual(SOCCER_LEAGUES.filter((l) => l.oddsReceipt).map((l) => l.key), ["epl"]);
});

test("🔴 nothing new publishes: the soccer-leagues publish filter still selects exactly Ligue 1, and no extra-time competition is live", () => {
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/soccer-leagues.yml"), "utf8");
  assert.match(wf, /l\.stage === "ACCEPTED_V1" \|\| \(l\.stage === "LIVE" && l\.key !== "epl"\)/, "the workflow's filter (evaluated below) is unchanged");
  const published = SOCCER_LEAGUES.filter((l) => l.stage === "ACCEPTED_V1" || (l.stage === "LIVE" && l.key !== "epl")).map((l) => l.key);
  assert.deepEqual(published, ["ligue-1"]);
  // The graders settle 90-minute scores; a competition whose scores can include extra time must not go live
  // until a grader that refuses AET/PEN exists (C-4).
  assert.deepEqual(SOCCER_LEAGUES.filter((l) => l.format.extraTime && (l.stage === "LIVE" || l.stage === "ACCEPTED_V1")).map((l) => l.key), []);
});

test("the source registry matches: openfootball covers every league that reads it; FPL is recorded as research-only", () => {
  for (const l of SOCCER_LEAGUES.filter((x) => x.openfootball)) assert.ok(SOURCES.openfootball.sports.includes(l.key), `openfootball.sports lists ${l.key}`);
  assert.equal(SOURCES.fantasy_premier_league.authorization, "PRIVATE_RESEARCH");
  assert.ok(fs.existsSync(path.join(APP, "scripts/epl/build-fpl-crosswalk.mjs")), "the reader the row records exists");
});
