import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
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
/**
 * KNOWN DEFECT, PINNED (founder approval B, 2026-11-09; extended 18 → 20 by the founder 2026-11-10 for the two
 * snapshots main's old-builder matchweek refreshes wrote at 01:28Z and 01:43Z, before #1295 shipped the ESPN builder).
 * These 20 frozen player-projection snapshots are historical records missing their ESPN id: they were built while
 * every EPL fixture carried openfootball's provisional "Saturday 15:00" kickoff; the ESPN lookup by that date missed
 * the games ESPN placed on other days, so they carry no espnEventId (EPL-KICKOFF-HIST in the master backlog; correction
 * is a separate founder decision). Frozen records are never edited, so the exception is EXACT: only these files, only
 * at these bytes (sha256), only these fixtures. Any other snapshot — every future one included — or any change to a
 * pinned file still fails, and a pin that no longer matches a missing id fails too. A narrow exception, not a validation.
 */
const KNOWN_MISSING_ESPN_ID = Object.freeze({
  "snapshot-202611030054.json": { sha256: "713a77f2a064ecaeabd75b059a9db931ef2195df8c13f5a6e569c041cd249e01", slugs: ["everton-v-coventry-city-2026-11-07", "crystal-palace-v-liverpool-2026-11-07", "sunderland-v-chelsea-2026-11-07", "ipswich-town-v-bournemouth-2026-11-07", "brighton-and-hove-albion-v-brentford-2026-11-07", "manchester-united-v-aston-villa-2026-11-07"] },
  "snapshot-202611030110.json": { sha256: "415fd12fab22e2930199f8fffb36a6f3092e897d251595bb0a35c6a7d060dfba", slugs: ["everton-v-coventry-city-2026-11-07", "crystal-palace-v-liverpool-2026-11-07", "sunderland-v-chelsea-2026-11-07", "ipswich-town-v-bournemouth-2026-11-07", "brighton-and-hove-albion-v-brentford-2026-11-07", "manchester-united-v-aston-villa-2026-11-07"] },
  "snapshot-202611060131.json": { sha256: "fb6b18fc484e00ae26ec55da64caf97467b734eecc3b1816b2432d9b42dfaaa2", slugs: ["everton-v-coventry-city-2026-11-07", "crystal-palace-v-liverpool-2026-11-07", "sunderland-v-chelsea-2026-11-07", "ipswich-town-v-bournemouth-2026-11-07", "brighton-and-hove-albion-v-brentford-2026-11-07", "manchester-united-v-aston-villa-2026-11-07"] },
  "snapshot-202611062229.json": { sha256: "acb05660b6e2dffde517bc206ee365f2d6f78c157702eba7cfd793ca283a553e", slugs: ["everton-v-coventry-city-2026-11-07", "crystal-palace-v-liverpool-2026-11-07", "sunderland-v-chelsea-2026-11-07", "ipswich-town-v-bournemouth-2026-11-07", "brighton-and-hove-albion-v-brentford-2026-11-07", "manchester-united-v-aston-villa-2026-11-07"] },
  "snapshot-202611062339.json": { sha256: "4a5ecb83fa070081a8d49b082e591bdd22a3a1b02b85be3a2d00b01349d5d950", slugs: ["everton-v-coventry-city-2026-11-07", "crystal-palace-v-liverpool-2026-11-07", "sunderland-v-chelsea-2026-11-07", "ipswich-town-v-bournemouth-2026-11-07", "brighton-and-hove-albion-v-brentford-2026-11-07", "manchester-united-v-aston-villa-2026-11-07"] },
  "snapshot-202611070039.json": { sha256: "83f83e75785ec1e635e34a3010066e0e2161610a0f975569fa12811a29934510", slugs: ["everton-v-coventry-city-2026-11-07", "crystal-palace-v-liverpool-2026-11-07", "sunderland-v-chelsea-2026-11-07", "ipswich-town-v-bournemouth-2026-11-07", "brighton-and-hove-albion-v-brentford-2026-11-07", "manchester-united-v-aston-villa-2026-11-07"] },
  "snapshot-202611071638.json": { sha256: "84a6c2e4b08da9619ea49b5ae24f944e9daad16f4067866f1bbd8218451ab913", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611071646.json": { sha256: "9e27866032f1aaf1b31961a287d84b6b0b51cc18a9733e258e10a3ab39600588", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611071757.json": { sha256: "ddd99e58e1ec78e5dbfb65f7b89ef397b91bafdeb6bcb56bea073c148dcdf143", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611071814.json": { sha256: "4636fa0bede383ca5b79280de93c3e691413c930b89679e07f04eb895df1b1c3", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611071934.json": { sha256: "fcfaa728aa756a4997c1c0dfd696792848a54811a1ee4ea40bad6b140477f989", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611071951.json": { sha256: "10dbe91b6ceb5c9f3f7a4ef3ca803adabc5dbc2c113891be5fa22bf3430cf21b", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611080008.json": { sha256: "c0bd1ad2fa6b8f23cc862d5e8a3bede9fb09b667b29d6043e1f2acb9c3743260", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611081743.json": { sha256: "91b9bb3ec0e16f94b2c3dd85bbe42c0afd9101f84a58ed7c6c1943081493b5f8", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611081803.json": { sha256: "9912cb6da2f41ebcd26c5afe3133a2bdfb6d25b482bdc9255223ae85ebf0226a", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611081858.json": { sha256: "d1be1806185b044e1c6fa54f03dc3e8d5b6b441ae0cc9fc4bef921bbf3bc0b2e", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611081919.json": { sha256: "372f8eb1695a68e57a25cd5853151fd35217b046f616216ae34dbf2c7f8f9ca7", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611090043.json": { sha256: "1fd7dafd4d4a1809caa4f93e4fa24180d3eab7b705266ef2f34889dcfb5c0f08", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },  "snapshot-202611100128.json": { sha256: "66cfdb6562673b84c823b80969b74d6829d00b0d2a40ea2dc34438a0fa5b9e70", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
  "snapshot-202611100143.json": { sha256: "5f9a97254b3303e7927adf38cd67cf09807d3ea82fc444140bd46a271b922e5c", slugs: ["liverpool-v-manchester-united-2026-11-21", "hull-city-v-brighton-and-hove-albion-2026-11-21", "brentford-v-everton-2026-11-21"] },
});

/** The pin guard over a snapshot directory: pinned bytes unchanged, every missing id pinned, no stale pin. */
function checkMissingEspnIdPins(dir, pins) {
  const files = fs.readdirSync(dir).filter((f) => /^snapshot-\d{12}\.json$/.test(f));
  assert.ok(files.length > 0, "snapshots must be readable, or this probe is vacuous");
  /* The pinned files are exactly the bytes that were reviewed. */
  for (const [file, pin] of Object.entries(pins)) {
    assert.equal(createHash("sha256").update(fs.readFileSync(path.join(dir, file))).digest("hex"), pin.sha256, `${file}: a pinned frozen snapshot changed`);
  }
  const pinnedSeen = new Set();
  const docs = files.map((f) => [f, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))]);
  for (const [f, doc] of docs) {
    for (const fx of doc.fixtures ?? []) {
      if (fx.espnEventId) continue;
      const pin = pins[f];
      assert.ok(pin?.slugs.includes(fx.slug), `${f} ${fx.slug} has no espnEventId — the grader would take the lookup path`);
      pinnedSeen.add(`${f}|${fx.slug}`);
    }
  }
  assert.deepEqual([...pinnedSeen].sort(), Object.entries(pins).flatMap(([file, pin]) => pin.slugs.map((x) => `${file}|${x}`)).sort(), "every pin matches a fixture still missing its id (no stale pin)");
  return docs;
}

test("pin guard: the 20 pinned snapshots pass alone; a 21st unpinned snapshot missing its ESPN id fails", () => {
  assert.equal(Object.keys(KNOWN_MISSING_ESPN_ID).length, 20);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "epl-pin-"));
  try {
    for (const file of Object.keys(KNOWN_MISSING_ESPN_ID)) fs.copyFileSync(path.join(PROJ_DIR, file), path.join(tmp, file));
    checkMissingEspnIdPins(tmp, KNOWN_MISSING_ESPN_ID);
    /* A future old-builder snapshot: same provisional fixtures, a new name, not pinned. */
    fs.copyFileSync(path.join(PROJ_DIR, "snapshot-202611100143.json"), path.join(tmp, "snapshot-202611100200.json"));
    assert.throws(() => checkMissingEspnIdPins(tmp, KNOWN_MISSING_ESPN_ID), /snapshot-202611100200\.json .* has no espnEventId/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("probe: committed snapshots — grader event path unchanged; side fix changes only Bournemouth home lineups", () => {
  const docs = checkMissingEspnIdPins(PROJ_DIR, KNOWN_MISSING_ESPN_ID);
  const oldNorm = (n) => String(n ?? "").toLowerCase().replace(/[^a-z]/g, "");
  let fixtures = 0;
  let published = 0;
  const changed = new Set();
  for (const [f, doc] of docs) {
    for (const fx of doc.fixtures ?? []) {
      fixtures += 1;
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
