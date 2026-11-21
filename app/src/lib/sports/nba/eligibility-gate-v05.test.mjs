/**
 * v0.5 CANDIDATE eligibility gate (eligibility-gate-v05.mjs) — state rule, no-leakage, redistribution (sums, caps),
 * determinism, the recompute of its prior-season table, and the unarmed / isolation guards.
 * NBA REGULAR SEASON — CANDIDATE SHADOW (NOT ARMED) · PRIVATE_RESEARCH.
 *
 * Run: npx tsx --test src/lib/sports/nba/eligibility-gate-v05.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  classifyState, indexCurrentSeasonStatus, stateFor, applyEligibilityGate, fitEligibilityTable, lineStatus,
  STATES, MULTIPLIERS, ELIGIBILITY_TABLE, ELIGIBILITY_GATE_V05_VERSION, POOL_V05_VERSION,
} from "./eligibility-gate-v05.mjs";
import { prepareRosterV03, PLAY_RATE_WATER_FILL } from "./game-sim-v03.mjs";
import { TEAM_MINUTES, MAX_PLAYER_MINUTES } from "./game-sim.mjs";
import { FAMILIES, CANDIDATE_FAMILIES, familySpec, unarmedWriteRefusal } from "./experimental-forecast.mjs";
import { owingFamilies } from "../../../../scripts/nba/decide-nba-forecast-window.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");

/* ─────────────── synthetic 2026-27 regular season (corpus season 2027) ─────────────── */
const TOR = "28", MIA = "14", BOS = "2";
const NOW = "2026-10-26T15:00:00Z";
const played = (id, team, minutes = 20) => ({ providerAthleteId: id, providerTeamId: team, didNotPlay: false, dnpReason: null, minutes, starter: minutes >= 28 });
const coach = (id, team) => ({ providerAthleteId: id, providerTeamId: team, didNotPlay: true, dnpReason: "COACH'S DECISION", minutes: null });
const hurt = (id, team) => ({ providerAthleteId: id, providerTeamId: team, didNotPlay: true, dnpReason: "LEFT ANKLE SPRAIN", minutes: null });
const box = (id, dateUtc, teams, players, extra = {}) => ({ providerEventId: id, season: 2027, phase: 2, dateUtc, capturedAt: new Date(Date.parse(dateUtc) + 13 * 3_600_000).toISOString(), boxscoreAvailable: true, teams: teams.map((t) => ({ providerTeamId: t })), players, ...extra });
// TOR plays 3 games before NOW. "s" starter always plays; "c" coach-DNP last game only; "cc" coach-DNP last two;
// "x" absent last game only (in box earlier); "xx" absent last two; "n" never in any box; "m" played for MIA then moved.
const G = [
  box("e1", "2026-10-21T23:00Z", [TOR, MIA], [played("s", TOR, 34), played("c", TOR), played("cc", TOR), played("x", TOR), played("xx", TOR), played("m", MIA)]),
  box("e2", "2026-10-23T23:00Z", [TOR, BOS], [played("s", TOR, 34), played("c", TOR), coach("cc", TOR), played("x", TOR), hurt("xx", TOR)]),
  box("e3", "2026-10-25T23:00Z", [TOR, MIA], [played("s", TOR, 34), coach("c", TOR), coach("cc", TOR), played("m", MIA)]),
];
// LEAKAGE PROBES: a game that tips AFTER the instant, and one that tipped before it but was CAPTURED after it.
const LATER = box("e4", "2026-10-27T23:00Z", [TOR, BOS], [coach("s", TOR), played("n", TOR, 30), played("cc", TOR, 30)]);
const LATE_CAPTURE = box("e5", "2026-10-26T00:00Z", [TOR, BOS], [coach("s", TOR), played("n", TOR, 30)], { capturedAt: "2026-10-26T16:00:00Z" });
const PRIOR_SEASON = box("p1", "2026-03-01T00:00Z", [TOR, MIA], [coach("s", TOR), played("n", TOR)], { season: 2026, capturedAt: "2026-03-02T00:00:00Z" });

