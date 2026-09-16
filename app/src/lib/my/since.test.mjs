/**
 * SINCE YOUR LAST VISIT — delta engine (v1.1.4 · §38–§41, §49, §50). Pure and deterministic: every clock is
 * injected; the "device" is a fake storage driven through the real adapter, visit by visit.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { commitObservation, readObservation } from "./observation-browser.mjs";
import { OBSERVATION_STORAGE_KEY, parseObservation } from "./observation-schema.mjs";
import { DELTA_TYPES, commitGate, computeSinceDeltas, currentGameEvidence, freshGameFacts, groupDeltas, pendingOwner, savedEventKey, uncheckedSlices } from "./since.mjs";
import { isSavedForecast } from "../saved/saved-schema.mjs";
import { resolveResult } from "../saved/results.mjs";

const NYY = "mlb-team-147", MIN = "mlb-team-142", CWS = "mlb-team-145", CLE = "mlb-team-114", BUF = "nfl-team-2", DET = "nfl-team-8";
const PK = "823655";
const START = "2026-09-16T23:40:00Z";
const BEFORE = Date.parse("2026-09-16T20:00:00Z");
const DURING = Date.parse("2026-09-17T00:30:00Z");
const AFTER = Date.parse("2026-09-17T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

const up = (over = {}) => ({ sport: "MLB", gameId: PK, startUtc: START, homeId: MIN, awayId: NYY, homeName: "Minnesota Twins", awayName: "New York Yankees", href: "/games/mlb/nyy-vs-min-2026-09-16/", forecast: null, ...over });
const res = (over = {}) => ({ sport: "MLB", gameId: PK, resultAt: START, homeId: MIN, awayId: NYY, homeName: "Minnesota Twins", awayName: "New York Yankees", homeScore: 1, awayScore: 8, href: null, ...over });
const env = (state, over = {}) => ({ eventId: PK, sport: "MLB", startTime: START, state, competitors: { home: { teamId: "142", abbr: "MIN", name: "Minnesota Twins", score: state === "PRE" ? null : 1 }, away: { teamId: "147", abbr: "NYY", name: "New York Yankees", score: state === "PRE" ? null : 8 } }, ...over });

/** A saved forecast in the Saved owner's REAL schema (checked with its own validator). */
const savedItem = (over = {}) => {
  const item = {
    schemaVersion: 1, id: `mlb-${PK}`, sport: "mlb", href: "/games/mlb/nyy-vs-min-2026-09-16/", startUtc: START,
    matchup: "New York Yankees @ Minnesota Twins", context: null, family: "Winner", value: "NYY 55%", sub: null, signal: null,
    modelState: "PUBLIC_EXPERIMENTAL", modelFamily: null, updatedAt: null, settlement: { kind: "mlb-game", gamePk: Number(PK), family: "Winner" },
    savedAt: "2026-09-16T18:00:00Z", sourceRoute: "/", ...over,
  };
  assert.ok(isSavedForecast(item), "fixture is a valid Saved owner item");
  return item;
};
const gradedLedger = { mlbGames: [{ gamePk: Number(PK), market: "moneyline", outcome: "WIN", actual: { homeRuns: 1, awayRuns: 8 }, gradedAt: "2026-09-17T09:58:00Z" }], nfl: [], epl: [], ufc: [] };
const emptyLedger = { mlbGames: [], nfl: [], epl: [], ufc: [] };

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), raw: () => map.get(OBSERVATION_STORAGE_KEY) };
}

/**
 * One /my visit, the way the page does it: read the prior at commit time, compute deltas against it from current
 * owners, commit the current observation. Returns the deltas the reader saw.
 */
