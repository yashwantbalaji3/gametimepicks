/**
 * nba-possession-sim-v0 guards: every draw passes the checker, the box score is exactly the fold of the event log,
 * minutes = 240 + 25·OT, five on court, determinism / replay, a mutation probe per invariant, the simulate-level throw,
 * PRA from the same draw, late fouls, foul-outs, no leakage, and the research boundary (nothing outside the research
 * folder imports the prototype). NBA RESEARCH PROTOTYPE · PRIVATE_RESEARCH.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nba/research/possession-sim/possession-sim.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { indexBoxscores, leagueMeans, buildSideProfile } from "../../sim-v1-profile.mjs";
import { indexExtended, leagueExtended, buildPossessionSide, derivedTeamGame } from "./profile-ext.mjs";
import { preparePossessionGame, simulatePossessionDraw, solveGammaScale, cappedGammaMean } from "./engine.mjs";
import { checkPossessionDraw } from "./invariants.mjs";
import { foldEvents, formatClock } from "./events.mjs";
import { simulatePossessionGame } from "./simulate.mjs";
import { POSSESSION_PARAMS, POSSESSION_SIM_VERSION, DATA_CLASS, PRODUCT_ELIGIBLE } from "./params.mjs";

/* ─────────────── fixture: two teams, 30 prior games with full stat lines ─────────────── */
const TOR = "28", MIA = "14";
function line(id, team, minutes, k) {
  const threePa = Math.round(minutes * (0.1 + 0.01 * (k % 5))), threePm = Math.round(threePa * 0.36);
  const twoPa = Math.round(minutes * 0.25), twoPm = Math.round(twoPa * 0.52);
  const fta = Math.round(minutes * 0.1), ftm = Math.round(fta * 0.78);
  const oreb = Math.round(minutes * 0.04), dreb = Math.round(minutes * (0.1 + 0.02 * (k % 3)));
  return { providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter: k < 5, didNotPlay: false, dnpReason: null, minutes, pts: 3 * threePm + 2 * twoPm + ftm, fgm: threePm + twoPm, fga: threePa + twoPa, threePm, threePa, ftm, fta, oreb, dreb, reb: oreb + dreb, ast: Math.round(minutes * (0.06 + 0.02 * (k % 4))), tov: Math.round(minutes * 0.05), stl: Math.round(minutes * 0.03), blk: Math.round(minutes * 0.02 * (k % 2)), pf: Math.round(minutes * 0.06) };
}
const MINS = [36, 34, 32, 30, 28, 24, 20, 16, 12, 8];
const teamLines = (team, prefix, shift = 0) => MINS.map((m, k) => line(`${prefix}${k}`, team, Math.max(1, m + ((shift + k) % 3) - 1), k));
const doc = (id, dateUtc, season, phase, shift = 0) => ({ schemaVersion: 1, providerEventId: id, season, phase, dateUtc, boxscoreAvailable: true, teams: [{ providerTeamId: TOR, homeAway: "home" }, { providerTeamId: MIA, homeAway: "away" }], players: [...teamLines(TOR, "t", shift), ...teamLines(MIA, "m", shift + 1)] });
const PRIOR = Array.from({ length: 30 }, (_, g) => doc(`p${g}`, new Date(Date.UTC(2026, 0, 5 + g * 3, 0)).toISOString().replace(".000Z", "Z"), 2026, 2, g));
const NOW = "2026-10-21T12:00:00Z";
const FITTED = { theta: POSSESSION_PARAMS.AND_ONE_PER_FGM, tau: POSSESSION_PARAMS.THREE_SHOT_TRIPS_PER_MIN };

