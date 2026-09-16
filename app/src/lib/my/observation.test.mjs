/**
 * DEVICE OBSERVATION CONTRACT (v1.1.4 · §48) — schema, merge, prune, storage failure, multi-tab.
 * Deterministic: every clock is injected; storage is a fake.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  GAME_RETENTION_DAYS, OBSERVATION_MAX_GAMES, OBSERVATION_STORAGE_KEY, emptyObservation, mergeObservation,
  parseObservation, pruneObservation, sameFacts, serializeObservation,
} from "./observation-schema.mjs";
import { commitObservation, isObservationStorageEvent, readObservation } from "./observation-browser.mjs";

const T0 = "2026-09-16T12:00:00.000Z";
const T1 = "2026-09-17T12:00:00.000Z";
const T2 = "2026-09-18T12:00:00.000Z";

function fakeStorage(initial = null, { getThrows = false, setThrows = false } = {}) {
  const map = new Map(initial === null ? [] : [[OBSERVATION_STORAGE_KEY, initial]]);
  let writes = 0;
  return {
    getItem: (k) => { if (getThrows) throw new Error("SecurityError"); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { if (setThrows) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } writes++; map.set(k, v); },
    raw: () => map.get(OBSERVATION_STORAGE_KEY) ?? null,
    writes: () => writes,
  };
}

const NYY = "mlb-team-147", MIN = "mlb-team-142", BUF = "nfl-team-2";
const game = (eventId, stage, teamIds = [NYY, MIN], startUtc = "2026-09-16T23:40:00Z", sport = "MLB") => ({ sport, eventId, teamIds, stage, startUtc });

/* ─────────────── schema ─────────────── */

test("OB1 · missing key ⇒ EMPTY (a first visit), with an empty document", () => {
  assert.deepEqual(parseObservation(null), { status: "EMPTY", doc: emptyObservation() });
  assert.equal(readObservation(fakeStorage()).status, "EMPTY");
});

test("OB2 · a valid v1 document round-trips, and serialization is byte-stable regardless of input key order", () => {
  const doc = mergeObservation(null, { followedIds: [MIN, NYY], savedIds: ["mlb-823655"], games: [game("823655", "PRE")], saved: [{ id: "mlb-823655", settled: false }] }, { nowIso: T0 });
  const s1 = serializeObservation(doc);
  const reordered = JSON.parse(s1);
  const shuffled = JSON.stringify({ saved: reordered.saved, games: reordered.games, savedIds: reordered.savedIds, followedIds: [...reordered.followedIds].reverse(), committedAt: reordered.committedAt, schemaVersion: 1 });
  const p = parseObservation(shuffled);
  assert.equal(p.status, "OK");
  assert.equal(serializeObservation(p.doc), s1);
  assert.deepEqual(p.doc.followedIds, [MIN, NYY].sort(), "ids are sorted deterministically");
});

test("OB3 · malformed JSON, a non-object, and a missing schemaVersion are CORRUPT — recovered to empty, never guessed", () => {
  for (const raw of ["{not json", "[1,2]", "42", JSON.stringify({ followedIds: [NYY] }), JSON.stringify({ schemaVersion: "1" }), JSON.stringify({ schemaVersion: 0 })]) {
    const p = parseObservation(raw);
    assert.equal(p.status, "CORRUPT", raw);
    assert.deepEqual(p.doc, emptyObservation());
  }
});

test("OB4 · ⚠ a FUTURE schema is UNSUPPORTED: no write, not cleared, not downgraded", () => {
  const future = JSON.stringify({ schemaVersion: 2, anything: "a newer app wrote this" });
  assert.equal(parseObservation(future).status, "UNSUPPORTED_VERSION");
  const st = fakeStorage(future);
  const r = commitObservation(st, { followedIds: [NYY], games: [game("1", "PRE")] }, { nowIso: T0, firstOfSession: true });
  assert.equal(r.committed, false);
  assert.equal(r.reason, "NEWER_SCHEMA");
  assert.equal(st.writes(), 0);
  assert.equal(st.raw(), future, "byte-identical after the attempt");
});