function visit(storage, { followedIds = [NYY], nowMs, upcoming = [], results = [], envelopes = null, saved = null, ledger = null, visible = true }) {
  const games = currentGameEvidence({ upcoming, results, envelopesByGamePk: envelopes, followedIds, nowMs });
  const savedSettled = saved && ledger ? new Map(saved.map((s) => [s.id, resolveResult(s, ledger, iso(nowMs)).state === "FINAL"])) : null;
  const fresh = {
    followedIds, games: freshGameFacts(games),
    savedIds: saved ? saved.map((s) => s.id) : null,
    saved: saved && savedSettled ? saved.map((s) => ({ id: s.id, settled: savedSettled.get(s.id) })) : null,
  };
  const gate = commitGate({ visible, observationStatus: readObservation(storage).status, followSettled: true, savedSettledOwner: true, liveRequired: false, liveSettled: true, settlementsRequired: false, settlementsSettled: true });
  if (!gate.allowed) {
    const prior = readObservation(storage);
    return { ...computeSinceDeltas({ prior: prior.status === "OK" ? prior.doc : null, followedIds, games, savedItems: saved, savedSettled }), committed: false };
  }
  const r = commitObservation(storage, fresh, { nowIso: iso(nowMs), firstOfSession: true });
  return { ...computeSinceDeltas({ prior: r.before, followedIds, games, savedItems: saved, savedSettled }), committed: r.committed };
}
const types = (v) => v.deltas.map((d) => d.type);

/* ─────────────── §38 first / second / third visit ─────────────── */

test("SV1 · ⚠ visit 1 is a baseline (0 deltas), PRE → LIVE yields exactly one GAME_STARTED, visit 3 does not repeat it", () => {
  const st = fakeStorage();
  const v1 = visit(st, { nowMs: BEFORE, upcoming: [up()], envelopes: { [PK]: env("PRE") } });
  assert.deepEqual([v1.mode, v1.deltas.length, v1.committed], ["BASELINE", 0, true]);
  assert.equal(parseObservation(st.raw()).doc.games[`MLB:${PK}`].stage, "PRE");

  const v2 = visit(st, { nowMs: DURING, upcoming: [up()], envelopes: { [PK]: env("LIVE") } });
  assert.deepEqual(types(v2), ["GAME_STARTED"]);
  assert.equal(v2.deltas[0].startUtc, START, "the delta carries the game's own start, not a device time");

  const v3 = visit(st, { nowMs: DURING + 60_000, upcoming: [up()], envelopes: { [PK]: env("LIVE") } });
  assert.deepEqual([v3.mode, v3.deltas.length], ["COMPARED", 0], "up to date — no repeated stale delta");
});

test("SV2 · LIVE → provider FINAL without settlement ⇒ one FINAL_REPORTED_PENDING_SETTLEMENT (never 'settled')", () => {
  const st = fakeStorage();
  visit(st, { nowMs: DURING, upcoming: [up()], envelopes: { [PK]: env("LIVE") } });
  const v = visit(st, { nowMs: AFTER, upcoming: [up()], envelopes: { [PK]: env("FINAL") } });
  assert.deepEqual(types(v), ["FINAL_REPORTED_PENDING_SETTLEMENT"]);
});

test("SV3 · FINAL pending → canonical settlement ⇒ RESULT_SETTLED; with both present, settled SUPERSEDES pending (one delta)", () => {
  const st = fakeStorage();
  visit(st, { nowMs: DURING, envelopes: { [PK]: env("FINAL") } });
  const v = visit(st, { nowMs: AFTER, results: [res()], envelopes: { [PK]: env("FINAL") } });
  assert.deepEqual(types(v), ["RESULT_SETTLED"]);
  assert.equal(v.deltas[0].game.result.gameAt, START, "result dated by the game, not the grading time");

  const st2 = fakeStorage();
  visit(st2, { nowMs: DURING, envelopes: { [PK]: env("LIVE") } });
  const both = visit(st2, { nowMs: AFTER, results: [res()], envelopes: { [PK]: env("FINAL") } });
  assert.deepEqual(types(both), ["RESULT_SETTLED"]);
});

