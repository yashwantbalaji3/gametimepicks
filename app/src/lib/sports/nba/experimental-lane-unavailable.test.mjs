/**
 * PROJECTION-UNAVAILABLE players in the public lane (founder mandate 2026-10-24, P1(b): rookies and returning players).
 * A rostered, not-Out player the official pool could not project is LISTED with state PROJECTION_UNAVAILABLE — never a
 * zero, never any number — copied from the receipt's own pregame availability record. Default OFF; a published slate
 * keeps exactly what it was published with. Fixtures: the committed, frozen 10-20 … 10-23 receipts and lanes.
 * Run (from app/): npx tsx --test src/lib/sports/nba/experimental-lane-unavailable.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildExperimentalSnapshot, snapshotMatchesSource, laneUnavailable, unavailablePlayersForPublish, rosterPositions, UNAVAILABLE_PLAYERS, UNAVAILABLE_STATE } from "./experimental-public-lane.mjs";
import { loadRosterIndex } from "./roster-index.mjs";
import { eloWinProbabilityForPublish } from "./elo-win-probability.mjs";

const APP = process.cwd(), REPO = path.resolve(APP, "..");
const LANE_DIR = path.join(APP, "public/data/nba/experimental-public");
const DATED = fs.readdirSync(LANE_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const doc = (d) => JSON.parse(fs.readFileSync(path.join(REPO, `data/internal/research/nba/experimental-v0.1/forecasts/${d}.json`), "utf8"));
const day = (d) => JSON.parse(fs.readFileSync(path.join(LANE_DIR, `${d}.json`), "utf8"));
const ROSTERS = loadRosterIndex(REPO);
const build = (d, unavailablePlayers, pub = day(d), rosters = ROSTERS) => buildExperimentalSnapshot({ forecastDoc: doc(d), sourceFile: pub.source.file, sourceCommit: pub.source.commit, generatedAt: pub.generatedAt, eloWinProbability: eloWinProbabilityForPublish(pub), unavailablePlayers, rosters });

test("whatever the switch (OFF by default; the release owner flips it in a vehicle), every committed slate rebuilds byte-for-byte under the publisher's rule", () => {
  assert.equal(typeof UNAVAILABLE_PLAYERS.enabled, "boolean");
  for (const f of DATED) {
    const d = f.slice(0, 10), pub = day(d);
    assert.equal(unavailablePlayersForPublish(pub, { enabled: true }), false, `${d} was published without the list`);
    assert.equal(`${JSON.stringify(build(d, unavailablePlayersForPublish(pub, { enabled: true })), null, 1)}\n`, fs.readFileSync(path.join(LANE_DIR, f), "utf8"), d);
  }
});

test("ON: each game lists exactly the receipt's excludedNoMinutes players, with a state and a reason — and no number at all", () => {
  const d = "2026-10-23", s = build(d, true), D = doc(d);
  let listed = 0;
  for (const g of s.games) {
    const rec = D.games.find((x) => String(x.providerEventId) === g.providerEventId);
    for (const side of ["away", "home"]) {
      const want = (rec.forecast.assumptions.availability[side].excludedNoMinutes ?? []).map((p) => String(p.providerAthleteId)).sort();
      assert.deepEqual(g.players.unavailable[side].map((p) => p.providerAthleteId), want, `${g.providerEventId} ${side}`);
      const shown = new Set(g.players[side].map((r) => r.providerAthleteId));
      for (const p of g.players.unavailable[side]) {
        assert.equal(p.state, UNAVAILABLE_STATE);
        assert.ok(["INSUFFICIENT_HISTORY", "NO_EXPECTED_MINUTES"].includes(p.reason));
        assert.deepEqual(Object.keys(p).sort(), ["name", "position", "providerAthleteId", "reason", "state"], "no medians, minutes or any number travel");
        assert.equal(shown.has(p.providerAthleteId), false, "never both projected and unavailable");
        listed += 1;
      }
    }
    assert.ok(snapshotMatchesSource(g, rec, { rosters: ROSTERS }), "re-derives from its receipt and its roster");
    const tampered = structuredClone(g); tampered.players.unavailable.home = tampered.players.unavailable.home.slice(1);
    if (g.players.unavailable.home.length) assert.equal(snapshotMatchesSource(tampered, rec, { rosters: ROSTERS }), false, "a dropped player never re-derives");
  }
  assert.ok(listed > 0, `the 10-23 receipts carry unprojected rostered players (${listed})`);
  assert.doesNotMatch(JSON.stringify(s.games.map((g) => g.players.unavailable)), /:\s*-?\d/, "no numeric value anywhere in the lists");
});

test("publish rule: a slate not yet published follows the switch; a published one keeps what it was published with", () => {
  assert.equal(unavailablePlayersForPublish(null, { enabled: true }), true);
  assert.equal(unavailablePlayersForPublish(null, { enabled: false }), false);
  const withList = build("2026-10-23", true);
  assert.equal(unavailablePlayersForPublish(withList, { enabled: false }), true, "published with the list → rebuilt with it, even with the switch OFF");
  assert.deepEqual(laneUnavailable(null), { away: [], home: [] });
});

test("POSITION: every row and unavailable entry carries the position from the EXACT roster the receipt froze on (by sha256)", () => {
  const d = "2026-10-23", s = build(d, true), D = doc(d);
  let n = 0, withPos = 0;
  for (const g of s.games) {
    const rec = D.games.find((x) => String(x.providerEventId) === g.providerEventId);
    const sha = rec.receipt.inputs.rosters.sha256;
    assert.deepEqual(g.players.positionSource, { file: ROSTERS.get(sha).file, sha256: sha }, "the receipt's own roster, proven by hash");
    assert.doesNotMatch(g.players.positionSource.file, /data\/internal/, "no internal path in the public lane");
    const pos = rosterPositions(ROSTERS.get(sha).doc);
    for (const side of ["away", "home"]) for (const r of [...g.players[side], ...g.players.unavailable[side]]) {
      assert.equal(r.position, pos.get(r.providerAthleteId) ?? null, `${g.providerEventId} ${r.providerAthleteId}`);
      n += 1; if (r.position) withPos += 1;
    }
    // re-derivation needs the roster; a changed position never re-derives
    assert.equal(snapshotMatchesSource(g, rec), false, "a slate carrying positions is never verified without its roster");
    const t = structuredClone(g); t.players[g.players.home.length ? "home" : "away"][0].position = "ZZ";
    assert.equal(snapshotMatchesSource(t, rec, { rosters: ROSTERS }), false);
  }
  assert.ok(n > 0 && withPos / n > 0.9, `positions present for ${withPos}/${n}`);
  // no committed capture matches → every position null and positionSource null (never guessed)
  const none = build(d, true, day(d), new Map());
  for (const g of none.games) {
    assert.equal(g.players.positionSource, null);
    for (const side of ["away", "home"]) for (const r of [...g.players[side], ...g.players.unavailable[side]]) assert.equal(r.position, null);
    assert.ok(snapshotMatchesSource(g, D.games.find((x) => String(x.providerEventId) === g.providerEventId), { rosters: new Map() }));
  }
});