test("OB5 · untrustworthy facts are dropped: unknown sport, blank/non-numeric event id, bad stage, no valid team, key/fact mismatch", () => {
  const raw = JSON.stringify({
    schemaVersion: 1, committedAt: T0, followedIds: [NYY, "yankees", ""], savedIds: ["mlb-1", "bad id"],
    games: {
      "MLB:1": { sport: "MLB", eventId: "1", teamIds: [NYY], stage: "LIVE", startUtc: null, observedAt: T0 },
      "EPL:2": { sport: "EPL", eventId: "2", teamIds: [NYY], stage: "LIVE", observedAt: T0 },
      "MLB:": { sport: "MLB", eventId: "", teamIds: [NYY], stage: "LIVE", observedAt: T0 },
      "MLB:3": { sport: "MLB", eventId: "3", teamIds: ["New York Yankees"], stage: "LIVE", observedAt: T0 },
      "MLB:4": { sport: "MLB", eventId: "4", teamIds: [NYY], stage: "GRADED", observedAt: T0 },
      "MLB:5": { sport: "MLB", eventId: "6", teamIds: [NYY], stage: "PRE", observedAt: T0 },
      "NFL:7": { sport: "NFL", eventId: "7", teamIds: [NYY], stage: "PRE", observedAt: T0 },
    },
    saved: { "mlb-1": { settled: "no", observedAt: T0 } },
  });
  const p = parseObservation(raw);
  assert.equal(p.status, "OK");
  assert.deepEqual(Object.keys(p.doc.games), ["MLB:1"]);
  assert.deepEqual(p.doc.followedIds, [NYY], "a display name is not an id");
  assert.deepEqual(p.doc.savedIds, ["mlb-1"]);
  assert.deepEqual(p.doc.saved, {});
});

test("OB6 · duplicate facts for one event collapse to ONE fact at the furthest stage", () => {
  const doc = mergeObservation(null, { followedIds: [NYY], games: [game("9", "PRE"), game("9", "LIVE"), game("9", "PRE")] }, { nowIso: T0 });
  assert.deepEqual(Object.keys(doc.games), ["MLB:9"]);
  assert.equal(doc.games["MLB:9"].stage, "LIVE");
});

/* ─────────────── merge / prune ─────────────── */

test("OB7 · ⚠ stages never regress, and observedAt moves only when the stage advances", () => {
  let doc = mergeObservation(null, { followedIds: [NYY], games: [game("9", "SETTLED")] }, { nowIso: T0 });
  doc = mergeObservation(doc, { followedIds: [NYY], games: [game("9", "LIVE")] }, { nowIso: T1 });
  assert.equal(doc.games["MLB:9"].stage, "SETTLED");
  assert.equal(doc.games["MLB:9"].observedAt, T0);
  doc = mergeObservation(null, { followedIds: [NYY], games: [game("9", "PRE")] }, { nowIso: T0 });
  doc = mergeObservation(doc, { followedIds: [NYY], games: [game("9", "LIVE")] }, { nowIso: T1 });
  assert.equal(doc.games["MLB:9"].observedAt, T1);
});

test("OB8 · ⚠ partial owner failure: a null slice keeps the persisted slice exactly (unknown is not unchanged)", () => {
  const prior = mergeObservation(null, { followedIds: [NYY], savedIds: ["mlb-9"], games: [game("9", "LIVE")], saved: [{ id: "mlb-9", settled: false }] }, { nowIso: T0 });
  // Live failed (no game facts), Saved owner not ready (null ids, null facts), Follow still usable.
  const next = mergeObservation(prior, { followedIds: [NYY], savedIds: null, games: [], saved: null }, { nowIso: T1 });
  assert.equal(next.games["MLB:9"].stage, "LIVE", "the Live fact is retained, not read as ended");
  assert.deepEqual(next.savedIds, ["mlb-9"]);
  assert.deepEqual(next.saved["mlb-9"], { settled: false, observedAt: T0 });
  // Follow owner broken too: its ids are retained, so the game fact survives the prune.
  const broken = mergeObservation(prior, { followedIds: null, savedIds: null, games: null, saved: null }, { nowIso: T1 });
  assert.ok(sameFacts(broken, prior));
  // A settled saved forecast never becomes unsettled.
  const graded = mergeObservation(prior, { savedIds: ["mlb-9"], saved: [{ id: "mlb-9", settled: true }] }, { nowIso: T1 });
  const again = mergeObservation(graded, { savedIds: ["mlb-9"], saved: [{ id: "mlb-9", settled: false }] }, { nowIso: T2 });
  assert.equal(again.saved["mlb-9"].settled, true);
});

