import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBankBuilderLedger } from "./bank-builder-progression.ts";

const OPT = { base: 100, goal: 3000 };
const pick = (date, result, dec) => ({ date, result, combinedDecimal: dec });

test("win multiplies bankroll and advances; profit = delta", () => {
  const { entries, summary } = buildBankBuilderLedger([pick("2026-06-09", "win", 2.0)], OPT);
  assert.equal(entries[0].bankrollBefore, 100);
  assert.equal(entries[0].bankrollAfter, 200);
  assert.equal(entries[0].profitUnits, 100);
  assert.equal(summary.currentBankrollUnits, 200);
  assert.equal(summary.record.wins, 1);
  assert.equal(summary.currentStreak, 1);
});

test("loss resets bankroll to base", () => {
  const { entries, summary } = buildBankBuilderLedger(
    [pick("2026-06-07", "win", 2.0), pick("2026-06-08", "loss", 2.0)], OPT);
  assert.equal(entries[1].bankrollBefore, 200);
  assert.equal(entries[1].bankrollAfter, 100); // reset
  assert.equal(entries[1].wasReset, true);
  assert.equal(summary.currentBankrollUnits, 100);
  assert.equal(summary.currentStreak, -1);
});

test("push holds bankroll and does not advance/reset", () => {
  const { entries, summary } = buildBankBuilderLedger(
    [pick("2026-06-08", "win", 2.0), pick("2026-06-09", "push", 2.0)], OPT);
  assert.equal(entries[1].bankrollBefore, 200);
  assert.equal(entries[1].bankrollAfter, 200);
  assert.equal(summary.record.pushes, 1);
  assert.equal(summary.currentBankrollUnits, 200);
});

test("June-9-like sequence: reset then win → current run profit honest", () => {
  const { summary } = buildBankBuilderLedger(
    [pick("2026-06-08", "loss", 2.0), pick("2026-06-09", "win", 2.1184987)], OPT);
  assert.equal(summary.currentBankrollUnits, 211.85);
  assert.equal(summary.currentRunProfitUnits, 111.85);
  assert.equal(summary.lastSettledResult, "win");
  assert.equal(summary.record.wins, 1);
  assert.equal(summary.record.losses, 1);
});

test("deterministic: same input → identical output (idempotent)", () => {
  const inp = [pick("2026-06-08", "loss", 2.0), pick("2026-06-09", "win", 2.1)];
  assert.deepEqual(buildBankBuilderLedger(inp, OPT), buildBankBuilderLedger(inp, OPT));
});

test("empty picks → base bankroll, no entries", () => {
  const { entries, summary } = buildBankBuilderLedger([], OPT);
  assert.equal(entries.length, 0);
  assert.equal(summary.currentBankrollUnits, 100);
  assert.equal(summary.lastSettledDate, null);
});

test("sorts by date defensively", () => {
  const { entries } = buildBankBuilderLedger(
    [pick("2026-06-09", "win", 2.0), pick("2026-06-07", "win", 2.0)], OPT);
  assert.equal(entries[0].date, "2026-06-07");
});
