/**
 * NBA lane · minutes plausibility (prepared 2026-11-13, switch OFF pending a founder decision).
 *
 * Pins (1) the threshold's derivation from the COMMITTED grading ledger, (2) what the rule withholds on the real
 * 2026-11-11 forecast, (3) that it changes nothing while off and never edits a number while on, and (4) that every lane
 * already published re-derives from its receipt exactly as before.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadRosterIndex } from "./roster-index.mjs";
import {
  MINUTES_PLAUSIBILITY, UNAVAILABLE_REASONS, buildExperimentalSnapshot, snapshotMatchesSource, minutesPlausibilityForPublish, unavailablePlayersForPublish,
} from "./experimental-public-lane.mjs";
import { eloWinProbabilityForPublish } from "./elo-win-probability.mjs";
import { NO_PROJECTION_LABEL, NO_PROJECTION_SHORT } from "./projection-board-ops.mjs";

const REPO = path.resolve(process.cwd(), "..");
const NBA = path.join(REPO, "data/internal/research/nba");
const PUB = path.join(process.cwd(), "public/data/nba/experimental-public");
const json = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const ROSTERS = loadRosterIndex(REPO);
const rosters = () => ROSTERS;
const build = (date, opts) => buildExperimentalSnapshot({ forecastDoc: json(path.join(NBA, `experimental-v0.1/forecasts/${date}.json`)), sourceFile: `nba/experimental-v0.1/forecasts/${date}.json`, generatedAt: "2026-11-11T12:00:00Z", rosters: rosters(), ...opts });

/** Graded regular-season player rows, newest entry per game, up to the pinned ledger sequence (append-only → stable). */
const PINNED_SEQ = 359;
function gradedRows() {
  const byGame = new Map();
  for (const e of json(path.join(NBA, "experimental-v0.1/ledger.json")).gradeEntries) {
    if (e.seq <= PINNED_SEQ && e.status === "GRADED" && e.grade?.population === "regular") byGame.set(e.providerEventId, e);
  }
  return [...byGame.values()].flatMap((e) => e.grade.players.rows).filter((r) => Number.isFinite(r.actualMinutes));
}

test("the threshold is the 99th percentile of minutes actually played in the committed graded record", () => {
  const rows = gradedRows();
  assert.equal(rows.length, 3369, "the pinned evidence set");
  const actual = rows.map((r) => r.actualMinutes).sort((a, b) => a - b);
  const p99 = actual[Math.ceil(0.99 * actual.length) - 1];
  assert.equal(p99, MINUTES_PLAUSIBILITY.maxExpectedMinutes, "nearest-rank 99th percentile of actual minutes");
  assert.equal(MINUTES_PLAUSIBILITY.maxExpectedMinutes, 40);
  const over = rows.filter((r) => r.expectedMinutes >= MINUTES_PLAUSIBILITY.maxExpectedMinutes);
  assert.equal(over.length, 45, "rows the model projected at or over the threshold");
  assert.equal(over.filter((r) => r.actualMinutes >= MINUTES_PLAUSIBILITY.maxExpectedMinutes).length, 1, "…of which this many played that much");
});

test("the rule ships OFF, and off it changes nothing: a settled published lane (2026-11-11) rebuilds byte-identically", () => {
  assert.equal(MINUTES_PLAUSIBILITY.enabled, false, "turning this on is a founder decision (it changes public eligibility)");
  const committed = json(path.join(PUB, "2026-11-11.json"));
  const rebuilt = build("2026-11-11", { eloWinProbability: eloWinProbabilityForPublish(committed), unavailablePlayers: unavailablePlayersForPublish(committed), minutesPlausibility: minutesPlausibilityForPublish(committed), sourceCommit: committed.source.commit, generatedAt: committed.generatedAt });
  assert.deepEqual(rebuilt, committed);
  assert.ok(committed.games.every((g) => g.players.minutesRule === undefined));
});

test("a published slate keeps the rule it was published under, whatever the switch says", () => {
  const without = { games: [{ players: { away: [], home: [], unavailable: { away: [], home: [] } } }] };
  const withRule = { games: [{ players: { away: [], home: [], unavailable: { away: [], home: [] }, minutesRule: { id: MINUTES_PLAUSIBILITY.id, maxExpectedMinutes: 40 } } }] };
  assert.equal(minutesPlausibilityForPublish(without, { enabled: true }), false, "published without → rebuilt without");
  assert.equal(minutesPlausibilityForPublish(withRule, { enabled: false }), true, "published with → rebuilt with");
  assert.equal(minutesPlausibilityForPublish(null, { enabled: true }), true);
  assert.equal(minutesPlausibilityForPublish(null, { enabled: false }), false);
});

