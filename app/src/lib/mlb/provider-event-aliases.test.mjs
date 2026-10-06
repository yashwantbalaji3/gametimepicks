/**
 * MLB provider event alias receipts: admitted only with deterministic evidence (MLB Department, 2026-10-05).
 *
 * Run: npx tsx --test src/lib/mlb/provider-event-aliases.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildProviderEventAliases, indexProviderEvents, etDate, ALIAS_TOLERANCE_MINUTES, ALIAS_SCHEMA_VERSION } from "./provider-event-aliases.mjs";

const TB = "Tampa Bay Rays";
const NYY = "New York Yankees";
const DET = "Detroit Tigers";
const CWS = "Chicago White Sox";

// Real 2026-09-22 board rows: a TB@NYY doubleheader (823543 17:05Z, 823494 23:05Z) and a single DET@CWS game.
const board = (...games) => new Map([["2026-09-22", games]]);
const g = (gamePk, away, home, commenceTime) => ({ gamePk, away, home, commenceTime });
const ev = (providerEventId, awayTeam, homeTeam, eventStartTime) => ({ providerEventId, awayTeam, homeTeam, eventStartTime });
const join = (gamePk, providerEventId, foreignRows, date = "2026-09-22") => ({ file: `settlement-joins/${date}/${gamePk}.json`, date, gamePk, providerEventId, foreignRows });
/** By default the provider's daily listing shows every recorded event on its ET date; tests of rule 6 pass their own. */
const listingsOf = (records) => {
  const m = new Map();
  for (const r of records) m.set(etDate(r.eventStartTime), [...(m.get(etDate(r.eventStartTime)) ?? []), { id: r.providerEventId, away: r.awayTeam, home: r.homeTeam, commenceTime: r.eventStartTime }]);
  return m;
};
const run = (joinFiles, records, boards, listings = listingsOf(records)) => buildProviderEventAliases({ joinFiles, events: indexProviderEvents(records), boards, listings });

test("a reissued id for the same single game, same clubs, start 1 minute off → one receipt with its evidence", () => {
  const r = run(
    [join(900001, "own", { reissued: 12 })],
    [ev("own", DET, CWS, "2026-09-22T18:10:00Z"), ev("reissued", DET, CWS, "2026-09-22T18:11:00Z")],
    board(g(900001, DET, CWS, "2026-09-22T18:10:00Z")),
  );
  assert.equal(r.aliases.length, 1);
  const a = r.aliases[0];
  assert.equal(a.foreignProviderEventId, "reissued");
  assert.equal(a.gamePk, 900001);
  assert.equal(a.rows, 12);
  assert.deepEqual(a.evidence[0].providerEvent, { awayTeam: DET, homeTeam: CWS, commenceTime: "2026-09-22T18:11:00Z" });
  assert.equal(a.evidence[0].startDeltaMinutes, 1);
  assert.equal(a.evidence[0].gamesBetweenClubsOnDate, 1);
  assert.equal(r.ownEventUnverified.length, 0);
});

test("a doubleheader day is refused, even for an id whose start matches one game exactly", () => {
  const r = run(
    [join(823543, "own1", { other: 5 })],
    [ev("own1", TB, NYY, "2026-09-22T17:05:00Z"), ev("other", TB, NYY, "2026-09-22T17:05:00Z")],
    board(g(823543, TB, NYY, "2026-09-22T17:05:00Z"), g(823494, TB, NYY, "2026-09-22T23:05:00Z")),
  );
  assert.equal(r.aliases.length, 0);
  assert.deepEqual(r.refused[0].reasons, ["DOUBLEHEADER"]);
});

test("a second provider start for the same clubs that day is a doubleheader even when the board shows one game", () => {
  const r = run(
    [join(900001, "own", { reissued: 4 })],
    [ev("own", DET, CWS, "2026-09-22T18:10:00Z"), ev("reissued", DET, CWS, "2026-09-22T18:11:00Z"), ev("late", DET, CWS, "2026-09-22T23:10:00Z")],
    board(g(900001, DET, CWS, "2026-09-22T18:10:00Z")),
  );
  assert.equal(r.aliases.length, 0);
  assert.deepEqual(r.refused[0].reasons, ["DOUBLEHEADER"]);
});

