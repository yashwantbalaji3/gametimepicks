/**
 * v0.3 CANDIDATE minutes model + engine (minutes-model-v03.mjs, game-sim-v03.mjs) — and the proof that the OFFICIAL
 * v0.1 output is unchanged by it (game-sim.mjs itself stays pinned byte-for-byte by game-sim-v1.test.mjs).
 * NBA REGULAR SEASON — CANDIDATE SHADOW (NOT ARMED) · PRIVATE_RESEARCH.
 *
 * Run: npx tsx --test src/lib/sports/nba/minutes-model-v03.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { indexRoleHistory, roleEstimate, gatePoolV03, PARAMS, BASES, NORMALISATION, MINUTES_MODEL_V03_VERSION, POOL_V03_VERSION } from "./minutes-model-v03.mjs";
import { expectedMinutes, TRAILING_N } from "./minutes-model.mjs";
import { gatePool } from "./roster-gated-pool.mjs";
import { prepareRoster, simulateGame, TEAM_MINUTES, MINUTES_RESCALE_BOUNDS, MAX_PLAYER_MINUTES, DEFAULT_MINUTES_SD_RATIO } from "./game-sim.mjs";
import { prepareRosterV03, simulateGameV03, weightedWaterFill, PLAY_RATE_WATER_FILL, NBA_SIM_V03_MODEL_VERSION } from "./game-sim-v03.mjs";
import { V1_PARAMS } from "./game-sim-v1.mjs";
import { buildForecastArtifact, familySpec, FAMILIES, CANDIDATE_FAMILIES, unarmedWriteRefusal, alignedCutoffRefusal } from "./experimental-forecast.mjs";
import { inPopulation } from "./sim-v1-profile.mjs";
import { validatePromotionRecord, RECORD_KIND } from "./promotion-record.mjs";
import { VERDICT } from "./champion-challenger.mjs";
import { owingFamilies } from "../../../../scripts/nba/decide-nba-forecast-window.mjs";
import { stampReceipt } from "./forecast-receipt.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
/** v0.3's two source files, frozen before its first forward slate (founder 2026-10-22). */
const FROZEN_SOURCES = Object.freeze({ "minutes-model-v03.mjs": "4819ce41c953c4b8df068539c1c85e91ade03cab41e041a6e0291bd3a500bec7", "game-sim-v03.mjs": "1b8aac60d571cba200db1658ff4262c0cfb376ef9e6ec8de081853ebfb0ab82e" });

/* ─────────────── synthetic history ─────────────── */
const NOW = "2026-10-21T14:00:00Z"; // corpus season 2027 → prior season 2026
const TOR = "28", MIA = "14";
const line = (id, team, minutes, over = {}) => ({ providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter: minutes >= 28, didNotPlay: false, dnpReason: null, minutes, pts: Math.round(minutes * 0.5), reb: Math.round(minutes * 0.2), ast: Math.round(minutes * 0.1), threePm: 1, ...over });
const dnp = (id, team, reason = "COACH'S DECISION") => ({ providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter: false, didNotPlay: true, dnpReason: reason, minutes: null });
const box = (id, dateUtc, phase, players, season = 2026) => ({ schemaVersion: 1, providerEventId: id, season, phase, dateUtc, boxscoreAvailable: true, teams: [{ providerTeamId: TOR, homeAway: "home" }, { providerTeamId: MIA, homeAway: "away" }], players });
const day = (i) => new Date(Date.UTC(2025, 10, 1) + i * 86_400_000).toISOString().slice(0, 16) + "Z";
const mia = (i) => [line("m0", MIA, 30), line("m1", MIA, 30), line("m2", MIA, 30), line("m3", MIA, 30), line("m4", MIA, 30)];
// "star": 60 regular-season games at 34, then the last 10 at 20 (an end-of-season shutdown) → v0's trailing10 sees 20.
const REG = Array.from({ length: 70 }, (_, i) => box(`r${i}`, day(i), 2, [line("star", TOR, i < 60 ? 34 : 20), line("b1", TOR, 18), i % 2 ? line("deep", TOR, 6) : dnp("deep", TOR), ...mia(i)]));
const PRE = Array.from({ length: 4 }, (_, i) => box(`pre${i}`, `2026-10-0${i + 3}T23:00Z`, 1, [line("star", TOR, 22), line("b1", TOR, 30), line("deep", TOR, 25), ...mia(i)], 2027));
const POST = Array.from({ length: 4 }, (_, i) => box(`po${i}`, `2026-04-2${i}T23:00Z`, 3, [line("star", TOR, 44), line("b1", TOR, 2), line("deep", TOR, 1), ...mia(i)]));
const PLAYIN = [box("pi0", "2026-04-15T23:00Z", 5, [line("star", TOR, 46), line("b1", TOR, 1), ...mia(0)])];
const BOX = [...REG, ...PRE, ...POST, ...PLAYIN];
const rosterTeam = (providerTeamId, ids) => ({ providerTeamId, espnAbbr: "X", canonicalTricode: "X", state: "CAPTURED", reason: null, playerCount: ids.length, capturedAt: "2026-10-21T06:00:00Z", players: ids.map((id) => ({ providerAthleteId: id, displayName: `R${id}`, position: "G", experienceYears: 3, injuryStatus: null })), refused: [] });
const ROSTERS = { artifact: "nba-roster-capture", contractVersion: "nba-roster-contract-v1", asOf: "2026-10-21T06:00:00Z", capturedAt: "2026-10-21T06:00:00Z", teams: [rosterTeam(TOR, ["star", "b1", "deep", "rk"]), rosterTeam(MIA, ["m0", "m1", "m2", "m3", "m4"])] };

