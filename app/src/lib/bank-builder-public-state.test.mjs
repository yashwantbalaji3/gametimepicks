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

test("public summary reflects the settled $1,423.64 / Step 4 state (World Cup hit)", () => {
  const s = read("public-summary-latest.json");
  assert.equal(s.ladder, "100-to-10000");
  assert.equal(s.currentBankrollUnits, 1423.64);
  assert.equal(s.currentProgressionStep, 4);
  assert.equal(s.currentStepStart, 1400);
  assert.equal(s.currentStepGoal, 3500);
  assert.equal(s.goalUnits, 10000);
  assert.equal(s.nextTargetUnits, 3500);
  assert.equal(s.record.wins, 3);
  assert.equal(s.record.losses, 0);
  assert.equal(s.lastSettledDate, "2026-06-11");
  assert.equal(s.lastSettledResult, "win");
  assert.equal(s.lastSettledLabel, "World Cup HIT");
  // $1,423.64 resolves to Step 4 ($1,400–$3,500) under the public ladder.
  assert.equal(resolveLadderStep(1423.64)?.step, 4);
});

test("public ledger: Step 1 MLB, Step 2 NBA Finals, Step 3 World Cup — all official hits", () => {
  const l = read("public-ledger-latest.json");
  assert.equal(l.entries.length, 3);
  const [s1, s2, s3] = l.entries;
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
  assert.ok(s2.legs.some((x) => (x.player ?? "").includes("Anunoby")));
  // Step 3 — the World Cup card, settled from official 90-minute finals.
  assert.equal(s3.step, 3);
  assert.equal(s3.sport, "World Cup");
  assert.equal(s3.date, "2026-06-11");
  assert.equal(s3.result, "win");
  assert.equal(s3.bankrollBefore, 728.76);
  assert.equal(s3.bankrollAfter, 1423.64);
  assert.equal(s3.profitUnits, 694.88);
  assert.equal(s3.combinedAmerican, -105);
  assert.equal(s3.officialResultConfirmed, true);
  assert.equal(s3.settlementSource, "espn_scoreboard");
  assert.equal(s3.legs.length, 2);
  assert.ok(s3.legs.every((x) => x.result === "win"));
  assert.ok(s3.legs.some((x) => x.selection === "Mexico" && x.finalScore === "Mexico 2-0 South Africa"));
  assert.ok(s3.legs.some((x) => x.selection === "South Korea or Czechia" && x.finalScore === "South Korea 2-1 Czechia"));
  assert.equal(l.nextStakeUnits, 1423.64);
  assert.equal(l.nextTargetUnits, 3500);
});

test("settlement integrity: exact parlay math, ledger continuity, no duplicate steps", () => {
  const l = read("public-ledger-latest.json");
  // Exact payout math: $728.76 × (1+100/235) × (1+100/270) = $1,423.64 — no rounding drift.
  const dec = (1 + 100 / 235) * (1 + 100 / 270);
  assert.equal(Math.round(728.76 * dec * 100) / 100, 1423.64);
  // Each step starts exactly where the previous one ended.
  for (let i = 1; i < l.entries.length; i++) {
    assert.equal(l.entries[i].bankrollBefore, l.entries[i - 1].bankrollAfter, `continuity at entry ${i}`);
  }
  // A step settles exactly once — never duplicated by a re-run.
  const steps = l.entries.map((e) => e.step);
  assert.equal(new Set(steps).size, steps.length, "duplicate step entries");
  // Summary record matches the ledger wins.
  const s = read("public-summary-latest.json");
  assert.equal(s.record.wins, l.entries.filter((e) => e.result === "win").length);
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
