import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { carryPlacedLanes } from "./placed-lanes.mjs";

const lane = (product, laneId, status, legs, exposure = 100, potentialReturn = 250) =>
  ({ product, lane: laneId, status, legs: legs.map((s) => ({ selection: s })), exposure: status === "active" ? exposure : 0, potentialReturn: status === "active" ? potentialReturn : 0 });
const dp = (date, generatedAt, lanes) => ({ version: "daily-portfolio-v1", date, generatedAt, activeBankroll: 17865.4, crownBankroll: 20465.4, lanes, products: { bankBuilder: {}, moonshot: {} }, note: "x" });

test("a placed card is never swapped by a same-date rerun", () => {
  const morning = dp("2026-09-11", "2026-09-11T13:19:29Z", [lane("bank-builder", "A", "active", ["Dodgers", "Red Sox"]), lane("moonshot", "A", "active", ["Under 8", "Orioles"], 25, 180)]);
  const rerun = dp("2026-09-11", "2026-09-11T14:51:14Z", [lane("bank-builder", "A", "active", ["Dodgers", "Brewers"]), lane("moonshot", "A", "active", ["Cubs -1.5", "Under 7.5"], 25, 200)]);
  const { dp: out, carried } = carryPlacedLanes(morning, rerun);
  assert.deepEqual(out.lanes.map((l) => l.legs.map((g) => g.selection)), [["Dodgers", "Red Sox"], ["Under 8", "Orioles"]]);
  assert.equal(out.lanes[0].placedAt, "2026-09-11T13:19:29Z", "the lane remembers when it was placed");
  assert.equal(carried.filter((c) => c.changedLegs).length, 2, "the rerun's swaps are reported, not applied");
});

test("a lane with no card may still activate later — a placement, not a swap", () => {
  const morning = dp("2026-09-11", "t1", [lane("bank-builder", "A", "active", ["X", "Y"]), lane("bank-builder", "B", "candidate", ["P", "Q"])]);
  const later = dp("2026-09-11", "t2", [lane("bank-builder", "A", "active", ["Z", "W"]), lane("bank-builder", "B", "active", ["P", "Q"])]);
  const { dp: out } = carryPlacedLanes(morning, later);
  assert.equal(out.lanes.find((l) => l.lane === "B").status, "active");
  assert.deepEqual(out.lanes.find((l) => l.lane === "A").legs.map((g) => g.selection), ["X", "Y"]);
});

test("a new date starts fresh", () => {
  const yesterday = dp("2026-09-10", "t0", [lane("bank-builder", "A", "active", ["Old", "Card"])]);
  const today = dp("2026-09-11", "t1", [lane("bank-builder", "A", "active", ["New", "Card"])]);
  assert.deepEqual(carryPlacedLanes(yesterday, today).dp, today);
});

test("every aggregate is recomputed from the final lanes (available = active − exposure)", () => {
  const morning = dp("2026-09-11", "t1", [lane("bank-builder", "A", "active", ["X"], 100, 220), lane("moonshot", "B", "active", ["M"], 25, 190)]);
  const rerun = dp("2026-09-11", "t2", [lane("bank-builder", "A", "candidate", ["X"]), lane("moonshot", "B", "candidate", ["M"])]);
  const { dp: out } = carryPlacedLanes(morning, rerun);
  assert.equal(out.openExposure, 125);
  assert.equal(out.availableBankroll, 17740.4);
  assert.equal(out.potentialReturn, 410);
  assert.equal(out.products.bankBuilder.exposure, 100);
  assert.equal(out.products.moonshot.exposure, 25);
  assert.equal(out.products.bankBuilder.record.pending, 1);
  assert.equal(out.settlement.status, "pending");
});

test("the one writer applies it before it writes", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/activate-daily-portfolio.mjs"), "utf8");
  assert.match(src, /carryPlacedLanes\(existing, built\)/);
  assert.ok(src.indexOf("carryPlacedLanes(") < src.indexOf("fs.writeFileSync(OUT"), "carried before the write");
});
