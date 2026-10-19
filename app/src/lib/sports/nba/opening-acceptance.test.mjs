import test from "node:test";
import assert from "node:assert/strict";

import { evaluateOpeningNight, OPENING_NIGHT_2026, STATES, renderMarkdown } from "./opening-acceptance.mjs";

const schedule = () => ({
  generatedAt: "2026-10-20T13:00:00Z",
  rows: OPENING_NIGHT_2026.map((g) => ({ providerEventId: g.providerEventId, dateUtc: g.dateUtc, seasonType: 2, statusRaw: "STATUS_SCHEDULED", home: { abbr: g.home }, away: { abbr: g.away } })),
});
const rosters = () => ({
  asOf: "2026-10-20T10:00:00Z",
  teams: Array.from({ length: 30 }, (_, i) => ({ espnAbbr: ["BOS", "DET", "PHI", "NY", "OKC", "SA"][i] ?? `T${i}`, playerCount: 17 })),
});
const side = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));
const forecast = (family, generatedAt = "2026-10-20T12:00:00Z", p50 = { home: 112, away: 108 }) => ({
  games: OPENING_NIGHT_2026.map((g) => ({
    providerEventId: g.providerEventId,
    receipt: { preTip: true, generatedAt, family },
    forecast: { sim: { pHome: 0.55, home: { p50: p50.home }, away: { p50: p50.away } }, elo: { pHome: 0.6 }, players: { home: side(10), away: side(10) } },
  })),
});
const finals = (rows = []) => ({ season: "2026-27", finals: rows, conflicts: [] });
const base = (over = {}) => ({ now: "2026-10-20T18:00:00Z", schedule: schedule(), rosters: rosters(), injuries: { generatedAt: "2026-10-20T12:00:00Z" }, forecastsByFamily: { v0: forecast("v0"), "v0.1": forecast("v0.1") }, finals: finals(), ...over });
const states = (r, id) => r.checks.filter((c) => c.id === id).map((c) => c.state);

test("pre-tip with every forecast built: READY_SO_FAR (finals pending), nothing fails", () => {
  const r = evaluateOpeningNight(base());
  assert.equal(r.summary.fail, 0, renderMarkdown(r));
  assert.equal(r.verdict, "READY_SO_FAR");
  assert.deepEqual(states(r, "L1"), [STATES.PENDING, STATES.PENDING, STATES.PENDING]);
});

test("a wrong tip time, wrong teams, preseason type or a duplicate row FAILs the schedule", () => {
  for (const mutate of [
    (s) => { s.rows[0].dateUtc = "2026-10-20T23:00Z"; },
    (s) => { s.rows[1].home.abbr = "BKN"; },
    (s) => { s.rows[2].seasonType = 1; },
    (s) => { s.rows.push({ ...s.rows[0] }); },
  ]) {
    const s = schedule(); mutate(s);
    assert.equal(evaluateOpeningNight(base({ schedule: s })).verdict, "NOT_READY");
  }
});

test("the v0.2 cold-start failure (a 0 team score) is caught as an implausible forecast", () => {
  const r = evaluateOpeningNight(base({ forecastsByFamily: { "v0.2": forecast("v0.2", undefined, { home: 0, away: 104 }) } }));
  assert.ok(states(r, "F2").every((s) => s === STATES.FAIL));
});

test("a forecast built after tip FAILs; a missing one is PENDING only inside its window + grace", () => {
  const late = evaluateOpeningNight(base({ forecastsByFamily: { v0: forecast("v0", "2026-10-20T19:05:00Z") } }));
  assert.equal(states(late, "F1")[0], STATES.FAIL);
  const early = evaluateOpeningNight(base({ now: "2026-10-20T09:00:00Z", forecastsByFamily: { v0: null } }));
  assert.ok(states(early, "F1").every((s) => s === STATES.PENDING));
  const overdue = evaluateOpeningNight(base({ now: "2026-10-20T18:30:00Z", forecastsByFamily: { v0: null } }));
  assert.equal(states(overdue, "F1")[0], STATES.FAIL, "BOS @ DET owed from 11:00Z, still missing 7.5 h later");
});

test("an unarmed family (undefined) is not checked; an armed one with no file is", () => {
  const r = evaluateOpeningNight(base({ forecastsByFamily: { v1: undefined } }));
  assert.equal(states(r, "F1").length, 0);
});

test("finals: PASS once recorded as regular season, FAIL when overdue, FAIL when recorded as preseason", () => {
  const rec = OPENING_NIGHT_2026.map((g) => ({ providerEventId: g.providerEventId, seasonType: 2, ftHome: 110, ftAway: 101 }));
  const after = "2026-10-21T08:00:00Z";
  const done = evaluateOpeningNight(base({ now: after, finals: finals(rec), rosters: { ...rosters(), asOf: "2026-10-21T07:00:00Z" } }));
  assert.deepEqual(states(done, "L1"), [STATES.PASS, STATES.PASS, STATES.PASS]);
  assert.equal(done.verdict, "COMPLETE");
  assert.ok(states(evaluateOpeningNight(base({ now: after })), "L1").every((s) => s === STATES.FAIL));
  rec[0].seasonType = 1;
  assert.equal(states(evaluateOpeningNight(base({ now: after, finals: finals(rec) })), "L1")[0], STATES.FAIL);
});

test("a stale roster (> 48 h) FAILs", () => {
  const r = evaluateOpeningNight(base({ rosters: { ...rosters(), asOf: "2026-10-18T13:10:45Z" } }));
  assert.equal(states(r, "R0")[0], STATES.FAIL);
});

test("public guard: a percentage on the built /nba page FAILs; the no-forecast page PASSes", () => {
  assert.equal(states(evaluateOpeningNight(base({ nbaHtml: "<p>BOS 61% to win</p>" })), "P1")[0], STATES.FAIL);
  assert.equal(states(evaluateOpeningNight(base({ nbaHtml: "<p>No public forecast — model in validation</p>" })), "P1")[0], STATES.PASS);
  assert.equal(states(evaluateOpeningNight(base()), "P1")[0], STATES.NOT_APPLICABLE);
});