function inputs({ boxscores = PRIOR, now = NOW, params = POSSESSION_PARAMS, simulations = 300, seed = null } = {}) {
  const v1 = indexBoxscores(boxscores), ext = indexExtended(boxscores);
  const leagueV1 = leagueMeans(v1, { asOf: now });
  const leagueExt = leagueExtended(ext, { asOf: now, fitted: FITTED });
  const side = (teamId, prefix) => buildPossessionSide(ext, { v1Side: buildSideProfile(v1, { teamId, rosterRows: MINS.map((_, k) => ({ providerAthleteId: `${prefix}${k}`, availability: "unknown" })), asOf: now, league: leagueV1 }), asOf: now, leagueExt, fitted: FITTED });
  return { providerEventId: "401909088", inputAsOf: now, home: { providerTeamId: TOR, side: side(TOR, "t") }, away: { providerTeamId: MIA, side: side(MIA, "m") }, leagueV1, leagueExt, params, simulations, seed };
}
const INPUT = inputs();
const PREP = preparePossessionGame(INPUT);
const has = (v, tag) => v.some((x) => x.startsWith(tag));

test("labels — research version, PRIVATE_RESEARCH, productEligible false", () => {
  assert.equal(POSSESSION_SIM_VERSION, "nba-possession-sim-v0");
  assert.equal(DATA_CLASS, "PRIVATE_RESEARCH");
  assert.equal(PRODUCT_ELIGIBLE, false);
  const o = simulatePossessionGame({ ...INPUT, simulations: 20 });
  assert.equal(o.dataClass, "PRIVATE_RESEARCH"); assert.equal(o.productEligible, false);
});

test("EVERY DRAW passes all invariants; the box score is exactly the fold of the event log and equals the engine ledger", () => {
  for (let i = 0; i < 400; i += 1) {
    const d = simulatePossessionDraw(PREP, i);
    assert.deepEqual(checkPossessionDraw(d, PREP.rosters), [], `draw ${i}`);
    const again = foldEvents(d.events, PREP.rosters);
    assert.deepEqual(again, d.box, `draw ${i}: box ≠ fold(events)`);
    PREP.rosters.forEach((ids, t) => ids.forEach((id, j) => assert.deepEqual(d.ledger[t][j], { ...d.box.players[t].get(id) }, `draw ${i} ${id}: ledger ≠ fold`)));
  }
  const o = simulatePossessionGame({ ...INPUT, simulations: 300 });
  assert.equal(o.invariants.checkedDraws, 300);
  assert.equal(o.invariants.violations, 0);
});

test("MINUTES = 240 + 25·OT per team, FIVE ON COURT, and overtime is played to a decision (an OT draw is found and checked)", () => {
  let otDraw = null;
  for (let i = 0; i < 6000 && !otDraw; i += 1) { const d = simulatePossessionDraw(PREP, i); if (d.overtimePeriods > 0) otDraw = d; }
  assert.ok(otDraw, "an overtime draw exists in 6000 draws");
  assert.deepEqual(checkPossessionDraw(otDraw, PREP.rosters), []);
  const ot = otDraw.overtimePeriods;
  for (let t = 0; t < 2; t += 1) {
    const ds = [...otDraw.box.players[t].values()].reduce((s, l) => s + l.ds, 0);
    assert.equal(ds / 600, 240 + 25 * ot);
    assert.equal(otDraw.periods[t].length, 4 + ot);
  }
  const reg = [0, 1].map((t) => otDraw.periods[t].slice(0, 4).reduce((a, b) => a + b, 0));
  assert.equal(reg[0], reg[1], "regulation ended tied");
  assert.notEqual(otDraw.final[0], otDraw.final[1]);
  const otStarts = otDraw.events.filter((e) => e.type === "period_start" && e.q > 4);
  assert.equal(otStarts.length, ot);
  assert.ok(otStarts.every((e) => e.c === 3000), "OT periods are 5:00");
  // five on court at every event: replay the lineups
  const on = [new Set(), new Set()];
  for (const e of otDraw.events) {
    if (e.type === "period_start") e.lineups.forEach((l, t) => { on[t] = new Set(l); });
    if (e.type === "sub") { on[e.team].delete(e.out); on[e.team].add(e.in); }
    assert.ok(on[0].size === 5 && on[1].size === 5, `five on court per team at event ${e.i}`);
  }
});