const row = (id, roleMinutes, playRate = 1) => ({ providerAthleteId: id, name: id, expectedMinutes: roleMinutes, minutesSd: roleMinutes * 0.2, starterRate: roleMinutes >= 28 ? 1 : 0, gamesUsed: 20, dnpCount: 0, nullMinutesCount: 0, basis: "blend", availability: "active", injuryStatus: null, rates: { pts: 0.5, reb: 0.2, ast: 0.1, threePm: 0.05 }, rateSd: { pts: 0.1, reb: 0.05, ast: 0.03, threePm: 0.02 }, playRate });
const POOL_IDS = [["s", 34], ["a1", 32], ["a2", 31], ["a3", 30], ["a4", 28], ["a5", 24], ["a6", 22], ["a7", 20], ["c", 18], ["cc", 16], ["x", 15], ["xx", 14], ["n", 12], ["m", 10]];
const gatedPool = (asOf = NOW, ids = POOL_IDS) => ({
  state: "GATED", teamProviderId: TOR, asOfDateUtc: asOf, population: "regular", modelVersion: "nba-minutes-model-v0.3-role-prior",
  injuriesProvided: true, normalisation: { rule: PLAY_RATE_WATER_FILL, power: 1.25 },
  rows: ids.map(([id, m]) => row(id, m, id === "c" ? 0.9 : 1)), unmatchedInjuries: [], gate: { poolVersion: "nba-roster-gated-pool-v0.3" },
});
// a1..a7 played every TOR game too (on the roster, in the box)
for (const g of G) if (g.teams.some((t) => t.providerTeamId === TOR)) for (const id of ["a1", "a2", "a3", "a4", "a5", "a6", "a7"]) g.players.push(played(id, TOR, 22));

test("STATE RULE: each roster player falls in exactly one state from his current-season record with this team", () => {
  const idx = indexCurrentSeasonStatus(G, { asOfDateUtc: NOW });
  const st = (id) => stateFor(idx, TOR, id);
  assert.equal(st("s").state, STATES.LAST_PLAYED);
  assert.deepEqual(st("c"), { state: STATES.MISSED_1_COACH, streak: 1, tenureGames: 3 });
  assert.deepEqual(st("cc"), { state: STATES.MISSED_2PLUS_COACH, streak: 2, tenureGames: 3 });
  assert.deepEqual(st("x"), { state: STATES.MISSED_1_OTHER, streak: 1, tenureGames: 3 }, "absent from the last box = OTHER");
  assert.deepEqual(st("xx"), { state: STATES.MISSED_2PLUS_OTHER, streak: 2, tenureGames: 3 }, "injury DNP then absent = OTHER");
  assert.equal(st("n").state, STATES.NO_APPEARANCE, "rostered, team has played, never in any box this season");
  assert.equal(st("m").state, STATES.NONE, "last appearance for another team (moved): no evidence, multiplier 1");
  assert.equal(stateFor(idx, "99", "s").state, STATES.NONE, "a team with no current-season game yet");
  // tenure: games before the player's first appearance with the team are not counted against him
  const late = [{ statusOf: new Map() }, { statusOf: new Map() }, { statusOf: new Map([["j", "dnp_coach"]]) }, { statusOf: new Map([["j", "played"]]) }];
  assert.deepEqual(classifyState({ teamGames: late, athleteId: "j", lastTeamBefore: TOR, teamId: TOR }), { state: STATES.LAST_PLAYED, streak: 0, tenureGames: 2 });
  assert.deepEqual(classifyState({ teamGames: late.slice(0, 3), athleteId: "j", lastTeamBefore: TOR, teamId: TOR }), { state: STATES.MISSED_1_COACH, streak: 1, tenureGames: 1 });
  assert.equal(lineStatus({ didNotPlay: false, minutes: 0 }), "dnp_other", "0 minutes is not an appearance");
});

