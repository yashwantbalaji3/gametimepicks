/**
 * v0.7 CANDIDATE minutes model: leakage, team reconciliation, each rule, the recompute of its constants, the completed-season
 * guard, the coverage report and the unarmed proof. NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · PRIVATE_RESEARCH.
 *
 * Run: npx tsx --test src/lib/sports/nba/minutes-model-v07.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  asOfInputs, boundedWaterFill, buildV07Context, CANDIDATE_STATUS, CONSTANTS, COVERAGE_STATUS, coverageReportV07, gatePoolV07, minutesEstimateV07,
  normaliseV07, noProjectionReason, playProbabilityV07, prepareRosterV07, PROPOSED, REUSED_CONSTANTS, STATES,
} from "./minutes-model-v07.mjs";
import { simulatePlayersV07, simulatePreparedV07 } from "./game-sim-v07.mjs";
import { assertCompletedSeasons, COMPLETED_SEASONS, fitAdditiveLift, fitStateTable, minutesQuantile, proportionalLiftSlope, qOfRow, seasonRows, sidesOf, stateTable } from "./minutes-model-v07-fit.mjs";
import { classifyState, lineStatus } from "./minutes-model-v07-state.mjs";
import { foldBoxscores } from "./season-fold.mjs";
import { CANDIDATE_FAMILIES, FAMILIES } from "./experimental-forecast.mjs";
import { PLAY_RATE_WATER_FILL, simulateGameV03 } from "./game-sim-v03.mjs";
import { MAX_PLAYER_MINUTES, TEAM_MINUTES } from "./game-sim.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..", "..");
const ROOT = path.resolve(APP, "..");
const NBA = path.join(ROOT, "data", "internal", "research", "nba");
const readBoxDir = (dir) => fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ─────────────── a synthetic 2026-27 regular season (corpus season 2027) ─────────────── */
const TOR = "28", MIA = "14", BOS = "2";
const NOW = "2026-10-26T15:00:00Z";
const line = (id, team, minutes, starter = false, extra = {}) => ({ providerAthleteId: id, name: `P ${id}`, providerTeamId: team, didNotPlay: false, dnpReason: null, minutes, starter, pts: Math.round(minutes * 0.5), reb: Math.round(minutes * 0.2), ast: Math.round(minutes * 0.1), threePm: Math.round(minutes * 0.05), ...extra });
const coach = (id, team) => ({ providerAthleteId: id, name: `P ${id}`, providerTeamId: team, didNotPlay: true, dnpReason: "COACH'S DECISION", minutes: null });
const hurt = (id, team) => ({ providerAthleteId: id, name: `P ${id}`, providerTeamId: team, didNotPlay: true, dnpReason: "LEFT ANKLE SPRAIN", minutes: null });
const box = (id, dateUtc, teams, players, extra = {}) => ({ providerEventId: id, season: 2027, phase: 2, dateUtc, capturedAt: new Date(Date.parse(dateUtc) + 13 * 3_600_000).toISOString(), boxscoreAvailable: true, teams: teams.map((t) => ({ providerTeamId: t })), players, ...extra });

const TOR_CORE = [["s1", 36], ["s2", 34], ["s3", 32], ["s4", 30], ["s5", 28]];
const BENCH = [["b1", 24], ["b2", 20], ["b3", 16], ["b4", 12], ["b5", 8]];
const coreLines = (over = {}) => [...TOR_CORE.map(([id, m]) => line(id, TOR, over[id] ?? m, true)), ...BENCH.map(([id, m]) => line(id, TOR, over[id] ?? m, false))];

/** Last season: everyone plays 40 games for TOR; "tr" played 30 minutes for MIA; "lapsed" stopped playing; "ret" was a 33-minute starter */
const PRIOR = Array.from({ length: 40 }, (_, i) => box(`p${i}`, new Date(Date.UTC(2026, 0, 1 + i, 23)).toISOString(), [TOR, MIA], [
  ...coreLines(), line("tr", MIA, 30, true), line("dnpg", TOR, 18), line("dd", TOR, 22),
  line("cc", TOR, 15), line("ms", TOR, 14), line("gone", TOR, 20), line("lapsed", TOR, 10), line("ret", TOR, 33, true),
], { season: 2026 }));
/** This season, three games before NOW */
const G = [
  box("e1", "2026-10-21T23:00Z", [TOR, MIA], [...coreLines({ s1: 38 }), line("tr", TOR, 12), line("dnpg", TOR, 18), line("dd", TOR, 22), line("cc", TOR, 10), line("ms", TOR, 12), hurt("gone", TOR)]),
  box("e2", "2026-10-23T23:00Z", [TOR, BOS], [...coreLines({ s1: 38 }), line("tr", TOR, 14), line("dnpg", TOR, 18), line("dd", TOR, 22), coach("cc", TOR), line("ms", TOR, 12), hurt("gone", TOR)]),
  box("e3", "2026-10-25T23:00Z", [TOR, MIA], [...coreLines({ s1: 38 }), line("tr", TOR, 16), line("dnpg", TOR, 18), line("dd", TOR, 22), coach("cc", TOR), coach("ms", TOR)]),
];
const DOCS = [...PRIOR, ...G];
const injuries = [
  { providerTeamId: TOR, athleteId: "dd", athleteName: "P dd", status: "Day-To-Day", statedAt: "2026-10-26T10:00Z" },
  { providerTeamId: TOR, athleteId: "b5", athleteName: "P b5", status: "Out", statedAt: "2026-10-26T10:00Z" },
];
const rosterIds = [...TOR_CORE, ...BENCH].map(([id]) => id).concat(["tr", "dnpg", "dd", "cc", "ms", "gone", "lapsed", "ret", "rook", "vet"]);
const rosters = (extraIds = []) => ({
  asOf: "2026-10-26T12:00:00Z",
  teams: [{ providerTeamId: TOR, state: "CAPTURED", capturedAt: "2026-10-26T12:00:00Z", players: [...rosterIds, ...extraIds].map((id) => ({ providerAthleteId: id, displayName: `P ${id}`, position: "G", experienceYears: id === "rook" ? 0 : id === "vet" ? 8 : 3 })) }],
});
const ctx = (over = {}) => buildV07Context({ boxscores: DOCS, injuries, injuriesAsOf: "2026-10-26T11:00Z", asOfDateUtc: NOW, ...over });
const pool = (over = {}) => gatePoolV07({ rosters: rosters(), providerTeamId: TOR, context: ctx(over) });
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.providerAthleteId, r]));
const K = Object.fromEntries(Object.entries(CONSTANTS).map(([k, c]) => [k, c.value]));
const RATE = K.PLAY_RATE_BY_STATE;