test("POPULATION: preseason, play-in and playoff appearances never enter a regular-season v0.3 estimate (mutation: relabel them regular and the estimate moves)", () => {
  const idx = indexRoleHistory(BOX, { asOfDateUtc: NOW, population: "regular" });
  const star = roleEstimate(idx.byAthlete.get("star"), idx);
  assert.equal(star.priorGames, 70, "70 regular-season appearances; 4 playoff + 1 play-in excluded");
  assert.equal(star.currentGames, 0, "the 4 preseason games of 2026-27 are not current-season regular games");
  // MUTATION PROBE: the same docs relabelled phase 2 do move it — the filter is what keeps them out.
  const relabelled = BOX.map((d) => (d.phase === 2 ? d : { ...d, phase: 2 }));
  const star2 = roleEstimate(indexRoleHistory(relabelled, { asOfDateUtc: NOW, population: "regular" }).byAthlete.get("star"), indexRoleHistory(relabelled, { asOfDateUtc: NOW, population: "regular" }));
  assert.notEqual(star2.expectedMinutes, star.expectedMinutes);
  // and v0's "regular" population DOES include playoffs and play-in (phase !== 1): the defect this candidate removes
  const v0 = expectedMinutes({ boxscores: BOX, teamProviderId: TOR, asOfDateUtc: NOW, population: "regular" });
  assert.equal(v0.rows.find((r) => r.providerAthleteId === "star").basis, "trailing10");
  assert.ok(v0.rows.find((r) => r.providerAthleteId === "star").expectedMinutes > 30, "v0's trailing-10 window = 4 playoff + 1 play-in games at 44–46 + 5 shutdown games at 20");
});

test("ROLE PRIOR: the whole prior regular season, not its last 10 team games", () => {
  const noPost = [...REG];
  const v0 = expectedMinutes({ boxscores: noPost, teamProviderId: TOR, asOfDateUtc: NOW, population: "regular" });
  assert.equal(v0.rows.find((r) => r.providerAthleteId === "star").expectedMinutes, 20, "v0 trailing10 = the shutdown stretch");
  const idx = indexRoleHistory(noPost, { asOfDateUtc: NOW, population: "regular" });
  const star = roleEstimate(idx.byAthlete.get("star"), idx);
  assert.equal(star.basis, BASES.ROLE_PRIOR);
  assert.equal(star.expectedMinutes, Number(((60 * 34 + 10 * 20) / 70).toFixed(3)));
  assert.equal(PARAMS.PRIOR_GAMES, TRAILING_N, "the prior weight is the frozen v0 window length, not a fitted number");
  assert.equal(PARAMS.MINUTES_POWER, V1_PARAMS.MINUTES_POWER, "the normalisation power is the frozen v1 constant");
});

test("BLEND: the prior is worth PRIOR_GAMES appearances; current-season games move it smoothly (no season-switch cliff)", () => {
  const cur = (n, m) => Array.from({ length: n }, (_, i) => box(`c${n}-${i}`, `2026-10-20T${String(i).padStart(2, "0")}:00Z`, 2, [line("star", TOR, m), ...mia(i)], 2027));
  const at = (n) => { const b = [...REG, ...cur(n, 40)]; const now = "2026-10-21T23:59:00Z"; const idx = indexRoleHistory(b, { asOfDateUtc: now, population: "regular" }); return roleEstimate(idx.byAthlete.get("star"), idx); };
  const prior = (60 * 34 + 10 * 20) / 70;
  const e1 = at(1);
  assert.equal(e1.basis, BASES.BLEND);
  assert.equal(e1.expectedMinutes, Number(((PARAMS.PRIOR_GAMES * prior + 40) / (PARAMS.PRIOR_GAMES + 1)).toFixed(3)), "one new game carries 1/11 of the weight");
  const e3 = at(3);
  assert.ok(e3.expectedMinutes > e1.expectedMinutes && e3.expectedMinutes < 40, "monotone toward the current season");
  assert.ok(e1.rates && Number.isFinite(e1.rates.pts), "rates never vanish after one new-season game (the v0.2 0–0 failure)");
  // v0 by contrast switches the whole team to the new season after its first game: the player has 1 appearance → no rates
  const v0 = expectedMinutes({ boxscores: [...REG, ...cur(1, 40)], teamProviderId: TOR, asOfDateUtc: "2026-10-21T23:59:00Z", population: "regular" });
  assert.equal(v0.seasonUsed, 2027);
  assert.equal(v0.rows.find((r) => r.providerAthleteId === "star").rates, null);
});