test("DETERMINISM — a draw replays from (seed, runIndex); different runIndex differ; explicit seed differs from default", () => {
  const a = simulatePossessionDraw(PREP, 7), b = simulatePossessionDraw(preparePossessionGame(INPUT), 7);
  assert.deepEqual(a.events, b.events);
  assert.notDeepEqual(simulatePossessionDraw(PREP, 8).events, a.events);
  const c = simulatePossessionDraw(preparePossessionGame({ ...INPUT, seed: "abc" }), 7);
  assert.notDeepEqual(c.events, a.events);
  const o1 = simulatePossessionGame({ ...INPUT, simulations: 50 }), o2 = simulatePossessionGame({ ...INPUT, simulations: 50 });
  assert.deepEqual(o1, o2);
});

test("EVENT LOG — vocabulary, providerAthleteId-only player refs, clocks, and the summary sample replays its draw", () => {
  const d = simulatePossessionDraw(PREP, 3);
  const ids = new Set(PREP.rosters.flat());
  for (const e of d.events) for (const k of ["player", "assist", "block", "steal", "on", "in", "out"]) if (e[k] != null) assert.ok(ids.has(e[k]), `${e.type}.${k} ${e[k]} is a roster providerAthleteId`);
  const types = new Set(d.events.map((e) => e.type));
  for (const t of ["period_start", "jump_ball", "shot", "free_throw", "rebound", "turnover", "foul", "sub", "period_end", "game_end"]) assert.ok(types.has(t), `log has ${t}`);
  assert.equal(formatClock(7200), "12:00"); assert.equal(formatClock(455), "45.5");
  const o = simulatePossessionGame({ ...INPUT, simulations: 10, keepSampleRunIndex: 3 });
  assert.equal(o.sample.box.final.home, d.final[0]); assert.equal(o.sample.events.length, d.events.length);
});

/* ─────────────── mutation probes ─────────────── */
function cleanDraw() {
  for (let i = 0; i < 200; i += 1) {
    const d = simulatePossessionDraw(PREP, i);
    if (d.events.some((e) => e.type === "shot" && e.made && e.assist) && d.events.some((e) => e.type === "turnover" && e.steal)) return d;
  }
  throw new Error("no rich draw");
}
test("MUTATION PROBES — each invariant catches its own violation (a clean draw passes)", () => {
  const clean = cleanDraw();
  assert.deepEqual(checkPossessionDraw(clean, PREP.rosters), [], "POSITIVE CONTROL");
  const probe = (tag, mutate) => { const d = structuredClone(clean); mutate(d); const v = checkPossessionDraw(d, PREP.rosters); assert.ok(has(v, tag), `${tag} probe not caught: ${JSON.stringify(v.slice(0, 4))}`); };
  const idx = (d, f) => d.events.findIndex(f);
  const benchOf = (d, i, t) => { const on = new Set(); for (const e of d.events.slice(0, i + 1)) { if (e.type === "period_start") { on.clear(); e.lineups[t].forEach((x) => on.add(x)); } if (e.type === "sub" && e.team === t) { on.delete(e.out); on.add(e.in); } } return PREP.rosters[t].find((x) => !on.has(x)); };
  probe("P1", (d) => { d.periods[0][0] += 2; });                                    // reported linescore ≠ fold
  probe("P1", (d) => { d.final[0] += 1; });                                         // final ≠ Σ
  probe("P2", (d) => { const e = d.events.find((x) => x.type === "period_start"); e.lineups[0][1] = e.lineups[0][0]; }); // 4 distinct → minutes short
  probe("P3", (d) => { const i = idx(d, (e) => e.type === "sub"); d.events[i].out = benchOf(d, i - 1, d.events[i].team); });
  probe("P3", (d) => { const i = idx(d, (e) => e.type === "shot"); d.events[i].player = benchOf(d, i, d.events[i].team); });
  probe("P3", (d) => { const e = d.events.find((x) => x.type === "shot" && x.made && x.assist); e.assist = e.player; });
  probe("P4", (d) => { const l = [...d.box.players[0].values()].find((x) => x.threePm > 0); l.threePa = l.threePm - 1; });
  probe("P4", (d) => { const l = [...d.box.players[0].values()].find((x) => x.ftm > 0) ?? [...d.box.players[1].values()].find((x) => x.ftm > 0); l.fta = l.ftm - 1; });
  probe("P5", (d) => { const e = d.events.find((x) => x.type === "shot" && !x.made); e.assist = d.events.find((x) => x.type === "shot" && x.made && x.assist).assist; });
  probe("P5", (d) => { d.box.team[1].stl = d.box.team[0].tov + 1; });
  probe("P6", (d) => { d.final[1] = d.final[0]; });
  probe("P7", (d) => { const i = idx(d, (e) => e.type === "shot" && e.q === 1); d.events[i].c = 7300; });
  probe("P7", (d) => { d.events.pop(); });
  probe("P8", (d) => { const e = d.events.find((x) => x.type === "turnover"); e.s = [e.s[0] + 1, e.s[1]]; });
  probe("P9", (d) => { const i = idx(d, (x, k) => x.type === "shot" && d.events[k - 1]?.type === "rebound" && d.events[k - 1].kind === "offensive"); const e = d.events[i]; e.poss = 1 - e.poss; e.team = 1 - e.team; }); // possession flips after an OFFENSIVE rebound
  probe("P9", (d) => { const i = idx(d, (e) => e.type === "turnover" && e.q === 1); const j = i + 1 + d.events.slice(i + 1).findIndex((e) => e.type === "shot"); for (let k = i + 1; k <= j; k += 1) d.events[k].poss = d.events[i].poss; d.events[j].team = d.events[i].poss; });
  probe("P10", (d) => { const f = d.events.find((x) => x.type === "foul"); for (let k = 0; k < 6; k += 1) d.events.splice(d.events.length - 2, 0, { ...f, i: 0, q: d.events[d.events.length - 2].q, c: 0, s: [...d.events[d.events.length - 2].s] }); d.events.forEach((e, k) => { e.i = k; }); });
  probe("P11", (d) => { d.ledger[0][0].pts += 1; });
  probe("P11", (d) => { const m = d.box.players[1]; const k = m.keys().next().value; m.get(k).ds += 10; });
});