test("LEAKAGE: changing any input dated after the instant changes no output", () => {
  const base = { pool: pool(), prep: prepareRosterV07(pool()) };
  const LATER = box("e4", "2026-10-27T23:00Z", [TOR, BOS], [coach("s1", TOR), line("rook", TOR, 34, true), line("lapsed", TOR, 40, true)]);
  const LATE_CAPTURE = box("e5", "2026-10-26T00:00Z", [TOR, BOS], [coach("s1", TOR), line("rook", TOR, 34, true)], { capturedAt: "2026-10-26T16:00:00Z" });
  const UNSTAMPED = box("e6", "2026-10-26T01:00Z", [TOR, BOS], [line("rook", TOR, 34, true)], { capturedAt: null });
  const futureInjury = { providerTeamId: TOR, athleteId: "s1", athleteName: "P s1", status: "Out", statedAt: "2026-10-26T15:30Z" };
  const probes = [
    { name: "a game that tips after the instant", boxscores: [...DOCS, LATER] },
    { name: "a game that tipped before it, captured after it", boxscores: [...DOCS, LATE_CAPTURE] },
    { name: "a box score with no capture stamp", boxscores: [...DOCS, UNSTAMPED] },
    { name: "an injury stated after it", injuries: [...injuries, futureInjury] },
  ];
  for (const p of probes) {
    const mutated = gatePoolV07({ rosters: rosters(), providerTeamId: TOR, context: ctx(p) });
    assert.deepEqual(mutated, base.pool, p.name);
    assert.deepEqual(prepareRosterV07(mutated), base.prep, p.name);
  }
  // the filter is what keeps them out: the same game, captured in time, does change the output
  const inTime = pool({ boxscores: [...DOCS, { ...LATE_CAPTURE, capturedAt: "2026-10-26T14:00:00Z" }] });
  assert.notDeepEqual(inTime, base.pool);
  assert.equal(byId(inTime.rows).rook.minutesState, "MODELLED");
  assert.equal(byId(pool({ injuries: [...injuries, { ...futureInjury, statedAt: "2026-10-26T14:00Z" }] }).rows).s1.availability, "out");
});

test("LEAKAGE: a feed or roster stamped after the instant is refused, not read", () => {
  assert.equal(gatePoolV07({ rosters: rosters(), providerTeamId: TOR, context: ctx({ injuriesAsOf: "2026-10-26T15:01Z" }) }).reason, "INJURIES_FROM_THE_FUTURE");
  const r = gatePoolV07({ rosters: { ...rosters(), asOf: "2026-10-26T15:01:00Z" }, providerTeamId: TOR, context: ctx() });
  assert.equal(r.state, "REFUSED");
  assert.match(r.reason, /FUTURE/);
});

test("LEAKAGE on committed data: scrambling every box score after the instant changes no pool on a real slate", () => {
  const fetched = readBoxDir(path.join(NBA, "experimental", "boxscores"));
  const now = "2026-10-28T15:00:00Z";
  const corpus = readBoxDir(path.join(NBA, "boxscores")).filter((d) => d.season === 2026);
  const docs = foldBoxscores(corpus, fetched, { now: "2099-01-01T00:00:00Z" }).docs;
  const after = docs.filter((d) => Date.parse(d.dateUtc) >= Date.parse(now));
  assert.ok(after.length >= 10, `games after the instant: ${after.length}`);
  const scrambled = clone(docs).map((d) => (Date.parse(d.dateUtc) >= Date.parse(now) ? { ...d, players: d.players.map((p) => ({ ...p, minutes: p.minutes == null ? 44 : null, didNotPlay: !p.didNotPlay, starter: !p.starter })) } : d));
  const roster = JSON.parse(fs.readFileSync(path.join(NBA, "rosters", "latest.json"), "utf8"));
  roster.asOf = "2026-10-28T12:00:00Z";
  for (const t of roster.teams.slice(0, 6)) {
    const a = gatePoolV07({ rosters: roster, providerTeamId: t.providerTeamId, context: buildV07Context({ boxscores: docs, injuries: [], asOfDateUtc: now }) });
    const b = gatePoolV07({ rosters: roster, providerTeamId: t.providerTeamId, context: buildV07Context({ boxscores: scrambled, injuries: [], asOfDateUtc: now }) });
    assert.deepEqual(b, a, t.canonicalTricode);
  }
});