test("PLAY RATE: only COACH'S DECISION DNPs count against it (an injury DNP is availability, read from the feed)", () => {
  const idx = indexRoleHistory(REG, { asOfDateUtc: NOW, population: "regular" });
  const deep = roleEstimate(idx.byAthlete.get("deep"), idx);
  assert.equal(deep.playRate, 0.5, "35 appearances, 35 coach's decisions");
  const injured = REG.map((d) => ({ ...d, players: d.players.map((p) => (p.providerAthleteId === "deep" && p.didNotPlay ? { ...p, dnpReason: "LEFT ANKLE SPRAIN" } : p)) }));
  const idx2 = indexRoleHistory(injured, { asOfDateUtc: NOW, population: "regular" });
  assert.equal(roleEstimate(idx2.byAthlete.get("deep"), idx2).playRate, 1);
});

test("GATE: same fail-closed roster gate as v0.1; a rookie with no history is INSUFFICIENT_HISTORY (null, never 0)", () => {
  assert.equal(gatePoolV03({ rosters: null, providerTeamId: TOR, boxscores: BOX, asOfDateUtc: NOW }).state, "REFUSED");
  assert.equal(gatePoolV03({ rosters: { ...ROSTERS, asOf: "2026-10-22T00:00:00Z" }, providerTeamId: TOR, boxscores: BOX, asOfDateUtc: NOW }).reason, "ROSTER_FROM_THE_FUTURE");
  const g = gatePoolV03({ rosters: ROSTERS, providerTeamId: TOR, boxscores: BOX, asOfDateUtc: NOW, injuries: [] });
  assert.equal(g.state, "GATED");
  assert.equal(g.modelVersion, MINUTES_MODEL_V03_VERSION);
  assert.equal(g.gate.poolVersion, POOL_V03_VERSION);
  assert.deepEqual(g.normalisation, { ...NORMALISATION });
  const rk = g.rows.find((r) => r.providerAthleteId === "rk");
  assert.equal(rk.expectedMinutes, null);
  assert.equal(rk.minutesState, "INSUFFICIENT_HISTORY");
  const out = gatePoolV03({ rosters: ROSTERS, providerTeamId: TOR, boxscores: BOX, asOfDateUtc: NOW, injuries: [{ providerTeamId: TOR, athleteId: "star", status: "Out" }] });
  assert.equal(out.rows.find((r) => r.providerAthleteId === "star").expectedMinutes, null);
});

test("NORMALISATION: an over-full pool sums to 240 in expectation and starters keep a larger share than v0's uniform factor gives them", () => {
  // 5 starters at 34 + 7 bench at 20 → Σ = 310 (over-full); bench play rate 0.8
  const rows = [...Array.from({ length: 5 }, (_, i) => ({ providerAthleteId: `s${i}`, name: `S${i}`, expectedMinutes: 34, minutesSd: 3, availability: "active", rates: { pts: 0.5, reb: 0.2, ast: 0.1, threePm: 0.05 }, rateSd: { pts: 0.1, reb: 0.05, ast: 0.03, threePm: 0.02 }, playRate: 1 })),
    ...Array.from({ length: 7 }, (_, i) => ({ providerAthleteId: `b${i}`, name: `B${i}`, expectedMinutes: 20, minutesSd: 4, availability: "active", rates: { pts: 0.4, reb: 0.2, ast: 0.1, threePm: 0.04 }, rateSd: { pts: 0.1, reb: 0.05, ast: 0.03, threePm: 0.02 }, playRate: 0.8 }))];
  const v0 = prepareRoster({ rows });
  const v03 = prepareRosterV03({ rows, normalisation: { ...NORMALISATION } });
  const starterV0 = v0.players[0].expectedMinutes, starterV03 = v03.players[0].expectedMinutes;
  assert.equal(starterV0, Number((34 * (240 / 310)).toFixed(4)), "v0: one share off everyone");
  assert.ok(starterV03 > starterV0, "v0.3: the excess comes mostly from the short-minutes players");
  assert.ok(Math.abs(v03.assumptions.minutes.expectedTeamMinutes - TEAM_MINUTES) < 0.05, "Σ playRate·minutes = 240");
  assert.equal(v03.assumptions.minutes.normalisation.rule, PLAY_RATE_WATER_FILL);
  assert.equal(v03.assumptions.minutes.normalisation.power, V1_PARAMS.MINUTES_POWER);
  assert.equal(v03.assumptions.minutes.rescaleFactor, null);
  // under-full pool: v0's uniform bounded factor on the play-rate-weighted sum
  const u = prepareRosterV03({ rows: rows.slice(0, 6), normalisation: { ...NORMALISATION } });
  assert.equal(u.assumptions.minutes.rescaleFactor, Number(Math.min(MINUTES_RESCALE_BOUNDS.max, 240 / (5 * 34 + 20 * 0.8)).toFixed(4)));
  // the v0.3 engine never silently runs v0's rule
  assert.throws(() => prepareRosterV03({ rows }), /normalisation/);
});

