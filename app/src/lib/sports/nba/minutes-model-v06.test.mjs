/**
 * v0.6 CANDIDATE minutes model: leakage, team-minutes reconciliation, the seven rules, the recompute of its constants,
 * and the unarmed guards. NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · PRIVATE_RESEARCH.
 *
 * Run: npx tsx --test src/lib/sports/nba/minutes-model-v06.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  asOfInputs, boundedWaterFill, buildV06Context, CANDIDATE_STATUS, CONSTANTS, EXCLUDED_STATE, excludedStates, gatePoolV06, minutesEstimateV06,
  normaliseV06, noProjectionReason, prepareRosterV06, PROPOSED, REUSED_CONSTANTS,
} from "./minutes-model-v06.mjs";
import { simulatePrepared, simulatePlayersV06 } from "./game-sim-v06.mjs";
import {
  earlySeasonRows, fitDayToDayMultiplier, fitTransferPriorGames, maeByPriorGames, minutesQuantile, shareUnderMeanPlusSd,
} from "./minutes-model-v06-fit.mjs";
import { ELIGIBILITY_TABLE, fitEligibilityTable, MULTIPLIERS, STATES } from "./eligibility-gate-v05.mjs";
import { foldBoxscores } from "./season-fold.mjs";
import { CANDIDATE_FAMILIES, FAMILIES } from "./experimental-forecast.mjs";
import { PLAY_RATE_WATER_FILL, simulateGameV03 } from "./game-sim-v03.mjs";
import { TEAM_MINUTES, MAX_PLAYER_MINUTES } from "./game-sim.mjs";

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

/** Last season: everyone plays 40 games for TOR; "tr" played 30 minutes for MIA and now plays for TOR; "lapsed" stopped playing */
const PRIOR = Array.from({ length: 40 }, (_, i) => box(`p${i}`, new Date(Date.UTC(2026, 0, 1 + i, 23)).toISOString(), [TOR, MIA], [
  ...coreLines(), line("tr", MIA, 30, true), line("dnpg", TOR, 18), line("dd", TOR, 22),
  line("cc", TOR, 15), line("ms", TOR, 14), line("gone", TOR, 20), line("lapsed", TOR, 10),
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
const rosterIds = [...TOR_CORE, ...BENCH].map(([id]) => id).concat(["tr", "dnpg", "dd", "cc", "ms", "gone", "lapsed", "rook", "vet"]);
const rosters = (extraIds = []) => ({
  asOf: "2026-10-26T12:00:00Z",
  teams: [{ providerTeamId: TOR, state: "CAPTURED", capturedAt: "2026-10-26T12:00:00Z", players: [...rosterIds, ...extraIds].map((id) => ({ providerAthleteId: id, displayName: `P ${id}`, position: "G", experienceYears: id === "rook" ? 0 : id === "vet" ? 8 : 3 })) }],
});
const ctx = (over = {}) => buildV06Context({ boxscores: DOCS, injuries, injuriesAsOf: "2026-10-26T11:00Z", asOfDateUtc: NOW, ...over });
const pool = (over = {}) => gatePoolV06({ rosters: rosters(), providerTeamId: TOR, context: ctx(over) });
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.providerAthleteId, r]));

test("LEAKAGE: changing any input dated after the instant changes no output", () => {
  const base = { pool: pool(), prep: prepareRosterV06(pool()) };
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
    const c = ctx(p);
    const mutated = gatePoolV06({ rosters: rosters(), providerTeamId: TOR, context: c });
    assert.deepEqual(mutated, base.pool, p.name);
    assert.deepEqual(prepareRosterV06(mutated), base.prep, p.name);
  }
  // the filter is what keeps them out: the same late-captured game, captured in time, does change the output
  const inTime = pool({ boxscores: [...DOCS, { ...LATE_CAPTURE, capturedAt: "2026-10-26T14:00:00Z" }] });
  assert.notDeepEqual(inTime, base.pool);
  assert.equal(byId(inTime.rows).rook.minutesState, "MODELLED");
  // the same injury, stated in time, does change the output
  assert.equal(byId(pool({ injuries: [...injuries, { ...futureInjury, statedAt: "2026-10-26T14:00Z" }] }).rows).s1.availability, "out");
});

