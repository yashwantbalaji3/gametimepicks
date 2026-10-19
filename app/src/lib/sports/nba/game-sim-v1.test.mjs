/**
 * NBA sim v1 ("nba-sim-v1-coherent") guards: the seven contract invariants each with a mutation probe, the engine
 * throwing on a violating draw, determinism, overtime and its cap, representative samples re-derived from runIndex,
 * the v0 engine byte-identical, the family guard, no leakage, and the v0.2 cold-start zero case NOT inherited.
 * NBA REGULAR SEASON — SHADOW CANDIDATE · PRIVATE_RESEARCH.
 *
 * Run: npx tsx --test src/lib/sports/nba/game-sim-v1.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { simulateGameV1, simulateOneDraw, prepareGame, checkDraw, waterFill, V1_PARAMS, OT_CAP, NBA_SIM_V1_MODEL_VERSION } from "./game-sim-v1.mjs";
import { indexBoxscores, leagueMeans, buildSideProfile, playerProfile } from "./sim-v1-profile.mjs";
import { simulateGame, fnv1a32 } from "./game-sim.mjs";
import { gatePool } from "./roster-gated-pool.mjs";
import { buildForecastArtifact, familyGuard, familySpec, FAMILIES } from "./experimental-forecast.mjs";

/* ─────────────── fixtures: two teams, a full prior season sample, full stat lines ─────────────── */
const TOR = "28", MIA = "14";
function line(id, team, minutes, k) {
  const threePa = Math.round(minutes * (0.1 + 0.01 * (k % 5)));
  const threePm = Math.round(threePa * 0.36);
  const twoPa = Math.round(minutes * 0.25);
  const twoPm = Math.round(twoPa * 0.52);
  const fta = Math.round(minutes * 0.1), ftm = Math.round(fta * 0.78);
  return { providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter: k < 5, didNotPlay: false, dnpReason: null, minutes, pts: 3 * threePm + 2 * twoPm + ftm, fgm: threePm + twoPm, fga: threePa + twoPa, threePm, threePa, ftm, fta, reb: Math.round(minutes * (0.12 + 0.02 * (k % 3))), ast: Math.round(minutes * (0.06 + 0.02 * (k % 4))), oreb: 1, dreb: 3, tov: 1 };
}
const MINS = [36, 34, 32, 30, 28, 24, 20, 16, 12, 8];
const teamLines = (team, prefix, shift = 0) => MINS.map((m, k) => line(`${prefix}${k}`, team, Math.max(1, m + ((shift + k) % 3) - 1), k));
function doc(id, dateUtc, season, phase, extra = {}) {
  return { schemaVersion: 1, providerEventId: id, season, phase, dateUtc, boxscoreAvailable: true, teams: [{ providerTeamId: TOR, homeAway: "home" }, { providerTeamId: MIA, homeAway: "away" }], players: [...teamLines(TOR, "t", extra.shift ?? 0), ...teamLines(MIA, "m", (extra.shift ?? 0) + 1)] };
}
// 2025-26 regular season (corpus 2026): 30 games Jan–Apr 2026
const PRIOR = Array.from({ length: 30 }, (_, g) => doc(`p${g}`, new Date(Date.UTC(2026, 0, 5 + g * 3, 0)).toISOString().replace(".000Z", "Z"), 2026, 2, { shift: g }));
const NOW = "2026-10-21T12:00:00Z";
const roster = (prefix) => MINS.map((_, k) => ({ providerAthleteId: `${prefix}${k}`, name: `P${prefix}${k}`, availability: "active", injuryStatus: k === 3 ? "Day-To-Day" : null }));