test("ON, on the real 2026-11-11 forecast: the 40+ minute players are withheld with a reason, and no other number moves", () => {
  const off = build("2026-11-11", { minutesPlausibility: false });
  const on = build("2026-11-11", { minutesPlausibility: true });
  const src = new Map(json(path.join(NBA, "experimental-v0.1/forecasts/2026-11-11.json")).games.map((g) => [String(g.providerEventId), g]));
  const withheld = [];
  for (const [i, g] of on.games.entries()) {
    const before = off.games[i];
    assert.deepEqual(g.players.minutesRule, { id: "nba-lane-minutes-plausibility@1", maxExpectedMinutes: 40 });
    assert.ok(snapshotMatchesSource(g, src.get(g.providerEventId), { rosters: rosters() }), `${g.providerEventId} re-derives from its receipt under the rule`);
    for (const side of ["away", "home"]) {
      const kept = new Map(g.players[side].map((r) => [r.providerAthleteId, r]));
      for (const r of before.players[side]) {
        if (r.expectedMinutes >= 40) {
          assert.equal(kept.has(r.providerAthleteId), false, `${r.name} is not shown with numbers`);
          const u = g.players.unavailable[side].find((x) => x.providerAthleteId === r.providerAthleteId);
          assert.equal(u?.reason, "MINUTES_NOT_PLAUSIBLE", `${r.name} is listed with the reason`);
          assert.deepEqual(Object.keys(u).sort(), ["name", "position", "providerAthleteId", "reason", "state"], "no number travels with the reason");
          withheld.push(r.name);
        } else {
          assert.deepEqual(kept.get(r.providerAthleteId), r, `${r.name}: every published figure is unchanged`);
        }
      }
      assert.ok(g.players[side].every((r) => r.expectedMinutes < 40));
      // everything the lane said without the rule is still said: same entries, plus the withheld players
      const others = g.players.unavailable[side].filter((x) => x.reason !== "MINUTES_NOT_PLAUSIBLE");
      assert.deepEqual(others, before.players.unavailable[side]);
    }
    for (const k of ["elo", "teamScores", "receipt", "frozenAt", "engine"]) assert.deepEqual(g[k], before[k], `${k} untouched`);
  }
  assert.deepEqual(withheld.sort(), ["Desmond Bane", "Donovan Mitchell", "Evan Mobley", "James Harden", "Shai Gilgeous-Alexander"]);
});

test("a tampered rule or a re-added player fails re-derivation", () => {
  const on = build("2026-11-11", { minutesPlausibility: true });
  const off = build("2026-11-11", { minutesPlausibility: false });
  const src = new Map(json(path.join(NBA, "experimental-v0.1/forecasts/2026-11-11.json")).games.map((g) => [String(g.providerEventId), g]));
  const i = on.games.findIndex((g, n) => g.players.away.length + g.players.home.length < off.games[n].players.away.length + off.games[n].players.home.length);
  const g = on.games[i]; const s = src.get(g.providerEventId); const R = { rosters: rosters() };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let t = clone(g); t.players.minutesRule.maxExpectedMinutes = 44;
  assert.equal(snapshotMatchesSource(t, s, R), false, "a different threshold");
  t = clone(g); t.players.away = clone(off.games[i].players.away); t.players.home = clone(off.games[i].players.home);
  assert.equal(snapshotMatchesSource(t, s, R), false, "rows the rule withholds, put back");
  t = clone(g); delete t.players.minutesRule;
  assert.equal(snapshotMatchesSource(t, s, R), false, "the rule's record removed while its effect stays");
  t = clone(off.games[i]); t.players.home = t.players.home.slice(1);
  assert.equal(snapshotMatchesSource(t, s, R), false, "a silently dropped player (no rule) is also caught");
});

test("every lane already published still re-derives from its own receipt", () => {
  const R = rosters();
  let games = 0;
  for (const n of fs.readdirSync(PUB).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    const lane = json(path.join(PUB, n));
    const f = path.join(NBA, lane.source?.file?.replace(/^nba\//, "") ?? "");
    if (!lane.source?.file || !fs.existsSync(f)) continue;
    const src = new Map(json(f).games.map((g) => [String(g.providerEventId), g]));
    for (const g of lane.games) { assert.ok(snapshotMatchesSource(g, src.get(g.providerEventId), { rosters: R }), `${n} ${g.providerEventId}`); games += 1; }
  }
  assert.ok(games > 100, `checked ${games} published games`);
});

test("the reason is named everywhere a reason is printed", () => {
  assert.ok(UNAVAILABLE_REASONS.includes("MINUTES_NOT_PLAUSIBLE"));
  assert.match(NO_PROJECTION_LABEL.MINUTES_NOT_PLAUSIBLE, /^Projection unavailable — /);
  assert.match(NO_PROJECTION_SHORT.MINUTES_NOT_PLAUSIBLE, /^Projection unavailable — /);
  for (const f of ["src/components/nba/official-predictions.tsx", "src/lib/simulation-theater/nba/possession/labels.mjs"]) assert.match(fs.readFileSync(f, "utf8"), /MINUTES_NOT_PLAUSIBLE: "/, f);
});