test("weightedWaterFill: Σ w·min(cap, f·raw) = target, nobody above the cap", () => {
  const w = [1, 1, 0.5, 0.5];
  const r = weightedWaterFill([50, 40, 10, 5], w, 100, 45);
  assert.ok(Math.abs(r.minutes.reduce((s, m, i) => s + m * w[i], 0) - 100) < 1e-9);
  assert.ok(r.minutes.every((m) => m <= 45 + 1e-12));
});

const simRows = (team, playRates) => Array.from({ length: 10 }, (_, i) => ({ providerAthleteId: `${team}${i}`, name: `${team}${i}`, expectedMinutes: 24, minutesSd: 3, availability: "active", rates: { pts: 0.5, reb: 0.2, ast: 0.1, threePm: 0.05 }, rateSd: { pts: 0.05, reb: 0.05, ast: 0.03, threePm: 0.02 }, ...(playRates ? { playRate: playRates(i) } : {}) }));
const simSide = (team, rows, normalisation) => ({ name: team, providerTeamId: team, rating: { rating: 1500 }, minutes: { rows, ...(normalisation ? { normalisation } : {}) } });

test("SAME DRAWS AS v0: with every playRate 1 and a pool of exactly 240, v0.3's player distributions equal the frozen v0 engine's", () => {
  const v0 = simulateGame({ providerEventId: "x2", home: simSide("h", simRows("h")), away: simSide("a", simRows("a")), eloWinProbability: 0.5, simulations: 2000 });
  const v3 = simulateGameV03({ providerEventId: "x2", home: simSide("h", simRows("h", () => 1), { ...NORMALISATION }), away: simSide("a", simRows("a", () => 1), { ...NORMALISATION }), eloWinProbability: 0.5, simulations: 2000 });
  const strip = (ps) => ps.map(({ playRate, roleMinutes, ...p }) => p);
  assert.deepEqual(strip(v3.players.home), v0.players.home, "the participation stream never touches the base stream");
  assert.deepEqual(v3.sim, v0.sim, "all play every draw → the same team totals");
  assert.equal(v3.seed, v0.seed);
});

test("PARTICIPATION: a v0.3 side's team total counts each player's points with probability playRate; deterministic per seed", () => {
  const pr = (i) => (i < 5 ? 1 : 0.5);
  const a = simulateGameV03({ providerEventId: "x1", home: simSide("h", simRows("h", pr), { ...NORMALISATION }), away: simSide("a", simRows("a", pr), { ...NORMALISATION }), eloWinProbability: 0.5, simulations: 4000 });
  const sumMeans = a.players.home.reduce((s, p) => s + p.pts.mean * p.playRate, 0);
  assert.ok(Math.abs(a.sim.home.mean - sumMeans) < 1.5, `team mean ${a.sim.home.mean} ≈ Σ playRate·pts ${sumMeans}`);
  const a2 = simulateGameV03({ providerEventId: "x1", home: simSide("h", simRows("h", pr), { ...NORMALISATION }), away: simSide("a", simRows("a", pr), { ...NORMALISATION }), eloWinProbability: 0.5, simulations: 4000 });
  assert.deepEqual(a2, a, "same seed → identical artifact");
  assert.equal(a.modelVersion, NBA_SIM_V03_MODEL_VERSION);
});

