/**
 * HARD PRODUCT RULE — Bank Builder is TEAM / GAME-MARKET ONLY (moneyline / DNB / double-chance / totals /
 * BTTS), never player props. Regression guard for the pool-contamination bug where the model-pick fill +
 * MLB board leaked high-implied player props (e.g. a −480 "Over 0.5 shots") into the BB pool, and the
 * safest-target-fit selector out-ranked the moneyline favorites — producing a prop-stacked ladder instead
 * of a team-market one (Spain ML / Portugal DNB). Both selection paths (cross-lane + single-lane fallback)
 * must draw only from the filtered pool.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildPersistedDailyPortfolio } from "./accounting.ts";

const root = path.join(process.cwd(), "public", "data");
const nowIso = "2026-07-02T12:00:00Z";

test("every Bank Builder lane leg is a TEAM market (player == null) — no player props", () => {
  const p = buildPersistedDailyPortfolio(root, nowIso, "2026-07-02", null, false);
  const bb = p.lanes.filter((l) => l.product === "bank-builder");
  const propLegs = bb.flatMap((l) => l.legs).filter((leg) => leg.player != null);
  assert.equal(propLegs.length, 0, `Bank Builder must never carry player props; found: ${propLegs.map((l) => `${l.selection} (${l.player})`).join(", ")}`);
});

test("Bank Builder legs use real team/game markets (moneyline / DNB / double chance / totals / BTTS)", () => {
  const p = buildPersistedDailyPortfolio(root, nowIso, "2026-07-02", null, false);
  const bb = p.lanes.filter((l) => l.product === "bank-builder");
  // Only assert when a lane actually generated legs (a thin/awaiting slate legitimately has none).
  const legs = bb.flatMap((l) => l.legs);
  if (legs.length === 0) return;
  const teamMarketRe = /moneyline|money line|match result|draw no bet|double chance|total goals|both teams to score|over|under|to win/i;
  for (const leg of legs) {
    assert.ok(teamMarketRe.test(leg.market) || teamMarketRe.test(leg.selection), `BB leg is not a recognised team/game market: ${leg.market} · ${leg.selection}`);
  }
});
