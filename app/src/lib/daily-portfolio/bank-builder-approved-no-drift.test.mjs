/**
 * APPROVED-CARD STABILITY — an operator-approved Bank Builder card must NOT drift when the daily portfolio
 * is re-activated. The July-3 drift bug was a MANUAL rewrite of bank-builder-approved.json, not an auto
 * override — the loader is date-gated and the selector is skipped when approved lanes exist. These tests
 * pin that guarantee (buildPersistedDailyPortfolio surfaces the approved legs verbatim), plus the hard
 * product rules: ≤3 legs per lane, team markets only (no player props).
 *
 * July-6 state: after the July-5 official settlement BOTH lanes lost and stopped. For July-6 the model
 * surfaces ONE disciplined card — Lane A (Spain or Draw + Belgium or Draw, the settled 8-0 double-chance
 * family, restarted cycle 8). Lane B is a deliberate NO-PLAY (on a 2-game slate the only value-band legs
 * were negative-to-fair BTTS in the weakest settled market), so it is absent from the active lanes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildPersistedDailyPortfolio } from "./accounting.ts";

const root = path.join(process.cwd(), "public", "data");
// Pre-slate "now" (before the first July-6 kickoff, Portugal-Spain 19:00 UTC) so nothing is cutoff-gated.
const nowIso = "2026-07-06T12:00:00Z";
const bbLanes = () => buildPersistedDailyPortfolio(root, nowIso, "2026-07-06", null, true).lanes.filter((l) => l.product === "bank-builder");

test("activate-daily-portfolio surfaces the operator-approved Lane A verbatim — no drift", () => {
  const bb = bbLanes();
  const a = bb.find((l) => l.lane === "A");
  assert.ok(a, "Lane A is present");
  // The USER-APPROVED July-6 survival Step-1 pair: Spain or Draw + Belgium or Draw (double chance).
  const legs = a.legs.map((l) => `${l.market}:${l.selection}:${l.odds}`);
  assert.equal(a.legs.length, 2, "Lane A is the approved 2-leg card");
  assert.ok(a.legs.some((l) => /Spain or Draw/.test(l.selection) && l.odds === -435 && /Spain/.test(l.matchup)), `Spain or Draw -435 present, got ${legs}`);
  assert.ok(a.legs.some((l) => /Belgium or Draw/.test(l.selection) && l.odds === -240 && /Belgium/.test(l.matchup)), `Belgium or Draw -240 present, got ${legs}`);
  assert.equal(a.step, 1, "Lane A is a fresh Step 1 (cycle-8 restart)");
});

test("Lane B is a deliberate NO-PLAY on July-6 — it must NOT surface as an active card", () => {
  const bb = bbLanes();
  const b = bb.find((l) => l.lane === "B");
  assert.ok(!b, "Lane B is absent (no-play) — never fabricated back into an active lane");
  // Exactly one Bank Builder lane is active today.
  assert.equal(bb.length, 1, "only the disciplined Lane A is active; Lane B was correctly skipped");
});

test("the active Bank Builder lane is ≤3 legs, team markets only (no player props)", () => {
  const bb = bbLanes();
  assert.ok(bb.length >= 1, "at least the survival lane generates");
  for (const l of bb) {
    assert.equal(l.step, 1, `${l.lane} is a fresh Step 1`);
    assert.ok(l.legs.length >= 2 && l.legs.length <= 3, `${l.lane} has 2-3 legs, got ${l.legs.length}`);
    assert.ok(l.legs.every((leg) => leg.player == null), `${l.lane} has no player props`);
    // Team/game markets only — the double-chance / DNB / totals / BTTS / moneyline family, never a prop.
    // leg.market is the human-readable LABEL ("Double Chance"), not the slug — match label form (see the
    // sibling bank-builder-team-market-only.test.mjs which checks the same field the same way).
    assert.ok(l.legs.every((leg) => /double chance|draw no bet|total goals|both teams to score|match result|moneyline/i.test(leg.market)), `${l.lane} uses team/game markets only`);
  }
});

test("re-activation is idempotent for the approved card (running twice yields identical Lane A legs)", () => {
  const first = bbLanes().find((l) => l.lane === "A").legs.map((l) => `${l.selection}:${l.odds}`);
  const second = bbLanes().find((l) => l.lane === "A").legs.map((l) => `${l.selection}:${l.odds}`);
  assert.deepEqual(second, first, "Lane A legs are stable across re-activation — approved cards do not drift");
});