test(`a start more than ${ALIAS_TOLERANCE_MINUTES} minutes from the scheduled game is refused`, () => {
  const r = run(
    [join(900001, "own", { drift: 3 })],
    [ev("drift", DET, CWS, "2026-09-22T18:41:00Z")],
    board(g(900001, DET, CWS, "2026-09-22T18:10:00Z")),
  );
  assert.equal(r.aliases.length, 0);
  assert.ok(r.refused[0].reasons.includes("NOT_WITHIN_30_MIN_SAME_CLUBS"));
});

test("home and away swapped is not the same game", () => {
  const r = run(
    [join(900001, "own", { swapped: 2 })],
    [ev("own", DET, CWS, "2026-09-22T18:10:00Z"), ev("swapped", CWS, DET, "2026-09-22T18:10:00Z")],
    board(g(900001, DET, CWS, "2026-09-22T18:10:00Z")),
  );
  assert.equal(r.aliases.length, 0);
});

test("an id that is another game's own event (the next day's series game) is never aliased", () => {
  const r = run(
    [join(900001, "own", { tomorrow: 9 }), join(900002, "tomorrow", {}, "2026-09-23")],
    [ev("own", DET, CWS, "2026-09-22T18:10:00Z"), ev("tomorrow", DET, CWS, "2026-09-22T18:10:00Z")],
    new Map([["2026-09-22", [g(900001, DET, CWS, "2026-09-22T18:10:00Z")]], ["2026-09-23", [g(900002, DET, CWS, "2026-09-23T18:10:00Z")]]]),
  );
  assert.equal(r.aliases.length, 0);
  assert.ok(r.refused[0].reasons.includes("OWNED_BY_ANOTHER_GAME"));
});

test("an id seen with two different start times, or with no provider record, is refused", () => {
  const r = run(
    [join(900001, "own", { moved: 1, unknown: 1 })],
    [ev("own", DET, CWS, "2026-09-22T18:10:00Z"), ev("moved", DET, CWS, "2026-09-22T18:10:00Z"), ev("moved", DET, CWS, "2026-09-23T18:10:00Z")],
    board(g(900001, DET, CWS, "2026-09-22T18:10:00Z")),
  );
  assert.equal(r.aliases.length, 0);
  assert.deepEqual(Object.fromEntries(r.refused.map((x) => [x.foreignProviderEventId, x.reasons])), { moved: ["INCONSISTENT_PROVIDER_RECORD"], unknown: ["NO_PROVIDER_RECORD"] });
});

test("one refusal anywhere refuses the id everywhere", () => {
  const r = run(
    [join(900001, "ownA", { x: 2 }), join(900003, "ownB", { x: 2 })],
    [ev("ownA", DET, CWS, "2026-09-22T18:10:00Z"), ev("ownB", TB, NYY, "2026-09-22T23:05:00Z"), ev("x", DET, CWS, "2026-09-22T18:10:00Z")],
    board(g(900001, DET, CWS, "2026-09-22T18:10:00Z"), g(900003, TB, NYY, "2026-09-22T23:05:00Z")),
  );
  assert.equal(r.aliases.length, 0);
  assert.equal(r.refused[0].rows, 4);
});

test("a join file whose own event is shared with another game is reported, both files", () => {
  const r = run(
    [join(900001, "shared", {}), join(900002, "shared", {}, "2026-09-23")],
    [ev("shared", DET, CWS, "2026-09-23T18:10:00Z")],
    new Map([["2026-09-22", [g(900001, DET, CWS, "2026-09-22T18:10:00Z")]], ["2026-09-23", [g(900002, DET, CWS, "2026-09-23T18:10:00Z")]]]),
  );
  assert.deepEqual(r.ownEventUnverified.map((x) => [x.gamePk, x.reason]), [[900001, "OWNED_BY_ANOTHER_GAME"], [900002, "OWNED_BY_ANOTHER_GAME"]]);
});

