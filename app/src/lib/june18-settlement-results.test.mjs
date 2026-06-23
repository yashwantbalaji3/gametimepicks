import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getBankBuilderSettledSteps } from "./bank-builder-results.ts";

test("Results: Bank Builder settled steps expose Lane A WON + Lane B WON (current) with the prior Lane B LOST still surfaced, official sources", () => {
  const steps = getBankBuilderSettledSteps();
  const a = steps.find((s) => s.laneId === "A");
  const b = steps.find((s) => s.laneId === "B");
  // Lane A Step 1 won (advanced).
  assert.ok(a, "Lane A settled step present");
  assert.equal(a.result, "won");
  assert.equal(a.laneOutcome, "advanced");
  assert.ok(a.legs.length === 2 && a.legs.every((l) => l.result === "won"), "both Lane A legs won");
  assert.ok(a.legs.every((l) => l.source && l.official), "each leg carries an official source + line");
  // Lane B current Step 1 restart WON (advanced) — Argentina ML + France/Iraq Under 3.5, official.
  assert.ok(b, "Lane B settled step present");
  assert.equal(b.result, "won");
  assert.equal(b.laneOutcome, "advanced");
  assert.ok(b.legs.length === 2 && b.legs.every((l) => l.result === "won"), "both Lane B current legs won (Argentina + France/Iraq Under 3.5)");
  assert.ok(b.legs.every((l) => l.source && l.official), "official source + line on each Lane B leg");
  // Transparency: the PRIOR Lane B lost step (Switzerland won, Goldschmidt lost) is still surfaced even after the restart cleared.
  const bLost = steps.find((s) => s.laneId === "B" && s.result === "lost");
  assert.ok(bLost, "prior Lane B lost step still surfaced (transparency)");
  assert.equal(bLost.laneOutcome, "stopped");
  assert.ok(bLost.legs.some((l) => l.result === "won") && bLost.legs.some((l) => l.result === "lost"), "Switzerland won, Goldschmidt lost");
  assert.ok(bLost.legs.every((l) => l.source), "official source on each prior-step leg");
});

test("Results page renders the Bank Builder settled section", () => {
  const src = fs.readFileSync("src/app/results/page.tsx", "utf8");
  assert.match(src, /BankBuilderResults/, "section component imported + rendered");
  assert.match(src, /getBankBuilderSettledSteps\(\)/, "fed by the settled-steps loader");
});