test("simulatePossessionGame THROWS on a violating draw (test seam), never averages it in", () => {
  assert.throws(() => simulatePossessionGame({ ...INPUT, simulations: 20, __testMutateDraw: (d, i) => { if (i === 11) d.final[0] += 1; } }), /INVARIANT VIOLATION .* draw 11: P1/);
});

test("PRA / PA / PR come from the SAME draw (recomputed from draws)", () => {
  const N = 120;
  const o = simulatePossessionGame({ ...INPUT, simulations: N });
  const id = PREP.rosters[0][0];
  const pra = [];
  for (let i = 0; i < N; i += 1) { const l = simulatePossessionDraw(PREP, i).box.players[0].get(id); if (l.ds > 0) pra.push(l.pts + l.reb + l.ast); }
  pra.sort((a, b) => a - b);
  const at = (q) => pra[Math.min(pra.length - 1, Math.max(0, Math.ceil(q * pra.length) - 1))];
  const p = o.players.home.find((x) => x.providerAthleteId === id);
  assert.equal(p.pra.p50, at(0.5)); assert.equal(p.pra.p90, at(0.9));
  assert.ok(Math.abs(p.pra.mean - (p.pts.mean + p.reb.mean + p.ast.mean)) < 1e-3);
});

test("LATE FOULS are explicit: off at W = 0; with a window they appear as late_intentional fouls followed by two free throws", () => {
  const off = simulatePossessionGame({ ...INPUT, simulations: 100, params: { ...POSSESSION_PARAMS, LATE_FOUL_WINDOW_DS: 0, LATE_FOUL_MAX_DEFICIT: 0 } });
  assert.equal(off.engine.notes.lateFouls, 0);
  const prep = preparePossessionGame({ ...INPUT, params: { ...POSSESSION_PARAMS, LATE_FOUL_WINDOW_DS: 1200, LATE_FOUL_MAX_DEFICIT: 9 } });
  let seen = 0;
  for (let i = 0; i < 100; i += 1) {
    const d = simulatePossessionDraw(prep, i);
    assert.deepEqual(checkPossessionDraw(d, prep.rosters), []);
    d.events.forEach((e, k) => {
      if (e.type !== "foul" || e.kind !== "late_intentional") return;
      seen += 1;
      assert.ok(e.q >= 4 && e.c <= 1200);
      assert.ok(e.s[e.poss] - e.s[1 - e.poss] >= 1 && e.s[e.poss] - e.s[1 - e.poss] <= 9, "fouling team trails by 1..D");
      const fts = d.events.slice(k + 1).filter((x) => x.type === "free_throw").slice(0, 2);
      assert.equal(fts[0].of, 2);
    });
  }
  assert.ok(seen > 0, "late fouls occur");
});

