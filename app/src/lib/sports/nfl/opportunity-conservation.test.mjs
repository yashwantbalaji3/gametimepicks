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

/* ── Session 5 · from measurement to publication safety ─────────────────────────────────────────── */
import { withholdOverAllocatedPools, overAllocationReason } from "./opportunity-conservation.mjs";

const rushRow = (id, team, name, mean, extra = {}) => ({ playerId: `nfl-athlete-${id}`, team, name, participation: "AVAILABLE_ROLE_UNCERTAIN", markets: { player_rush_yds: { mean, median: mean }, ...extra } });

test("Session 5 · an over-allocated carries pool is WITHHELD for that team, never renormalised", () => {
  // ARI on the Week-4 board: Love 0.57 + Conner 0.44 + Benson 0.30 (Σ 1.31). NYG 0.53 + 0.20 (Σ 0.73).
  const players = [
    rushRow(1, "ARI", "Love", 59.7, { anytime_td: { probability: 0.4 } }),
    rushRow(2, "ARI", "Conner", 46.5, { player_receptions: { median: 2 } }),
    rushRow(3, "ARI", "Benson", 35.3),
    rushRow(4, "NYG", "Skattebo", 57.0),
    rushRow(5, "NYG", "Singletary", 21.8),
  ];
  const shares = table({ "1|ARI|player_rush_yds": 0.57, "2|ARI|player_rush_yds": 0.44, "3|ARI|player_rush_yds": 0.30, "4|NYG|player_rush_yds": 0.53, "5|NYG|player_rush_yds": 0.20 });
  const out = withholdOverAllocatedPools({ players, shareOf: shares, markets: ["player_rush_yds"] });
  assert.equal(out.withheld.length, 1);
  assert.equal(out.withheld[0].team, "ARI");
  assert.equal(out.withheld[0].sum, 1.31);
  for (const p of out.players.filter((x) => x.team === "ARI")) assert.equal(p.markets.player_rush_yds, undefined, `${p.name}: rushing must be withheld`);
  assert.equal(out.players.find((p) => p.name === "Love").markets.anytime_td.probability, 0.4, "another family on the same row is untouched");
  assert.equal(out.players.find((p) => p.name === "Conner").markets.player_receptions.median, 2);
  const nyg = out.players.filter((x) => x.team === "NYG");
  assert.deepEqual(nyg.map((p) => p.markets.player_rush_yds.mean), [57.0, 21.8], "the coherent pool publishes, and its numbers are NOT rescaled");
  assert.ok(players[0].markets.player_rush_yds, "pure: the input rows are not mutated");
});

test("Session 5 · only the markets passed are enforced — an allocating engine's family is never withheld", () => {
  // v1 receiving conserves targets by construction; its rows must survive even when share-level target shares sum past 1.
  const players = [
    { playerId: "nfl-athlete-1", team: "SF", name: "A", markets: { player_receptions: { median: 5 } } },
    { playerId: "nfl-athlete-2", team: "SF", name: "B", markets: { player_receptions: { median: 4 } } },
  ];
  const out = withholdOverAllocatedPools({ players, shareOf: table({ "1|SF|player_receptions": 0.7, "2|SF|player_receptions": 0.6 }), markets: ["player_rush_yds"] });
  assert.equal(out.withheld.length, 0);
  assert.equal(out.players.length, 2);
  assert.equal(out.players[0].markets.player_receptions.median, 5);
});

test("Session 5 · the boundary is the audit's own EPS — no new threshold", () => {
  const two = (a, b) => withholdOverAllocatedPools({ players: [rushRow(1, "KC", "X", 1), rushRow(2, "KC", "Y", 1)], shareOf: table({ "1|KC|player_rush_yds": a, "2|KC|player_rush_yds": b }), markets: ["player_rush_yds"] });
  assert.equal(two(0.70, 0.30 + EPS).withheld.length, 0, "exactly 1 + EPS is rounding, not over-allocation");
  assert.equal(two(0.70, 0.31 + EPS).withheld.length, 1);
});

test("Session 5 · ESPN WSH/LAR join the nflverse WAS/LA forecast through the one normaliser", () => {
  const out = withholdOverAllocatedPools({ players: [rushRow(1, "WSH", "A", 1), rushRow(2, "WSH", "B", 1)], shareOf: table({ "1|WAS|player_rush_yds": 0.8, "2|WAS|player_rush_yds": 0.75 }), markets: ["player_rush_yds"] });
  assert.equal(out.withheld[0]?.team, "WSH", "a raw-abbreviation join would read NO_JOIN and publish the incoherent pool");
});

test("Session 5 · the reader-facing reason states the sum and names no internal file", () => {
  const r = overAllocationReason({ team: "ARI", pool: "carries", sum: 1.8636 });
  assert.match(r, /186% of the team's carries/);
  assert.doesNotMatch(r, /data\/internal|share-level|\.json/);
});