test("SV4 · PRE → SETTLED between visits ⇒ exactly one RESULT_SETTLED (prior PRE is proof it was not settled)", () => {
  const st = fakeStorage();
  visit(st, { nowMs: BEFORE, upcoming: [up()] });
  const v = visit(st, { nowMs: AFTER, upcoming: [up()], results: [res()] });
  assert.deepEqual(types(v), ["RESULT_SETTLED"]);
});

test("SV5 · no change ⇒ zero deltas; and after the baseline commit nothing repeats", () => {
  const st = fakeStorage();
  visit(st, { nowMs: BEFORE, upcoming: [up()] });
  assert.equal(visit(st, { nowMs: BEFORE + 60_000, upcoming: [up()] }).deltas.length, 0);
  visit(st, { nowMs: AFTER, results: [res()] });
  assert.equal(visit(st, { nowMs: AFTER + 3_600_000, results: [res()] }).deltas.length, 0);
});

/* ─────────────── §39 saved ─────────────── */

test("SV6 · ⚠ saved unresolved → graded ⇒ one SAVED_FORECAST_SETTLED; no repeat; deleting the save stops it", () => {
  const st = fakeStorage();
  const item = savedItem();
  visit(st, { followedIds: [], nowMs: BEFORE, saved: [item], ledger: emptyLedger });
  assert.equal(parseObservation(st.raw()).doc.saved[item.id].settled, false);

  const v2 = visit(st, { followedIds: [], nowMs: AFTER, saved: [item], ledger: gradedLedger });
  assert.deepEqual(types(v2), ["SAVED_FORECAST_SETTLED"]);
  assert.equal(v2.deltas[0].eventKey, `MLB:${PK}`);

  assert.equal(visit(st, { followedIds: [], nowMs: AFTER + 60_000, saved: [item], ledger: gradedLedger }).deltas.length, 0, "no repeat");

  visit(st, { followedIds: [], nowMs: AFTER + 120_000, saved: [], ledger: gradedLedger });
  assert.equal(parseObservation(st.raw()).doc.saved[item.id], undefined, "deleted ⇒ its fact is pruned");
});

test("SV7 · ⚠ a NEWLY saved, already-graded forecast gets no retroactive delta", () => {
  const st = fakeStorage();
  visit(st, { followedIds: [], nowMs: BEFORE, saved: [], ledger: emptyLedger });
  const v = visit(st, { followedIds: [], nowMs: AFTER, saved: [savedItem()], ledger: gradedLedger });
  assert.deepEqual([v.mode, v.deltas.length], ["COMPARED", 0]);
});

test("SV8 · saved settlement UNKNOWN (ledger not ready) is not 'unresolved': no delta now, and no false evidence stored", () => {
  const st = fakeStorage();
  const item = savedItem();
  visit(st, { followedIds: [], nowMs: BEFORE, saved: [item], ledger: null });
  assert.equal(parseObservation(st.raw()).doc.saved[item.id], undefined, "no settled:false recorded without a ledger");
  const v = visit(st, { followedIds: [], nowMs: AFTER, saved: [item], ledger: gradedLedger });
  assert.equal(v.deltas.length, 0, "no prior evidence of 'unresolved' ⇒ nothing is claimed");
});

/* ─────────────── §40 follow changes ─────────────── */

test("SV9 · ⚠ a NEWLY followed team gets no retroactive history", () => {
  const st = fakeStorage();
  visit(st, { followedIds: [CWS], nowMs: BEFORE, upcoming: [up()] });
  const v = visit(st, { followedIds: [CWS, NYY], nowMs: AFTER, results: [res()] });
  assert.equal(v.deltas.length, 0);
});

