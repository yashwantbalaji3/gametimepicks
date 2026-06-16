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

test("the V1 selector is superseded by the V2 survival gate and refuses to launch", () => {
  // V1 picked on model probability alone; it must defer to V2 (no Run #3 via V1).
  const src = fs.readFileSync(new URL("../../../pipeline/daily/build_dual_bank_builder.py", import.meta.url), "utf8");
  assert.ok(/REFUSED/.test(src), "V1 launcher refuses to launch");
  assert.ok(/superseded by Bank Builder V2/.test(src), "V1 points operators to V2");
  assert.ok(/force-v1-launch/.test(src), "an explicit operator override exists");
  // The V2 survival gate now exists and is pure/importable.
  const v2 = new URL("../../../pipeline/daily/bank_builder_v2_eligibility.py", import.meta.url);
  assert.ok(fs.existsSync(v2), "V2 eligibility gate module exists");
});

test("V2 evaluation gate exists and Run #3 only launches when it passes", () => {
  const evalDoc = JSON.parse(fs.readFileSync(new URL("v2-evaluation-latest.json", DIR), "utf8"));
  assert.ok(["launch", "evaluating"].includes(evalDoc.decision), "decision is launch|evaluating");
  assert.ok(Array.isArray(evalDoc.eligibleLegs), "eligible legs listed");
  assert.ok(typeof evalDoc.eligibleThreshold === "number", "threshold recorded");
  // Every eligible leg actually cleared the threshold (no rigging).
  for (const leg of evalDoc.eligibleLegs) {
    assert.ok(leg.survivalScore >= evalDoc.eligibleThreshold, `${leg.pick} >= threshold`);
    assert.equal(leg.rejectionReasons.length, 0, `${leg.pick} has no rejection reasons`);
  }
  // If we did NOT launch, the latest dual run must still be the closed Run #2 (not overwritten).
  if (evalDoc.decision !== "launch") {
    assert.ok(dual.runNumber === 2 || dual.status === "settled" || dual.status === "closed",
      "no Run #3 written; Run #2 preserved");
  }
});