test("LEAKAGE: a feed or roster stamped after the instant is refused, not read", () => {
  const c = ctx({ injuriesAsOf: "2026-10-26T15:01Z" });
  assert.equal(gatePoolV06({ rosters: rosters(), providerTeamId: TOR, context: c }).reason, "INJURIES_FROM_THE_FUTURE");
  const r = gatePoolV06({ rosters: { ...rosters(), asOf: "2026-10-26T15:01:00Z" }, providerTeamId: TOR, context: ctx() });
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
    const a = gatePoolV06({ rosters: roster, providerTeamId: t.providerTeamId, context: buildV06Context({ boxscores: docs, injuries: [], asOfDateUtc: now }) });
    const b = gatePoolV06({ rosters: roster, providerTeamId: t.providerTeamId, context: buildV06Context({ boxscores: scrambled, injuries: [], asOfDateUtc: now }) });
    assert.deepEqual(b, a, t.canonicalTricode);
  }
});

test("TEAM MINUTES RECONCILE: Σ q·minutes + unallocated = 240 on over-full, under-full and depleted pools", () => {
  const sum = (p) => p.players.reduce((s, x) => s + x.expectedMinutes * x.playRate, 0);
  const cases = {
    full: pool(),
    "starters out": pool({ injuries: ["s1", "s2", "s3"].map((id) => ({ providerTeamId: TOR, athleteId: id, status: "Out", statedAt: "2026-10-26T10:00Z" })) }),
    "eight out": pool({ injuries: ["s1", "s2", "s3", "s4", "s5", "b1", "b2", "b3"].map((id) => ({ providerTeamId: TOR, athleteId: id, status: "Out", statedAt: "2026-10-26T10:00Z" })) }),
  };
  for (const [name, p] of Object.entries(cases)) {
    const prep = prepareRosterV06(p);
    const rec = prep.reconciliation;
    assert.ok(Math.abs(sum(prep) + rec.unallocatedMinutes - TEAM_MINUTES) < 0.02, `${name}: ${sum(prep)} + ${rec.unallocatedMinutes}`);
    assert.ok(rec.unallocatedMinutes >= 0, name);
    for (const x of prep.players) assert.ok(x.expectedMinutes <= MAX_PLAYER_MINUTES, name);
  }
  assert.equal(prepareRosterV06(cases.full).reconciliation.unallocatedMinutes, 0);
  assert.ok(prepareRosterV06(cases["eight out"]).reconciliation.unallocatedMinutes > 0, "a depleted pool leaves minutes unplaced");
});

test("TEAM MINUTES RECONCILE on every team of the committed roster, at the latest committed box scores", () => {
  const fetched = readBoxDir(path.join(NBA, "experimental", "boxscores"));
  const corpus = readBoxDir(path.join(NBA, "boxscores")).filter((d) => d.season === 2026);
  const roster = JSON.parse(fs.readFileSync(path.join(NBA, "rosters", "latest.json"), "utf8"));
  const now = new Date(Date.parse(roster.asOf) + 3_600_000).toISOString();
  const docs = foldBoxscores(corpus, fetched, { now }).docs;
  const injuriesDoc = JSON.parse(fs.readFileSync(path.resolve(NBA, "..", "injuries", "nba", "latest.json"), "utf8"));
  const context = buildV06Context({ boxscores: docs, injuries: injuriesDoc.entries, asOfDateUtc: now });
  assert.equal(roster.teams.length, 30);
  for (const t of roster.teams) {
    const p = gatePoolV06({ rosters: roster, providerTeamId: t.providerTeamId, context });
    assert.equal(p.state, "GATED", t.canonicalTricode);
    const prep = prepareRosterV06(p);
    const placed = prep.players.reduce((s, x) => s + x.expectedMinutes * x.playRate, 0);
    assert.ok(Math.abs(placed + prep.reconciliation.unallocatedMinutes - TEAM_MINUTES) < 0.02, `${t.canonicalTricode}: ${placed}`);
    for (const x of prep.players) { assert.ok(x.expectedMinutes > 0); assert.ok(x.playRate > 0 && x.playRate <= 1); }
  }
});