test("SV10 · unfollowed ⇒ no delta; re-followed after a /my visit ⇒ a new baseline, never the old era's change", () => {
  const st = fakeStorage();
  visit(st, { followedIds: [NYY], nowMs: BEFORE, upcoming: [up()] });
  assert.equal(visit(st, { followedIds: [], nowMs: DURING, envelopes: { [PK]: env("LIVE") } }).deltas.length, 0, "unfollowed");
  assert.equal(parseObservation(st.raw()).doc.games[`MLB:${PK}`], undefined, "the old era's fact is pruned");
  assert.equal(visit(st, { followedIds: [NYY], nowMs: AFTER, results: [res()] }).deltas.length, 0, "re-followed ⇒ baseline");
});

test("SV11 · both teams followed ⇒ ONE delta for the game", () => {
  const st = fakeStorage();
  visit(st, { followedIds: [NYY, MIN], nowMs: BEFORE, upcoming: [up()] });
  const v = visit(st, { followedIds: [NYY, MIN], nowMs: AFTER, results: [res()] });
  assert.deepEqual(types(v), ["RESULT_SETTLED"]);
});

/* ─────────────── §49 / §50 truth boundaries ─────────────── */

test("TB1 · ⚠ provider FINAL can never manufacture a settlement delta", () => {
  const st = fakeStorage();
  visit(st, { nowMs: BEFORE, upcoming: [up()] });
  const v = visit(st, { nowMs: AFTER, envelopes: { [PK]: env("FINAL") } });
  assert.ok(!types(v).includes("RESULT_SETTLED"));
  assert.deepEqual(types(v), ["FINAL_REPORTED_PENDING_SETTLEMENT"]);
});

test("TB2 · ⚠ the observation cannot manufacture sports state: a prior fact with no current owner evidence yields nothing", () => {
  const st = fakeStorage();
  visit(st, { nowMs: DURING, envelopes: { [PK]: env("LIVE") } });
  // Live failed and nothing settled: current evidence is empty.
  const v = visit(st, { nowMs: AFTER });
  assert.deepEqual([v.mode, v.deltas.length], ["COMPARED", 0], "unknown is not 'ended' or 'unchanged'");
  assert.equal(parseObservation(st.raw()).doc.games[`MLB:${PK}`].stage, "LIVE", "and the trustworthy prior fact is kept");
});

test("TB3 · a postponed or cancelled game produces no delta even if a result row exists (fail closed)", () => {
  for (const state of ["POSTPONED", "CANCELLED"]) {
    const st = fakeStorage();
    visit(st, { nowMs: BEFORE, upcoming: [up()] });
    const v = visit(st, { nowMs: AFTER, results: [res()], envelopes: { [PK]: env(state) } });
    assert.equal(v.deltas.length, 0, state);
  }
});

test("TB4 · ⚠ NFL: no Live-derived delta is possible; PRE → canonical final is the only NFL transition", () => {
  const eid = "401872932";
  const nflUp = up({ sport: "NFL", gameId: eid, homeId: BUF, awayId: DET, homeName: "Buffalo Bills", awayName: "Detroit Lions", startUtc: "2026-09-18T00:15:00Z", href: `/nfl/game/${eid}/` });
  const nflEnv = { eventId: eid, sport: "NFL", startTime: nflUp.startUtc, state: "LIVE", competitors: { home: { teamId: "2", abbr: "BUF", name: "Buffalo Bills", score: 7 }, away: { teamId: "8", abbr: "DET", name: "Detroit Lions", score: 3 } } };
  const st = fakeStorage();
  visit(st, { followedIds: [BUF], nowMs: BEFORE, upcoming: [nflUp] });
  const during = visit(st, { followedIds: [BUF], nowMs: Date.parse("2026-09-18T01:00:00Z"), upcoming: [nflUp], envelopes: { [eid]: nflEnv } });
  assert.equal(during.deltas.length, 0, "an NFL envelope is never read");
  const after = visit(st, { followedIds: [BUF], nowMs: Date.parse("2026-09-18T12:00:00Z"), results: [res({ sport: "NFL", gameId: eid, homeId: BUF, awayId: DET, resultAt: nflUp.startUtc, homeScore: 24, awayScore: 20 })] });
  assert.deepEqual(types(after), ["RESULT_SETTLED"]);
});