test("NO LEAKAGE: nothing that tips at/after the instant, nothing captured after it, nothing from the prior season is read (mutation probes)", () => {
  const base = indexCurrentSeasonStatus(G, { asOfDateUtc: NOW });
  const withProbes = indexCurrentSeasonStatus([...G, LATER, LATE_CAPTURE, PRIOR_SEASON], { asOfDateUtc: NOW });
  assert.equal(withProbes.docsRead, 3);
  const gatedA = applyEligibilityGate(gatedPool(), { statusIndex: base });
  const gatedB = applyEligibilityGate(gatedPool(), { statusIndex: withProbes });
  assert.deepEqual(gatedB, gatedA, "post-instant / late-captured / prior-season docs change nothing");
  // PROBE: the same late-captured game, captured in time, DOES change the states (the capture filter is what keeps it out)
  const inTime = indexCurrentSeasonStatus([...G, { ...LATE_CAPTURE, capturedAt: "2026-10-26T14:00:00Z" }], { asOfDateUtc: NOW });
  assert.equal(stateFor(inTime, TOR, "s").state, STATES.MISSED_1_COACH);
  assert.equal(stateFor(inTime, TOR, "n").state, STATES.LAST_PLAYED);
  // and the game being forecast (tip after the instant) is never in the index
  assert.ok(![...withProbes.byTeam.get(TOR)].some((g) => g.providerEventId === "e4"));
  assert.throws(() => applyEligibilityGate(gatedPool("2026-10-26T16:00:00Z"), { statusIndex: base }), /same|asOfDateUtc/);
});

test("GATE: q = playRate × multiplier (down-weight only); LAST_PLAYED / NONE keep v0.3's playRate exactly; input not mutated; deterministic", () => {
  const idx = indexCurrentSeasonStatus(G, { asOfDateUtc: NOW });
  const input = gatedPool();
  const before = JSON.stringify(input);
  const out = applyEligibilityGate(input, { statusIndex: idx });
  assert.equal(JSON.stringify(input), before, "the v0.3 pool is not mutated");
  assert.deepEqual(applyEligibilityGate(gatedPool(), { statusIndex: indexCurrentSeasonStatus(G, { asOfDateUtc: NOW }) }), out, "same inputs → identical output");
  const by = Object.fromEntries(out.rows.map((r) => [r.providerAthleteId, r]));
  assert.equal(by.s.playRate, 1);
  assert.equal(by.m.playRate, 1, "NONE keeps v0.3");
  assert.equal(by.c.playRate, Number((0.9 * MULTIPLIERS.MISSED_1_COACH).toFixed(3)));
  assert.equal(by.c.rolePlayRate, 0.9);
  assert.equal(by.n.playRate, MULTIPLIERS.NO_APPEARANCE);
  assert.equal(by.xx.playRate, MULTIPLIERS.MISSED_2PLUS_OTHER);
  for (const r of out.rows) assert.ok(r.playRate > 0 && r.playRate <= (r.rolePlayRate ?? 1), `${r.providerAthleteId}: the gate only down-weights`);
  for (const [k, v] of Object.entries(MULTIPLIERS)) assert.ok(v > 0 && v <= 1, `${k} multiplier in (0, 1]`);
  assert.equal(out.gate.poolVersion, POOL_V05_VERSION);
  assert.equal(out.gate.eligibilityGate, ELIGIBILITY_GATE_V05_VERSION);
  assert.equal(out.eligibility.teamGamesBefore, 3);
  assert.deepEqual(out.normalisation, input.normalisation, "v0.3's normalisation, unchanged");
  const refused = { state: "REFUSED", reason: "x" };
  assert.equal(applyEligibilityGate(refused, { statusIndex: idx }), refused);
  assert.throws(() => applyEligibilityGate(input, { statusIndex: idx, multipliers: { ...MULTIPLIERS, MISSED_1_COACH: 0 } }), /\(0, 1\]/);
});

