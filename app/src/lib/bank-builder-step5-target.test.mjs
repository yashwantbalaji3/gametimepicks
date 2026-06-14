/**
 * Bank Builder Step 5 target structure: the owner-authorized final card is the best real
 * 2-leg card from tonight's slate — NBA Finals + MLB (cross-sport) OR two NBA Finals legs.
 * World Cup / Brazil is NO LONGER a Step 5 dependency or blocker. The review panel (shown
 * only when no candidate is published) reflects NBA + MLB readiness, never Brazil.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "data");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));
const helper = fs.readFileSync("src/lib/bank-builder-step5-target.ts", "utf8");
const page = fs.readFileSync("src/app/bank-builder/page.tsx", "utf8");

test("target structure is NBA Finals + MLB (or 2 NBA) — World Cup/Brazil is NOT a Step 5 dependency", () => {
  assert.ok(helper.includes("NBA Finals Game 5"), "NBA Finals leg targeted");
  assert.ok(/mlb/i.test(helper), "MLB leg is an authorized target (cross-sport)");
  // The stale Brazil / World Cup / API-Football blocker is gone from the Step 5 target.
  assert.ok(!/brazil/i.test(helper), "no Brazil leg/blocker in the Step 5 target");
  assert.ok(!/world.?cup|api.?football/i.test(helper), "no World Cup / API-Football dependency");
});

test("readiness is real (model-recommended Over/Under legs), never fabricated", () => {
  assert.ok(helper.includes('l.lean === "Over" || l.lean === "Under"'), "ready needs a real recommendation");
  assert.ok(helper.includes("nba.state === \"ready\""), "NBA Finals readiness gates the 2-leg build");
});

test("the page no longer shows Brazil / API-Football as a Step 5 blocker", () => {
  assert.ok(!/Brazil vs Morocco/i.test(page), "no Brazil target on the Bank Builder page");
  assert.ok(!/API-?Football credential/i.test(page), "no API-Football blocker on the page");
});

test("Step 5 has officially settled — the ladder reflects the completed Road to $10K", () => {
  // The gate-cleared Step 5 candidate (owner-authorized) has now officially settled as a WIN,
  // so the ladder advanced exactly once to the $10K crown — no double-count, no fabrication.
  const s = read("bank-builder/public-summary-latest.json");
  assert.equal(s.currentBankrollUnits, 10376.17);
  assert.equal(s.currentProgressionStep, 5);
  assert.deepEqual(s.record, { wins: 5, losses: 0, pushes: 0 });
  const l = read("bank-builder/public-ledger-latest.json");
  assert.equal(l.entries.filter((e) => e.step === 5).length, 1, "exactly one settled Step 5 ledger entry");
  assert.equal(l.entries.find((e) => e.step === 5).result, "win");
  // The page still computes the per-leg target status (used when no candidate is published).
  assert.ok(page.includes("loadStep5TargetStatus"), "page computes real per-leg status");
});