test("OB9 · bounded: unfollowed teams' games, unsaved forecasts, and games older than the retention window are pruned; the game map is capped", () => {
  const old = new Date(Date.parse(T1) - (GAME_RETENTION_DAYS + 1) * 86_400_000).toISOString();
  let doc = mergeObservation(null, {
    followedIds: [NYY, BUF], savedIds: ["mlb-1", "nfl-2"],
    games: [game("1", "PRE"), game("2", "PRE", [BUF], "2026-09-20T17:00:00Z", "NFL"), game("3", "SETTLED", [NYY], old)],
    saved: [{ id: "mlb-1", settled: false }, { id: "nfl-2", settled: false }],
  }, { nowIso: T0 });
  assert.ok(doc.games["MLB:3"], "inside the window at T0");
  doc = mergeObservation(doc, { followedIds: [NYY], savedIds: ["mlb-1"], games: [], saved: [] }, { nowIso: T1 });
  assert.deepEqual(Object.keys(doc.games), ["MLB:1"], "BUF unfollowed ⇒ its game goes; the old game ages out");
  assert.deepEqual(Object.keys(doc.saved), ["mlb-1"]);

  const many = Array.from({ length: OBSERVATION_MAX_GAMES + 50 }, (_, i) => game(String(1000 + i), "PRE", [NYY], new Date(Date.parse(T0) + i * 3_600_000).toISOString()));
  const capped = mergeObservation(null, { followedIds: [NYY], games: many }, { nowIso: T0 });
  assert.equal(Object.keys(capped.games).length, OBSERVATION_MAX_GAMES);
  assert.ok(capped.games["MLB:1349"] && !capped.games["MLB:1000"], "the most recent starts are kept");
  assert.ok(sameFacts(pruneObservation(capped, { nowIso: T0 }), capped), "prune is idempotent");
});

/* ─────────────── storage failure ─────────────── */

test("OB10 · getItem throws ⇒ UNAVAILABLE; a commit attempts no write", () => {
  const st = fakeStorage(null, { getThrows: true });
  assert.equal(readObservation(st).status, "UNAVAILABLE");
  const r = commitObservation(st, { followedIds: [NYY] }, { nowIso: T0, firstOfSession: true });
  assert.deepEqual([r.committed, r.reason, st.writes()], [false, "STORAGE_UNAVAILABLE", 0]);
});

test("OB11 · setItem throws (quota) ⇒ reported as NOT committed; the stored baseline is unchanged", () => {
  const prior = serializeObservation(mergeObservation(null, { followedIds: [NYY], games: [game("9", "PRE")] }, { nowIso: T0 }));
  const st = fakeStorage(prior, { setThrows: true });
  const r = commitObservation(st, { followedIds: [NYY], games: [game("9", "LIVE")] }, { nowIso: T1, firstOfSession: true });
  assert.equal(r.committed, false);
  assert.equal(r.reason, "WRITE_FAILED");
  assert.equal(st.raw(), prior);
});

test("OB12 · CORRUPT storage is recovered: the commit writes a valid document", () => {
  const st = fakeStorage("{garbage");
  const r = commitObservation(st, { followedIds: [NYY], games: [game("9", "PRE")] }, { nowIso: T0, firstOfSession: true });
  assert.equal(r.committed, true);
  assert.equal(r.before, null, "a corrupt prior is no evidence: this visit is a baseline");
  assert.equal(parseObservation(st.raw()).status, "OK");
});

test("OB13 · no write storm: a later commit with the same facts does not write; the session's first commit does", () => {
  const st = fakeStorage();
  commitObservation(st, { followedIds: [NYY], games: [game("9", "PRE")] }, { nowIso: T0, firstOfSession: true });
  assert.equal(st.writes(), 1);
  for (let i = 0; i < 20; i++) commitObservation(st, { followedIds: [NYY], games: [game("9", "PRE")] }, { nowIso: T1 });
  assert.equal(st.writes(), 1);
  commitObservation(st, { followedIds: [NYY], games: [game("9", "LIVE")] }, { nowIso: T1 });
  assert.equal(st.writes(), 2, "a real change writes");
  commitObservation(st, { followedIds: [NYY], games: [game("9", "LIVE")] }, { nowIso: T2, firstOfSession: true });
  assert.equal(st.writes(), 3, "a new visit records itself");
});

/* ─────────────── multi-tab ─────────────── */

