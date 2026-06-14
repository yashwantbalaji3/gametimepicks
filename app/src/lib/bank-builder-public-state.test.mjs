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

test("public summary reflects the settled $10,376.17 / Step 5 HIT state (Road to $10K complete)", () => {
  const s = read("public-summary-latest.json");
  assert.equal(s.ladder, "100-to-10000");
  assert.equal(s.currentBankrollUnits, 10376.17);
  assert.equal(s.currentProgressionStep, 5);
  assert.equal(s.currentStepStart, 3500);
  assert.equal(s.currentStepGoal, 10000);
  assert.equal(s.goalUnits, 10000);
  assert.equal(s.nextTargetUnits, 10000);
  assert.equal(s.record.wins, 5);
  assert.equal(s.record.losses, 0);
  assert.equal(s.currentStreak, 5);
  assert.equal(s.lastSettledDate, "2026-06-13");
  assert.equal(s.lastSettledResult, "win");
  assert.equal(s.lastSettledLabel, "Step 5 HIT — NBA Finals Game 5 · Road to $10K complete");
  assert.equal(s.runStatus, "completed");
  assert.equal(s.finalBankrollUnits, 10376.17);
  // The final $10,376.17 has crossed the $10,000 crown — the ladder is complete (resolves to null).
  assert.equal(resolveLadderStep(10376.17), null);
  // Step 5 ($3,500–$10,000) was the final rung that just hit.
  assert.equal(resolveLadderStep(3623.97)?.step, 5);
});

test("public ledger: Steps 1–5 all official hits (MLB, NBA, World Cup, Mixed WC+MLB, NBA)", () => {
  const l = read("public-ledger-latest.json");
  assert.equal(l.entries.length, 5);
  const [s1, s2, s3, s4, s5] = l.entries;
  assert.equal(s1.step, 1);
  assert.equal(s1.result, "win");
  assert.equal(s1.bankrollAfter, 211.85);
  assert.equal(s2.step, 2);
  assert.equal(s2.sport, "NBA");
  assert.equal(s2.result, "win");
  assert.equal(s2.bankrollAfter, 728.76);
  assert.equal(s2.officialResultConfirmed, true);
  assert.ok(s2.legs.every((x) => x.result === "win"));
  assert.ok(s2.legs.some((x) => (x.player ?? "").includes("Anunoby")));
  // Step 3 — the World Cup card, settled from official 90-minute finals.
  assert.equal(s3.step, 3);
  assert.equal(s3.sport, "World Cup");
  assert.equal(s3.result, "win");
  assert.equal(s3.bankrollBefore, 728.76);
  assert.equal(s3.bankrollAfter, 1423.64);
  assert.equal(s3.profitUnits, 694.88);
  assert.equal(s3.settlementSource, "espn_scoreboard");
  assert.ok(s3.legs.some((x) => x.selection === "Mexico" && x.finalScore === "Mexico 2-0 South Africa"));
  // Step 4 — the mixed World Cup + MLB card, settled from official soccer final + MLB box score.
  assert.equal(s4.step, 4);
  assert.equal(s4.date, "2026-06-12");
  assert.equal(s4.result, "win");
  assert.equal(s4.bankrollBefore, 1423.64);
  assert.equal(s4.bankrollAfter, 3623.97);
  assert.equal(s4.profitUnits, 2200.33);
  assert.equal(s4.combinedAmerican, 155);
  assert.equal(s4.officialResultConfirmed, true);
  assert.equal(s4.legs.length, 2);
  assert.ok(s4.legs.every((x) => x.result === "win"));
  // Official evidence: USA 4-1 Paraguay (double chance) + Avila 0 K (Under 3.5).
  assert.ok(s4.legs.some((x) => x.selection === "United States or Paraguay" && x.finalScore === "United States 4-1 Paraguay"));
  assert.ok(s4.legs.some((x) => x.player === "Luinder Avila" && x.side === "Under" && x.line === 3.5 && x.finalStat === 0));
  // Step 5 — the same-game NBA Finals Game 5 card that completed the Road to $10K.
  assert.equal(s5.step, 5);
  assert.equal(s5.date, "2026-06-13");
  assert.equal(s5.sport, "NBA");
  assert.equal(s5.event, "NBA Finals Game 5 · Knicks 94–90 Spurs");
  assert.equal(s5.result, "win");
  assert.equal(s5.bankrollBefore, 3623.97);
  assert.equal(s5.bankrollAfter, 10376.17);
  assert.equal(s5.profitUnits, 6752.2);
  assert.equal(s5.combinedAmerican, 186);
  assert.equal(s5.settlementSource, "espn");
  assert.equal(s5.officialResultConfirmed, true);
  assert.equal(s5.sameGame, true);
  assert.equal(s5.legs.length, 2);
  assert.ok(s5.legs.every((x) => x.result === "win"));
  // Official evidence: Vassell 7 REB (Over 4.5) + Castle 5 REB (Over 4.5).
  assert.ok(s5.legs.some((x) => x.player === "Devin Vassell" && x.side === "Over" && x.line === 4.5 && x.finalStat === 7));
  assert.ok(s5.legs.some((x) => x.player === "Stephon Castle" && x.side === "Over" && x.line === 4.5 && x.finalStat === 5));
  // Run complete — no next pick; the stake field is cleared.
  assert.equal(l.nextPickStatus, "completed");
  assert.equal(l.nextStakeUnits, null);
  assert.equal(l.nextTargetUnits, 10000);
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
