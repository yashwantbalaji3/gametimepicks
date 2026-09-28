/** A late producer and an empty calendar are different facts (day-in-flight.mjs). Fixtures only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { artifactAbsence, scheduleShowsNoGames } from "./day-in-flight.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gtp-dif-"));
const write = (root, rel, obj) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), JSON.stringify(obj)); };
const LATE = Date.UTC(2026, 8, 28, 23); // well past mlb-daily-production's 19:00Z deadline for 09-28
const D = "2026-09-28";

test("🔴 a date the committed schedule shows with NO games owes no artifact", () => {
  const root = tmp();
  write(root, `public/data/mlb/schedule/${D}.json`, { date: D, games: [] });
  write(root, `public/data/mlb/statsapi-schedule/${D}.json`, { date: D, games: [] });
  assert.equal(scheduleShowsNoGames({ appDir: root, date: D, producer: "mlb-daily-production" }), true);
  const a = artifactAbsence({ appDir: root, relDir: "public/data/mlb/team-markets", date: D, producer: "mlb-daily-production", nowUtcMs: LATE });
  assert.equal(a.inFlight, true); assert.equal(a.noSlate, true);
  assert.match(a.reason, /no games are scheduled/);
});

test("🔴 a date WITH games, past the deadline, is still an incident", () => {
  const root = tmp();
  write(root, `public/data/mlb/schedule/${D}.json`, { date: D, games: [{ gamePk: 1 }] });
  const a = artifactAbsence({ appDir: root, relDir: "public/data/mlb/team-markets", date: D, producer: "mlb-daily-production", nowUtcMs: LATE });
  assert.equal(a.inFlight, false, "a scheduled slate with a missing artifact past the deadline must fail");
  assert.match(a.reason, /MISSING and mlb-daily-production is past its deadline/);
});

test("no schedule — or a disagreeing or unreadable one — proves nothing", () => {
  const none = tmp();
  assert.equal(scheduleShowsNoGames({ appDir: none, date: D, producer: "mlb-daily-production" }), false, "absence of a schedule is not an empty calendar");
  const split = tmp();
  write(split, `public/data/mlb/schedule/${D}.json`, { games: [] });
  write(split, `public/data/mlb/statsapi-schedule/${D}.json`, { games: [{ gamePk: 2 }] });
  assert.equal(scheduleShowsNoGames({ appDir: split, date: D, producer: "mlb-daily-production" }), false, "if any schedule lists a game, it is owed");
  const odd = tmp();
  write(odd, `public/data/mlb/schedule/${D}.json`, { notGames: true });
  assert.equal(scheduleShowsNoGames({ appDir: odd, date: D, producer: "mlb-daily-production" }), false, "an unreadable shape proves nothing");
  assert.equal(scheduleShowsNoGames({ appDir: tmp(), date: D, producer: "unknown-producer" }), false);
});

test("🔴 a present-but-EMPTY artifact is excused only on a no-games date", () => {
  const off = tmp();
  write(off, `public/data/mlb/schedule/${D}.json`, { games: [] });
  write(off, `public/data/mlb/full-game-simulations/${D}.json`, { games: [] });
  const a = artifactAbsence({ appDir: off, relDir: "public/data/mlb/full-game-simulations", date: D, producer: "mlb-daily-production", nowUtcMs: LATE });
  assert.equal(a.inFlight, true); assert.equal(a.noSlate, true); assert.equal(a.present, true);
  const game = tmp();
  write(game, `public/data/mlb/schedule/${D}.json`, { games: [{ gamePk: 1 }] });
  write(game, `public/data/mlb/full-game-simulations/${D}.json`, { games: [] });
  const b = artifactAbsence({ appDir: game, relDir: "public/data/mlb/full-game-simulations", date: D, producer: "mlb-daily-production", nowUtcMs: LATE });
  assert.equal(b.inFlight, false, "an empty simulation on a SCHEDULED day is a defect — the caller must check it");
  const full = tmp();
  write(full, `public/data/mlb/schedule/${D}.json`, { games: [] });
  write(full, `public/data/mlb/full-game-simulations/${D}.json`, { games: [{ slug: "x" }] });
  const c = artifactAbsence({ appDir: full, relDir: "public/data/mlb/full-game-simulations", date: D, producer: "mlb-daily-production", nowUtcMs: LATE });
  assert.equal(c.inFlight, false, "games in the artifact against an empty schedule is a contradiction the caller must see");
});
