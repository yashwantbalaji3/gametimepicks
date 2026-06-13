/**
 * Step-4 settlement grading rules + ledger outcome (2026-06-12 official results).
 * Encodes the win conditions the brief specified so a future edit can't silently
 * regrade: USA-or-Paraguay double chance, Avila Under 3.5 strikeouts, idempotent
 * single Step-4 entry, exact $3,623.97 bankroll, 4-0 record, Step 5 pending.
 *
 * Official sources used (recorded in docs/audits and the ledger):
 *   - soccer: United States 4-1 Paraguay (90' regulation, group stage — no extra time)
 *   - MLB: official box score (MLB Stats API gamePk 824102) — Avila 0 K in 0.2 IP, started
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "data", "bank-builder");
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

/** Double chance "A or B": wins if A or B win in regulation; a draw loses. */
function gradeDoubleChance(homeGoals, awayGoals) {
  if (homeGoals === awayGoals) return "loss"; // draw
  return "win"; // either side ahead → the "either team" double chance covers it
}
/** Pitcher strikeouts Under(line): wins when official K < line (started, game final). */
function gradeStrikeoutUnder(strikeouts, line) {
  return strikeouts < line ? "win" : "loss";
}

test("double chance grading: USA win covers, draw loses, Paraguay win covers", () => {
  assert.equal(gradeDoubleChance(4, 1), "win");  // USA 4-1 — the actual June-12 final
  assert.equal(gradeDoubleChance(1, 1), "loss"); // a draw would have lost
  assert.equal(gradeDoubleChance(0, 2), "win");  // Paraguay win would also cover
});

test("Avila Under 3.5 grading: 0-3 K wins, 4+ K loses", () => {
  assert.equal(gradeStrikeoutUnder(0, 3.5), "win");  // the actual June-12 box score
  assert.equal(gradeStrikeoutUnder(3, 3.5), "win");
  assert.equal(gradeStrikeoutUnder(4, 3.5), "loss");
  assert.equal(gradeStrikeoutUnder(8, 3.5), "loss"); // the conflated career-high game would have lost
});

test("Step 4 ledger entry encodes both official outcomes and is idempotent", () => {
  const l = read("public-ledger-latest.json");
  const s4 = l.entries.filter((e) => e.step === 4);
  assert.equal(s4.length, 1, "Step 4 settled exactly once");
  const e = s4[0];
  const soccer = e.legs.find((x) => x.selection === "United States or Paraguay");
  const mlb = e.legs.find((x) => x.player === "Luinder Avila");
  assert.equal(soccer.finalScore, "United States 4-1 Paraguay");
  assert.equal(soccer.result, gradeDoubleChance(4, 1));
  assert.equal(mlb.finalStat, 0);
  assert.equal(mlb.result, gradeStrikeoutUnder(0, 3.5));
});

test("settlement outcome: $1,423.64 → $3,623.97, +$2,200.33, 4-0, Step 5 pending", () => {
  const s = read("public-summary-latest.json");
  const l = read("public-ledger-latest.json");
  const e = l.entries.find((x) => x.step === 4);
  // Exact parlay math: -290 × -112 on $1,423.64.
  const dec = (1 + 100 / 290) * (1 + 100 / 112);
  assert.equal(Math.round(1423.64 * dec * 100) / 100, 3623.97);
  assert.equal(e.bankrollAfter, 3623.97);
  assert.equal(e.profitUnits, 2200.33);
  assert.equal(s.currentBankrollUnits, 3623.97);
  assert.equal(s.record.wins, 4);
  assert.equal(s.record.losses, 0);
  assert.equal(s.currentProgressionStep, 5);
  assert.equal(l.nextPickStatus, "pending");
});

test("the Bank Builder page renders the Road to $10K final step", () => {
  const page = fs.readFileSync("src/app/bank-builder/page.tsx", "utf8");
  assert.ok(page.includes("One step from $10K"), "hype headline present");
  assert.ok(page.includes("Road to $10,000") || page.includes("Final step"), "final-step framing present");
  assert.ok(page.includes("Review final step"), "Review final step CTA present");
  assert.ok(page.includes("Step 5 review pending"), "no invented Step 5 card — review pending copy");
});