test("NORMALISATION: over-full raises nobody and cuts the bench most; under-full lifts by one factor up to personal ceilings", () => {
  const over = [{ minutes: 36, q: 1, sd: 4 }, { minutes: 34, q: 1, sd: 4 }, { minutes: 30, q: 1, sd: 4 }, { minutes: 30, q: 1, sd: 4 }, { minutes: 28, q: 1, sd: 4 }, { minutes: 26, q: 1, sd: 4 }, { minutes: 22, q: 1, sd: 4 }, { minutes: 18, q: 1, sd: 4 }, { minutes: 12, q: 1, sd: 4 }, { minutes: 8, q: 1, sd: 4 }];
  const o = normaliseV06(over);
  assert.equal(o.unallocatedMinutes, 0);
  over.forEach((r, i) => assert.ok(o.minutes[i] <= r.minutes + 1e-9, "nobody is raised"));
  assert.ok(o.minutes[0] / over[0].minutes > o.minutes[9] / over[9].minutes, "the bench gives up the larger share");
  assert.ok(Math.abs(over.reduce((s, r, i) => s + r.q * o.minutes[i], 0) - 240) < 1e-6);
  const under = [{ minutes: 34, q: 1, sd: 4 }, { minutes: 30, q: 1, sd: 5 }, { minutes: 28, q: 1, sd: null }, { minutes: 24, q: 1, sd: 4 }, { minutes: 20, q: 1, sd: 4 }];
  const u = normaliseV06(under);
  under.forEach((r, i) => assert.ok(u.minutes[i] >= r.minutes - 1e-9, "nobody is lowered"));
  assert.equal(u.minutes[0], 38, "mean + one SD");
  assert.equal(u.minutes[2], 28 * 1.3, "no own SD: the frozen default ratio");
  assert.ok(u.unallocatedMinutes > 0);
  const star = normaliseV06([{ minutes: 39, q: 1, sd: 5 }, { minutes: 44, q: 1, sd: 3 }]);
  assert.equal(star.minutes[0], 41, "the ceiling stops at 41");
  assert.equal(star.minutes[1], 44, "a role above 41 is not lowered by the ceiling");
  // continuity at 240: both branches agree
  const exact = Array.from({ length: 12 }, () => ({ minutes: 20, q: 1, sd: 2 }));
  assert.deepEqual(normaliseV06(exact).minutes.map((m) => Number(m.toFixed(9))), exact.map(() => 20));
  // a pool with nobody in it
  assert.deepEqual(boundedWaterFill([], [], [], 240).minutes, []);
});

test("SHORT POOL: an eight-man side stays near its roles; v0.1's factor would have added half", () => {
  const eight = [36.4, 28.7, 23.2, 23.1, 21, 15, 12, 8.7].map((minutes) => ({ minutes, q: 1, sd: 5 }));
  const n = normaliseV06(eight);
  eight.forEach((r, i) => assert.ok(n.minutes[i] <= r.minutes + 5 + 1e-9));
  assert.ok(n.unallocatedMinutes > 0 && n.unallocatedMinutes < 240 - 168);
});