test("FAMILY: v0.3 is an ARMED forward-shadow CHALLENGER in FAMILIES (founder 2026-10-22), aligned with v0.1; v0.3 is not a candidate and every candidate is unarmed", () => {
  assert.deepEqual(Object.keys(FAMILIES), ["v0", "v0.1", "v0.2", "v1", "v0.3"]);
  // v0.4 (minutes-model-v04.test.mjs) is the only candidate today; it is unarmed and never iterated by the pipeline
  assert.ok(!("v0.3" in CANDIDATE_FAMILIES), "v0.3 left CANDIDATE_FAMILIES when it was armed");
  for (const c of Object.values(CANDIDATE_FAMILIES)) assert.equal(c.armed, false, `${c.family} is a candidate, so it is NOT ARMED`);
  const f = familySpec("v0.3");
  assert.equal(f, FAMILIES["v0.3"]);
  assert.equal(f.role, "CHALLENGER");
  assert.equal(f.alignsWith, "v0.1");
  assert.ok(!("armed" in f), "an armed family carries no armed:false flag");
  assert.equal(f.poolRule, FAMILIES["v0.1"].poolRule);
  assert.equal(f.dataRule, "corpus-v1+boxscores-2026-27", "box scores fold, the finals record does not: Elo stays v0.1's");
  assert.equal(f.dir, "experimental-v0.3");
  const sched = [{ providerEventId: "401999001", dateUtc: "2026-10-22T23:00Z", seasonType: 2, neutralSite: false, home: { abbr: "TOR", name: "Toronto Raptors", providerTeamId: TOR }, away: { abbr: "MIA", name: "Miami Heat", providerTeamId: MIA } }];
  const corpusRows = REG.map((b, i) => ({ providerEventId: b.providerEventId, season: 2026, phase: 2, dateUtc: b.dateUtc, home: "Toronto Raptors", away: "Miami Heat", ftHome: 100 + (i % 5), ftAway: 101, neutralSite: false }));
  const base = { date: "2026-10-22", now: NOW, scheduleRows: sched, corpusRows, boxscores: BOX, injuries: [], rosters: ROSTERS, simulations: 200 };
  const a3 = buildForecastArtifact({ ...base, family: "v0.3" }).artifact;
  const a1 = buildForecastArtifact({ ...base, family: "v0.1" }).artifact;
  assert.equal(a3.modelVersion, "nba-experimental-v0.3-role-minutes");
  assert.equal(a3.family, "v0.3");
  assert.equal(a3.minutesModelVersion, MINUTES_MODEL_V03_VERSION);
  assert.equal(a3.alignsWith, "v0.1");
  assert.equal(a3.poolVersion, POOL_V03_VERSION);
  assert.equal(a3.simEngineVersion, NBA_SIM_V03_MODEL_VERSION);
  assert.equal(a1.simEngineVersion, "nba-preseason-experimental-v0", "v0.1 still runs the frozen v0 engine");
  assert.deepEqual(a3.games[0].forecast.elo, a1.games[0].forecast.elo, "same Elo as v0.1 — only the minutes layer differs");
  // SAME CUTOFF at the artifact level: one instant in, the same instant out, for both families and every game
  assert.equal(a3.inputAsOf, a1.inputAsOf);
  assert.deepEqual(a3.games.map((g) => g.forecast.inputAsOf), a1.games.map((g) => g.forecast.inputAsOf));
  assert.ok(!("minutesModelVersion" in a1) && !("alignsWith" in a1));
  assert.throws(() => buildForecastArtifact({ ...base, rosters: null, family: "v0.3" }), /requires a roster capture/);
});

test("FROZEN CONSTANTS AND RULES (founder 2026-10-22, prereg look 8): any change is a new candidate, never an edit of v0.3", () => {
  assert.deepEqual({ ...PARAMS }, { PRIOR_GAMES: 10, MIN_GAMES_FOR_RATES: 3, MINUTES_POWER: 1.25 });
  assert.equal(PARAMS.PRIOR_GAMES, TRAILING_N, "origin: the frozen v0 window length");
  assert.equal(PARAMS.MINUTES_POWER, V1_PARAMS.MINUTES_POWER, "origin: the frozen v1 bench-first power (look 4)");
  assert.deepEqual({ ...NORMALISATION }, { rule: "play-rate-water-fill", power: 1.25 });
  assert.deepEqual({ ...BASES }, { ROLE_PRIOR: "role-prior", BLEND: "blend", CURRENT: "current", INSUFFICIENT: "insufficient" });
  assert.equal(MINUTES_MODEL_V03_VERSION, "nba-minutes-model-v0.3-role-prior");
  assert.equal(POOL_V03_VERSION, "nba-roster-gated-pool-v0.3");
  assert.equal(NBA_SIM_V03_MODEL_VERSION, "nba-sim-v0.3-conditional-minutes");
  assert.deepEqual({ ...FAMILIES["v0.3"] }, { family: "v0.3", poolRule: "roster-gated", dataRule: "corpus-v1+boxscores-2026-27", role: "CHALLENGER", modelVersion: "nba-experimental-v0.3-role-minutes", dir: "experimental-v0.3", minutesRule: "v0.3-role-prior", alignsWith: "v0.1" });
  // the v0 engine constants v0.3's engine reuses
  assert.deepEqual([TEAM_MINUTES, MAX_PLAYER_MINUTES, MINUTES_RESCALE_BOUNDS.min, MINUTES_RESCALE_BOUNDS.max, DEFAULT_MINUTES_SD_RATIO], [240, 48, 0.5, 1.5, 0.3]);
  // the population rule (regular = phase 2 + cup final) and the coach's-decision play-rate rule
  assert.deepEqual([1, 2, 3, 5, "cup-final"].map((p) => inPopulation(p, "regular")), [false, true, false, false, true]);
  // the two v0.3 source files are frozen byte-for-byte (same practice as game-sim.mjs in game-sim-v1.test.mjs)
  for (const [file, want] of Object.entries(FROZEN_SOURCES)) {
    assert.equal(sha(fs.readFileSync(path.join(HERE, file))), want, `${file} changed — a change during the test is a NEW candidate (new version strings, own shadow)`);
  }
});

