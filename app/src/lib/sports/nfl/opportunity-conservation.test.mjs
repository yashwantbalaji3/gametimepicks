/**
 * P694 — opportunity conservation on the published NFL player board.
 *
 * THE MEASUREMENT. A `share` is a player's fraction of a team opportunity pool. Σ over the rows a
 * reader actually sees is therefore a physical quantity with a ceiling of 1, and nothing in the
 * pipeline computed it. Measured on the 2026-09-27 slate: 38 of 78 published team-pools exceed it,
 * worst Σ 2.433 — three Cleveland quarterbacks each holding most of the team's pass attempts.
 *
 * WHAT THESE TESTS GUARD. The measurement, not a threshold. Renormalising survivors would change
 * every published number and is a model promotion, so `OVER_ALLOCATED` is a finding here and not a
 * refusal. What must not rot is the arithmetic: the double-count, the missing join, the empty
 * slate and the team-abbreviation trap are each a way for this audit to report a clean slate that
 * is not clean.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { conservationForBoard, foldConservation, classify, EPS, THIN_BELOW, OPPORTUNITY_POOL } from "./opportunity-conservation.mjs";

const player = (id, team, name, markets) => ({ playerId: `nfl-athlete-${id}`, team, name, markets: Object.fromEntries(markets.map((m) => [m, {}])) });
/** A share table keyed exactly as the forward forecast is: nflverse team abbreviation. */
const table = (entries) => (espnId, team, market) => entries[`${espnId}|${team}|${market}`];

test("P694 · Σ over a team pool is the sum of its published players' shares", () => {
  const out = conservationForBoard({
    board: { providerEventId: "1", matchup: "A @ B", players: [player(1, "CLE", "QB1", ["player_pass_yds"]), player(2, "CLE", "QB2", ["player_pass_yds"])] },
    shareOf: table({ "1|CLE|player_pass_yds": 0.98, "2|CLE|player_pass_yds": 0.95 }),
  });
  const row = out.rows.find((r) => r.pool === "passAttempts");
  assert.equal(row.sum, 1.93);
  assert.equal(row.state, "OVER_ALLOCATED", "two quarterbacks cannot hold 193% of a team's dropbacks");
  assert.equal(row.joined, 2);
  assert.equal(row.largest.name, "QB1", "the biggest holder is named, so one implausible row is distinguishable from twenty");
  assert.equal(out.overAllocated, 1);
});

test("P694 · receptions and receiving yards are ONE target share, never two", () => {
  // Both markets map to `targets`. Counting each would double every receiver on every board and
  // turn a conserved pool into a false 2.0.
  assert.equal(OPPORTUNITY_POOL.player_receptions, OPPORTUNITY_POOL.player_reception_yds);
  const out = conservationForBoard({
    board: { players: [player(7, "SF", "WR", ["player_receptions", "player_reception_yds"])] },
    shareOf: table({ "7|SF|player_receptions": 0.3, "7|SF|player_reception_yds": 0.3 }),
  });
  const row = out.rows.find((r) => r.pool === "targets");
  assert.equal(row.sum, 0.3, "one player, one target share");
  assert.equal(row.joined, 1);
  assert.deepEqual(row.markets, ["player_reception_yds", "player_receptions"], "both markets are still reported as drawing on the pool");
});

test("P694 · a pool nothing joined is NO_JOIN, never a conserved Σ0", () => {
  // The vacuous pass this audit is most likely to produce: an unjoinable key reads as perfect
  // conservation. It did exactly that on WSH and LAR before the normaliser was shared.
  const out = conservationForBoard({
    board: { players: [player(9, "WSH", "WR", ["player_receptions"])] },
    shareOf: table({}),
  });
  const row = out.rows.find((r) => r.pool === "targets");
  assert.equal(row.state, "NO_JOIN");
  assert.equal(row.missed, 1);
  assert.notEqual(row.state, "CONSERVED");
});

test("P694 · the ESPN→nflverse abbreviation is applied, and it is the board's own mapping", () => {
  // WSH/LAR on the board, WAS/LA in the forecast. A private copy of this map is how the two drift.
  const out = conservationForBoard({
    board: { players: [player(9, "WSH", "WR", ["player_receptions"]), player(10, "LAR", "WR", ["player_receptions"])] },
    shareOf: table({ "9|WAS|player_receptions": 0.4, "10|LA|player_receptions": 0.5 }),
  });
  assert.equal(out.rows.find((r) => r.team === "WSH").joined, 1);
  assert.equal(out.rows.find((r) => r.team === "LAR").joined, 1);
  assert.equal(out.rows.filter((r) => r.state === "NO_JOIN").length, 0);
});

test("P694 · anytime_td draws on no share pool and is not counted", () => {
  const out = conservationForBoard({
    board: { players: [player(1, "KC", "RB", ["anytime_td"])] },
    shareOf: table({ "1|KC|anytime_td": 0.6 }),
  });
  assert.equal(out.rows.length, 0, "the TD model owns a probability, not a fraction of a pool");
});

test("P694 · EPS absorbs the artifact's rounding and nothing more", () => {
  assert.equal(classify(1 + EPS / 2, 3), "CONSERVED", "four-decimal rounding over twenty rows is not the defect");
  assert.equal(classify(1 + EPS * 3, 3), "OVER_ALLOCATED", "2% over is the defect");
  assert.ok(EPS < 0.01, "a tolerance wide enough to hide a real over-allocation is not a tolerance");
});

test("P694 · a thin pool is reported rather than passed as conserved", () => {
  assert.equal(classify(THIN_BELOW - 0.01, 4), "UNDER_ALLOCATED");
  assert.equal(classify(THIN_BELOW + 0.01, 4), "CONSERVED");
  // Σ < 1 is legitimate — the residual is where a genuinely unplaced arrival's volume belongs —
  // but a collapse to 0.3 is a different event and must not hide inside "≤ 1 is fine".
});

test("P694 · an empty slate folds to NO_BOARDS, never to CONSERVED", () => {
  assert.equal(foldConservation([]).state, "NO_BOARDS");
  assert.equal(foldConservation([]).worst, null);
});

test("P694 · the fold carries the worst sum and the count, not just a verdict", () => {
  const fold = foldConservation([
    { rows: [{ sum: 0.9 }, { sum: 1.4 }], overAllocated: 1, worst: 1.4 },
    { rows: [{ sum: 0.8 }], overAllocated: 0, worst: 0.8 },
  ]);
  assert.equal(fold.state, "OVER_ALLOCATED");
  assert.equal(fold.boards, 2);
  assert.equal(fold.teamPools, 3);
  assert.equal(fold.overAllocated, 1);
  assert.equal(fold.worst, 1.4);
});