test("EXCLUSION AND DAY-TO-DAY: the row says why; missed-game evidence and the listing never stack", () => {
  const p = pool();
  const r = byId(p.rows);
  assert.deepEqual(excludedStates(), [STATES.MISSED_2PLUS_OTHER, STATES.NO_APPEARANCE].sort());
  assert.equal(r.lapsed.minutesState, EXCLUDED_STATE, "on the roster, in no box this season, has history");
  assert.equal(r.lapsed.exclusionReason, STATES.NO_APPEARANCE);
  assert.equal(r.lapsed.expectedMinutes, null);
  assert.ok(r.lapsed.projectedPlayProbability > 0, "scored in participation, not in minutes");
  assert.equal(r.gone.eligibilityState, STATES.MISSED_2PLUS_OTHER);
  assert.equal(r.gone.minutesState, EXCLUDED_STATE);
  assert.equal(r.cc.eligibilityState, STATES.MISSED_2PLUS_COACH);
  assert.notEqual(r.cc.minutesState, EXCLUDED_STATE, "a coach's decision streak stays in, at a lower q");
  assert.equal(r.cc.playRate, r.cc.v05PlayRate);
  assert.equal(r.dd.eligibilityState, STATES.LAST_PLAYED);
  assert.equal(r.dd.playRate, Number((r.dd.v05PlayRate * CONSTANTS.DAY_TO_DAY_MULTIPLIER.value).toFixed(3)));
  assert.equal(r.dd.dayToDayApplied, true);
  const missed = pool({ injuries: [{ providerTeamId: TOR, athleteId: "ms", status: "Day-To-Day", statedAt: "2026-10-26T10:00Z" }] });
  const ms = byId(missed.rows).ms;
  assert.equal(ms.eligibilityState, STATES.MISSED_1_COACH);
  assert.equal(ms.dayToDayApplied, false);
  assert.equal(ms.playRate, ms.v05PlayRate);
  assert.equal(r.b5.availability, "out");
  assert.equal(r.b5.expectedMinutes, null);
  assert.deepEqual(p.excluded.map((x) => x.providerAthleteId).sort(), ["gone", "lapsed"]);
});

test("NEVER FABRICATE: a rookie or veteran with no committed evidence has null minutes and a reason, never 0; first box score covers him", () => {
  const p = pool();
  const r = byId(p.rows);
  assert.equal(r.rook.expectedMinutes, null);
  assert.equal(r.rook.minutesSd, null);
  assert.equal(r.rook.rates, null);
  assert.equal(r.rook.noProjectionReason, "ROOKIE_NO_REGULAR_SEASON_BOX");
  assert.equal(r.vet.noProjectionReason, "VETERAN_NO_BOX_IN_LAST_TWO_SEASONS");
  assert.equal(noProjectionReason({ rosterExperienceYears: null }), "NO_COMMITTED_EVIDENCE");
  assert.ok(!prepareRosterV06(p).players.some((x) => x.providerAthleteId === "rook" || x.providerAthleteId === "vet"));
  assert.deepEqual(p.noProjection.map((x) => [x.providerAthleteId, x.reason]).sort(), [["rook", "ROOKIE_NO_REGULAR_SEASON_BOX"], ["vet", "VETERAN_NO_BOX_IN_LAST_TWO_SEASONS"]]);
  // preseason minutes are not evidence
  const pre = box("e0", "2026-10-10T23:00Z", [TOR, MIA], [line("rook", TOR, 30, true)], { phase: 1 });
  assert.equal(byId(pool({ boxscores: [...DOCS, pre] }).rows).rook.expectedMinutes, null);
  // one regular-season game is evidence
  const first = box("e3b", "2026-10-25T23:30Z", [TOR, BOS], [line("rook", TOR, 21)]);
  const after = byId(pool({ boxscores: [...DOCS, first] }).rows).rook;
  assert.equal(after.expectedMinutes, 21);
  assert.equal(after.noProjectionReason, null);
});

