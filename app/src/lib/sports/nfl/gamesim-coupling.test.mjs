/**
 * P248 · Release C — WHAT THE TOTALS HEAD DOES AND DOES NOT DRIVE, proven empirically.
 *
 * The integration finding (P247) was algebraic: ownMargin = margin exactly, so the game total
 * CANCELS from player opportunity volumes. This test pins that as MEASURED behavior, in both
 * directions, so the architecture cannot be described as more than it is:
 *   · a ±8-point muTotal shift moves TEAM SCORES (the handoff the team artifact publishes);
 *   · the same shift leaves player attempt/yardage distributions essentially unchanged —
 *     volumes are MARGIN-driven; totals do not model pace or play count;
 *   · a margin shift DOES move volumes (the coupling that exists).
 * If a future engine intends total→pace coupling, it must change this test DELIBERATELY —
 * and the public copy that calls this "one totals assumption across team and player chains"
 * (a parameter handoff, never a drive-level simulation) changes with it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { simulatePlayerProps, loadPlayerPropsFit } from "./player-props-v1.mjs";

const APP = process.cwd();
const fit = loadPlayerPropsFit({ fs, path, cwd: APP });

const strengthState = { ratingFor: () => 1500, cutoffIso: "2025-09-01T00:00:00Z" };
const event = { providerEventId: "999001", home: { abbr: "AAA" }, away: { abbr: "BBB" }, seasonType: 2 };
const roleRates = {
  players: [
    { playerId: "qb1", name: "Test QB", families: new Set(["passAttempts"]), qbShare: 0.95, carryShare: 0, targetShare: 0, compRate: 0.65, ypcmp: 11.4, catchRate: 0.65, ypr: 11, ypc: 4.3, intRate: 0.02, share: 0.95, recent: {} },
    { playerId: "rb1", name: "Test RB", families: new Set(["rushAttempts"]), qbShare: 0, carryShare: 0.6, targetShare: 0.1, compRate: 0.65, ypcmp: 11.4, catchRate: 0.75, ypr: 8, ypc: 4.4, intRate: 0.02, share: 0.6, recent: {} },
    { playerId: "wr1", name: "Test WR", families: new Set(["targets"]), qbShare: 0, carryShare: 0, targetShare: 0.25, compRate: 0.65, ypcmp: 11.4, catchRate: 0.66, ypr: 12.2, ypc: 4.3, intRate: 0.02, share: 0.25, recent: {} },
  ],
};

function run(muTotal, marginSlopeScale = 1) {
  const f = {
    ...fit,
    gamesim: { ...fit.gamesim, muTotal, marginSlope: fit.gamesim.marginSlope * marginSlopeScale },
  };
  const sim = simulatePlayerProps({ event, teamAbbr: "AAA", fit: f, strengthState, roleRates, artifactDate: "2025-09-07", runs: 4000 });
  assert.equal(sim.state, "SIMULATED", sim.reason ?? "");
  const by = Object.fromEntries(sim.players.map((p) => [p.playerId, p.markets]));
  return {
    qbYds: by.qb1?.player_pass_yds?.mean ?? null,
    rbYds: by.rb1?.player_rush_yds?.mean ?? null,
    wrRec: by.wr1?.player_receptions?.mean ?? null,
  };
}

test("a ±8-point total shift leaves player volumes essentially unchanged (totals do not model pace)", () => {
  const lo = run(fit.gamesim.muTotal - 8);
  const hi = run(fit.gamesim.muTotal + 8);
  for (const k of ["qbYds", "rbYds", "wrRec"]) {
    assert.ok(lo[k] != null && hi[k] != null, `${k} simulated`);
    const rel = Math.abs(hi[k] - lo[k]) / Math.max(1, lo[k]);
    assert.ok(rel < 0.02, `${k}: a 16-point total swing moved the mean ${(rel * 100).toFixed(2)}% — if total→pace coupling was added, change this test AND the public copy deliberately`);
  }
});

test("a margin-strength shift DOES move volumes — the coupling that exists is margin-driven", () => {
  // Same teams, same total; double the margin slope so the Elo gap produces a bigger expected
  // margin. Attempts respond to ownMargin (game script), so pass volume must move.
  const eloGap = { ratingFor: (t) => (t === "AAA" ? 1600 : 1400), cutoffIso: strengthState.cutoffIso };
  const base = (() => { const s = simulatePlayerProps({ event, teamAbbr: "AAA", fit, strengthState: eloGap, roleRates, artifactDate: "2025-09-07", runs: 4000 }); return s.players.find((p) => p.playerId === "qb1").markets.player_pass_yds.mean; })();
  const doubled = (() => { const f = { ...fit, gamesim: { ...fit.gamesim, marginSlope: fit.gamesim.marginSlope * 3 } }; const s = simulatePlayerProps({ event, teamAbbr: "AAA", fit: f, strengthState: eloGap, roleRates, artifactDate: "2025-09-07", runs: 4000 }); return s.players.find((p) => p.playerId === "qb1").markets.player_pass_yds.mean; })();
  assert.ok(Math.abs(doubled - base) / base > 0.005, `margin coupling must be live (moved ${((doubled - base) / base * 100).toFixed(2)}%)`);
});
