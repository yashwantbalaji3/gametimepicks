/**
 * NBA settlement contract guards (Program 162 · Release A).
 *
 * The corpus section grades all 4,179 research finals and cross-checks every verdict against the
 * corpus's own result column. NBA-specific physics: ZERO pushes must appear on moneyline (the
 * corpus builder refused ties as source defects, and the contract quarantines them), while the
 * synthetic tied-final corruption case must quarantine rather than settle.
 *
 * Run: npx tsx --test src/lib/sports/nba/settlement-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { NBA_SETTLEMENT_CONTRACT_VERSION, OUTCOMES, MARKETS, gradeNbaLeg, settleNbaSlate } from "./settlement-contract.mjs";

const FINAL = (h, a) => ({ status: "STATUS_FINAL", homePointsFT: h, awayPointsFT: a });

test("moneyline grades winners; a TIED final is a source defect that quarantines, never a push", () => {
  assert.equal(gradeNbaLeg({ market: "moneyline", side: "home" }, FINAL(111, 99)).outcome, "WIN");
  assert.equal(gradeNbaLeg({ market: "moneyline", side: "away" }, FINAL(111, 99)).outcome, "LOSS");
  const tie = gradeNbaLeg({ market: "moneyline", side: "home" }, FINAL(100, 100));
  assert.equal(tie.outcome, "VOID_PENDING_REVIEW", "an NBA game cannot end tied — settle nothing");
  assert.match(tie.reason, /cannot end tied/);
  // The tie rule fires before market dispatch — spreads and totals on the defective row quarantine too.
  assert.equal(gradeNbaLeg({ market: "total_points", side: "over", line: 195.5 }, FINAL(100, 100)).outcome, "VOID_PENDING_REVIEW");
});

test("point_spread: side-relative line, exact integer cover is PUSH from both sides", () => {
  assert.equal(gradeNbaLeg({ market: "point_spread", side: "home", line: -6.5 }, FINAL(118, 110)).outcome, "WIN");
  assert.equal(gradeNbaLeg({ market: "point_spread", side: "home", line: -8 }, FINAL(118, 110)).outcome, "PUSH");
  assert.equal(gradeNbaLeg({ market: "point_spread", side: "away", line: 8 }, FINAL(118, 110)).outcome, "PUSH", "the same position from the other side pushes identically");
  assert.equal(gradeNbaLeg({ market: "point_spread", side: "away", line: 8.5 }, FINAL(118, 110)).outcome, "WIN");
  assert.equal(gradeNbaLeg({ market: "point_spread", side: "home", line: 4.5 }, FINAL(108, 110)).outcome, "WIN", "an underdog line covers a narrow loss");
});

test("total_points: over/under with exact-line PUSH", () => {
  assert.equal(gradeNbaLeg({ market: "total_points", side: "over", line: 219.5 }, FINAL(118, 110)).outcome, "WIN");
  assert.equal(gradeNbaLeg({ market: "total_points", side: "under", line: 219.5 }, FINAL(118, 110)).outcome, "LOSS");
  assert.equal(gradeNbaLeg({ market: "total_points", side: "over", line: 228 }, FINAL(118, 110)).outcome, "PUSH");
});

test("nothing grades without a real FINAL: statuses, missing scores, negatives, unknown markets", () => {
  for (const status of ["STATUS_SCHEDULED", "STATUS_IN_PROGRESS", "STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_DELAYED", undefined]) {
    assert.equal(gradeNbaLeg({ market: "moneyline", side: "home" }, { status, homePointsFT: 110, awayPointsFT: 99 }).outcome, "VOID_PENDING_REVIEW", String(status));
  }
  assert.equal(gradeNbaLeg({ market: "moneyline", side: "home" }, { status: "STATUS_FINAL", homePointsFT: null, awayPointsFT: 99 }).outcome, "VOID_PENDING_REVIEW", "the Final-without-scores trap");
  assert.equal(gradeNbaLeg({ market: "moneyline", side: "home" }, { status: "STATUS_FINAL", homePointsFT: -1, awayPointsFT: 99 }).outcome, "VOID_PENDING_REVIEW");
  assert.equal(gradeNbaLeg({ market: "moneyline", side: "home" }, FINAL(110.5, 99)).outcome, "VOID_PENDING_REVIEW", "non-integer points refuse");
  assert.equal(gradeNbaLeg({ market: "player_points", side: "over", line: 25.5 }, FINAL(110, 99)).outcome, "VOID_PENDING_REVIEW", "unknown markets refuse instead of improvising");
});

test("CORPUS · the contract agrees with all 4,179 settled finals — and produces ZERO moneyline pushes", () => {
  const corpus = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data", "internal", "research", "nba", "corpus-v1.json"), "utf8"));
  const rows = corpus.rows ?? corpus.games;
  assert.equal(rows.length, 4179, "the committed research corpus");
  let pushes = 0;
  for (const r of rows) {
    const verdict = gradeNbaLeg({ market: "moneyline", side: "home" }, { status: r.statusRaw, homePointsFT: r.ftHome, awayPointsFT: r.ftAway });
    assert.notEqual(verdict.outcome, "VOID_PENDING_REVIEW", `corpus row ${r.providerEventId} must be gradeable — it is a settled final`);
    const expected = r.result === "H" ? "WIN" : "LOSS";
    assert.equal(verdict.outcome, expected, `${r.providerEventId}: contract says ${verdict.outcome}, corpus settled ${r.result} (${r.ftHome}-${r.ftAway})`);
    if (verdict.outcome === "PUSH") pushes += 1;
  }
  assert.equal(pushes, 0, "no NBA final can tie, so no moneyline push may exist across three seasons");
});

test("batch settle reconciles exactly (gap zero) and counts decisive = W+L only", () => {
  const legs = [
    { providerEventId: "a", market: "moneyline", side: "home" },
    { providerEventId: "a", market: "total_points", side: "over", line: 210 },
    { providerEventId: "tied", market: "moneyline", side: "away" },
    { providerEventId: "missing", market: "moneyline", side: "home" },
  ];
  // a: 118-110 → home WIN; a totals: 228 vs 210 → over WIN; tied: source defect → VOID; missing → VOID.
  const { summary } = settleNbaSlate(legs, { a: FINAL(118, 110), tied: FINAL(100, 100) });
  assert.deepEqual(
    { total: summary.total, wins: summary.wins, losses: summary.losses, pushes: summary.pushes, voids: summary.voids, decisive: summary.decisive, reconciles: summary.reconciles },
    { total: 4, wins: 2, losses: 0, pushes: 0, voids: 2, decisive: 2, reconciles: true },
  );
});

test("contract surface is closed: version 1, four outcomes, three markets", () => {
  assert.equal(NBA_SETTLEMENT_CONTRACT_VERSION, 1);
  assert.deepEqual([...OUTCOMES], ["WIN", "LOSS", "PUSH", "VOID_PENDING_REVIEW"]);
  assert.deepEqual([...MARKETS], ["moneyline", "point_spread", "total_points"]);
});

test("NO LEDGER WRITER: the contract module performs no filesystem writes", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "sports", "nba", "settlement-contract.mjs"), "utf8");
  assert.ok(!/writeFileSync|appendFileSync|mkdirSync/.test(src), "one settlement writer exists in this repo and this is not it");
});