function game({ boxscores = PRIOR, now = NOW, eloH = 1530, eloA = 1480, neutralSite = false, rosterH = roster("t"), rosterA = roster("m"), simulations = 400, params = V1_PARAMS, seed = null, __testMutateDraw = null } = {}) {
  const index = indexBoxscores(boxscores);
  const league = leagueMeans(index, { asOf: now });
  const side = (teamId, rows, elo, name) => ({ name, providerTeamId: teamId, rating: { rating: elo, games: 30, basis: "regular" }, profile: buildSideProfile(index, { teamId, rosterRows: rows, asOf: now, league }) });
  const input = { providerEventId: "401909088", inputAsOf: now, neutralSite, home: side(TOR, rosterH, eloH, "Toronto Raptors"), away: side(MIA, rosterA, eloA, "Miami Heat"), league, eloWinProbability: 0.6, simulations, params, seed, __testMutateDraw };
  return { input, out: () => simulateGameV1(input) };
}

/* ─────────────── invariants ─────────────── */
test("INVARIANTS — every draw of a real run satisfies all seven; checkedDraws = N, violations 0", () => {
  const { out } = game({ simulations: 1500 });
  const o = out();
  assert.equal(o.modelVersion, NBA_SIM_V1_MODEL_VERSION);
  assert.deepEqual(o.invariants.checkedDraws, 1500);
  assert.equal(o.invariants.violations, 0);
  assert.equal(o.sim.tieMass, 0);
  assert.ok(Math.abs(o.sim.pHome + o.sim.pAway - 1) < 1e-9);
  assert.ok(o.sim.total.sd > o.sim.margin.sd, `shared pace: total SD ${o.sim.total.sd} > margin SD ${o.sim.margin.sd}`);
  const histP = o.sim.totalHistogram.reduce((s, b) => s + b.probability, 0);
  assert.ok(Math.abs(histP - 1) < 1e-3, "1-point total histogram sums to 1");
});

function realDraw() {
  const { input } = game();
  const prep = prepareGame(input);
  for (let i = 0; i < 50; i += 1) {
    const d = simulateOneDraw(prep, i);
    if (d.players.home.some((p) => p.minutes === 0) && d.players.home.some((p) => p.pts > 0 && p.minutes > 1)) return structuredClone(d);
  }
  return structuredClone(simulateOneDraw(prep, 0));
}
const has = (v, tag) => v.some((x) => x.startsWith(tag));

test("MUTATION PROBES — each invariant catches its own violation (a clean draw passes)", () => {
  const clean = realDraw();
  assert.deepEqual(checkDraw(clean), [], "POSITIVE CONTROL: a real draw is clean");
  const probe = (tag, mutate) => { const d = structuredClone(clean); mutate(d); const v = checkDraw(d); assert.ok(has(v, tag), `${tag} probe not caught: ${JSON.stringify(v)}`); };
  const scorer = (d) => d.players.home.find((p) => p.pts > 0 && p.ftm > 0) ?? d.players.home.find((p) => p.pts > 0);
  // I1 team = Σ periods = Σ players
  probe("I1", (d) => { d.periods.home[0] += 1; });
  probe("I1", (d) => { const p = scorer(d); p.ftm += 1; p.pts += 1; });
  // I2 decomposition, integers, 3PM ≤ 3PA
  probe("I2", (d) => { const p = scorer(d); p.pts += 1; d.final.home += 1; d.team.home.pts += 1; d.periods.home[3] += 1; });
  probe("I2", (d) => { const p = d.players.home.find((x) => x.minutes > 0); p.threePm = p.threePa + 1; p.pts += 3; d.team.home.threePm += 1; d.team.home.fgm += 1; d.final.home += 3; d.team.home.pts += 3; d.periods.home[3] += 3; });
  probe("I2", (d) => { scorer(d).reb = 1.5; });
  // I3 minutes sum and per-player cap
  probe("I3", (d) => { d.players.home[0].minutes += 0.5; });
  probe("I3", (d) => { const a = d.players.home[0], b = d.players.home[1]; const x = 49 + 5 * d.overtimePeriods - a.minutes; a.minutes += x; b.minutes -= x; });
  // I4 assists ≤ FGM
  probe("I4", (d) => { const extra = d.team.home.fgm - d.team.home.ast + 1; d.team.home.ast += extra; d.players.home[0].ast += extra; });
  // I5 untied
  probe("I5", (d) => { d.final.away = d.final.home; });
  // I6 Σ player reb = team reb
  probe("I6", (d) => { d.players.away[0].reb += 1; });
  // I7 zero minutes ⇒ zero stats (minutes moved to a teammate so I3 still holds)
  probe("I7", (d) => { const p = d.players.home.find((x) => x.pts > 0 && x.minutes > 1); const q = d.players.home.find((x) => x !== p && x.minutes < 30); q.minutes += p.minutes; p.minutes = 0; });
});

