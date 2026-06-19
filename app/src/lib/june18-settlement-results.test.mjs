import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getBankBuilderSettledSteps } from "./bank-builder-results.ts";

test("Results: Bank Builder settled steps expose Lane A WON + Lane B LOST with official sources", () => {
  const steps = getBankBuilderSettledSteps();
  const a = steps.find((s) => s.laneId === "A");
  const b = steps.find((s) => s.laneId === "B");
  // Lane A Step 1 won (advanced).
  assert.ok(a, "Lane A settled step present");
  assert.equal(a.result, "won");
  assert.equal(a.laneOutcome, "advanced");
  assert.ok(a.legs.length === 2 && a.legs.every((l) => l.result === "won"), "both Lane A legs won");
  assert.ok(a.legs.every((l) => l.source && l.official), "each leg carries an official source + line");
  // Lane B Step 2 lost (stopped) — transparency surface shows the loss even though public BB hides it.
  assert.ok(b, "Lane B settled step present");
  assert.equal(b.result, "lost");
  assert.equal(b.laneOutcome, "stopped");
  assert.ok(b.legs.some((l) => l.result === "won") && b.legs.some((l) => l.result === "lost"), "Switzerland won, Goldschmidt lost");
  assert.ok(b.legs.every((l) => l.source), "official source on each leg");
});

test("Results page renders the Bank Builder settled section", () => {
  const src = fs.readFileSync("src/app/results/page.tsx", "utf8");
  assert.match(src, /BankBuilderResults/, "section component imported + rendered");
  assert.match(src, /getBankBuilderSettledSteps\(\)/, "fed by the settled-steps loader");
});
