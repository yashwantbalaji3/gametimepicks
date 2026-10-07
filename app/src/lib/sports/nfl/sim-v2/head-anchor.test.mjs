/**
 * NS-1 · Sim V2 anchored to the validated heads (architecture audit §8A, founder F-5). SHADOW.
 * The solver hits both head targets on the batch it reports, refuses what it cannot reach, recovers the head values
 * exactly from the forecast of record, and leaves the median-anchored receipt untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { compileParams, prepareTeamPlayers } from "./engine.mjs";
import { batchMoments, calibrate, calibrateToHeads, HEAD_ANCHOR_TOLERANCE, runBatch } from "./simulate.mjs";
import { buildNflSimulationReceipt } from "./receipt.mjs";
import { makeTotalsHeadTarget, winHeadTarget } from "../../../../../scripts/nfl/build-nfl-sim-v2-shadow.mjs";
import {
  totalsV3Gate, gamesFromTable, TOTALS_REPLAY_RECEIPT, TOTALS_REPLAY_PREREG, GAMES_HISTORY, EFFICIENCY_HISTORY, CURRENT_SEASON,
} from "../totals-play-efficiency.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const compiled = compileParams(readJson("data/internal/research/nfl/sim-v2/drive-params-2015-2025.json"));
const team = (tag) => ({
  players: [
    { playerId: `${tag}-qb`, name: "QB", position: "QB", passShare: 1, targetShare: 0, carryShare: 0.12, catchRate: null, ypr: null, ypc: 4.8 },
    { playerId: `${tag}-rb`, name: "RB", position: "RB", passShare: 0, targetShare: 0.12, carryShare: 0.6, catchRate: 0.78, ypr: 7.5, ypc: 4.3 },
    { playerId: `${tag}-wr1`, name: "WR1", position: "WR", passShare: 0, targetShare: 0.4, carryShare: 0.02, catchRate: 0.64, ypr: 13.2, ypc: 6 },
    { playerId: `${tag}-te`, name: "TE", position: "TE", passShare: 0, targetShare: 0.25, carryShare: 0, catchRate: 0.7, ypr: 10.1, ypc: null },
  ],
});
const prep = [prepareTeamPlayers(team("h")), prepareTeamPlayers(team("a"))];
const RUNS = 4000;

test("the solver hits both head targets on the batch it reports (favourite, underdog, big favourite)", () => {
  for (const [pHome, total] of [[0.6147, 52.3], [0.33, 44.5], [0.88, 41]]) {
    const start = calibrate({ compiled, anchors: { home: total / 2, away: total / 2 }, baseSeed: "5eed0001", runs: 1000 }).thetas;
    const r = calibrateToHeads({ compiled, players: prep, targets: { pHome, total }, baseSeed: "5eed0001", runs: RUNS, start });
    assert.equal(r.state, "ANCHORED", `${pHome}/${total}: ${r.reason}`);
    assert.ok(Math.abs(r.achieved.pHomeDecided - pHome) <= HEAD_ANCHOR_TOLERANCE.pHome, JSON.stringify(r.achieved));
    assert.ok(Math.abs(r.achieved.meanTotal - total) <= HEAD_ANCHOR_TOLERANCE.total, JSON.stringify(r.achieved));
    // The batch at the solved tilts (with the coherence check on) is the same set of games.
    const checked = runBatch({ compiled, thetas: r.thetas, players: prep, baseSeed: "5eed0001", runs: RUNS });
    assert.equal(checked.failedRuns, 0);
    assert.deepEqual(batchMoments(checked), batchMoments(r.batch));
  }
});

test("unreachable or invalid targets are ANCHOR_UNSOLVED, never a nearest miss called anchored", () => {
  const far = calibrateToHeads({ compiled, players: prep, targets: { pHome: 0.9995, total: 9 }, baseSeed: "5eed0002", runs: 1500, maxIterations: 4 });
  assert.equal(far.state, "ANCHOR_UNSOLVED");
  assert.match(far.reason, /no tilt pair reached/);
  for (const targets of [{ pHome: 1.2, total: 44 }, { pHome: 0.5, total: -1 }, { pHome: null, total: 44 }, null]) {
    const r = calibrateToHeads({ compiled, players: prep, targets, baseSeed: "5eed0002", runs: 500 });
    assert.equal(r.state, "ANCHOR_UNSOLVED", JSON.stringify(targets));
    assert.equal(r.thetas, null);
  }
  // Control: a reachable target with the same budget is ANCHORED.
  const ok = calibrateToHeads({ compiled, players: prep, targets: { pHome: 0.55, total: 45 }, baseSeed: "5eed0002", runs: 1500 });
  assert.equal(ok.state, "ANCHORED");
});

test("win head target: head = homeUnrounded / (1 − tieMass); fallback head is named, missing data refused", () => {
  const r = { model: { winHead: { id: "nfl-win-elo-mov-v1" } }, forecastSummary: { winProbability: { homeUnrounded: 0.6 * (1 - 0.0323), tieMass: 0.0323 } } };
  const t = winHeadTarget(r);
  assert.equal(t.state, "READY");
  assert.ok(Math.abs(t.pHome - 0.6) < 1e-12);
  assert.equal(t.validatedHead, true);
  const fb = winHeadTarget({ ...r, model: { winHead: { id: "nfl-model-v1-elo-analytic", fallbackFrom: "nfl-win-elo-mov-v1" } } });
  assert.equal(fb.state, "READY");
  assert.equal(fb.validatedHead, false);
  assert.equal(winHeadTarget({ forecastSummary: { winProbability: { home: 0.6 } } }).state, "REFUSED");
});

function totalsV3() {
  const gate = totalsV3Gate(readJson(TOTALS_REPLAY_RECEIPT), readJson(TOTALS_REPLAY_PREREG));
  const history = readJson(GAMES_HISTORY);
  const eff = readJson(EFFICIENCY_HISTORY);
  const current = readJson(CURRENT_SEASON);
  const last = history.seasons[1];
  return {
    ...gate,
    games: [...gamesFromTable(history), ...(current?.state === "CAPTURED" ? gamesFromTable(current).filter((g) => g.season > last) : [])],
    efficiencyRows: [...eff.rows, ...(current?.state === "CAPTURED" ? current.efficiencyRows.filter((x) => x.season > last) : [])],
  };
}

test("totals head target: the re-fold must reproduce the receipt's own fold; otherwise refused", () => {
  // A committed v3 forecast receipt (Week 5, written 2026-10-07 with the fold through 2026-10-05).
  const r = readJson("data/internal/nfl/forecast-receipts/2026-10-07/401872980.json");
  assert.equal(r.model.totalsHead.id, "matchup-totals-v3-play-efficiency");
  const target = makeTotalsHeadTarget(totalsV3());
  const ok = target(r);
  assert.equal(ok.state, "READY", ok.reason);
  assert.ok(Math.abs(ok.total - r.forecastSummary.total.median) <= 1.5);
  assert.notEqual(ok.total, Math.round(ok.total), "the target is the unrounded head mean, not the integer median");
  const mismatch = target({ ...r, model: { ...r.model, totalsHead: { ...r.model.totalsHead, gamesFolded: r.model.totalsHead.gamesFolded + 1 } } });
  assert.equal(mismatch.state, "REFUSED");
  assert.match(mismatch.reason, /does not reproduce/);
  const v1 = target({ ...r, model: { ...r.model, totalsHead: { id: "matchup-totals-v1" } } });
  assert.equal(v1.state, "REFUSED");
});

test("receipt: no anchoring argument → no anchoring key and the original id namespace (median mode unchanged)", () => {
  const b = runBatch({ compiled, thetas: [0, 0], players: prep, baseSeed: "5eed0003", runs: 200 });
  const args = {
    event: { eventId: "1", kickoffUtc: "2026-10-12T17:00Z", home: { abbr: "H" }, away: { abbr: "A" } },
    compiled, paramsRef: { file: "x", sha256: "y" }, anchors: { home: 22, away: 21, source: "t", modelVersion: {} },
    calibration: { thetas: [0, 0], achieved: [22, 21] }, prep, batch: b, baseSeed: "5eed0003", inputHash: "h", generatedAt: "2026-10-07T00:00:00Z", inputs: {},
  };
  const plain = buildNflSimulationReceipt(args);
  assert.equal("anchoring" in plain, false);
  assert.equal(plain.simulationReceiptId, "nfl-sim-v2:1:h");
  const anchored = buildNflSimulationReceipt({ ...args, anchoring: { method: "m" }, idPrefix: "nfl-sim-v2-anchored" });
  assert.equal(anchored.simulationReceiptId, "nfl-sim-v2-anchored:1:h");
  assert.deepEqual(anchored.anchoring, { method: "m" });
  assert.notEqual(anchored.artifactHash, plain.artifactHash, "anchoring is inside the hashed body");
});