test("UNARMED-CANDIDATE GUARD is kept for future candidates (pure)", () => {
  const spec = { family: "vX", armed: false };
  const nbaRoot = "/repo/data/internal/research/nba/";
  assert.match(unarmedWriteRefusal(spec, { write: true, outFile: null, nbaRoot }), /NOT ARMED/);
  assert.match(unarmedWriteRefusal(spec, { write: false, outFile: "/repo/data/internal/research/nba/experimental-v0.1/forecasts/x.json", nbaRoot }), /NOT ARMED/);
  assert.equal(unarmedWriteRefusal(spec, { write: true, outFile: "/tmp/replay/x.json", nbaRoot }), null);
  for (const f of Object.values(FAMILIES)) assert.equal(unarmedWriteRefusal(f, { write: true, outFile: null, nbaRoot }), null, `${f.family} is armed`);
});

test("SAME-CUTOFF RULE (pure): aligned only at the anchor's exact instant on the anchor's exact inputs", () => {
  const run = { now: "2026-10-22T14:00:00Z", rostersSha256: "r1", injuriesSha256: "i1", scheduleGeneratedAt: "2026-10-22T13:59:00Z" };
  const anchor = { receipt: { generatedAt: run.now, inputs: { rosters: { sha256: "r1" }, injuries: { sha256: "i1" }, schedule: { generatedAt: run.scheduleGeneratedAt } } } };
  assert.equal(alignedCutoffRefusal(anchor, run), null);
  assert.match(alignedCutoffRefusal(undefined, run), /no receipt/);
  assert.match(alignedCutoffRefusal({ receipt: { ...anchor.receipt, generatedAt: "2026-10-22T09:00:00Z" } }, run), /froze at/);
  assert.match(alignedCutoffRefusal(anchor, { ...run, rostersSha256: "r2" }), /roster/);
  assert.match(alignedCutoffRefusal(anchor, { ...run, injuriesSha256: "i2" }), /injury/);
  assert.match(alignedCutoffRefusal(anchor, { ...run, scheduleGeneratedAt: "x" }), /schedule/);
  // the forecast-window decision never counts an aligned family as owed (it follows its anchor)
  assert.deepEqual(owingFamilies(FAMILIES).map((f) => f.family), ["v0", "v0.1", "v0.2", "v1"]);
});