test("TEAM MINUTES RECONCILE: Σ q·minutes + unallocated = 240 on over-full, under-full and depleted pools", () => {
  const sum = (p) => p.players.reduce((s, x) => s + x.expectedMinutes * x.playRate, 0);
  const out = (ids) => ids.map((id) => ({ providerTeamId: TOR, athleteId: id, status: "Out", statedAt: "2026-10-26T10:00Z" }));
  const cases = { full: pool(), "starters out": pool({ injuries: out(["s1", "s2", "s3"]) }), "eight out": pool({ injuries: out(["s1", "s2", "s3", "s4", "s5", "b1", "b2", "b3"]) }) };
  for (const [name, p] of Object.entries(cases)) {
    const prep = prepareRosterV07(p);
    const rec = prep.reconciliation;
    assert.ok(Math.abs(sum(prep) + rec.unallocatedMinutes - TEAM_MINUTES) < 0.02, `${name}: ${sum(prep)} + ${rec.unallocatedMinutes}`);
    assert.ok(rec.unallocatedMinutes >= 0, name);
    for (const x of prep.players) assert.ok(x.expectedMinutes <= MAX_PLAYER_MINUTES, name);
  }
  const eight = prepareRosterV07(cases["eight out"]).reconciliation;
  assert.ok(eight.unallocatedMinutes > 0, "a depleted pool leaves minutes unplaced");
  assert.ok(eight.unallocatedContext.includes("PLAYERS_OUT_IN_FEED"));
  assert.ok(eight.unallocatedContext.includes("ROSTERED_PLAYERS_WITH_NO_PROJECTION"));
});

test("TEAM MINUTES RECONCILE on every team of the committed roster, at the latest committed box scores", () => {
  const fetched = readBoxDir(path.join(NBA, "experimental", "boxscores"));
  const corpus = readBoxDir(path.join(NBA, "boxscores")).filter((d) => d.season === 2026);
  const roster = JSON.parse(fs.readFileSync(path.join(NBA, "rosters", "latest.json"), "utf8"));
  const now = new Date(Date.parse(roster.asOf) + 3_600_000).toISOString();
  const docs = foldBoxscores(corpus, fetched, { now }).docs;
  const injuriesDoc = JSON.parse(fs.readFileSync(path.resolve(NBA, "..", "injuries", "nba", "latest.json"), "utf8"));
  const context = buildV07Context({ boxscores: docs, injuries: injuriesDoc.entries, asOfDateUtc: now });
  const captured = roster.teams.filter((t) => t.state === "CAPTURED");
  assert.ok(captured.length >= 20, `captured teams: ${captured.length}`);
  for (const t of captured) {
    const p = gatePoolV07({ rosters: roster, providerTeamId: t.providerTeamId, context });
    assert.equal(p.state, "GATED", t.canonicalTricode);
    const prep = prepareRosterV07(p);
    const placed = prep.players.reduce((s, x) => s + x.expectedMinutes * x.playRate, 0);
    assert.ok(Math.abs(placed + prep.reconciliation.unallocatedMinutes - TEAM_MINUTES) < 0.02, `${t.canonicalTricode}: ${placed}`);
    for (const x of prep.players) { assert.ok(x.expectedMinutes > 0); assert.ok(x.playRate > 0 && x.playRate <= 1); }
  }
});

test("NORMALISATION over-full: nobody is raised, the bench gives up the larger share, the team lands on 240", () => {
  const over = [36, 34, 30, 30, 28, 26, 22, 18, 12, 8].map((minutes) => ({ minutes, q: 1 }));
  const o = normaliseV07(over);
  assert.equal(o.unallocatedMinutes, 0);
  over.forEach((r, i) => assert.ok(o.minutes[i] <= r.minutes + 1e-9, "nobody is raised"));
  assert.ok(o.minutes[0] / over[0].minutes > o.minutes[9] / over[9].minutes);
  assert.ok(Math.abs(over.reduce((s, r, i) => s + r.q * o.minutes[i], 0) - 240) < 1e-6);
  assert.ok(o.cut > 0);
});

test("NORMALISATION under-full: top rotation is never raised, the lift is additive, stops at the top line, and a short pool is not scaled", () => {
  const rows = [36.4, 31, 29.5, 23.1, 21, 15, 12, 8.7].map((minutes) => ({ minutes, q: 1 }));
  const n = normaliseV07(rows);
  const S = rows.reduce((s, r) => s + r.minutes, 0);
  const f = 240 / S;
  assert.equal(n.minutes[0], 36.4, "at or above the line: unchanged, on the shortest pool");
  assert.equal(n.minutes[1], 31);
  assert.equal(n.minutes[2], 30, "stops at the top line");
  const wanted = K.UNDER_FULL_LIFT_MINUTES * (f - 1);
  for (const i of [3, 4, 5, 6, 7]) assert.ok(Math.abs(n.minutes[i] - rows[i].minutes - wanted) < 1e-9, "the same minutes for each player below the line");
  rows.forEach((r, i) => assert.ok(n.minutes[i] >= r.minutes - 1e-9, "nobody is lowered"));
  assert.ok(n.unallocatedMinutes > 0, "the remainder stays unallocated");
  assert.ok(Math.abs(n.placed + n.unallocatedMinutes - 240) < 1e-9);
  assert.ok(n.placed < 240 && n.minutes[0] < 40, "uniform scaling would have put the top player on 52");
  // the lift never overfills a tiny pool
  const tiny = normaliseV07(Array.from({ length: 15 }, () => ({ minutes: 1, q: 1 })));
  assert.ok(tiny.placed <= 240 + 1e-9 && tiny.unallocatedMinutes >= 0);
  // continuity at 240 and the empty pool
  const exact = Array.from({ length: 12 }, () => ({ minutes: 20, q: 1 }));
  assert.deepEqual(normaliseV07(exact).minutes.map((m) => Number(m.toFixed(9))), exact.map(() => 20));
  assert.deepEqual(normaliseV07([]).minutes, []);
  assert.equal(normaliseV07([]).unallocatedMinutes, 240);
  assert.deepEqual(boundedWaterFill([], [], [], 240).minutes, []);
});

