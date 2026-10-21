/**
 * Parlay Lab V2 · the NBA settlement gate: team markets via the NBA team contract; a player prop only when its family is
 * graded forward (sports/nba/prop-settlement-readiness.mjs). An open settlement gate admits nothing on its own.
 * Run: npx tsx --test src/lib/parlays/v2/nba-settlement-gate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { nbaLegSettles, nbaContractSettles, legReasons, recommendCtx } from "./recommend.mjs";
import { nbaSourceStatus } from "./nba-source.mjs";
import { canEnterPredictionProducts } from "../../sport-capability-registry.ts";

test("the settlement gate: team markets via the contract; a prop only when its family is graded forward", () => {
  const prop = (market) => ({ sport: "nba", market, playerId: "1", side: "over", line: 20.5 });
  const closed = nbaLegSettles();
  assert.equal(closed(prop("player_points")), false, "default: no prop family is ready");
  assert.equal(closed({ market: "h2h" }), true);
  assert.equal(closed({ market: "totals" }), nbaContractSettles({ market: "totals" }));
  const open = nbaLegSettles(["pts"]);
  assert.equal(open(prop("player_points")), true);
  assert.equal(open(prop("player_rebounds")), false, "readiness is per family");
  assert.equal(open(prop("player_blocks")), false, "an ungraded market never opens");
});

test("an open settlement gate does not admit a real NBA leg: the registry still refuses it", () => {
  assert.equal(canEnterPredictionProducts("nba"), false, "NBA is not product-eligible");
  const leg = { sport: "nba", eventId: "401909088", market: "player_points", selection: "x", line: 20.5, startUtc: "2099-01-01T00:00:00Z" };
  const reasons = legReasons(leg, recommendCtx({ nowMs: Date.parse("2026-10-21T12:00:00Z"), nbaPropReadyFamilies: ["pts"] }));
  assert.ok(!reasons.includes("NO_SETTLEMENT_PATH"), "the settlement gate is open for pts");
  assert.ok(reasons.includes("SPORT_NOT_ELIGIBLE"), "the registry still refuses it");
  assert.ok(reasons.includes("OPERATOR_NOT_VERIFIED") || reasons.includes("PRICE_MISSING"), "and there is no authorized price");
  const s = nbaSourceStatus({ propReadyFamilies: ["pts"] });
  assert.equal(s.gates.find((g) => g.gate === "player-prop settlement").open, true);
  assert.equal(s.gates.find((g) => g.gate === "registry").open, false);
  assert.equal(s.state, "NBA_PRICE_NOT_AUTHORIZED", "the board still says NBA legs need an authorized price");
  assert.equal(nbaSourceStatus().gates.find((g) => g.gate === "player-prop settlement").open, false);
});