test("REDISTRIBUTION (v0.3 engine unchanged): Σ q·minutes = 240, per-player cap 48, the removed mass goes to the eligible rotation", () => {
  const idx = indexCurrentSeasonStatus(G, { asOfDateUtc: NOW });
  const v03 = prepareRosterV03(gatedPool());
  const v05 = prepareRosterV03(applyEligibilityGate(gatedPool(), { statusIndex: idx }));
  const expTeam = (p) => p.players.reduce((s, x) => s + x.expectedMinutes * x.playRate, 0);
  assert.ok(Math.abs(expTeam(v03) - TEAM_MINUTES) < 0.01);
  assert.ok(Math.abs(expTeam(v05) - TEAM_MINUTES) < 0.01, `v0.5 expected team minutes ${expTeam(v05)}`);
  for (const p of v05.players) assert.ok(p.expectedMinutes <= MAX_PLAYER_MINUTES + 1e-9);
  const m3 = Object.fromEntries(v03.players.map((p) => [p.providerAthleteId, p.expectedMinutes]));
  for (const p of v05.players) assert.ok(p.expectedMinutes >= m3[p.providerAthleteId] - 1e-9, `${p.providerAthleteId}: conditional minutes never fall (the pool only loses non-player mass)`);
  const nonMass = (p, ids) => p.players.filter((x) => ids.includes(x.providerAthleteId)).reduce((s, x) => s + x.expectedMinutes * x.playRate, 0);
  const likelyOut = ["c", "cc", "x", "xx", "n"];
  assert.ok(nonMass(v05, likelyOut) < nonMass(v03, likelyOut), "less expected mass on likely non-players");
  assert.ok(nonMass(v05, ["s", "a1", "a2", "a3", "a4"]) > nonMass(v03, ["s", "a1", "a2", "a3", "a4"]), "more on the eligible top of the rotation");
  // CAP: a thin eligible pool whose removed mass pushes the top of the water-fill past 48 — the cap binds and the
  // team still sums to 240 in expectation (water-filling hands the excess to the uncapped players)
  const thin = [["s", 48], ["a1", 48], ["a2", 48], ["a3", 48], ["a4", 20], ["cc", 48], ["xx", 48]];
  const t5 = prepareRosterV03(applyEligibilityGate(gatedPool(NOW, thin), { statusIndex: idx }));
  assert.ok(t5.players.some((p) => p.expectedMinutes === MAX_PLAYER_MINUTES), "some player is capped at 48");
  for (const p of t5.players) assert.ok(p.expectedMinutes <= MAX_PLAYER_MINUTES);
  assert.ok(Math.abs(expTeam(t5) - TEAM_MINUTES) < 0.01);
  // IDENTITY: with every multiplier 1 the gate is a no-op on what the engine sees (v0.5 ≡ v0.3)
  const ones = Object.fromEntries(Object.keys(MULTIPLIERS).map((k) => [k, 1]));
  assert.deepEqual(prepareRosterV03(applyEligibilityGate(gatedPool(), { statusIndex: idx, multipliers: ones })), v03);
});

test("RECOMPUTE: ELIGIBILITY_TABLE and MULTIPLIERS re-derive exactly from the committed 2025-26 corpus box scores (strictly before 2026-27)", () => {
  const dir = path.join(NBA, "boxscores");
  const docs = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const fit = fitEligibilityTable(docs, { season: ELIGIBILITY_TABLE.fitSeason });
  assert.equal(ELIGIBILITY_TABLE.fitSeason, 2026, "the prior season of the 2026-27 forecasts");
  assert.ok(fit.docs >= 1230, `regular-season docs read: ${fit.docs}`);
  assert.deepEqual(fit.cells, JSON.parse(JSON.stringify(ELIGIBILITY_TABLE.cells)));
  assert.deepEqual(fit.multipliers, { ...MULTIPLIERS });
  // every fitted doc is strictly before the first 2026-27 regular-season game
  const latest = docs.filter((d) => d.boxscoreAvailable && (d.season ?? 0) === 2026 && (d.phase === 2 || d.phase === "cup-final")).map((d) => d.dateUtc).sort().at(-1);
  assert.ok(latest < "2026-10-20", `last fitted game ${latest}`);
});

