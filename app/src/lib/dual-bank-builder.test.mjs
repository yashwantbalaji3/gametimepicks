/**
 * Dual Bank Builder settlement contract. Run #2 launched two parallel paper lanes from real,
 * odds-backed, upcoming legs; Step 1 has now been OFFICIALLY settled (both lanes lost, 0/2) from
 * official sources. The COMPLETED first run is preserved untouched, and no Run #3 was launched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const DIR = new URL("../../public/data/bank-builder/", import.meta.url);
const dual = JSON.parse(fs.readFileSync(new URL("dual-lanes-latest.json", DIR), "utf8"));
const firstRun = JSON.parse(fs.readFileSync(new URL("public-summary-latest.json", DIR), "utf8"));

test("dual run is settled/closed with exactly two lanes", () => {
  assert.ok(dual.status === "settled" || dual.status === "closed", `status settled/closed (got ${dual.status})`);
  assert.equal(dual.runStatus, "closed");
  assert.equal(dual.step, 1);
  assert.ok(Array.isArray(dual.lanes) && dual.lanes.length === 2, "two lanes");
  assert.deepEqual(dual.lanes.map((l) => l.lane).sort(), ["A", "B"]);
});

test("Run #2 Step 1 went 0/2 — no lane advanced (run not continued)", () => {
  assert.equal(dual.lanesSurvived, 0);
  assert.ok(/0\s*\/\s*2/.test(dual.overallResult || ""), `overallResult shows 0/2 (got ${dual.overallResult})`);
  assert.equal(dual.advancedToStep, null, "no advance to a next step");
  for (const lane of dual.lanes) {
    assert.equal(lane.status, "lost", `${lane.lane} lost`);
    assert.equal(lane.return, 0, `${lane.lane} returns $0`);
  }
});

test("every leg is officially graded (result + final), no leg left pending", () => {
  for (const lane of dual.lanes) {
    assert.equal(lane.legs.length, 2, `${lane.lane} has 2 legs`);
    for (const leg of lane.legs) {
      assert.ok(["won", "lost", "void"].includes(leg.result), `leg graded (got ${leg.result}): ${leg.pick}`);
      assert.ok(typeof leg.final === "string" && leg.final.length > 0, `leg has an official final line: ${leg.pick}`);
      assert.ok(typeof leg.americanOdds === "number" && leg.americanOdds !== 0, "leg is odds-backed");
    }
  }
});

test("a lane is lost if any decisive leg lost (void does not rescue it)", () => {
  for (const lane of dual.lanes) {
    const decisive = lane.legs.map((l) => l.result).filter((r) => r === "won" || r === "lost");
    const allWon = decisive.length > 0 && decisive.every((r) => r === "won");
    // Both lanes lost, so none should be all-won.
    assert.equal(allWon, lane.status === "won");
    assert.equal(lane.status, "lost");
  }
});

test("the two lanes use different legs (no shared leg)", () => {
  const key = (l) => `${l.gameId}|${l.market}|${l.pick}`;
  const aKeys = new Set(dual.lanes[0].legs.map(key));
  const shared = dual.lanes[1].legs.filter((l) => aKeys.has(key(l)));
  assert.equal(shared.length, 0, "Lane A and Lane B share no leg");
});

test("lanes used only safer MLB markets — no risky Over 1.5+ hits", () => {
  for (const lane of dual.lanes) {
    for (const leg of lane.legs) {
      if (leg.sport !== "mlb") continue;
      const isHitsOver = leg.market === "batter_hits" && /\bOver\b/.test(leg.pick);
      if (isHitsOver) {
        assert.ok(/Over 0\.5\b/.test(leg.pick), `risky MLB Over-1.5+ hits leg leaked: ${leg.pick}`);
      }
    }
  }
});

test("completed first Bank Builder run is preserved untouched", () => {
  assert.equal(firstRun.currentBankrollUnits, 10376.17);
  assert.equal(firstRun.record.wins, 5);
  assert.equal(firstRun.record.losses, 0);
  assert.equal(firstRun.runStatus, "completed");
});

test("no banned copy in the dual-lane artifact", () => {
  const banned = /\b(lock|safe|safest|guaranteed|guarantee|sure thing|free money|risk-free)\b/i;
  assert.ok(!banned.test(JSON.stringify(dual)), "no outcome-promise copy in lanes");
});

test("a new Bank Builder run is guarded until the V2 eligibility gate exists", () => {
  // The launcher must fail closed (no Run #3) until the V2 survival-score gate is built.
  const src = fs.readFileSync(new URL("../../../pipeline/daily/build_dual_bank_builder.py", import.meta.url), "utf8");
  assert.ok(/v2_gate/.test(src), "launcher checks for a V2 eligibility gate");
  assert.ok(/REFUSED/.test(src), "launcher refuses to launch when the gate is missing");
  assert.ok(/force-v1-launch/.test(src), "an explicit operator override exists");
  // The V2 gate module does not exist yet, so the guard is currently ACTIVE.
  const v2 = new URL("../../../pipeline/daily/bank_builder_v2_eligibility.py", import.meta.url);
  assert.ok(!fs.existsSync(v2), "V2 eligibility gate not built yet — launch guard remains active");
});