test("OB14 · ⚠ two tabs, same prior: the later commit of an OLDER picture cannot regress the newer facts", () => {
  const st = fakeStorage(serializeObservation(mergeObservation(null, { followedIds: [NYY], games: [game("9", "PRE")] }, { nowIso: T0 })));
  // Tab A sees the game settled and commits first.
  const a = commitObservation(st, { followedIds: [NYY], games: [game("9", "SETTLED")] }, { nowIso: T1, firstOfSession: true });
  assert.equal(a.before.games["MLB:9"].stage, "PRE");
  // Tab B, loaded earlier, still holds a LIVE picture and commits later.
  const b = commitObservation(st, { followedIds: [NYY], games: [game("9", "LIVE")] }, { nowIso: T2, firstOfSession: true });
  assert.equal(b.before.games["MLB:9"].stage, "SETTLED", "B judges against what A committed, re-read at commit time");
  const stored = parseObservation(st.raw()).doc;
  assert.equal(stored.games["MLB:9"].stage, "SETTLED");
  assert.equal(stored.games["MLB:9"].observedAt, T1, "A's fact stands");
  assert.equal(stored.committedAt, T2);
});

test("OB15 · committedAt never moves backwards (a tab with a slow clock)", () => {
  const st = fakeStorage();
  commitObservation(st, { followedIds: [NYY] }, { nowIso: T2, firstOfSession: true });
  commitObservation(st, { followedIds: [NYY] }, { nowIso: T0, firstOfSession: true });
  assert.equal(parseObservation(st.raw()).doc.committedAt, T2);
});

test("OB16 · storage events are hints: only our key (or a full clear) triggers a re-read", () => {
  assert.equal(isObservationStorageEvent({ key: OBSERVATION_STORAGE_KEY, newValue: "{\"schemaVersion\":1}" }), true);
  assert.equal(isObservationStorageEvent({ key: null }), true);
  assert.equal(isObservationStorageEvent({ key: "gtp.follow.v2" }), false);
});

/* ─────────────── size ─────────────── */

test("OB17 · measured serialized size: ordinary, 10 teams, mixed MLB/NFL, and the structural maximum", () => {
  const mlbTeams = Array.from({ length: 30 }, (_, i) => `mlb-team-${108 + i}`);
  const nflTeams = Array.from({ length: 32 }, (_, i) => `nfl-team-${1 + i}`);
  const players = Array.from({ length: 438 }, (_, i) => `nfl-athlete-${4_000_000 + i}`);
  const games = (teams, n, sport) => Array.from({ length: n }, (_, i) => game(String(820_000 + i + (sport === "NFL" ? 50_000 : 0)), "PRE", [teams[i % teams.length], teams[(i + 1) % teams.length]], new Date(Date.parse(T0) + i * 3_600_000).toISOString(), sport));
  const size = (fresh) => serializeObservation(mergeObservation(null, fresh, { nowIso: T0 })).length;
  const saved = Array.from({ length: 60 }, (_, i) => `mlb-${830_000 + i}`);
  const sizes = {
    ordinary: size({ followedIds: [NYY], savedIds: saved.slice(0, 3), games: games([NYY, MIN], 8, "MLB"), saved: saved.slice(0, 3).map((id) => ({ id, settled: false })) }),
    tenTeams: size({ followedIds: mlbTeams.slice(0, 10), games: games(mlbTeams.slice(0, 10), 70, "MLB") }),
    mixed: size({ followedIds: [...mlbTeams.slice(0, 5), ...nflTeams.slice(0, 5), ...players.slice(0, 10)], savedIds: saved.slice(0, 10), games: [...games(mlbTeams.slice(0, 5), 35, "MLB"), ...games(nflTeams.slice(0, 5), 5, "NFL")], saved: saved.slice(0, 10).map((id) => ({ id, settled: false })) }),
    structuralMax: size({ followedIds: [...mlbTeams, ...nflTeams, ...players], savedIds: saved, games: [...games(mlbTeams, 250, "MLB"), ...games(nflTeams, 100, "NFL")], saved: saved.map((id) => ({ id, settled: true })) }),
  };
  console.log("# observation bytes", JSON.stringify(sizes));
  assert.ok(sizes.ordinary < 3_000, `ordinary ${sizes.ordinary}`);
  assert.ok(sizes.tenTeams < 20_000, `10 teams ${sizes.tenTeams}`);
  assert.ok(sizes.structuralMax < 100_000, `structural max ${sizes.structuralMax}`);
});