test("UNARMED: v0.5 is a CANDIDATE (armed: false), never iterated, never owed, --write refused", () => {
  assert.ok(!("v0.5" in FAMILIES));
  const f = familySpec("v0.5");
  assert.equal(f, CANDIDATE_FAMILIES["v0.5"]);
  assert.deepEqual({ ...f }, { family: "v0.5", poolRule: "roster-gated", dataRule: "corpus-v1+boxscores-2026-27", role: "CANDIDATE_SHADOW", modelVersion: "nba-experimental-v0.5-eligibility-gate", dir: "experimental-v0.5", minutesRule: "v0.5-eligibility-gate", alignsWith: "v0.1", armed: false });
  assert.ok(!owingFamilies(FAMILIES).some((x) => x.family === "v0.5"));
  const nbaRoot = NBA + path.sep;
  assert.match(unarmedWriteRefusal(f, { write: true, outFile: null, nbaRoot }), /NOT ARMED/);
  assert.match(unarmedWriteRefusal(f, { write: false, outFile: path.join(NBA, "experimental-v0.5", "forecasts", "x.json"), nbaRoot }), /NOT ARMED/);
  // the real builder refuses --write for v0.5 before reading any input
  const script = path.join(APP, "scripts", "nba", "build-nba-experimental-forecasts.mjs");
  const r = spawnSync(process.execPath, [script, "--family", "v0.5", "--date", "2026-10-30", "--now", "2026-10-30T14:00:00Z", "--write"], { cwd: APP, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /NOT ARMED/);
  assert.ok(!fs.existsSync(path.join(NBA, "experimental-v0.5")), "no v0.5 directory exists in the repository");
  // no workflow schedules, builds or grades v0.5
  const wf = path.resolve(APP, "..", ".github", "workflows");
  for (const file of fs.readdirSync(wf)) assert.doesNotMatch(fs.readFileSync(path.join(wf, file), "utf8"), /v0\.5|eligibility-gate/, `${file} names v0.5`);
});

test("ISOLATION: no lane / snapshot / product / route / theater source names the v0.5 family or its module", () => {
  const SRC = path.join(APP, "src");
  const MARKERS = /eligibility-gate-v05|experimental-v0\.5|nba-experimental-v0\.5|["']v0\.5["']/;
  const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
  const isCode = (f) => /\.(m?js|tsx?)$/.test(f) && !/\.test\.m?js$|\.spec\.tsx?$/.test(f);
  const surfaces = [
    path.join(SRC, "lib", "sports", "nba", "experimental-public-lane.mjs"),
    path.join(SRC, "lib", "consistency", "official-snapshot.mjs"),
    path.join(APP, "scripts", "nba", "build-nba-experimental-public.mjs"),
    path.join(APP, "scripts", "nba", "publish-nba-experimental-lane.mjs"),
    ...walk(path.join(SRC, "lib", "products")).filter(isCode),
    ...walk(path.join(SRC, "lib", "simulation-theater")).filter(isCode),
    ...walk(path.join(SRC, "app")).filter(isCode),
    ...walk(path.join(SRC, "components")).filter(isCode),
  ].filter((f) => fs.existsSync(f));
  assert.ok(surfaces.length > 50);
  assert.deepEqual(surfaces.filter((f) => MARKERS.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(APP, f)), []);
  // the only importer of the gate module is the producer library (and tests / research scripts)
  const importers = walk(path.join(APP, "src")).concat(walk(path.join(APP, "scripts"))).filter(isCode).filter((f) => !/eligibility-gate-v05\.mjs$/.test(f) && /eligibility-gate-v05/.test(fs.readFileSync(f, "utf8")));
  assert.ok(importers.length >= 1);
  for (const f of importers) assert.ok(/experimental-forecast\.mjs$|scripts[\\/]nba[\\/]research[\\/]/.test(f), `${path.relative(APP, f)} imports the v0.5 gate`);
});

test("REPLAY SCRIPT refuses to write inside the repository", () => {
  const script = path.join(APP, "scripts", "nba", "research", "replay-nba-v05-eligibility-candidate.mjs");
  const r = spawnSync(process.execPath, [script, "--dates", "2026-10-22", "--out-dir", path.join(NBA, "replays", "x")], { cwd: APP, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /inside the repository/);
});