test("WINDOW: playoffs never enter; a trade makes old-team games prior, worth TRANSFER_PRIOR_GAMES; the rest is worth PRIOR_GAMES", () => {
  const r = byId(pool().rows);
  // tr: 40 games at 30 for MIA, 3 for TOR at 12, 14, 16 → (1·30 + 42) / 4
  assert.equal(r.tr.movedTeam, true);
  assert.equal(r.tr.carriedGames, 40);
  assert.equal(r.tr.expectedMinutes, 18);
  // s1: 40 games at 36, 3 at 38, prior worth 3 → (3·36 + 3·38) / 6
  assert.equal(r.s1.movedTeam, false);
  assert.equal(r.s1.expectedMinutes, 37);
  // v0.3 keeps the prior at 10 games, and rates stay on v0.3's estimate
  assert.equal(r.s1.v03RoleMinutes, Number(((10 * 36 + 3 * 38) / 13).toFixed(3)));
  const playoff = box("po", "2026-05-01T23:00Z", [TOR, MIA], [line("s1", TOR, 48, true)], { season: 2026, phase: 3 });
  const playIn = box("pi", "2026-04-15T23:00Z", [TOR, MIA], [line("s1", TOR, 48, true)], { season: 2026, phase: 5 });
  assert.equal(byId(pool({ boxscores: [...DOCS, playoff, playIn] }).rows).s1.expectedMinutes, 37, "playoff and play-in minutes change nothing");
  // a mid-season trade: this season's games for the old team are prior, never current
  const rec = { apps: { 2026: Array.from({ length: 30 }, () => ({ minutes: 20, teamId: MIA })), 2027: [{ minutes: 30, teamId: MIA }, { minutes: 30, teamId: MIA }, { minutes: 10, teamId: TOR }] } };
  const est = minutesEstimateV06(rec, { priorSeason: 2026, currentSeason: 2027, teamId: TOR });
  assert.equal(est.carriedGames, 32);
  assert.equal(est.currentGamesThisTeam, 1);
  assert.equal(est.movedTeam, true);
  assert.equal(est.expectedMinutes, Number((((1 / 32) * (30 * 20 + 60) + 10) / 2).toFixed(3)));
  // no game for the new team yet: the carried role is all there is
  assert.equal(minutesEstimateV06({ apps: { 2026: [{ minutes: 26, teamId: MIA }, { minutes: 30, teamId: MIA }], 2027: [] } }, { priorSeason: 2026, currentSeason: 2027, teamId: TOR }).expectedMinutes, 28);
  assert.equal(minutesEstimateV06({ apps: { 2026: [], 2027: [] } }, { priorSeason: 2026, currentSeason: 2027, teamId: TOR }), null);
});

test("COVERAGE: last game's starters and sixth man each get a status and a reason", () => {
  const p = pool({ injuries: [{ providerTeamId: TOR, athleteId: "s2", status: "Out", statedAt: "2026-10-26T10:00Z" }] });
  assert.equal(p.coverage.lastEventId, "e3");
  assert.equal(p.coverage.total, 6);
  const c = byId(p.coverage.roles);
  assert.equal(c.s1.role, "STARTER");
  assert.equal(c.s1.status, "PROJECTED");
  assert.equal(c.s2.status, "OUT");
  assert.equal(c.b1.role, "SIXTH_MAN");
  assert.equal(p.coverage.projected, 5);
  const off = gatePoolV06({ rosters: { ...rosters(), teams: [{ ...rosters().teams[0], players: rosters().teams[0].players.filter((x) => x.providerAthleteId !== "s3") }] }, providerTeamId: TOR, context: ctx() });
  assert.equal(byId(off.coverage.roles).s3.status, "NOT_ON_ROSTER_CAPTURE");
});

test("DETERMINISM: same inputs, same pool, same prepared roster, same draws; inputs are not mutated", () => {
  const before = JSON.stringify(DOCS);
  assert.deepEqual(pool(), pool());
  assert.equal(JSON.stringify(DOCS), before);
  const a = simulatePlayersV06({ providerEventId: "401", homePool: pool(), awayPool: pool(), simulations: 200 });
  const b = simulatePlayersV06({ providerEventId: "401", homePool: pool(), awayPool: pool(), simulations: 200 });
  assert.deepEqual(a, b);
  assert.equal(a.teamScores, "WITHHELD");
  assert.equal(a.armed, false);
});

test("DRAWS: for the same prepared line the player distributions equal v0.3's engine", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ providerAthleteId: String(i + 1), name: `P${i}`, expectedMinutes: 20, minutesSd: 4, starterRate: 0.5, gamesUsed: 30, dnpCount: 0, nullMinutesCount: 0, basis: "blend", availability: "active", injuryStatus: null, rates: { pts: 0.5, reb: 0.2, ast: 0.1, threePm: 0.05 }, rateSd: { pts: 0.1, reb: 0.05, ast: 0.03, threePm: 0.02 }, playRate: 1 }));
  const v03Side = { minutes: { rows, normalisation: { rule: PLAY_RATE_WATER_FILL, power: 1.25 }, injuriesProvided: true } };
  const v06Pool = { rows, normalisation: { rule: "v06-bounded-water-fill", power: 1.25 } };
  const v03 = simulateGameV03({ providerEventId: "501", home: v03Side, away: v03Side, simulations: 300 });
  const v06 = simulatePlayersV06({ providerEventId: "501", homePool: v06Pool, awayPool: v06Pool, simulations: 300 });
  assert.equal(v06.seed, v03.seed);
  for (const side of ["home", "away"]) v03.players[side].forEach((p, i) => { for (const k of ["minutes", "pts", "reb", "ast", "threePm"]) assert.equal(v06.players[side][i][k].p50, p[k].p50, `${side} ${i} ${k}`); });
  assert.throws(() => simulatePrepared({ home: { players: [] }, away: { players: [] } }), /providerEventId/);
});