test("REMOVAL NEEDS POSITIVE EVIDENCE: a box-score absence never removes a player; only Out in the feed does", () => {
  const p = pool();
  const r = byId(p.rows);
  // "ret": a 33-minute starter last season, in no box this season, unlisted. This is the returning-starter case.
  assert.equal(r.ret.eligibilityState, STATES.NO_APPEARANCE);
  assert.equal(r.ret.expectedMinutes, 33);
  assert.equal(r.ret.projectedPlayProbability, RATE.NO_APPEARANCE);
  assert.equal(r.ret.removalEvidence, null);
  assert.equal(r.gone.eligibilityState, STATES.MISSED_2PLUS_OTHER);
  assert.ok(r.gone.expectedMinutes > 0);
  assert.equal(r.gone.removalEvidence, null);
  const prep = prepareRosterV07(p);
  for (const id of ["ret", "gone", "lapsed", "cc", "ms"]) assert.ok(prep.players.some((x) => x.providerAthleteId === id), id);
  // the same player listed Out is removed, and the row says why
  const out = byId(pool({ injuries: [{ providerTeamId: TOR, athleteId: "ret", status: "Out", statedAt: "2026-10-26T10:00Z" }] }).rows).ret;
  assert.equal(out.expectedMinutes, null);
  assert.equal(out.projectedPlayProbability, 0);
  assert.equal(out.removalEvidence, "OUT_IN_FEED");
  // no row anywhere carries a removal without that evidence
  for (const row of p.rows) assert.equal(row.expectedMinutes == null, row.availability === "out" || row.noProjectionReason != null, row.providerAthleteId);
  assert.equal("excluded" in p, false, "there is no exclusion list");
});

test("PLAY PROBABILITY: a direct state rate, never base × multiplier, and it never raises base", () => {
  for (const [state, rate] of Object.entries(RATE)) {
    assert.equal(playProbabilityV07({ base: 0.95, state, dayToDay: false }), rate, state);
    assert.equal(playProbabilityV07({ base: 0.2, state: state, dayToDay: false }), Math.min(0.2, rate), `${state}: capped by base`);
  }
  assert.equal(playProbabilityV07({ base: 0.9, state: STATES.LAST_PLAYED, dayToDay: false }), 0.9);
  assert.equal(playProbabilityV07({ base: 0.9, state: STATES.NONE, dayToDay: false }), 0.9);
  assert.equal(playProbabilityV07({ base: null, state: STATES.LAST_PLAYED, dayToDay: false }), 1);
  const r = byId(pool().rows);
  assert.equal(r.cc.eligibilityState, STATES.MISSED_2PLUS_COACH);
  assert.equal(r.cc.playRate, Math.min(r.cc.basePlayRate, RATE.MISSED_2PLUS_COACH));
});

test("DAY-TO-DAY: no constant of its own; a listing takes the MISSED_1_OTHER rate, lifts a long absence to it, and never stacks", () => {
  const d = RATE.MISSED_1_OTHER;
  assert.equal(playProbabilityV07({ base: 0.97, state: STATES.LAST_PLAYED, dayToDay: true }), d);
  assert.equal(playProbabilityV07({ base: 0.97, state: STATES.NONE, dayToDay: true }), d);
  assert.equal(playProbabilityV07({ base: 0.97, state: STATES.NO_APPEARANCE, dayToDay: true }), d, "the listing is positive evidence of a short absence");
  assert.equal(playProbabilityV07({ base: 0.97, state: STATES.MISSED_2PLUS_OTHER, dayToDay: true }), d);
  assert.equal(playProbabilityV07({ base: 0.3, state: STATES.NO_APPEARANCE, dayToDay: true }), 0.3, "a listing does not raise base");
  const r = byId(pool().rows);
  assert.equal(r.dd.dayToDay, true);
  assert.equal(r.dd.playRate, Math.min(r.dd.basePlayRate, d));
  const listed = byId(pool({ injuries: [{ providerTeamId: TOR, athleteId: "ret", status: "Day-To-Day", statedAt: "2026-10-26T10:00Z" }] }).rows).ret;
  assert.equal(listed.projectedPlayProbability, Math.min(listed.basePlayRate, d));
});

test("STATE RULE: the same classifications as the v0.5 rule on the cases that matter", () => {
  const tg = [["a", "played"], ["a", "dnp_coach"], ["a", "dnp_other"]].map(([id, s]) => ({ statusOf: new Map([[id, s]]) }));
  assert.equal(classifyState({ teamGames: [], athleteId: "a", lastTeamBefore: null, teamId: "1" }).state, STATES.NONE);
  assert.equal(classifyState({ teamGames: tg, athleteId: "b", lastTeamBefore: null, teamId: "1" }).state, STATES.NO_APPEARANCE);
  assert.equal(classifyState({ teamGames: tg, athleteId: "a", lastTeamBefore: "2", teamId: "1" }).state, STATES.NONE);
  assert.equal(classifyState({ teamGames: tg, athleteId: "a", lastTeamBefore: "1", teamId: "1" }).state, STATES.MISSED_2PLUS_OTHER);
  assert.equal(classifyState({ teamGames: tg.slice(0, 2), athleteId: "a", lastTeamBefore: "1", teamId: "1" }).state, STATES.MISSED_1_COACH);
  assert.equal(classifyState({ teamGames: tg.slice(0, 1), athleteId: "a", lastTeamBefore: "1", teamId: "1" }).state, STATES.LAST_PLAYED);
  assert.equal(lineStatus({ didNotPlay: true, dnpReason: "COACH'S DECISION" }), "dnp_coach");
  assert.equal(lineStatus({ didNotPlay: false, minutes: 0 }), "dnp_other");
  assert.equal(lineStatus({ didNotPlay: false, minutes: 12 }), "played");
});