test("TB5 · ⚠ no name matching: a row whose NAMES match a follow but whose ids do not is invisible", () => {
  const st = fakeStorage();
  const impostor = up({ homeId: "mlb-team-999", awayId: "mlb-team-998", homeName: "Minnesota Twins", awayName: "New York Yankees" });
  visit(st, { followedIds: [NYY], nowMs: BEFORE, upcoming: [impostor] });
  assert.deepEqual(parseObservation(st.raw()).doc.games, {});
  assert.equal(visit(st, { followedIds: [NYY], nowMs: AFTER, results: [res({ homeId: "mlb-team-999", awayId: "mlb-team-998" })] }).deltas.length, 0);
});

test("TB6 · no MLB-player or NFL-player delta exists: player follows produce no game evidence and no delta type", () => {
  const ev = currentGameEvidence({ upcoming: [up()], results: [res()], envelopesByGamePk: { [PK]: env("LIVE") }, followedIds: ["nfl-athlete-4374302"], nowMs: BEFORE });
  assert.deepEqual(ev, []);
  assert.deepEqual([...DELTA_TYPES].sort(), ["FINAL_REPORTED_PENDING_SETTLEMENT", "GAME_STARTED", "RESULT_SETTLED", "SAVED_FORECAST_SETTLED"]);
});

test("TB7 · ⚠ a past or unknown scheduled start is not evidence of PRE (the schedule cannot age into a claim)", () => {
  const ev = currentGameEvidence({ upcoming: [up(), up({ gameId: "2", startUtc: null })], results: [], envelopesByGamePk: null, followedIds: [NYY], nowMs: AFTER });
  assert.deepEqual(ev.map((e) => e.stage), [null, null]);
  assert.deepEqual(freshGameFacts(ev), [], "nothing to observe");
});

test("TB8 · observation timestamps never order or date a delta: order is priority, then game start, then key", () => {
  const g = (id, start) => ({ key: `MLB:${id}`, sport: "MLB", eventId: id, teamIds: [NYY], startUtc: start, stage: "SETTLED", voided: false, result: { homeScore: 1, awayScore: 2, gameAt: start } });
  const prior = { followedIds: [NYY], savedIds: [], saved: {}, games: {
    "MLB:1": { stage: "PRE", observedAt: "2026-09-20T00:00:00Z" }, "MLB:2": { stage: "PRE", observedAt: "2026-09-01T00:00:00Z" },
    "MLB:3": { stage: "PRE", observedAt: "2026-09-10T00:00:00Z" },
  } };
  const games = [g("1", "2026-09-15T23:00:00Z"), g("2", "2026-09-16T23:00:00Z"), { ...g("3", "2026-09-14T23:00:00Z"), stage: "LIVE" }];
  const { deltas } = computeSinceDeltas({ prior, followedIds: [NYY], games, savedItems: null, savedSettled: null });
  assert.deepEqual(deltas.map((d) => d.key), ["RESULT_SETTLED:MLB:1", "RESULT_SETTLED:MLB:2", "GAME_STARTED:MLB:3"]);
  assert.deepEqual(deltas.map((d) => d.startUtc), ["2026-09-15T23:00:00Z", "2026-09-16T23:00:00Z", "2026-09-14T23:00:00Z"]);
});

test("TB9 · a saved delta and a result delta for the same game present as ONE card", () => {
  const st = fakeStorage();
  const item = savedItem();
  visit(st, { nowMs: BEFORE, upcoming: [up()], saved: [item], ledger: emptyLedger });
  const v = visit(st, { nowMs: AFTER, results: [res()], saved: [item], ledger: gradedLedger });
  assert.deepEqual(types(v), ["RESULT_SETTLED", "SAVED_FORECAST_SETTLED"], "both proven, typed separately");
  const cards = groupDeltas(v.deltas);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].savedAlso[0].id, item.id);
  assert.equal(savedEventKey(item), `MLB:${PK}`);
});