test("CONSTANTS: every new constant has a source and is PROPOSED_NOT_APPROVED; overrides accept only named constants", () => {
  for (const [k, c] of Object.entries({ ...CONSTANTS, ...REUSED_CONSTANTS })) {
    assert.equal(c.status, PROPOSED, k);
    assert.equal(c.status, "PROPOSED_NOT_APPROVED", k);
    assert.ok(c.source.length > 20, `${k} has a source`);
    assert.ok(c.value != null, k);
  }
  assert.equal(pool().constantsStatus, "PROPOSED_NOT_APPROVED");
  assert.throws(() => ctx({ overrides: { NOPE: 1 } }), /unknown override/);
  assert.equal(pool({ overrides: { DAY_TO_DAY_MULTIPLIER: 1 } }).params.DAY_TO_DAY_MULTIPLIER, 1);
});

test("RECOMPUTE: every data-sourced constant re-derives from committed data", () => {
  const corpus = readBoxDir(path.join(NBA, "boxscores"));
  // transfer prior: completed seasons only
  const grid = [0.001, 1, 2, 3, 5, 10, 20];
  const fit = fitTransferPriorGames(corpus, { seasons: [2025, 2026], grid });
  assert.equal(fit.best, CONSTANTS.TRANSFER_PRIOR_GAMES.value);
  assert.equal(fit.n, 2334);
  assert.deepEqual(fit.pooled, { 0.001: 4.965, 1: 4.955, 2: 5.053, 3: 5.154, 5: 5.329, 10: 5.632, 20: 5.956 });
  const same = maeByPriorGames(earlySeasonRows(corpus, { season: 2026 }).filter((r) => !r.changedTeam), [3, 10]);
  assert.ok(same[3] < same[10], "the lighter prior also holds on same-team rows in 2025-26");
  // the ceilings
  assert.deepEqual(shareUnderMeanPlusSd(corpus, { season: 2026 }), { n: 26173, share: 0.848 });
  assert.deepEqual(minutesQuantile(corpus, { season: 2026, q: 0.99 }), { n: 26565, value: CONSTANTS.UNDERFULL_CEILING_MINUTES.value });
  // the exclusion gap: the same two states whichever value in the gap is used, on the whole season and early in it
  const rate = (c) => c.played / c.n;
  const c = ELIGIBILITY_TABLE.cells;
  assert.deepEqual(excludedStates(0.14), excludedStates(0.36));
  assert.ok(rate(c.MISSED_2PLUS_OTHER) < CONSTANTS.EXCLUDE_BELOW_PLAY_RATE.value && CONSTANTS.EXCLUDE_BELOW_PLAY_RATE.value < rate(c.MISSED_2PLUS_COACH));
  // v0.5's table is unchanged from PR 1281
  const season2026 = fitEligibilityTable(corpus, { season: 2026 });
  assert.deepEqual(season2026.cells, clone(ELIGIBILITY_TABLE.cells));
  assert.deepEqual(season2026.multipliers, { ...MULTIPLIERS });
  // Day-To-Day: frozen receipts on the closed window; in-sample there, and only there
  const fetched = readBoxDir(path.join(NBA, "experimental", "boxscores"));
  const docs = foldBoxscores([], fetched, { now: "2099-01-01T00:00:00Z" }).docs;
  const dir = path.join(NBA, "experimental-v0.3", "forecasts");
  const forecasts = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => ({ ...JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), date: f.slice(0, 10) }));
  const dtd = fitDayToDayMultiplier(forecasts, { boxscores: docs, outcomeDocs: new Map(docs.map((d) => [String(d.providerEventId), d])), fromDate: "2026-10-22", toDate: "2026-10-28" });
  assert.equal(dtd.games, 54);
  assert.deepEqual(dtd.cells, { dayToDay: { n: 43, played: 20 }, unlisted: { n: 1171, played: 1033 } });
  assert.equal(dtd.multiplier, CONSTANTS.DAY_TO_DAY_MULTIPLIER.value);
});

