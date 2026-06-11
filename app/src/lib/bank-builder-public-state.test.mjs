import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { formatLadderUsdPrecise, resolveLadderStep } from "./bank-builder-ladder.ts";

const dir = path.join(process.cwd(), "public", "data", "bank-builder");
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

test("formatLadderUsdPrecise shows cents only when present", () => {
  assert.equal(formatLadderUsdPrecise(728.76), "$728.76");
  assert.equal(formatLadderUsdPrecise(211.85), "$211.85");
  assert.equal(formatLadderUsdPrecise(2000), "$2,000");
  assert.equal(formatLadderUsdPrecise(100), "$100");
});

test("public summary reflects the migrated $728.76 / Step 3 state", () => {
  const s = read("public-summary-latest.json");
  assert.equal(s.ladder, "100-to-10000");
  assert.equal(s.currentBankrollUnits, 728.76);
  assert.equal(s.currentProgressionStep, 3);
  assert.equal(s.goalUnits, 10000);
  assert.equal(s.nextTargetUnits, 2000);
  assert.equal(s.lastSettledResult, "win");
  // $728.76 resolves to Step 3 ($700–$2,000) under the new ladder.
  assert.equal(resolveLadderStep(728.76)?.step, 3);
});

test("public ledger: Step 1 MLB win, Step 2 NBA Finals official hit", () => {
  const l = read("public-ledger-latest.json");
  assert.equal(l.entries.length, 2);
  const [s1, s2] = l.entries;
  assert.equal(s1.step, 1);
  assert.equal(s1.result, "win");
  assert.equal(s1.bankrollAfter, 211.85);
  assert.equal(s2.step, 2);
  assert.equal(s2.sport, "NBA");
  assert.equal(s2.result, "win");
  assert.equal(s2.bankrollAfter, 728.76);
  assert.equal(s2.officialResultConfirmed, true);
  // Castle REB + Anunoby PRA legs, both won
  assert.ok(s2.legs.every((x) => x.result === "win"));
  assert.ok(s2.legs.some((x) => x.player.includes("Anunoby")));
  assert.equal(l.nextStakeUnits, 728.76);
});

test("original tracked ledger preserved (canonical, untouched)", () => {
  const c = read("ledger-latest.json");
  const j10 = (c.entries || []).find((e) => e.date === "2026-06-10");
  assert.ok(j10, "canonical June 10 entry still present");
  assert.equal(j10.sport, "mlb");
  assert.equal(j10.result, "win");
  assert.equal(j10.bankrollAfter, 444.19); // tracked MLB ladder unchanged
});

test("featured NBA Finals card preserved + not part of tracked ladder", () => {
  const f = read("featured-latest.json");
  assert.equal(f.result, "win");
  assert.equal(f.trackedLadder, false);
  assert.equal(f.settledReturn, 728.76);
  assert.equal(f.officialResultConfirmed, true);
});