test("THROWS — a draw that violates an invariant stops the engine (never a silent artifact)", () => {
  const { out } = game({ simulations: 50, __testMutateDraw: (d, i) => { if (i === 17) d.players.home[0].reb += 1; } });
  assert.throws(out, /INVARIANT VIOLATION in 401909088 draw 17: I6/);
});

test("waterFill — exact target, cap respected, zeros stay zero", () => {
  const m = waterFill([40, 40, 40, 40, 40, 0, 10], 265, 53);
  assert.ok(Math.abs(m.reduce((s, x) => s + x, 0) - 265) < 1e-9);
  assert.ok(m.every((x) => x <= 53 + 1e-12));
  assert.equal(m[5], 0);
});

/* ─────────────── determinism ─────────────── */
test("DETERMINISM — same inputs → byte-identical JSON; another seed → another sample; seed is fnv1a(event id)", () => {
  const a = game().out(), b = game().out();
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.seed, fnv1a32("401909088"));
  const c = game({ seed: "deadbeef" }).out();
  assert.equal(c.seedPolicy, "explicit");
  assert.notDeepEqual(a.sim, c.sim);
});

/* ─────────────── overtime ─────────────── */
test("OVERTIME — a forced regulation tie plays 5-minute periods until untied; minutes become 240 + 25·OT", () => {
  const params = { ...V1_PARAMS, TEAM_NOISE_SD: 0, PACE_SD: 0, HCA_POINTS: 0 };
  const sym = (prefix) => MINS.map((_, k) => ({ providerAthleteId: `t${k}`, availability: "active" })); // same players both sides → identical expectations
  const { input } = game({ eloH: 1500, eloA: 1500, params, rosterH: sym(), rosterA: sym() });
  const prep = prepareGame(input);
  assert.equal(prep.expected[0], prep.expected[1]);
  let otSeen = 0;
  for (let i = 0; i < 200; i += 1) {
    const d = simulateOneDraw(prep, i);
    assert.ok(d.overtimePeriods >= 1, "every draw was tied after regulation");
    assert.equal(d.regulation.home, d.regulation.away);
    assert.notEqual(d.final.home, d.final.away);
    assert.equal(d.periods.home.length, 4 + d.overtimePeriods);
    assert.deepEqual(checkDraw(d), []);
    const mins = d.players.home.reduce((s, p) => s + p.minutes, 0);
    assert.ok(Math.abs(mins - (240 + 25 * d.overtimePeriods)) < 1e-6);
    otSeen += d.overtimePeriods > 1 ? 1 : 0;
  }
  assert.ok(otSeen > 0, "double overtime occurs");
});

test("OVERTIME CAP — never more than OT_CAP periods; a tied last period is redrawn (counted), never left tied", () => {
  const params = { ...V1_PARAMS, TEAM_NOISE_SD: 0, PACE_SD: 0, HCA_POINTS: 0, OT_SCALE: 0.02 }; // λ ≈ 0.25 per period → many tied periods
  const sym = () => MINS.map((_, k) => ({ providerAthleteId: `t${k}`, availability: "active" }));
  const o = game({ eloH: 1500, eloA: 1500, params, rosterH: sym(), rosterA: sym(), simulations: 300 }).out();
  assert.equal(o.sim.overtimeRate, 1);
  assert.ok(o.engine.notes.otCapRedraws > 0, "the cap rule was exercised");
  const prep = prepareGame(game({ eloH: 1500, eloA: 1500, params, rosterH: sym(), rosterA: sym() }).input);
  for (let i = 0; i < 300; i += 1) assert.ok(simulateOneDraw(prep, i).overtimePeriods <= OT_CAP);
});