test("UNARMED: no production path imports the candidate; no family, workflow, reader or data directory names it", () => {
  assert.deepEqual({ ...CANDIDATE_STATUS }, { armed: false, role: "CANDIDATE_UNARMED", dataClass: "PRIVATE_RESEARCH", productEligible: false });
  assert.ok(!("v0.6" in FAMILIES) && !("v0.6" in CANDIDATE_FAMILIES));
  const SRC = path.join(APP, "src");
  const SCRIPTS = path.join(APP, "scripts");
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const code = [...walk(SRC), ...walk(SCRIPTS)].filter((f) => /\.(m?js|tsx?)$/.test(f));
  const MARKER = /minutes-model-v06|game-sim-v06|nba-minutes-model-v0\.6|nba-roster-gated-pool-v0\.6|experimental-v0\.6|["']v0\.6["']/;
  const OWN = new Set(["minutes-model-v06.mjs", "minutes-model-v06-fit.mjs", "game-sim-v06.mjs", "minutes-model-v06.test.mjs"].map((f) => path.join(HERE, f)));
  const namers = code.filter((f) => !OWN.has(f) && MARKER.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(APP, f));
  assert.deepEqual(namers, ["scripts/nba/research/replay-nba-v06-candidate.mjs"], "only the research replay reaches the candidate");
  // the vendored v0.5 gate is imported by the candidate only, as on this branch it is registered nowhere
  const gateNamers = code.filter((f) => !OWN.has(f) && !/eligibility-gate-v05\.mjs$/.test(f) && /eligibility-gate-v05/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(APP, f));
  for (const f of gateNamers) assert.match(f, /^scripts\/nba\/research\//, f);
  const wf = path.join(ROOT, ".github", "workflows");
  for (const file of fs.readdirSync(wf)) assert.doesNotMatch(fs.readFileSync(path.join(wf, file), "utf8"), /minutes-model-v06|replay-nba-v06|experimental-v0\.6/, file);
  assert.ok(!fs.existsSync(path.join(NBA, "experimental-v0.6")), "no v0.6 directory in the research tree");
  assert.ok(!fs.existsSync(path.join(APP, "public", "data", "nba", "experimental-v0.6")), "no v0.6 public data");
});

test("FROZEN SOURCES: the v0.5 gate is PR 1281's file byte for byte, and v0.3's two sources are untouched", () => {
  const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(HERE, f))).digest("hex");
  assert.equal(sha("eligibility-gate-v05.mjs"), "cec9578ba5c3fd827c43b980374c2545bf76fb37b1cb45b5f505e79bef62cc8e");
  assert.equal(sha("minutes-model-v03.mjs"), "4819ce41c953c4b8df068539c1c85e91ade03cab41e041a6e0291bd3a500bec7");
  assert.equal(sha("game-sim-v03.mjs"), "1b8aac60d571cba200db1658ff4262c0cfb376ef9e6ec8de081853ebfb0ab82e");
});

test("REPLAY SCRIPT refuses to write inside the repository", () => {
  const script = path.join(APP, "scripts", "nba", "research", "replay-nba-v06-candidate.mjs");
  const r = spawnSync("npx", ["tsx", script, "--out-dir", path.join(NBA, "replays", "x")], { cwd: APP, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /inside the repository/);
});

test("asOfInputs: null injuries stay null, an undated injury entry is kept, a missing instant throws", () => {
  assert.equal(asOfInputs({ boxscores: [], injuries: null, asOfDateUtc: NOW }).injuries, null);
  assert.equal(asOfInputs({ boxscores: [], injuries: [{ athleteId: "x" }], asOfDateUtc: NOW }).injuries.length, 1);
  assert.throws(() => asOfInputs({ boxscores: [] }), /asOfDateUtc/);
});
