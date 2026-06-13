/**
 * Bank Builder Step 5 target structure: the final card MUST be Brazil (World Cup) + NBA
 * Finals Game 5, and publishes ONLY when both legs are real + model-recommended. With the
 * current data (World Cup blocked — no API-Football; NBA Game 5 all no-play), neither leg
 * is ready, so no card publishes and the page shows the honest per-leg blocker. Source-level
 * + data assertions guard against fabrication, an invented card, or an MLB-substitute leg.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "data");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));
const helper = fs.readFileSync("src/lib/bank-builder-step5-target.ts", "utf8");
const page = fs.readFileSync("src/app/bank-builder/page.tsx", "utf8");

test("target structure is Brazil (World Cup) + NBA Finals Game 5 — the only allowed Step 5", () => {
  assert.ok(/brazil/i.test(helper) && /morocco/i.test(helper), "Brazil vs Morocco WC leg required");
  assert.ok(helper.includes("NBA Finals Game 5"), "NBA Finals Game 5 leg required");
  // No MLB substitute leg in the target structure.
  assert.ok(!/mlb/i.test(helper), "no MLB leg in the Step 5 target structure");
});

test("card publishes ONLY when both legs are 'ready'; otherwise canPublish is false", () => {
  assert.ok(helper.includes('legs.every((l) => l.state === "ready")'), "both legs must be ready to publish");
  // A leg is ready only with a real recommendation (Over/Under), never No Play.
  assert.ok(helper.includes('l.lean === "Over" || l.lean === "Under"'), "NBA leg ready needs a real recommendation");
  // World Cup leg ready needs a real Brazil match in the projections (real odds+model).
  assert.ok(helper.includes("loadWorldCupProjections"), "Brazil leg ready needs real WC projections");
});

test("current data: World Cup blocked + NBA Game 5 all no-play → no card can publish", () => {
  // World Cup June-13 projections artifact does not exist (no API-Football credential).
  assert.equal(fs.existsSync(path.join(dir, "world-cup/projections/2026-06-13.json")), false,
    "no real June-13 World Cup projections → Brazil leg blocked");
  // NBA Game-5 board has zero recommended legs (all No Play / insufficient_data).
  const nba = read("boards/2026-06-13.json");
  const recommended = nba.leans.filter((l) => l.lean === "Over" || l.lean === "Under");
  assert.equal(recommended.length, 0, "no recommended NBA Game-5 leg");
});

test("no invented Step 5 card; Bank Builder unchanged; pending panel is transparent", () => {
  assert.equal(fs.existsSync(path.join(dir, "bank-builder/official-step5-candidate.json")), false,
    "no fabricated Step 5 candidate");
  const s = read("bank-builder/public-summary-latest.json");
  assert.equal(s.currentBankrollUnits, 3623.97);
  assert.equal(s.currentProgressionStep, 5);
  const l = read("bank-builder/public-ledger-latest.json");
  assert.equal(l.entries.filter((e) => e.step === 5).length, 0);
  // The page renders the target structure + per-leg status (not a generic message).
  assert.ok(page.includes("loadStep5TargetStatus"), "page computes real per-leg status");
  assert.ok(page.includes("step5Target") && page.includes("leg.detail"), "page shows per-leg blocker detail");
});