test("NEVER FABRICATE: a rookie or veteran with no committed evidence has null minutes and a reason, never 0; first box score covers him", () => {
  const p = pool();
  const r = byId(p.rows);
  assert.equal(r.rook.expectedMinutes, null);
  assert.equal(r.rook.minutesSd, null);
  assert.equal(r.rook.rates, null);
  assert.equal(r.rook.projectedPlayProbability, null);
  assert.equal(r.rook.noProjectionReason, "ROOKIE_NO_REGULAR_SEASON_BOX");
  assert.equal(r.vet.noProjectionReason, "VETERAN_NO_BOX_IN_LAST_TWO_SEASONS");
  assert.equal(noProjectionReason({ rosterExperienceYears: null }), "NO_COMMITTED_EVIDENCE");
  assert.ok(!prepareRosterV07(p).players.some((x) => x.providerAthleteId === "rook" || x.providerAthleteId === "vet"));
  assert.deepEqual(p.noProjection.map((x) => [x.providerAthleteId, x.reason]).sort(), [["rook", "ROOKIE_NO_REGULAR_SEASON_BOX"], ["vet", "VETERAN_NO_BOX_IN_LAST_TWO_SEASONS"]]);
  // preseason minutes are not evidence
  const pre = box("e0", "2026-10-10T23:00Z", [TOR, MIA], [line("rook", TOR, 30, true)], { phase: 1 });
  assert.equal(byId(pool({ boxscores: [...DOCS, pre] }).rows).rook.expectedMinutes, null);
  // one regular-season game is evidence
  const after = byId(pool({ boxscores: [...DOCS, box("e3b", "2026-10-25T23:30Z", [TOR, BOS], [line("rook", TOR, 21)])] }).rows).rook;
  assert.equal(after.expectedMinutes, 21);
  assert.equal(after.noProjectionReason, null);
});

test("WINDOW: playoffs never enter; a trade makes old-team games prior, worth TRANSFER_PRIOR_GAMES; the rest is worth PRIOR_GAMES", () => {
  const r = byId(pool().rows);
  assert.equal(r.tr.movedTeam, true);
  assert.equal(r.tr.expectedMinutes, 18, "(1·30 + 42) / 4");
  assert.equal(r.s1.expectedMinutes, 37, "(3·36 + 3·38) / 6");
  assert.equal(r.s1.v03RoleMinutes, Number(((10 * 36 + 3 * 38) / 13).toFixed(3)), "rates and base stay on the v0.3 estimate");
  const playoff = box("po", "2026-05-01T23:00Z", [TOR, MIA], [line("s1", TOR, 48, true)], { season: 2026, phase: 3 });
  const playIn = box("pi", "2026-04-15T23:00Z", [TOR, MIA], [line("s1", TOR, 48, true)], { season: 2026, phase: 5 });
  assert.equal(byId(pool({ boxscores: [...DOCS, playoff, playIn] }).rows).s1.expectedMinutes, 37);
  const rec = { apps: { 2026: Array.from({ length: 30 }, () => ({ minutes: 20, teamId: MIA })), 2027: [{ minutes: 30, teamId: MIA }, { minutes: 30, teamId: MIA }, { minutes: 10, teamId: TOR }] } };
  const est = minutesEstimateV07(rec, { priorSeason: 2026, currentSeason: 2027, teamId: TOR });
  assert.equal(est.carriedGames, 32);
  assert.equal(est.movedTeam, true);
  assert.equal(est.expectedMinutes, Number((((1 / 32) * (30 * 20 + 60) + 10) / 2).toFixed(3)));
  assert.equal(minutesEstimateV07({ apps: { 2026: [{ minutes: 26, teamId: MIA }, { minutes: 30, teamId: MIA }], 2027: [] } }, { priorSeason: 2026, currentSeason: 2027, teamId: TOR }).expectedMinutes, 28);
  assert.equal(minutesEstimateV07({ apps: { 2026: [], 2027: [] } }, { priorSeason: 2026, currentSeason: 2027, teamId: TOR }), null);
});

test("COVERAGE: last game's starters, sixth man and rotation each get a status; every missing row has a reason code", () => {
  const p = pool({ injuries: [{ providerTeamId: TOR, athleteId: "s2", status: "Out", statedAt: "2026-10-26T10:00Z" }] });
  assert.equal(p.coverage.lastEventId, "e3");
  const c = byId(p.coverage.roles);
  assert.equal(c.s1.role, "STARTER");
  assert.equal(c.s1.status, COVERAGE_STATUS.PROJECTED);
  assert.equal(c.s1.reason, null);
  assert.equal(c.s2.status, COVERAGE_STATUS.OUT);
  assert.equal(c.s2.reason, "OUT_IN_FEED");
  assert.equal(c.b1.role, "SIXTH_MAN");
  assert.equal(c.b2.role, "ROTATION");
  const off = gatePoolV07({ rosters: { ...rosters(), teams: [{ ...rosters().teams[0], players: rosters().teams[0].players.filter((x) => x.providerAthleteId !== "s3") }] }, providerTeamId: TOR, context: ctx() });
  assert.equal(byId(off.coverage.roles).s3.reason, "NOT_ON_ROSTER_CAPTURE");
});

