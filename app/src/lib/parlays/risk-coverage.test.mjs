/**
 * Risk-coverage instrument guards (Program 200).
 *
 * The committed matrix must account for every lane × tier with a typed state, PUBLISHED cells
 * must name their card, refusals must carry reasons, and the World-Cup-era relic schema must
 * never return. Structure only — cards and no-plays move daily by design.
 *
 * Run: npx tsx --test src/lib/parlays/risk-coverage.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { RISK_ORDER } from "../prefs/bettor-tiers.mjs";

const matrix = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/parlays/coverage-matrix.json"), "utf8"));

test("v2 schema: five lanes × four tiers, twenty typed cells, counts recount", () => {
  assert.equal(matrix.schemaVersion, 2, "the June relic (World Cup scopes, schemaVersion absent) must never return");
  assert.deepEqual(matrix.rows.map((r) => r.lane), ["mlb", "epl", "ufc", "nfl", "multi"]);
  const counts = { PUBLISHED: 0, NO_PLAY: 0, LANE_CLOSED: 0, MISSING: 0 };
  for (const r of matrix.rows) {
    assert.deepEqual(Object.keys(r.tiers), [...RISK_ORDER], `${r.lane}: every tier answered, in the canonical order`);
    for (const [tier, cell] of Object.entries(r.tiers)) {
      assert.ok(["PUBLISHED", "NO_PLAY", "LANE_CLOSED", "MISSING"].includes(cell.state), `${r.lane}.${tier}`);
      counts[cell.state] += 1;
      if (cell.state === "PUBLISHED") assert.ok(cell.slipId, `${r.lane}.${tier}: a published cell names its card`);
      else assert.ok(cell.reason && cell.reason.length > 10, `${r.lane}.${tier}: a refusal carries its reason`);
    }
  }
  assert.deepEqual(matrix.counts, counts, "counts recount from the cells — never hand-kept");
});

test("a closed lane closes all four tiers with the same cause class — no half-closed lanes", () => {
  for (const r of matrix.rows) {
    if (r.laneState !== "CLOSED") continue;
    for (const cell of Object.values(r.tiers)) assert.equal(cell.state, "LANE_CLOSED", `${r.lane}: a closed lane cannot publish`);
    assert.ok(r.laneReason, `${r.lane}: closure names its cause`);
  }
});

test("the canonical risk vocabulary is the only vocabulary — four tiers, no fifth class", () => {
  assert.deepEqual([...RISK_ORDER], ["low", "medium", "high", "longshot"]);
  for (const r of matrix.rows) assert.equal(Object.keys(r.tiers).length, 4);
});