/* ─────────────── representative samples ─────────────── */
test("REPRESENTATIVE SAMPLES — every one is a real draw: replaying its runIndex reproduces it exactly", () => {
  const { input } = game({ simulations: 2000 });
  const o = simulateGameV1(input);
  const prep = prepareGame(input);
  const labels = o.representativeSamples.map((s) => s.label);
  assert.deepEqual(labels.slice(0, 4), ["typical", "close", "high", "low"]);
  for (const s of o.representativeSamples) {
    assert.ok(Number.isInteger(s.runIndex) && s.runIndex >= 0 && s.runIndex < 2000);
    assert.ok(typeof s.selectionRule === "string" && s.selectionRule.length > 20);
    const d = simulateOneDraw(prep, s.runIndex);
    assert.deepEqual(s.final, d.final);
    assert.deepEqual(s.periods.map((p) => [p.home, p.away]), d.periods.home.map((h, i) => [h, d.periods.away[i]]));
    assert.deepEqual(s.players.home.map((p) => [p.providerAthleteId, p.pts, p.reb, p.ast, p.threePm, p.twoPm, p.ftm]), d.players.home.map((p) => [p.providerAthleteId, p.pts, p.reb, p.ast, p.threePm, p.twoPm, p.ftm]));
    assert.equal(s.team.home.pts, s.final.home);
  }
  // typical = argmin of the stated rule, recomputed here from fresh replays of every draw
  const ms = [], ts = [];
  for (let i = 0; i < 2000; i += 1) { const d = simulateOneDraw(prep, i); ms.push(d.final.home - d.final.away); ts.push(d.final.home + d.final.away); }
  let best = -1, bs = Infinity;
  for (let i = 0; i < 2000; i += 1) { const v = ((ms[i] - o.sim.margin.p50) / o.sim.margin.sd) ** 2 + ((ts[i] - o.sim.total.p50) / o.sim.total.sd) ** 2; if (v < bs) { bs = v; best = i; } }
  assert.equal(o.representativeSamples[0].runIndex, best);
  // upset present iff the sim underdog wins some draw
  const underdogWins = ms.filter((m) => (o.sim.pHome < 0.5 ? m > 0 : m < 0)).length;
  assert.equal(labels.includes("upset"), underdogWins > 0);
});

test("REPRESENTATIVE SAMPLES — 'upset' is omitted (never invented) when the underdog never wins", () => {
  const o = game({ eloH: 3500, eloA: 500, simulations: 300 }).out();
  assert.equal(o.sim.pHome, 1);
  assert.ok(!o.representativeSamples.some((s) => s.label === "upset"));
});

/* ─────────────── v0 untouched ─────────────── */
test("v0 ENGINE BYTE-IDENTICAL — game-sim.mjs hashes to its origin/main bytes (f0b02a7ff7)", () => {
  const bytes = fs.readFileSync(fileURLToPath(new URL("./game-sim.mjs", import.meta.url)));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), "e88db87224d691e8187d09394a9435bc1b9ebe04bd8129801bdb8cb749d21267");
});

/* ─────────────── family guard ─────────────── */
test("FAMILY v1 — own dir and version, CANDIDATE_SHADOW, v0.2's pool + data rule, its own engine; guard isolates it", () => {
  const f = familySpec("v1");
  assert.equal(f.dir, "experimental-v1");
  assert.equal(f.role, "CANDIDATE_SHADOW");
  assert.equal(f.modelVersion, NBA_SIM_V1_MODEL_VERSION);
  assert.equal(f.poolRule, FAMILIES["v0.2"].poolRule);
  assert.equal(f.dataRule, FAMILIES["v0.2"].dataRule);
  assert.equal(f.engine, "v1");
  assert.equal(familyGuard({ family: "v1", doc: { family: "v1", modelVersion: NBA_SIM_V1_MODEL_VERSION } }).ok, true);
  assert.equal(familyGuard({ family: "v1", doc: { family: "v0.2", modelVersion: FAMILIES["v0.2"].modelVersion } }).reason, "FAMILY_MISMATCH");
  assert.equal(familyGuard({ family: "v0.2", doc: { family: "v1", modelVersion: NBA_SIM_V1_MODEL_VERSION } }).reason, "FAMILY_MISMATCH");
  assert.equal(familyGuard({ family: "v1", doc: { modelVersion: "nba-preseason-experimental-v0" } }).reason, "MODEL_VERSION_MISMATCH");
  assert.equal(familyGuard({ family: "v1", doc: {} }).reason, "UNSTAMPED_NOT_ADOPTABLE");
});