test("rule 6: an id the provider's daily listing does not show is refused, even when rules 1-5 all pass", () => {
  const records = [ev("own", DET, CWS, "2026-09-22T18:10:00Z"), ev("reissued", DET, CWS, "2026-09-22T18:11:00Z")];
  const boards = board(g(900001, DET, CWS, "2026-09-22T18:10:00Z"));
  const files = [join(900001, "own", { reissued: 12 })];
  const listed = (entry) => run(files, records, boards, new Map([["2026-09-22", [entry]]]));
  assert.equal(listed({ id: "reissued", away: DET, home: CWS, commenceTime: "2026-09-22T18:11:00Z" }).aliases.length, 1, "listed with the same clubs and start → admitted");
  assert.equal(listed({ id: "reissued", away: DET, home: CWS, commenceTime: "2026-09-22T18:11:00Z" }).aliases[0].evidence[0].providerDailyListing.file, "app/public/data/mlb/schedule/2026-09-22.json");
  for (const [why, entry] of [
    ["absent from the listing", { id: "other", away: DET, home: CWS, commenceTime: "2026-09-22T18:11:00Z" }],
    ["listed with other clubs", { id: "reissued", away: TB, home: NYY, commenceTime: "2026-09-22T18:11:00Z" }],
    ["listed at another time", { id: "reissued", away: DET, home: CWS, commenceTime: "2026-09-22T23:10:00Z" }],
  ]) {
    const r = listed(entry);
    assert.equal(r.aliases.length, 0, why);
    assert.deepEqual(r.refused[0].reasons, ["NOT_CONFIRMED_BY_PROVIDER_DAILY_LISTING"], why);
  }
  assert.equal(run(files, records, boards, new Map()).aliases.length, 0, "no listing for the date → refused, never inferred");
});

test("ET date of a late-evening UTC start is the board date", () => {
  assert.equal(etDate("2026-09-23T01:40:00Z"), "2026-09-22");
});

test("the committed receipt file: every alias carries evidence that satisfies the rule", () => {
  const p = path.join(process.cwd(), "..", "data/internal/mlb/reference/provider-event-aliases.json");
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(doc.schemaVersion, ALIAS_SCHEMA_VERSION);
  assert.equal(doc.public, false);
  assert.ok(!("generatedAt" in doc), "no wall-clock time: a rerun on the same inputs is byte-identical");
  const ids = new Set();
  for (const a of doc.aliases) {
    assert.ok(!ids.has(a.foreignProviderEventId), "one receipt per provider id"); ids.add(a.foreignProviderEventId);
    assert.ok(a.evidence.length > 0);
    for (const e of a.evidence) {
      assert.equal(e.scheduledGame.gamePk, a.gamePk);
      assert.equal(e.providerEvent.awayTeam, e.scheduledGame.awayTeam);
      assert.equal(e.providerEvent.homeTeam, e.scheduledGame.homeTeam);
      assert.ok(Math.abs(Date.parse(e.providerEvent.commenceTime) - Date.parse(e.scheduledGame.gameDate)) <= ALIAS_TOLERANCE_MINUTES * 60e3);
      assert.equal(e.gamesBetweenClubsOnDate, 1);
      assert.equal(e.providerDailyListing.awayTeam, e.scheduledGame.awayTeam, "independently confirmed by the provider's daily listing");
      assert.equal(e.providerDailyListing.homeTeam, e.scheduledGame.homeTeam);
      assert.ok(Math.abs(Date.parse(e.providerDailyListing.commenceTime) - Date.parse(e.scheduledGame.gameDate)) <= ALIAS_TOLERANCE_MINUTES * 60e3);
    }
  }
  for (const r of doc.refused) assert.ok(!ids.has(r.foreignProviderEventId), "an id is aliased or refused, never both");
});
