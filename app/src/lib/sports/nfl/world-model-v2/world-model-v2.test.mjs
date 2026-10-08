/**
 * World Model V2 guards: every world is one consistent game (the engine throws otherwise), runs are reproducible,
 * the win chance is counted from the worlds, the committed artifacts are showable and carry no unsupported family,
 * and the Top boards are exactly the per-game artifact numbers with uncleared players and started games left out.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { prepareSide, simulateGame, scoringTables, composeRegulation, composeOvertime, distribution, mulberry32 } from "./engine.mjs";
import { topBoards, BOARD_FAMILIES, UNSUPPORTED } from "./artifact.mjs";
import { readWorldModelArtifacts, isShowable } from "./read.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const INPUTS = path.join(ROOT, "data/internal/nfl/world-model-v2/inputs");
const packet = JSON.parse(fs.readFileSync(path.join(INPUTS, fs.readdirSync(INPUTS).filter((f) => f.endsWith(".json")).sort().at(-1)), "utf8"));
const artifacts = readWorldModelArtifacts(path.join(APP, "public"));

function sidesFor(ev) {
  const heads = { mMean: 3, mSigma: 13, tMean: 45, tSigma: 13 };
  const sides = [ev.away, ev.home].map((abbr, si) => prepareSide({
    pool: packet.teams[abbr].pool, isActive: (p) => Boolean(p.espnId) && Object.values(p.shares).some((s) => s > 0.03), volumeBase: ev.volumeBase[abbr],
    marginTeam: si === 1 ? heads.mMean : -heads.mMean, teamTdForm: packet.teams[abbr].teamTdForm, params: packet.params,
  }));
  return { sides, heads };
}

test("every simulated world is one consistent game, and the run is reproducible", () => {
  const ev = packet.games[0];
  const { sides, heads } = sidesFor(ev);
  const a = simulateGame({ sides, heads, params: packet.params, tables: packet.tables, runs: 3000, seed: "test|a" });
  const b = simulateGame({ sides, heads, params: packet.params, tables: packet.tables, runs: 3000, seed: "test|a" });
  const c = simulateGame({ sides, heads, params: packet.params, tables: packet.tables, runs: 3000, seed: "test|b" });
  assert.equal(a.diag.teamWorldsChecked, 6000, "both teams checked in every world");
  assert.deepEqual(Array.from(a.game.home), Array.from(b.game.home), "same seed, same worlds");
  assert.deepEqual(Array.from(a.team[0].players[0].recYds), Array.from(b.team[0].players[0].recYds));
  assert.notDeepEqual(Array.from(a.game.home), Array.from(c.game.home), "a different seed is a different run");
  for (let r = 0; r < 3000; r += 1) {
    for (const [si, pts] of [[0, a.game.away[r]], [1, a.game.home[r]]]) {
      const t = a.team[si];
      assert.equal(6 * (t.offTd[r] + t.nonOffTd[r]) + t.xp[r] + 2 * t.two[r] + 3 * t.fg[r] + 2 * t.saf[r], pts, "scoring adds up to the score");
      assert.equal(t.rushTd[r] + t.recTd[r], t.offTd[r]);
      let rec = 0; let recYds = 0; let passYds = 0; let cmp = 0; let rushTd = 0; let recTd = 0; let passTd = 0;
      for (const p of t.players) {
        rec += p.rec[r]; recYds += p.recYds[r]; passYds += p.passYds[r]; cmp += p.completions[r]; rushTd += p.rushTd[r]; recTd += p.recTd[r]; passTd += p.passTd[r];
        assert.ok(p.recTd[r] <= p.rec[r] && p.rushTd[r] <= p.carries[r] && p.passTd[r] <= p.completions[r] && p.rec[r] <= p.targets[r]);
      }
      assert.ok(rec <= t.completions[r] && cmp <= t.completions[r] && recTd <= t.recTd[r] && rushTd <= t.rushTd[r] && passTd <= t.recTd[r], "named players never exceed the team");
      assert.ok(recYds <= t.passYds[r] + 1e-3 && passYds <= t.passYds[r] + 1e-3);
    }
    if (a.game.ot[r]) assert.equal(a.game.regHome[r], a.game.regAway[r], "only a game level after regulation goes to overtime");
    else assert.notEqual(a.game.home[r], a.game.away[r], "a game without overtime is never level");
  }
});

test("the win chance is counted from the worlds, overtime included", () => {
  const ev = packet.games[0];
  const { sides, heads } = sidesFor(ev);
  const s = simulateGame({ sides, heads, params: packet.params, tables: packet.tables, runs: 4000, seed: "test|win" });
  let h = 0; let w = 0; let t = 0; let ot = 0;
  for (let r = 0; r < 4000; r += 1) { if (s.game.home[r] > s.game.away[r]) h += 1; else if (s.game.home[r] < s.game.away[r]) w += 1; else t += 1; ot += s.game.ot[r]; }
  assert.equal(h + w + t, 4000);
  assert.equal(ot, s.diag.levelAfterRegulation);
  assert.equal(t, s.diag.levelAfterOvertime, "a final tie happens only after overtime");
  assert.ok(t / 4000 < 0.01 && ot / 4000 > 0.01 && ot / 4000 < 0.08, `overtime ${ot / 4000}, ties ${t / 4000}`);
});

test("scoring decompositions: every regulation score has one, overtime points are touchdowns or kicks", () => {
  const T = scoringTables(packet.tables, packet.params.tdTableMinObs);
  const rng = mulberry32(7);
  for (let pts = 0; pts <= 70; pts += 1) {
    if (pts === 1) continue;
    const c = composeRegulation(rng, T, pts, 0);
    assert.ok(c, `${pts} points with no offensive TD`);
    const [n, x, two, f, s] = c.parts;
    assert.equal(6 * n + x + 2 * two + 3 * f + 2 * s, pts);
  }
  for (const k of Object.keys(packet.tables.overtime.outcomes)) for (const p of k.split(",").map(Number)) { const o = composeOvertime(p); assert.equal(6 * o.td + o.xp + 2 * o.two + 3 * o.fg + 2 * o.saf, p); }
});

test("distribution summaries are ordered and ladders are monotone", () => {
  const d = distribution(Float32Array.from({ length: 1000 }, (_, i) => i % 97), [10, 50, 90]);
  assert.ok(d.p10 <= d.p25 && d.p25 <= d.median && d.median <= d.p75 && d.p75 <= d.p90);
  assert.ok(d.atLeast[10] >= d.atLeast[50] && d.atLeast[50] >= d.atLeast[90]);
});

test("committed artifacts are showable, frozen before kickoff and publish no unsupported family", () => {
  assert.ok(artifacts.length > 0, "at least one World Model V2 artifact");
  for (const a of artifacts) {
    assert.ok(isShowable(a));
    assert.ok(Date.parse(a.run.generatedAt) < Date.parse(a.identity.kickoffUtc), "generated before kickoff");
    assert.ok(a.run.runs >= 10000);
    const wp = a.game.winProbability;
    assert.ok(Math.abs(wp.home + wp.away + wp.tie - 1) < 2e-4, "win chances are shares of the same worlds");
    assert.equal(a.game.disagreement.winProbabilityHome.worlds, wp.home);
    assert.equal(a.game.disagreement.winProbabilityHome.forecastOfRecord, a.forecastOfRecord.winProbability.home, "the forecast of record is shown as itself, not copied into the worlds");
    assert.equal(a.status.productionPromoted.value, false);
    assert.equal(a.status.forwardEvaluated.value, false);
    assert.deepEqual(a.unsupported.map((u) => u.family), UNSUPPORTED.map((u) => u.family));
    const text = JSON.stringify(a.players);
    assert.ok(!/anytime|touchdownProbability|passingTd/i.test(text), "no touchdown marginals in player distributions");
    for (const p of a.players) assert.ok(["ACTIVE", "QUESTIONABLE", "DOUBTFUL"].includes(p.availability), `${p.name} simulated while ${p.availability}`);
    for (const x of a.availability.filter((v) => v.state === "OUT")) {
      assert.equal(x.simulated, false);
      assert.ok(!a.players.some((p) => p.playerId === x.playerId), `${x.name} is Out and has no distribution`);
    }
    for (const w of a.sampledWorlds) {
      for (const s of [w.away, w.home]) {
        const sc = s.scoring;
        assert.equal(6 * (sc.offensiveTd + sc.nonOffensiveTd) + sc.extraPoints + 2 * sc.twoPointConversions + 3 * sc.fieldGoals + 2 * sc.safeties, s.points, "a sampled world's scoring adds up");
        const named = s.players.reduce((t, p) => t + p.line.passingTd, 0);
        assert.ok(named <= sc.receivingTd, "passing TDs credited to passers never exceed receiving TDs");
      }
      assert.equal(w.winner, w.home.points > w.away.points ? a.identity.home : w.away.points > w.home.points ? a.identity.away : "TIE");
    }
  }
});

test("Top boards are the per-game artifact numbers, cleared players only, at most ten rows", () => {
  const now = artifacts.length ? new Date(Date.parse(artifacts[0].identity.kickoffUtc) - 60_000).toISOString() : new Date().toISOString();
  const { boards } = topBoards(artifacts, { now });
  for (const { key } of BOARD_FAMILIES) {
    const rows = boards[key];
    assert.ok(rows.length <= 10);
    rows.forEach((r, i) => {
      assert.equal(r.rank, i + 1);
      if (i) assert.ok(rows[i - 1].mean >= r.mean, "ranked by simulated average");
      const a = artifacts.find((x) => x.identity.providerEventId === r.providerEventId);
      const p = a.players.find((x) => x.playerId === r.playerId);
      assert.equal(p.availability, "ACTIVE", `${r.name} on a board while ${p.availability}`);
      assert.deepEqual({ mean: r.mean, median: r.median, p10: r.p10, p90: r.p90 }, { mean: p.families[key].mean, median: p.families[key].median, p10: p.families[key].p10, p90: p.families[key].p90 }, "board number = game-page number");
      assert.equal(r.simulationId, a.simulationId);
    });
  }
  // a started game drops off every board
  if (artifacts.length) {
    const first = artifacts[0];
    const after = topBoards(artifacts, { now: new Date(Date.parse(first.identity.kickoffUtc) + 1000).toISOString() });
    for (const { key } of BOARD_FAMILIES) assert.ok(!after.boards[key].some((r) => r.providerEventId === first.identity.providerEventId));
  }
  // fewer than ten rather than fill
  const one = artifacts.slice(0, 1);
  const small = topBoards(one, { now: "2000-01-01T00:00:00Z" });
  for (const { key } of BOARD_FAMILIES) assert.equal(small.boards[key].length, Math.min(10, one[0]?.players.filter((p) => p.availability === "ACTIVE" && p.families[key]).length ?? 0));
});

test("the forecast of record keeps its label; the world model page is linked, never substituted", () => {
  const game = fs.readFileSync(path.join(APP, "src/app/nfl/game/[eventId]/page.tsx"), "utf8");
  assert.ok(game.includes("<WorldModelV2Link eventId={f.providerEventId} />"));
  const link = fs.readFileSync(path.join(APP, "src/components/nfl/world-model-v2-link.tsx"), "utf8");
  assert.ok(/experimental · separate from this forecast/.test(link));
  const report = fs.readFileSync(path.join(APP, "src/components/nfl/world-model-v2-report.tsx"), "utf8");
  assert.ok(report.includes("not the forecast of record") && report.includes("forecast of record"));
  assert.ok(!/anytime_td\b.*probability\s*\}/.test(report));
});

test("the NFL hub leads to World Model V2, worded as experimental and not the forecast of record", () => {
  const hub = fs.readFileSync(path.join(APP, "src/app/nfl/page.tsx"), "utf8");
  assert.ok(hub.includes("<WorldModelV2HubCard />"), "hub renders the World Model V2 entry");
  const card = fs.readFileSync(path.join(APP, "src/components/nfl/world-model-v2-hub-card.tsx"), "utf8");
  assert.ok(card.includes("experimental · not the forecast of record") && card.includes("the Game Time Forecast stays the forecast of record"));
  assert.ok(card.includes('href="/nfl/world-model/"') && card.includes("readWorldModelArtifacts"), "links the boards built from the same artifacts");
  assert.ok(/kickoffUtc\) > now/.test(card) && card.includes("return null"), "renders nothing when no upcoming game has a simulation");
});