/* ─────────────── §41 visibility / cross-tab ─────────────── */

test("SV12 · ⚠ a hidden tab does not consume unseen deltas: nothing commits, and the next visible visit still shows the change", () => {
  const st = fakeStorage();
  visit(st, { nowMs: BEFORE, upcoming: [up()] });
  const hidden = visit(st, { nowMs: AFTER, results: [res()], visible: false });
  assert.deepEqual([types(hidden), hidden.committed], [["RESULT_SETTLED"], false]);
  const shown = visit(st, { nowMs: AFTER + 60_000, results: [res()] });
  assert.deepEqual(types(shown), ["RESULT_SETTLED"]);
});

test("SV13 · two tabs on the same prior: the tab that commits second judges against the first tab's baseline (no double consumption, no regression)", () => {
  const st = fakeStorage();
  visit(st, { nowMs: BEFORE, upcoming: [up()] });
  const a = visit(st, { nowMs: AFTER, results: [res()] });
  const b = visit(st, { nowMs: DURING, envelopes: { [PK]: env("LIVE") } }); // an older picture, committed later
  assert.deepEqual(types(a), ["RESULT_SETTLED"]);
  assert.equal(b.deltas.length, 0);
  assert.equal(parseObservation(st.raw()).doc.games[`MLB:${PK}`].stage, "SETTLED");
});

test("SV14 · commit gate: hidden, loading owners, unavailable or newer-schema storage all refuse; a settled visible session commits", () => {
  const ok = { visible: true, observationStatus: "OK", followSettled: true, savedSettledOwner: true, liveRequired: true, liveSettled: true, settlementsRequired: true, settlementsSettled: true };
  assert.deepEqual(commitGate(ok), { allowed: true, reason: null });
  assert.equal(commitGate({ ...ok, observationStatus: "EMPTY" }).allowed, true, "a first visit commits its baseline");
  assert.equal(commitGate({ ...ok, observationStatus: "CORRUPT" }).allowed, true, "corrupt storage is recovered");
  for (const [patch, reason] of [
    [{ visible: false }, "HIDDEN"], [{ observationStatus: "UNAVAILABLE" }, "STORAGE_UNAVAILABLE"], [{ observationStatus: "UNSUPPORTED_VERSION" }, "NEWER_SCHEMA"],
    [{ observationStatus: "LOADING" }, "OBSERVATION_LOADING"], [{ followSettled: false }, "OWNERS_LOADING"], [{ liveSettled: false }, "LIVE_LOADING"],
    [{ settlementsSettled: false }, "SETTLEMENTS_LOADING"],
  ]) assert.deepEqual(commitGate({ ...ok, ...patch }), { allowed: false, reason });
  assert.equal(commitGate({ ...ok, liveRequired: false, liveSettled: false }).allowed, true, "an unmounted Live owner is not waited for");
});

/* ─────────────── defense in depth (each found by a mutation probe the visit-level tests could not see) ─────────────── */

const settledGame = { key: `MLB:${PK}`, sport: "MLB", eventId: PK, teamIds: [MIN, NYY], startUtc: START, stage: "SETTLED", voided: false, result: { homeScore: 1, awayScore: 8, gameAt: START } };