/* ─────────────── leakage ─────────────── */
test("NO LEAKAGE — a box score dated at or after `now` changes nothing", () => {
  const base = JSON.stringify(game().out());
  const future = { ...doc("future", "2026-10-22T00:00Z", 2027, 2), players: doc("future", "2026-10-22T00:00Z", 2027, 2).players.map((p) => ({ ...p, minutes: 48, pts: 90, threePa: 30, threePm: 30, fga: 30, fgm: 30, reb: 40, ast: 40 })) };
  const atNow = { ...future, providerEventId: "atnow", dateUtc: NOW };
  assert.equal(JSON.stringify(game({ boxscores: [...PRIOR, future, atNow] }).out()), base);
  // POSITIVE CONTROL: the same game strictly before now DOES move the output
  const past = { ...future, providerEventId: "past", dateUtc: "2026-10-21T00:00Z" };
  assert.notEqual(JSON.stringify(game({ boxscores: [...PRIOR, past] }).out()), base);
});

/* ─────────────── the v0.2 cold-start zero case ─────────────── */
test("COLD START — a team with 1–2 new-season games: v0's engine on the v0.2 pool scores exactly 0, v1 keeps the prior season", () => {
  const newSeason = [doc("n1", "2026-10-21T00:00Z", 2027, 2), doc("n2", "2026-10-22T00:00Z", 2027, 2)];
  const now = "2026-10-23T12:00:00Z";
  const boxscores = [...PRIOR, ...newSeason];
  // REPRODUCE the v0.2 defect: the minutes model switches to season 2027 (2 games < 3) → no rates → v0 team score 0
  const rosters = { asOf: "2026-10-23T06:00:00Z", capturedAt: "2026-10-23T06:00:00Z", contractVersion: "nba-roster-contract-v1", teams: [TOR, MIA].map((t, i) => ({ providerTeamId: t, state: "CAPTURED", playerCount: 10, capturedAt: "2026-10-23T06:00:00Z", players: MINS.map((_, k) => ({ providerAthleteId: `${i ? "m" : "t"}${k}`, displayName: "x" })) })) };
  const gated = (t) => gatePool({ rosters, providerTeamId: t, boxscores, asOfDateUtc: now, injuries: [], population: "regular" });
  const v0 = simulateGame({ providerEventId: "x", inputAsOf: now, home: { name: "Toronto Raptors", providerTeamId: TOR, rating: { rating: 1500 }, minutes: gated(TOR) }, away: { name: "Miami Heat", providerTeamId: MIA, rating: { rating: 1500 }, minutes: gated(MIA) }, eloWinProbability: 0.5, simulations: 200 });
  assert.equal(v0.sim.home.mean, 0, "the v0.2 defect reproduces: v0 engine scores 0");
  assert.equal(v0.sim.away.mean, 0);
  // v1 on the same as-of data
  const o = game({ boxscores, now, simulations: 600 }).out();
  assert.ok(o.sim.home.mean > 85 && o.sim.away.mean > 85, `v1 scores are sensible: ${o.sim.home.mean}-${o.sim.away.mean}`);
  assert.ok(o.sim.home.mean < 150 && o.sim.away.mean < 150);
  const index = indexBoxscores(boxscores);
  const prof = playerProfile(index, "t0", { asOf: now, league: leagueMeans(index, { asOf: now }) });
  assert.equal(prof.gamesThisSeason, 2);
  assert.equal(prof.gamesPriorSeason, 30, "the prior season is blended in, never dropped");
  assert.ok(prof.rates.pts > 0.3, "rates exist (not null) after 2 new-season games");
  assert.ok(o.players.home[0].pts.p50 > 5);
});

