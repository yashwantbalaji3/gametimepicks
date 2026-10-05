import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { matchEspnEvent, lineupSides, squadForClub } from "./espn-club-match.mjs";
import { buildEplClubIndex } from "../../soccer/epl-clubs.ts";

const index = buildEplClubIndex();
const resolve = (n) => index.resolve(n);
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PROJ_DIR = path.join(APP, "public/data/soccer/epl/player-projections");

const ev = (id, home, away) => ({
  id,
  competitions: [{ competitors: [{ homeAway: "home", team: { displayName: home } }, { homeAway: "away", team: { displayName: away } }] }],
});

test("the alias table the matcher depends on is sound", () => {
  assert.equal(index.isSound, true);
});

test("AFC Bournemouth at home: the Bournemouth eleven is HOME, not away (2026-09-12 defect)", () => {
  const fixture = { homeClub: "Bournemouth", awayClub: "Brentford" };
  assert.deepEqual(lineupSides([{ teamName: "AFC Bournemouth" }, { teamName: "Brentford" }], fixture, resolve), ["home", "away"]);
  assert.deepEqual(lineupSides([{ teamName: "Brentford" }, { teamName: "AFC Bournemouth" }], fixture, resolve), ["away", "home"]);
});

test("a lineup that does not resolve to exactly this fixture's two clubs is refused, never guessed", () => {
  const fixture = { homeClub: "Bournemouth", awayClub: "Brentford" };
  assert.equal(lineupSides([{ teamName: "Bournemouth" }, { teamName: "AFC Bournemouth" }], fixture, resolve), null);
  assert.equal(lineupSides([{ teamName: "Bournemouth" }, { teamName: "Chelsea" }], fixture, resolve), null);
  assert.equal(lineupSides([{ teamName: "Bournemouth" }, { teamName: "Some Unknown FC" }], fixture, resolve), null);
  assert.equal(lineupSides([{ teamName: "Bournemouth" }], fixture, resolve), null);
});

test("event lookup resolves ESPN spellings exactly, one event or none", () => {
  const events = [ev("1", "Chelsea", "AFC Bournemouth"), ev("2", "AFC Bournemouth", "Brentford")];
  assert.deepEqual(matchEspnEvent(events, { homeClub: "Bournemouth", awayClub: "Brentford" }, resolve), { id: "2", home: "AFC Bournemouth", away: "Brentford" });
  // Reversed fixture is a different match.
  assert.equal(matchEspnEvent(events, { homeClub: "Brentford", awayClub: "Bournemouth" }, resolve), null);
  // Two candidates is ambiguity, not a pick.
  assert.equal(matchEspnEvent([...events, ev("3", "Bournemouth", "Brentford FC")], { homeClub: "Bournemouth", awayClub: "Brentford" }, resolve), null);
});

test("substring containment no longer matches: 'Manchester' is not Manchester City", () => {
  const events = [ev("9", "Manchester City", "Arsenal")];
  assert.equal(matchEspnEvent(events, { homeClub: "Manchester", awayClub: "Arsenal" }, resolve), null);
  assert.equal(matchEspnEvent(events, { homeClub: "Manchester City", awayClub: "Arsenal" }, resolve)?.id, "9");
});

test("squad lookup is by canonical club; unknown or duplicated clubs give no squad", () => {
  const squads = [{ teamName: "AFC Bournemouth", players: [] }, { teamName: "Brentford", players: [] }];
  assert.equal(squadForClub(squads, "Bournemouth", resolve)?.teamName, "AFC Bournemouth");
  assert.equal(squadForClub(squads, "Chelsea", resolve), null);
  assert.equal(squadForClub([...squads, { teamName: "Bournemouth", players: [] }], "Bournemouth", resolve), null);
});

/*
 * PROBE over every committed projection snapshot — what the fix changes and what it cannot.
 *  1. The grader only looks an event up when a fixture recorded no espnEventId. Every committed fixture carries one,
 *     so re-grading committed projections takes the identical path: output rows are unchanged.
 *  2. Re-deciding sides for every PUBLISHED lineup: each resolves to one home + one away club, and the old letters-only
 *     compare disagreed ONLY on Bournemouth home fixtures — the known 2026-09-12 defect.
 */
test("probe: committed snapshots — grader event path unchanged; side fix changes only Bournemouth home lineups", () => {
  const files = fs.readdirSync(PROJ_DIR).filter((f) => /^snapshot-\d{12}\.json$/.test(f));
  assert.ok(files.length > 0, "snapshots must be readable, or this probe is vacuous");
  const oldNorm = (n) => String(n ?? "").toLowerCase().replace(/[^a-z]/g, "");
  let fixtures = 0;
  let published = 0;
  const changed = new Set();
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(PROJ_DIR, f), "utf8"));
    for (const fx of doc.fixtures ?? []) {
      fixtures += 1;
      assert.ok(fx.espnEventId, `${f} ${fx.slug} has no espnEventId — the grader would take the lookup path`);
      if (fx.lineupState !== "PUBLISHED") continue;
      published += 1;
      const teams = [...new Set(fx.players.map((p) => p.teamName))].map((teamName) => ({ teamName }));
      const sides = lineupSides(teams, fx, resolve);
      assert.ok(sides, `${f} ${fx.slug}: lineup teams ${JSON.stringify(teams)} must resolve`);
      const before = teams.map((t) => (oldNorm(t.teamName) === oldNorm(fx.homeClub) ? "home" : "away"));
      if (before.join() !== sides.join()) changed.add(fx.slug);
    }
  }
  assert.ok(fixtures > 100 && published > 0);
  assert.deepEqual([...changed].sort(), ["bournemouth-v-brentford-2026-09-12"]);
});