test("DD1 · eligibility is checked on its own: a prior game fact for a team NOT followed at that time proves nothing", () => {
  // Pruning normally removes such a fact; a document from any other writer must still not produce a delta.
  const prior = { followedIds: [CWS], savedIds: [], saved: {}, games: { [`MLB:${PK}`]: { stage: "PRE", observedAt: "2026-09-16T12:00:00Z" } } };
  assert.equal(computeSinceDeltas({ prior, followedIds: [CWS, NYY], games: [settledGame], savedItems: null, savedSettled: null }).deltas.length, 0);
  const eligible = { ...prior, followedIds: [CWS, NYY] };
  assert.equal(computeSinceDeltas({ prior: eligible, followedIds: [CWS, NYY], games: [settledGame], savedItems: null, savedSettled: null }).deltas.length, 1, "positive control");
});

test("DD2 · a followed team with NO prior fact for this game (e.g. Live failed last visit) gets no delta — absence is not PRE", () => {
  const prior = { followedIds: [NYY], savedIds: [], saved: {}, games: {} };
  assert.equal(computeSinceDeltas({ prior, followedIds: [NYY], games: [settledGame], savedItems: null, savedSettled: null }).deltas.length, 0);
});

test("DD3 · a saved fact for an id that was NOT in the prior saved set proves nothing", () => {
  const item = savedItem();
  const prior = { followedIds: [], savedIds: [], games: {}, saved: { [item.id]: { settled: false, observedAt: "2026-09-16T12:00:00Z" } } };
  const settled = new Map([[item.id, true]]);
  assert.equal(computeSinceDeltas({ prior, followedIds: [], games: [], savedItems: [item], savedSettled: settled }).deltas.length, 0);
  assert.equal(computeSinceDeltas({ prior: { ...prior, savedIds: [item.id] }, followedIds: [], games: [], savedItems: [item], savedSettled: settled }).deltas.length, 1, "positive control");
});

test("DD4 · ⚠ a non-MLB envelope is never read, even when its numeric team id equals a followed MLB team's", () => {
  const nflLookalike = { eventId: "401872932", sport: "NFL", startTime: START, state: "LIVE", competitors: { home: { teamId: "147", abbr: "BUF", name: "Buffalo Bills", score: 7 }, away: { teamId: "142", abbr: "DET", name: "Detroit Lions", score: 3 } } };
  assert.deepEqual(currentGameEvidence({ upcoming: [], results: [], envelopesByGamePk: { x: nflLookalike }, followedIds: [NYY], nowMs: BEFORE }), []);
  const asMlb = currentGameEvidence({ upcoming: [], results: [], envelopesByGamePk: { x: { ...nflLookalike, sport: "MLB" } }, followedIds: [NYY], nowMs: BEFORE });
  assert.equal(asMlb.length, 1, "positive control: the same envelope marked MLB is read");
});

test("SV15 · ⚠ owner readiness is independent of visibility: a hidden tab still waits for every mounted owner before computing", () => {
  const loading = { followSettled: true, savedSettledOwner: true, liveRequired: true, liveSettled: true, settlementsRequired: true, settlementsSettled: false };
  assert.equal(commitGate({ visible: false, observationStatus: "OK", ...loading }).reason, "HIDDEN", "the gate reports HIDDEN first…");
  assert.equal(pendingOwner(loading), "SETTLEMENTS_LOADING", "…so readiness must be asked separately");
  assert.equal(pendingOwner({ ...loading, settlementsSettled: true }), null);
});

test("SV16 · ⚠ unknown is not unchanged: a failed owner is reported as unchecked, so zero deltas never reads 'up to date'", () => {
  const base = { followBroken: false, liveRequired: true, liveFailed: false, settlementsRequired: true, settlementsFailed: false };
  assert.deepEqual(uncheckedSlices(base), []);
  assert.deepEqual(uncheckedSlices({ ...base, liveFailed: true }), ["LIVE"]);
  assert.deepEqual(uncheckedSlices({ ...base, liveRequired: false, liveFailed: true }), [], "an unmounted Live owner is not a gap");
  assert.deepEqual(uncheckedSlices({ ...base, followBroken: true, settlementsFailed: true }), ["FOLLOWING", "SAVED_RESULTS"]);
});