test("FOUL-OUTS: with inflated foul rates players reach 6 PF, are replaced and never return; every draw still passes", () => {
  const hot = structuredClone(INPUT);
  for (const s of [hot.home.side, hot.away.side]) for (const p of s.players) p.ext.pf *= 4;
  const prep = preparePossessionGame(hot);
  let outs = 0;
  for (let i = 0; i < 60; i += 1) {
    const d = simulatePossessionDraw(prep, i);
    assert.deepEqual(checkPossessionDraw(d, prep.rosters), [], `draw ${i}`);
    outs += d.notes.fouledOut;
  }
  assert.ok(outs > 0);
});

test("NO LEAKAGE — a box score at/after the as-of instant changes nothing", () => {
  const late = [...PRIOR, doc("late1", "2026-10-21T12:00:00Z", 2027, 2, 5), doc("late2", "2026-11-01T00:00:00Z", 2027, 2, 9)];
  const a = simulatePossessionGame({ ...INPUT, simulations: 40 });
  const b = simulatePossessionGame({ ...inputs({ boxscores: late }), simulations: 40 });
  assert.deepEqual(a.sim, b.sim);
});

test("helpers — capped-gamma scale solves the mean; derived team-game segments", () => {
  const s = solveGammaScale(1.3, 123, 240);
  assert.ok(Math.abs(cappedGammaMean(1.3, s, 240) - 123) < 1e-6);
  const z = { fga: 88, fgm: 42, fta: 22, tov: 13, pf: 19, minutes: 240 };
  const x = derivedTeamGame(z, z, FITTED);
  assert.ok(Math.abs(x.segments - (88 + 13 + x.trips2 + x.trips3 + x.nonFtFoulsDrawn)) < 1e-9);
  assert.ok(Math.abs(2 * x.trips2 + 3 * x.trips3 + x.andOnes - 22) < 1e-9, "FTA = 2·trips2 + 3·trips3 + and-ones");
});

/* ─────────────── boundary ─────────────── */
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(m?js|tsx?|ya?ml)$/.test(e.name)) out.push(p);
  }
  return out;
}
test("BOUNDARY — nothing outside the research folders imports the prototype (no route, producer, board, workflow, snapshot)", () => {
  const root = path.resolve(APP, "..");
  const files = [...walk(path.join(APP, "src")), ...walk(path.join(APP, "scripts")), ...(fs.existsSync(path.join(root, ".github")) ? walk(path.join(root, ".github")) : [])];
  // THEATER EXCEPTION (Lane C 2026-10-21, founder decision NBA-CC: the Theater may play a different engine than the
  // official forecast): the Theater's possession playback library + its offline generator may read the engine. Routes
  // import only that library, never the engine (possession-theater.test.mjs › BOUNDARY keeps products/boards/snapshot out).
  const theater = (f) => f.includes(`${path.sep}simulation-theater${path.sep}nba${path.sep}possession${path.sep}`) || f.endsWith(`${path.sep}build-theater-possession-runs.mjs`);
  const allowed = (f) => theater(f) || f.includes(`${path.sep}research${path.sep}possession-sim${path.sep}`) || f.endsWith(`${path.sep}fit-possession-sim-v0.mjs`) || f.endsWith(`${path.sep}evaluate-possession-sim-v0.mjs`) || f.endsWith(`${path.sep}research${path.sep}paired-metrics.mjs`);
  const offenders = files.filter((f) => !allowed(f) && /possession-sim/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(offenders.map((f) => path.relative(root, f)), []);
});