test("COVERAGE REPORT: per team and per slate, with a rookie starter, an unknown team and a refused team all explained", () => {
  const rookStarted = box("e3c", "2026-10-25T23:40Z", [TOR, BOS], [...coreLines(), line("rook", TOR, 30, true), line("nobody", TOR, 20, false)]);
  const docs = [...DOCS, rookStarted];
  const roster = rosters();
  const games = [{ providerEventId: "900", home: { providerTeamId: TOR, abbr: "TOR" }, away: { providerTeamId: BOS, abbr: "BOS" } }];
  const report = coverageReportV07({ date: "2026-10-26", games, rosters: roster, context: ctx({ boxscores: docs }) });
  assert.equal(report.armed, false);
  assert.equal(report.label, "COVERAGE_REPORT_LAST_LINEUP_PROXY");
  const [tor, bos] = report.teams;
  assert.equal(tor.state, "GATED");
  assert.equal(bos.state, "REFUSED", "BOS is not in this roster capture");
  assert.match(bos.teamReason, /^REFUSED:/);
  assert.ok(tor.starters.find((c) => c.providerAthleteId === "rook").status === COVERAGE_STATUS.PROJECTED, "a first game makes him projected");
  assert.equal(tor.missing.find((c) => c.providerAthleteId === "nobody")?.reason, "NOT_ON_ROSTER_CAPTURE");
  for (const c of tor.missing) assert.ok(c.reason, c.name);
  assert.equal(report.totals.starters.total, tor.starters.length);
  assert.equal(report.totals.teamsWithNoLineup, 1);
  // a team with no game yet carries a team-level reason
  const empty = coverageReportV07({ date: "2026-10-20", games: [{ providerEventId: "901", home: { providerTeamId: TOR, abbr: "TOR" }, away: { providerTeamId: TOR, abbr: "TOR" } }], rosters: { ...roster, asOf: "2026-10-20T12:00:00Z" }, context: buildV07Context({ boxscores: PRIOR, injuries: [], asOfDateUtc: "2026-10-20T15:00:00Z" }) });
  assert.equal(empty.teams.length, 1, "a team is reported once");
  assert.equal(empty.teams[0].teamReason, "TEAM_NO_GAME_BEFORE_INSTANT");
});

test("DETERMINISM: same inputs, same pool, same prepared roster, same draws; inputs are not mutated", () => {
  const before = JSON.stringify(DOCS);
  assert.deepEqual(pool(), pool());
  assert.equal(JSON.stringify(DOCS), before);
  const a = simulatePlayersV07({ providerEventId: "401", homePool: pool(), awayPool: pool(), simulations: 200 });
  assert.deepEqual(a, simulatePlayersV07({ providerEventId: "401", homePool: pool(), awayPool: pool(), simulations: 200 }));
  assert.equal(a.teamScores, "WITHHELD");
  assert.equal(a.armed, false);
});

test("DRAWS: for the same prepared line the player distributions equal v0.3's engine", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ providerAthleteId: String(i + 1), name: `P${i}`, expectedMinutes: 20, minutesSd: 4, starterRate: 0.5, gamesUsed: 30, dnpCount: 0, nullMinutesCount: 0, basis: "blend", availability: "active", injuryStatus: null, rates: { pts: 0.5, reb: 0.2, ast: 0.1, threePm: 0.05 }, rateSd: { pts: 0.1, reb: 0.05, ast: 0.03, threePm: 0.02 }, playRate: 1 }));
  const v03Side = { minutes: { rows, normalisation: { rule: PLAY_RATE_WATER_FILL, power: 1.25 }, injuriesProvided: true } };
  const v07Pool = { rows, normalisation: { rule: "v07-top-held-additive-lift", power: 1.25 } };
  const v03 = simulateGameV03({ providerEventId: "501", home: v03Side, away: v03Side, simulations: 300 });
  const v07 = simulatePlayersV07({ providerEventId: "501", homePool: v07Pool, awayPool: v07Pool, simulations: 300 });
  assert.equal(v07.seed, v03.seed);
  for (const side of ["home", "away"]) v03.players[side].forEach((p, i) => { for (const k of ["minutes", "pts", "reb", "ast", "threePm"]) assert.equal(v07.players[side][i][k].p50, p[k].p50, `${side} ${i} ${k}`); });
  assert.throws(() => simulatePreparedV07({ home: { players: [] }, away: { players: [] } }), /providerEventId/);
});

test("CONSTANTS: every new constant has a source and is PROPOSED_NOT_APPROVED; the context takes no overrides", () => {
  for (const [k, c] of Object.entries({ ...CONSTANTS, ...REUSED_CONSTANTS })) {
    assert.equal(c.status, PROPOSED, k);
    assert.equal(c.status, "PROPOSED_NOT_APPROVED", k);
    assert.ok(c.source.length > 20, `${k} has a source`);
    assert.ok(c.value != null, k);
  }
  assert.equal(pool().constantsStatus, "PROPOSED_NOT_APPROVED");
  // sensitivities cannot be run from the module: an override argument changes nothing
  assert.deepEqual(pool({ overrides: { UNDER_FULL_LIFT_MINUTES: 99 } }).params, pool().params);
  for (const dropped of ["EXCLUDE_BELOW_PLAY_RATE", "DAY_TO_DAY_MULTIPLIER", "UNDERFULL_CEILING_SDS", "UNDERFULL_CEILING_MINUTES"]) assert.ok(!(dropped in CONSTANTS), dropped);
});