/* ─────────────── availability and thin pools ─────────────── */
test("AVAILABILITY — Out excluded and listed; Day-To-Day simulated with injuryStatus recorded; < 5 players REFUSED", () => {
  const rows = roster("t"); rows[0] = { ...rows[0], availability: "out", injuryStatus: "Out" };
  const o = game({ rosterH: rows }).out();
  assert.ok(!o.players.home.some((p) => p.providerAthleteId === "t0"));
  assert.equal(o.assumptions.availability.home.excludedOut[0].providerAthleteId, "t0");
  assert.equal(o.players.home.find((p) => p.providerAthleteId === "t3").injuryStatus, "Day-To-Day");
  const thin = roster("t").slice(0, 4);
  assert.throws(() => game({ rosterH: thin }).out(), /REFUSED: home side has 4 simulable players/);
  const rookie = [...roster("t"), { providerAthleteId: "rookie", name: "Rookie", availability: "active" }];
  const r = game({ rosterH: rookie }).out();
  assert.equal(r.assumptions.availability.home.excludedInsufficientHistory[0].providerAthleteId, "rookie", "no history → listed, not simulated, never zero-filled");
});

/* ─────────────── through the artifact ─────────────── */
test("ARTIFACT — family v1 builds through buildForecastArtifact with the v1 engine stamped; v0.2 on the same inputs is unchanged", () => {
  const rosters = { asOf: "2026-10-21T06:00:00Z", capturedAt: "2026-10-21T06:00:00Z", contractVersion: "nba-roster-contract-v1", teams: [TOR, MIA].map((t, i) => ({ providerTeamId: t, state: "CAPTURED", playerCount: 10, capturedAt: "2026-10-21T06:00:00Z", players: MINS.map((_, k) => ({ providerAthleteId: `${i ? "m" : "t"}${k}`, displayName: "x", position: "G" })) })) };
  const sched = [{ providerEventId: "401909088", dateUtc: "2026-10-21T23:00Z", seasonType: 2, neutralSite: false, home: { abbr: "TOR", name: "Toronto Raptors", providerTeamId: TOR }, away: { abbr: "MIA", name: "Miami Heat", providerTeamId: MIA } }];
  const corpus = PRIOR.map((b, i) => ({ providerEventId: b.providerEventId, season: 2026, phase: 2, dateUtc: b.dateUtc, home: "Toronto Raptors", away: "Miami Heat", ftHome: 100 + (i % 5), ftAway: 101, neutralSite: false }));
  const base = { date: "2026-10-21", now: NOW, scheduleRows: sched, corpusRows: corpus, boxscores: PRIOR, injuries: [{ providerTeamId: TOR, athleteId: "t1", status: "Out" }, { providerTeamId: TOR, athleteId: "t2", status: "Day-To-Day" }], rosters, simulations: 300 };
  const { artifact, manifest } = buildForecastArtifact({ ...base, family: "v1" });
  assert.equal(artifact.modelVersion, NBA_SIM_V1_MODEL_VERSION);
  assert.equal(artifact.simEngineVersion, NBA_SIM_V1_MODEL_VERSION);
  assert.equal(artifact.role, "CANDIDATE_SHADOW");
  assert.equal(manifest.gamesForecast, 1);
  const f = artifact.games[0].forecast;
  assert.equal(f.modelVersion, NBA_SIM_V1_MODEL_VERSION);
  assert.equal(f.invariants.violations, 0);
  assert.ok(!f.players.home.some((p) => p.providerAthleteId === "t1"), "Out excluded");
  assert.equal(f.players.home.find((p) => p.providerAthleteId === "t2").injuryStatus, "Day-To-Day");
  assert.ok(f.publishedSide, "winner side frozen beside the probabilities");
  const v02a = buildForecastArtifact({ ...base, family: "v0.2" }).artifact;
  const v02b = buildForecastArtifact({ ...base, family: "v0.2" }).artifact;
  assert.equal(v02a.simEngineVersion, "nba-preseason-experimental-v0");
  assert.equal(JSON.stringify(v02a), JSON.stringify(v02b));
});
