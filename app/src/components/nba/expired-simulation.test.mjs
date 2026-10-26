/**
 * Expired NBA Game Simulation links (independent audit 2026-10-23 F07 / A-T31). A game-day /nba/simulation/<id>/ link
 * 404s after the ET rollover by design (current slate only); the 404 page must name the game and link that day's frozen
 * Official Forecast board — never re-publish the past scenario, never change any other 404.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { EXPIRED_SIMULATION_MAX_DATES, NBA_RESULTS_LINK, expiredSimulationFor, expiredSimulationMap } from "./expired-simulation.mjs";

const lane = (date, ...games) => ({ date, games: games.map(([id, a, h]) => ({ providerEventId: id, away: { abbr: a }, home: { abbr: h } })) });

test("the map names each published game's date and matchup", () => {
  const map = expiredSimulationMap([lane("2026-10-22", ["401909093", "CLE", "PHI"], ["401909094", "DEN", "OKC"]), lane("2026-10-21", ["401909091", "BOS", "NY"])]);
  assert.deepEqual(map["401909093"], ["2026-10-22", "CLE @ PHI"]);
  assert.deepEqual(map["401909091"], ["2026-10-21", "BOS @ NY"]);
});

test("the map keeps only the newest dates up to the cap (bounded bytes)", () => {
  const lanes = Array.from({ length: EXPIRED_SIMULATION_MAX_DATES + 5 }, (_, i) => lane(`2026-11-${String(i + 1).padStart(2, "0")}`, [String(401900000 + i), "AAA", "BBB"]));
  const map = expiredSimulationMap(lanes);
  assert.equal(Object.keys(map).length, EXPIRED_SIMULATION_MAX_DATES);
  assert.equal(map["401900000"], undefined, "the oldest dates fall off");
  assert.ok(map[String(401900000 + EXPIRED_SIMULATION_MAX_DATES + 4)]);
});

test("a known expired link points at that day's frozen board and NBA results", () => {
  const map = { "401909093": ["2026-10-22", "CLE @ PHI"] };
  for (const p of ["/nba/simulation/401909093/", "/nba/simulation/401909093"]) {
    assert.deepEqual(expiredSimulationFor(p, map), { kind: "KNOWN", id: "401909093", date: "2026-10-22", matchup: "CLE @ PHI", boardHref: "/nba/projections/2026-10-22/", resultsHref: NBA_RESULTS_LINK });
  }
  assert.deepEqual(expiredSimulationFor("/nba/simulation/401999999/", map), { kind: "UNKNOWN", id: "401999999", resultsHref: NBA_RESULTS_LINK });
});

test("every other missing path keeps the plain 404 (no notice)", () => {
  for (const p of ["/", "/nba/", "/nba/simulation/", "/nba/simulation/abc/", "/nfl/game/401873011/", "/nba/simulation/401909093/extra/"]) {
    assert.equal(expiredSimulationFor(p, { "401909093": ["2026-10-22", "CLE @ PHI"] }), null, p);
  }
});

test("SOURCE PIN · the 404 page builds the map from the committed dated lanes and renders the notice", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/app/not-found.tsx"), "utf8");
  assert.match(src, /expiredSimulationMap\(committedLaneDates\(\)\.map\(\(date\) => \(\{ date, games: loadLaneForDate\(date\)\?\.games \?\? \[\] \}\)\)\)/);
  // founder P1 2026-10-26: the notice also receives the recorded final + frozen Elo side (components/expired/expired-games.mjs)
  assert.match(src, /<ExpiredSimulationNotice map=\{expired\} facts=\{nbaFacts\} \/>/);
  // the results link is the same anchor the Theater page's nav uses
  const theater = fs.readFileSync(path.join(process.cwd(), "src/components/simulation-theater/nba/possession/NbaPossessionGamePage.tsx"), "utf8");
  assert.match(theater, new RegExp(`NBA_RESULTS_HREF = "${NBA_RESULTS_LINK.replace(/[/#]/g, "\\$&")}"`));
  // the notice imports nothing from the research Theater library or private data
  const notice = fs.readFileSync(path.join(process.cwd(), "src/components/nba/expired-simulation-notice.tsx"), "utf8");
  assert.doesNotMatch(notice, /simulation-theater|possession|data\/internal/);
});