test("ANTI-TUNING: no fit reads 2026-27. The guard throws, and a 2026-27 box score changes no fit", () => {
  assert.deepEqual([...COMPLETED_SEASONS], [2024, 2025, 2026]);
  assert.throws(() => assertCompletedSeasons([2027]), /not a completed season/);
  assert.throws(() => seasonRows([], { season: 2027, priorGames: 3, transferPriorGames: 1 }), /not a completed season/);
  assert.throws(() => fitStateTable([], { seasons: [2026, 2027], priorGames: 3, transferPriorGames: 1 }), /not a completed season/);
  assert.throws(() => minutesQuantile([], { season: 2027, q: 0.5 }), /not a completed season/);
  // the corpus the fits read holds no 2026-27 game, and adding one changes nothing
  const seen = box("seen", "2026-10-21T23:00Z", [TOR, MIA], [line("s1", TOR, 48, true)]);
  const P = { priorGames: 3, transferPriorGames: 1 };
  assert.deepEqual(seasonRows([...PRIOR, seen], { season: 2026, ...P }), seasonRows(PRIOR, { season: 2026, ...P }));
  const dir = path.join(NBA, "boxscores");
  const seasons = new Set(fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).season));
  assert.ok([...seasons].every((s) => COMPLETED_SEASONS.includes(s)), `corpus seasons: ${[...seasons]}`);
});

test("RECOMPUTE: every data-sourced constant re-derives from the completed-season corpus", () => {
  const corpus = readBoxDir(path.join(NBA, "boxscores"));
  const P = { priorGames: K.PRIOR_GAMES, transferPriorGames: K.TRANSFER_PRIOR_GAMES };
  // the state rule is the v0.5 rule: its table's counts come back exactly, with no-role rows included
  const v05 = stateTable(seasonRows(corpus, { season: 2026, ...P, includeNoRole: true }));
  assert.deepEqual(v05.cells.ALL, {
    NO_APPEARANCE: { n: 5059, played: 107 }, LAST_PLAYED: { n: 26076, played: 22461 }, MISSED_1_COACH: { n: 1847, played: 913 },
    MISSED_1_OTHER: { n: 1865, played: 929 }, MISSED_2PLUS_COACH: { n: 2421, played: 894 }, MISSED_2PLUS_OTHER: { n: 6454, played: 872 },
  });
  const pooled = [...seasonRows(corpus, { season: 2025, ...P }), ...seasonRows(corpus, { season: 2026, ...P })];
  const table = stateTable(pooled);
  assert.deepEqual(table.cells.ALL, {
    NO_APPEARANCE: { n: 4358, played: 126 }, LAST_PLAYED: { n: 51845, played: 44507 }, MISSED_1_COACH: { n: 3784, played: 1833 },
    MISSED_1_OTHER: { n: 3650, played: 1785 }, MISSED_2PLUS_COACH: { n: 5047, played: 1850 }, MISSED_2PLUS_OTHER: { n: 12739, played: 1734 },
  });
  for (const [s, rate] of Object.entries(RATE)) assert.equal(table.rates.ALL[s], rate, s);
  // the lift
  const sides = sidesOf(pooled, { q: qOfRow(table.rates.ALL) });
  const fit = fitAdditiveLift(sides, { topRotationMinutes: K.TOP_ROTATION_MINUTES });
  assert.deepEqual(fit, { n: 28970, liftMinutes: 9.029 });
  assert.equal(Math.round(fit.liftMinutes), K.UNDER_FULL_LIFT_MINUTES);
  // the top line: each season shows no lift at or above it and a measurable one just below it
  for (const season of [2025, 2026]) {
    const s = sidesOf(pooled.filter((r) => r.season === season), { q: qOfRow(table.rates.ALL) });
    const top = proportionalLiftSlope(s, { lo: K.TOP_ROTATION_MINUTES });
    const below = proportionalLiftSlope(s, { lo: 24, hi: K.TOP_ROTATION_MINUTES });
    assert.ok(Math.abs(top.slope) <= 0.07, `${season} top ${top.slope}`);
    assert.ok(below.slope >= 0.14, `${season} below ${below.slope}`);
  }
  // the direct rate beats the multiplier out of sample, in both directions
  for (const [tr, te] of [[2025, 2026], [2026, 2025]]) {
    const t = stateTable(pooled.filter((r) => r.season === tr));
    const test = pooled.filter((r) => r.season === te && r.k < 20);
    const y = (r) => (r.played ? 1 : 0);
    const brier = (q) => test.reduce((s, r) => s + (q(r) - y(r)) ** 2, 0) / test.length;
    assert.ok(brier(qOfRow(t.rates.ALL)) < brier((r) => Math.min(1, r.base * (t.multipliers.ALL[r.state] ?? 1))), `fit ${tr}`);
  }
});

