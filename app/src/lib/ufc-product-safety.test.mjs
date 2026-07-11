/**
 * UFC PRODUCT SAFETY — while the UFC moneyline model is unvalidated, a UFC projection must NEVER become a
 * model-qualified top pick, a Picks-Lab / parlay eligible leg, or a Bank Builder / Moonshot / product-card
 * leg, and must never create official exposure. UFC is model-only (no odds in the eligible-leg pool), so it
 * is excluded BY CONSTRUCTION — these pins prove that construction can't silently regress.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => fs.readFileSync(p, "utf8");

test("1 · the eligible-leg pool reads only MLB boards + World Cup projections (no UFC source dir)", () => {
  const loader = read("src/lib/parlays/ui-loader.ts");
  assert.match(loader, /path\.join\(root, "mlb", "boards"\), path\.join\(root, "world-cup", "projections"\)/, "pool dirs are MLB + WC only");
  assert.doesNotMatch(loader, /path\.join\(root, "ufc"/, "no UFC directory feeds the eligible-leg pool");
});

test("2 · build-legs documents UFC as model-only / excluded from the odds-backed leg pool", () => {
  assert.match(read("src/lib/build-legs.ts"), /UFC is model-only/, "UFC is explicitly out of the odds-backed pool");
});

test("3 · at runtime, NO eligible leg is UFC", () => {
  let slate;
  try { slate = loadTodaySlate(); } catch { slate = null; }
  assert.ok(slate, "slate loads");
  const legs = slate.eligibleLegs ?? [];
  for (const leg of legs) {
    const s = String(leg.sportKey ?? leg.sport ?? "").toLowerCase();
    assert.notEqual(s, "ufc", `no UFC eligible leg (found ${leg.id ?? "?"})`);
  }
});

test("4 · UFC suggested cards are moneyline-only and never priced/parlay-eligible product legs", () => {
  const c = JSON.parse(read("public/data/ufc/suggested-parlays-latest.json"));
  assert.equal(c.marketScope, "h2h_moneyline_only", "UFC cards are moneyline-only");
  // The UFC suggested cards artifact is its own internal study — not the official product pool. Its cards
  // carry no market payout (model-probability only), so they cannot create official exposure.
  for (const card of c.cards ?? []) {
    for (const leg of card.legs ?? []) {
      assert.ok(!("goesDistance" in leg) && !("method" in leg) && !("totalRounds" in leg), "no model-only prop legs");
    }
  }
});

test("5 · UFC public picks remain gated (publicPicksVisible=false) so nothing unlocks into products", () => {
  const ops = JSON.parse(read("public/data/ufc/ops-status-latest.json"));
  assert.equal(ops.publicPicksVisible, false, "UFC public picks not visible → cannot enter products");
});
