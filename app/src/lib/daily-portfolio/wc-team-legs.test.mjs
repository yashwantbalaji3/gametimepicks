/**
 * WC team-leg pool — must expose the SAFE team markets (moneyline / totals PLUS draw-no-bet / double-chance
 * / BTTS) so Bank Builder can build draw-protected lanes, and must NEVER contain player props or a
 * fabricated market. Reads the committed slate artifacts (deterministic).
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadWorldCupTeamLegs } from "./wc-team-legs.ts";

const ROOT = path.join(process.cwd(), "public", "data");
const ALLOWED = new Set(["moneyline_90", "match_total_goals", "draw_no_bet", "double_chance", "btts"]);

test("team-leg pool is TEAM markets only — never a player prop, never an unknown market", () => {
  const legs = loadWorldCupTeamLegs(ROOT, new Date().toISOString(), "2026-07-01");
  assert.ok(legs.length > 0, "the committed July-1 slate should yield team legs");
  for (const l of legs) {
    assert.equal(l.player, null, `no player props in the BB team pool (got ${l.selection})`);
    assert.ok(ALLOWED.has(l.marketKey), `unexpected market in the BB team pool: ${l.marketKey}`);
  }
});

test("pool now includes the draw-protected / BTTS markets (not just moneyline + totals)", () => {
  const legs = loadWorldCupTeamLegs(ROOT, new Date().toISOString(), "2026-07-01");
  const markets = new Set(legs.map((l) => l.marketKey));
  // The broadening added DNB / DC / BTTS from the projections artifact — at least one must be present on a
  // slate that offers them (the July-1 knockout slate does).
  const extras = ["draw_no_bet", "double_chance", "btts"].filter((m) => markets.has(m));
  assert.ok(extras.length >= 1, `expected DNB/DC/BTTS in the team pool, got markets: ${[...markets].join(", ")}`);
});

test("every leg is odds-backed with a real de-vigged probability (no fabricated legs)", () => {
  const legs = loadWorldCupTeamLegs(ROOT, new Date().toISOString(), "2026-07-01");
  for (const l of legs) {
    assert.equal(typeof l.odds, "number");
    assert.ok(l.odds >= -650 && l.odds <= 400, `BB pool odds must stay in the payable band, got ${l.odds}`);
    assert.ok(typeof l.modelProbability === "number" && l.modelProbability > 0 && l.modelProbability <= 1);
    assert.ok(l.provider, "each leg names the bookmaker it was priced from");
  }
});