test("UNARMED: no production path reaches the candidate; no family, workflow, package script, reader or data directory names it", () => {
  assert.deepEqual({ ...CANDIDATE_STATUS }, { armed: false, role: "CANDIDATE_UNARMED", dataClass: "PRIVATE_RESEARCH", productEligible: false });
  assert.ok(!("v0.7" in FAMILIES) && !("v0.7" in CANDIDATE_FAMILIES));
  const SRC = path.join(APP, "src");
  const SCRIPTS = path.join(APP, "scripts");
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const code = [...walk(SRC), ...walk(SCRIPTS)].filter((f) => /\.(m?js|tsx?)$/.test(f));
  const OWN = new Set([
    ...["minutes-model-v07.mjs", "minutes-model-v07-state.mjs", "minutes-model-v07-fit.mjs", "game-sim-v07.mjs", "minutes-model-v07.test.mjs"].map((f) => path.join(HERE, f)),
    ...["replay-nba-v07-candidate.mjs", "report-nba-v07-coverage.mjs", "study-nba-v07-completed-seasons.mjs", "nba-v07-inputs.mjs"].map((f) => path.join(SCRIPTS, "nba", "research", f)),
  ]);
  for (const f of OWN) assert.ok(fs.existsSync(f), f);
  const MARKER = /minutes-model-v07|game-sim-v07|nba-minutes-model-v0\.7|nba-roster-gated-pool-v0\.7|experimental-v0\.7|replay-nba-v07|report-nba-v07|study-nba-v07|nba-v07-inputs|["']v0\.7["']/;
  assert.deepEqual(code.filter((f) => !OWN.has(f) && MARKER.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(APP, f)), [], "nothing outside the candidate names it");
  // nothing the candidate's own code imports is a writer of official artifacts
  for (const f of OWN) {
    if (f.endsWith(".test.mjs")) continue;
    const text = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(text, /\bfrom\s+["'][^"']*(publish-nba|grade-nba|ledger|receipt-|build-nba-experimental)/, f);
    assert.doesNotMatch(text, /process\.env/, `${f} reads no environment`);
    if (f.includes(`${path.sep}src${path.sep}`)) assert.doesNotMatch(text, /\bfrom\s+["']node:/, `${f} is pure`);
  }
  const wf = path.join(ROOT, ".github", "workflows");
  for (const file of fs.readdirSync(wf)) assert.doesNotMatch(fs.readFileSync(path.join(wf, file), "utf8"), MARKER, file);
  assert.doesNotMatch(fs.readFileSync(path.join(APP, "package.json"), "utf8"), MARKER);
  assert.ok(!fs.existsSync(path.join(NBA, "experimental-v0.7")), "no v0.7 directory in the research tree");
  assert.ok(!fs.existsSync(path.join(APP, "public", "data", "nba", "experimental-v0.7")), "no v0.7 public data");
});

test("PRESERVED EVIDENCE: the v0.6 files, their docs and v0.3's sources are byte-identical", () => {
  const sha = (rel) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex");
  const v0six = ["minutes-model-v0", "6"].join(""), simSix = ["game-sim-v0", "6"].join("");
  const pins = {
    [`app/src/lib/sports/nba/${v0six}.mjs`]: "8722f0e0f3890f4dc610598299327ca18a0dcabda0cf87bc92500bd7541c5938",
    [`app/src/lib/sports/nba/${v0six}-fit.mjs`]: "f162d45ffa97854d5abf772dce9bae9ed8163f81ff70230f0fcf61de2646b256",
    [`app/src/lib/sports/nba/${simSix}.mjs`]: "4e69808f0d58eb03f4beb0922a0f7be976b67e2debc4b25622b687eaf4999f74",
    [`app/src/lib/sports/nba/${v0six}.test.mjs`]: "4fa74e450447c9764c62e92a850a274b89fd9cfa6fdee30a7235afb70e5fb02a",
    [`app/scripts/nba/research/${["replay-nba-v0", "6"].join("")}-candidate.mjs`]: "704668b34bfcd20802c0583eafb9a9ac450091d6b9da0457b97e23b124fbfb46",
    "docs/nba/NBA_V06_MINUTES_CANDIDATE_PREREGISTRATION_2026-11-02.md": "7d6dbb6cd6d985ef3e8189c293b611552ccdca97954d38b146533955dd7df683",
    "docs/nba/NBA_V06_SEEN_DATA_REPLAY_2026-11-02.md": "cf0d828d79e1de91bfac3340c885aec49bc2b49ac9bc5b16f23063e432dee813",
    "app/src/lib/sports/nba/minutes-model-v03.mjs": "4819ce41c953c4b8df068539c1c85e91ade03cab41e041a6e0291bd3a500bec7",
    "app/src/lib/sports/nba/game-sim-v03.mjs": "1b8aac60d571cba200db1658ff4262c0cfb376ef9e6ec8de081853ebfb0ab82e",
  };
  for (const [rel, want] of Object.entries(pins)) assert.equal(sha(rel), want, rel);
});

test("PREREGISTRATION: the document exists and states every bar and the no-single-metric rule", () => {
  const doc = fs.readFileSync(path.join(ROOT, "docs", "nba", "NBA_V07_MINUTES_CANDIDATE_PREREGISTRATION_2026-11-02.md"), "utf8");
  for (const bar of ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B12"]) assert.match(doc, new RegExp(`\\| ${bar} \\|`), bar);
  assert.match(doc, /No single metric/);
  assert.match(doc, /2026-11-03/);
  assert.match(doc, /30 games/);
  for (const c of Object.keys(CONSTANTS)) assert.match(doc, new RegExp(c), c);
});

test("SCRIPTS refuse to write inside the repository, and the replay needs a named mode", () => {
  const research = path.join(APP, "scripts", "nba", "research");
  const run = (file, args) => spawnSync("npx", ["tsx", path.join(research, file), ...args], { cwd: APP, encoding: "utf8" });
  const a = run("replay-nba-v07-candidate.mjs", ["--mode", "seen-regression", "--out-dir", path.join(NBA, "replays", "x")]);
  assert.equal(a.status, 1);
  assert.match(a.stderr, /inside the repository/);
  const b = run("report-nba-v07-coverage.mjs", ["--date", "2026-11-02", "--out-dir", path.join(NBA, "replays", "x")]);
  assert.equal(b.status, 1);
  assert.match(b.stderr, /inside the repository/);
  const c = run("replay-nba-v07-candidate.mjs", ["--out-dir", "/tmp/never"]);
  assert.equal(c.status, 1);
  assert.match(c.stderr, /--mode/);
});

test("asOfInputs: null injuries stay null, an undated injury entry is kept, a missing instant throws", () => {
  assert.equal(asOfInputs({ boxscores: [], injuries: null, asOfDateUtc: NOW }).injuries, null);
  assert.equal(asOfInputs({ boxscores: [], injuries: [{ athleteId: "x" }], asOfDateUtc: NOW }).injuries.length, 1);
  assert.throws(() => asOfInputs({ boxscores: [] }), /asOfDateUtc/);
});
