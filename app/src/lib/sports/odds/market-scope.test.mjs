/**
 * Market-scope + three-way/pointed no-vig guards (Program 167 · Release C).
 * Run: npx tsx --test src/lib/sports/odds/market-scope.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { MARKET_SCOPE, THREE_WAY_H2H, noVigThreeWay, noVigPointedTwoWay, normalizeScopedOddsEvent } from "./market-scope.mjs";

test("scope: UFC is winner-only, EPL h2h is three-way, NFL carries spreads/totals", () => {
  assert.deepEqual([...MARKET_SCOPE.ufc], ["h2h"]);
  assert.ok(MARKET_SCOPE.nfl.includes("spreads") && MARKET_SCOPE.nfl.includes("totals"));
  assert.ok(THREE_WAY_H2H.has("epl") && !THREE_WAY_H2H.has("nfl"));
});

test("three-way no-vig preserves the draw and probabilities reconcile to 1", () => {
  const r = noVigThreeWay([
    { name: "Arsenal", price: -125 },
    { name: "Draw", price: 260 },
    { name: "Chelsea", price: 340 },
  ]);
  assert.equal(r.ok, true);
  assert.ok(r.impliedSum > 1.0 && r.impliedSum < 1.3, `vig visible: ${r.impliedSum}`);
  const sum = r.noVig.reduce((a, o) => a + o.prob, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `probabilities reconcile (${sum})`);
  const draw = r.noVig.find((o) => o.name === "Draw");
  assert.ok(draw && draw.prob > 0.15 && draw.prob < 0.4, "the draw survives as a real outcome");
});

test("three-way refuses two outcomes — the draw is never folded away", () => {
  const r = noVigThreeWay([{ name: "A", price: -110 }, { name: "B", price: -110 }]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /draw/i);
});

test("three-way refuses degenerate sums and unparseable prices", () => {
  assert.equal(noVigThreeWay([{ name: "A", price: 900 }, { name: "Draw", price: 900 }, { name: "B", price: 900 }]).ok, false);
  assert.equal(noVigThreeWay([{ name: "A", price: -125 }, { name: "Draw", price: "260" }, { name: "B", price: 340 }]).ok, false);
});

test("pointed two-way: totals need identical points, spreads mirrored points", () => {
  const tot = noVigPointedTwoWay([
    { name: "Over", price: -110, point: 44.5 },
    { name: "Under", price: -110, point: 44.5 },
  ], "totals");
  assert.equal(tot.ok, true);
  assert.equal(tot.point, 44.5);

  const spread = noVigPointedTwoWay([
    { name: "DET", price: -105, point: 3.5 },
    { name: "CIN", price: -115, point: -3.5 },
  ], "spreads");
  assert.equal(spread.ok, true);
  assert.equal(spread.point, 3.5);

  const mismatched = noVigPointedTwoWay([
    { name: "Over", price: -110, point: 44.5 },
    { name: "Under", price: -110, point: 45.5 },
  ], "totals");
  assert.equal(mismatched.ok, false);
  assert.match(mismatched.reason, /different lines/);

  const missing = noVigPointedTwoWay([
    { name: "Over", price: -110 },
    { name: "Under", price: -110, point: 44.5 },
  ], "totals");
  assert.equal(missing.ok, false);
});

test("scoped normalization: in-scope rows, out-of-scope quarantines with the scope named", () => {
  const raw = {
    id: "evt1", commence_time: "2026-08-13T23:00:00Z", home_team: "Cincinnati Bengals", away_team: "Detroit Lions",
    bookmakers: [{
      key: "bookx", last_update: "2026-08-13T20:00:00Z",
      markets: [
        { key: "h2h", outcomes: [{ name: "Cincinnati Bengals", price: -130 }, { name: "Detroit Lions", price: 110 }] },
        { key: "totals", outcomes: [{ name: "Over", price: -110, point: 44.5 }, { name: "Under", price: -110, point: 44.5 }] },
        { key: "player_pass_tds", outcomes: [{ name: "X", price: -110 }] },
      ],
    }],
  };
  const { rows, quarantined } = normalizeScopedOddsEvent(raw, { sport: "nfl", capturedAt: "2026-08-13T20:05:00Z", requestId: "req1" });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.marketType).sort(), ["h2h", "totals"]);
  assert.equal(rows.find((r) => r.marketType === "totals").point, 44.5);
  assert.equal(quarantined.length, 1);
  assert.match(quarantined[0].reason, /outside nfl scope/);
});

test("scoped normalization: EPL h2h routes through the three-way validator", () => {
  const raw = {
    id: "evt2", commence_time: "2026-08-22T14:00:00Z", home_team: "Arsenal", away_team: "Chelsea",
    bookmakers: [{
      key: "bookx",
      markets: [
        { key: "h2h", outcomes: [{ name: "Arsenal", price: -125 }, { name: "Draw", price: 260 }, { name: "Chelsea", price: 340 }] },
      ],
    }],
  };
  const { rows, quarantined } = normalizeScopedOddsEvent(raw, { sport: "epl", capturedAt: "2026-08-22T10:00:00Z", requestId: "req2" });
  assert.equal(quarantined.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].marketShape, "h2h_3way");
  assert.equal(rows[0].noVig.length, 3);

  // a two-outcome soccer h2h REFUSES — the binary-draw shortcut is structurally impossible
  const binary = { ...raw, bookmakers: [{ key: "bookx", markets: [{ key: "h2h", outcomes: [{ name: "Arsenal", price: -125 }, { name: "Chelsea", price: 340 }] }] }] };
  const res = normalizeScopedOddsEvent(binary, { sport: "epl", capturedAt: "2026-08-22T10:00:00Z", requestId: "req3" });
  assert.equal(res.rows.length, 0);
  assert.equal(res.quarantined.length, 1);
});
