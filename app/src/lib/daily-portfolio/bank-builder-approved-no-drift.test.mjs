/**
 * APPROVED-CARD STABILITY — an operator-approved Bank Builder card must NOT drift when the daily portfolio
 * is re-activated. The July-3 drift bug was a MANUAL rewrite of bank-builder-approved.json, not an auto
 * override — the loader is date-gated and the selector is skipped when approved lanes exist. These tests
 * pin that guarantee (buildPersistedDailyPortfolio surfaces the approved legs verbatim), plus the hard
 * product rules: ≤3 legs per lane, team markets only (no player props), Lane A Step 3 / Lane B Step 1.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildPersistedDailyPortfolio } from "./accounting.ts";

const root = path.join(process.cwd(), "public", "data");
// Pre-slate "now" (before the first July-3 kickoff, Australia-Egypt 18:00 UTC) so nothing is cutoff-gated.
const nowIso = "2026-07-03T12:00:00Z";
const bbLanes = () => buildPersistedDailyPortfolio(root, nowIso, "2026-07-03", null, true).lanes.filter((l) => l.product === "bank-builder");

test("activate-daily-portfolio surfaces the operator-approved Lane A verbatim — no drift", () => {
  const bb = bbLanes();
  const a = bb.find((l) => l.lane === "A");
  assert.ok(a, "Lane A is present");
  // The USER-APPROVED Step-3 pair: Egypt or Draw + Argentina/Cape Verde Over 2.5.
  const legs = a.legs.map((l) => `${l.market}:${l.selection}:${l.odds}`);
  assert.equal(a.legs.length, 2, "Lane A is the approved 2-leg card");
  assert.ok(a.legs.some((l) => /Egypt or Draw/.test(l.selection) && l.odds === -335), `Egypt or Draw -335 present, got ${legs}`);
  assert.ok(a.legs.some((l) => /Over 2\.5/.test(l.selection) && l.odds === -175 && /Argentina/.test(l.matchup)), `Argentina Over 2.5 -175 present, got ${legs}`);
  assert.equal(a.step, 3, "Lane A is Step 3");
});

test("both Bank Builder lanes are present, ≤3 legs, team markets only (no player props)", () => {
  const bb = bbLanes();
  assert.equal(bb.length, 2, "both lanes generate");
  const a = bb.find((l) => l.lane === "A"), b = bb.find((l) => l.lane === "B");
  assert.equal(a.step, 3); assert.equal(b.step, 1);
  for (const l of bb) {
    assert.ok(l.legs.length >= 2 && l.legs.length <= 3, `${l.lane} has 2-3 legs, got ${l.legs.length}`);
    assert.ok(l.legs.every((leg) => leg.player == null), `${l.lane} has no player props`);
  }
});

test("re-activation is idempotent for the approved card (running twice yields identical Lane A legs)", () => {
  const first = bbLanes().find((l) => l.lane === "A").legs.map((l) => `${l.selection}:${l.odds}`);
  const second = bbLanes().find((l) => l.lane === "A").legs.map((l) => `${l.selection}:${l.odds}`);
  assert.deepEqual(second, first, "Lane A legs are stable across re-activation — approved cards do not drift");
});