test("BUILDER (real script, committed 2026-10-21 inputs, --out outside the repo): v0.3's cutoff equals v0.1's receipt, game by game", () => {
  const script = path.join(APP, "scripts", "nba", "build-nba-experimental-forecasts.mjs");
  const v01 = readJson(path.join(NBA, "experimental-v0.1", "forecasts", "2026-10-21.json"));
  const ri = v01.games[0].receipt.inputs;
  const files = ["--schedule-file", path.join(APP, "public", "data", "nba", "schedule", "capture-2026-10-21T1428.json"), "--rosters-file", path.join(NBA, "rosters", "2026-10-21.json"), "--injuries-file", path.join(NBA, "v0.3-candidate", "fixtures", `injuries-${ri.injuries.sha256.slice(0, 16)}.json`)];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nba-v03-align-"));
  const run = (args) => spawnSync(process.execPath, [script, "--family", "v0.3", "--date", "2026-10-21", "--simulations", "100", ...args], { cwd: APP, encoding: "utf8" });
  const out = path.join(tmp, "v0.3-2026-10-21.json");
  const r = run(["--now", v01.games[0].receipt.generatedAt, ...files, "--out", out]);
  assert.equal(r.status, 0, r.stderr);
  const doc = readJson(out);
  assert.equal(doc.games.length, v01.games.length);
  for (const g of doc.games) {
    const a = v01.games.find((x) => x.providerEventId === g.providerEventId);
    assert.equal(g.receipt.generatedAt, a.receipt.generatedAt, `${g.providerEventId}: same instant`);
    assert.equal(g.forecast.inputAsOf, a.forecast.inputAsOf, `${g.providerEventId}: same inputAsOf`);
    assert.equal(g.receipt.inputs.rosters.sha256, a.receipt.inputs.rosters.sha256);
    assert.equal(g.receipt.inputs.injuries.sha256, a.receipt.inputs.injuries.sha256);
    assert.equal(g.receipt.inputs.schedule.generatedAt, a.receipt.inputs.schedule.generatedAt);
    assert.deepEqual(g.receipt.inputs.alignedWith, { family: "v0.1", generatedAt: a.receipt.generatedAt, rule: "frozen only where v0.1's receipt has generatedAt = this instant and the same roster / injury / schedule inputs" });
  }
  // one second later: no v0.1 receipt at that instant → NOT_ALIGNED, nothing written
  const later = path.join(tmp, "later.json");
  const n = run(["--now", new Date(Date.parse(v01.games[0].receipt.generatedAt) + 1000).toISOString().replace(".000Z", "Z"), ...files, "--out", later]);
  assert.equal(n.status, 0, n.stderr);
  assert.match(n.stdout, /state=NOT_ALIGNED/);
  assert.ok(!fs.existsSync(later));
  // a replay's input overrides never reach the repository
  const inRepo = run(["--now", v01.games[0].receipt.generatedAt, ...files, "--out", path.join(NBA, "experimental-v0.3", "forecasts", "2026-10-21.json")]);
  assert.equal(inRepo.status, 1);
  assert.match(inRepo.stderr, /outside the repository/);
  const noOut = run(["--now", v01.games[0].receipt.generatedAt, ...files, "--write"]);
  assert.equal(noOut.status, 1);
  assert.ok(!fs.existsSync(path.join(NBA, "experimental-v0.3", "forecasts", "2026-10-21.json")), "2026-10-21 is never a v0.3 forward sample");
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("PROMOTION RECORD recognises v0.3 (founder approval still required for any record)", () => {
  const rec = {
    kind: RECORD_KIND.PROMOTION, family: "v0.3", version: FAMILIES["v0.3"].modelVersion, market: "points", date: "2030-03-01", decidedAt: "2030-03-01T12:00:00Z",
    metrics: { pairedN: 1600, minutesMaeDiff: -0.4, ci95: [-0.6, -0.2] }, reason: "paired forward evidence met every §7 bar",
    approver: "Yash (founder)", evidence: { verdict: VERDICT.READY_FOR_FOUNDER_REVIEW, report: "reports/champion-challenger/2030-03-01.json", market: "points" },
  };
  assert.deepEqual(validatePromotionRecord(rec).errors, []);
  assert.match(validatePromotionRecord({ ...rec, version: "nba-experimental-v0.3-something-else" }).errors.join(), /model version/);
  assert.match(validatePromotionRecord({ ...rec, approver: "Claude" }).errors.join(), /automation identity/);
});

test("ISOLATION: v0.3 never feeds the lane, the official snapshot, any product or any public route", () => {
  const SRC = path.join(APP, "src");
  const PRODUCER_HELPERS_ALLOWED = new Set(["etDateOf", "labelForSeasonType", "populationForSeasonType", "LABELS", "POPULATIONS"]);
  const MARKERS = /experimental-v0\.3|minutes-model-v03|game-sim-v03|nba-experimental-v0\.3|nba-sim-v0\.3|role-minutes|["']v0\.3["']/;
  const walkSrc = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkSrc(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
  const isCode = (f) => /\.(m?js|tsx?)$/.test(f) && !/\.test\.m?js$|\.spec\.tsx?$/.test(f);
  const surfaces = [
    path.join(SRC, "lib", "sports", "nba", "experimental-public-lane.mjs"),
    path.join(SRC, "lib", "consistency", "official-snapshot.mjs"),
    path.join(APP, "scripts", "nba", "build-nba-experimental-public.mjs"),
    path.join(APP, "scripts", "nba", "publish-nba-experimental-lane.mjs"),
    ...walkSrc(path.join(SRC, "lib", "products")).filter(isCode),
    ...walkSrc(path.join(SRC, "lib", "simulation-theater")).filter(isCode),
    ...walkSrc(path.join(SRC, "app")).filter(isCode),
    ...walkSrc(path.join(SRC, "components")).filter(isCode),
  ];
  assert.ok(surfaces.length > 50, `scanned ${surfaces.length} files`);
  const hits = surfaces.filter((f) => fs.existsSync(f) && MARKERS.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(APP, f));
  assert.deepEqual(hits, [], "no lane / snapshot / product / route / theater source names the v0.3 family, its directory or its modules");
  // IMPORT GRAPH: nothing reachable from those surfaces is a v0.3 module
  const resolve = (from, spec) => {
    const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
    if (!base) return null;
    for (const c of [base, ...[".mjs", ".js", ".ts", ".tsx"].map((x) => base + x), ...["index.mjs", "index.js", "index.ts", "index.tsx"].map((x) => path.join(base, x))]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    return null;
  };
  const seen = new Set();
  const stack = surfaces.filter((f) => fs.existsSync(f));
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !/\.(m?js|tsx?)$/.test(f)) continue;
    seen.add(f);
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(/(?:import|export)\s([^"'`]*?)from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const r = resolve(f, m[2] ?? m[3]);
      if (!r) continue;
      // experimental-forecast.mjs is the producer library: a surface may take only its pure date/label helpers from it
      // (the lane publisher reads etDateOf), never a family, a builder or a model — and the walk stops there.
      if (path.basename(r) === "experimental-forecast.mjs") {
        const names = (/\{([^}]*)\}/.exec(m[1] ?? "")?.[1] ?? "*").split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        for (const name of names) assert.ok(PRODUCER_HELPERS_ALLOWED.has(name), `${path.relative(APP, f)} imports ${name} from experimental-forecast.mjs`);
        continue;
      }
      stack.push(r);
    }
  }
  const reached = [...seen].map((f) => path.basename(f));
  for (const m of ["minutes-model-v03.mjs", "game-sim-v03.mjs"]) assert.ok(!reached.includes(m), `${m} is reachable from a lane / snapshot / product / route surface`);
  assert.ok(seen.size > surfaces.length / 2, `graph walked ${seen.size} files`);
});

/* ─────────────── the official family is untouched ─────────────── */
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
// The receipts' exact inputs: the dated roster captures are the latest.json blobs the receipts hashed; the injury
// snapshots are copies of the latest.json git blobs (data/internal/research/nba/v0.3-candidate/fixtures/).
const ROSTER_FILE = { "8faecd4e44c6ea10": "2026-10-19.json", "60ff1802bf95776d": "2026-10-20.json", "9c2baafed1c9686f": "2026-10-21.json" };
let corpusBox = null;
const loadCorpus = () => (corpusBox ??= fs.readdirSync(path.join(NBA, "boxscores")).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(NBA, "boxscores", f))));

for (const date of ["2026-10-20", "2026-10-21"]) {
  test(`v0.1 BYTE-IDENTICAL: every committed ${date} v0.1 game re-derives its payloadSha256 from its own inputs with this code`, () => {
    const doc = readJson(path.join(NBA, "experimental-v0.1", "forecasts", `${date}.json`));
    const corpus = readJson(path.join(NBA, "corpus-v1.json"));
    const byFreeze = new Map();
    for (const g of doc.games) { const k = g.receipt.generatedAt; if (!byFreeze.has(k)) byFreeze.set(k, []); byFreeze.get(k).push(g); }
    let checked = 0;
    for (const [now, games] of byFreeze) {
      const ri = games[0].receipt.inputs;
      const rText = fs.readFileSync(path.join(NBA, "rosters", ROSTER_FILE[ri.rosters.sha256.slice(0, 16)]));
      const iText = fs.readFileSync(path.join(NBA, "v0.3-candidate", "fixtures", `injuries-${ri.injuries.sha256.slice(0, 16)}.json`));
      assert.equal(sha(rText), ri.rosters.sha256, "roster input is the receipt's");
      assert.equal(sha(iText), ri.injuries.sha256, "injury input is the receipt's");
      const scheduleRows = games.map((g) => ({ providerEventId: g.providerEventId, dateUtc: g.dateUtc, seasonType: g.seasonType, neutralSite: g.neutralSite, venue: g.venue, home: { abbr: g.home.abbr, name: g.home.name, providerTeamId: g.home.providerTeamId }, away: { abbr: g.away.abbr, name: g.away.name, providerTeamId: g.away.providerTeamId } }));
      const { artifact } = buildForecastArtifact({ date, now, scheduleRows, corpusRows: corpus.rows, boxscores: loadCorpus(), injuries: JSON.parse(iText).entries ?? null, rosters: JSON.parse(rText), simulations: games[0].forecast.simulations, family: "v0.1" });
      for (const stored of games) {
        const built = artifact.games.find((x) => x.providerEventId === stored.providerEventId);
        assert.ok(built, `${stored.providerEventId} rebuilt`);
        const st = stampReceipt(built, { family: "v0.1", modelVersion: artifact.modelVersion, now, inputs: stored.receipt.inputs });
        assert.equal(st.receipt.payloadSha256, stored.receipt.payloadSha256, `${date} ${stored.providerEventId}: v0.1 output changed`);
        checked += 1;
      }
    }
    assert.equal(checked, doc.games.length);
    // and the gate itself: v0.1 still reads the v0 minutes model (its rows carry v0 bases, never v0.3's)
    const g = doc.games[0];
    const g0 = gatePool({ rosters: readJson(path.join(NBA, "rosters", ROSTER_FILE[g.receipt.inputs.rosters.sha256.slice(0, 16)])), providerTeamId: g.home.providerTeamId, boxscores: loadCorpus(), asOfDateUtc: g.receipt.generatedAt, injuries: [] });
    assert.equal(g0.state, "GATED");
    assert.ok(g0.rows.every((r) => ["trailing10", "season", "insufficient"].includes(r.basis)));
  });
}
