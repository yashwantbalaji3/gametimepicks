/**
 * NFL settlement contract guards (Program 161 · Release D).
 *
 * The acceptance bar from the roadmap item: guard-tested against REAL corpus shapes, zero-gap
 * reconciliation, and no path that grades anything before a real final. The corpus section grades
 * all 1,001 research finals and cross-checks the contract's verdicts against the corpus's own
 * result column — the contract must agree with three seasons of settled reality, ties included.
 *
 * Run: npx tsx --test src/lib/sports/nfl/settlement-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { NFL_SETTLEMENT_CONTRACT_VERSION, OUTCOMES, MARKETS, gradeNflLeg, settleNflSlate } from "./settlement-contract.mjs";

const FINAL = (h, a) => ({ status: "STATUS_FINAL", homePointsFT: h, awayPointsFT: a });

test("moneyline: home win, away win, and the EXPLICIT tie push", () => {
  assert.equal(gradeNflLeg({ market: "moneyline", side: "home" }, FINAL(24, 17)).outcome, "WIN");
  assert.equal(gradeNflLeg({ market: "moneyline", side: "away" }, FINAL(24, 17)).outcome, "LOSS");
  assert.equal(gradeNflLeg({ market: "moneyline", side: "home" }, FINAL(20, 20)).outcome, "PUSH");
  assert.equal(gradeNflLeg({ market: "moneyline", side: "away" }, FINAL(20, 20)).outcome, "PUSH");
  assert.equal(gradeNflLeg({ market: "moneyline", side: "draw" }, FINAL(20, 20)).outcome, "VOID_PENDING_REVIEW", "a two-way market has no draw side");
});

test("point_spread: side-relative line, exact integer cover is PUSH from both sides", () => {
  assert.equal(gradeNflLeg({ market: "point_spread", side: "home", line: -3.5 }, FINAL(27, 20)).outcome, "WIN");
  assert.equal(gradeNflLeg({ market: "point_spread", side: "home", line: -7.5 }, FINAL(27, 20)).outcome, "LOSS");
  assert.equal(gradeNflLeg({ market: "point_spread", side: "home", line: -7 }, FINAL(27, 20)).outcome, "PUSH");
  assert.equal(gradeNflLeg({ market: "point_spread", side: "away", line: 7 }, FINAL(27, 20)).outcome, "PUSH", "the same position from the other side pushes identically");
  assert.equal(gradeNflLeg({ market: "point_spread", side: "away", line: 7.5 }, FINAL(27, 20)).outcome, "WIN");
  assert.equal(gradeNflLeg({ market: "point_spread", side: "home", line: 3.5 }, FINAL(20, 23)).outcome, "WIN", "an underdog line covers a narrow loss");
});

test("total_points: over/under with exact-line PUSH", () => {
  assert.equal(gradeNflLeg({ market: "total_points", side: "over", line: 43.5 }, FINAL(27, 20)).outcome, "WIN");
  assert.equal(gradeNflLeg({ market: "total_points", side: "under", line: 43.5 }, FINAL(27, 20)).outcome, "LOSS");
  assert.equal(gradeNflLeg({ market: "total_points", side: "over", line: 47 }, FINAL(27, 20)).outcome, "PUSH");
});

test("nothing grades without a real FINAL: statuses, missing scores, negatives, unknown markets", () => {
  for (const status of ["STATUS_SCHEDULED", "STATUS_IN_PROGRESS", "STATUS_POSTPONED", "STATUS_CANCELED", undefined]) {
    assert.equal(gradeNflLeg({ market: "moneyline", side: "home" }, { status, homePointsFT: 21, awayPointsFT: 14 }).outcome, "VOID_PENDING_REVIEW", String(status));
  }
  assert.equal(gradeNflLeg({ market: "moneyline", side: "home" }, { status: "STATUS_FINAL", homePointsFT: null, awayPointsFT: 14 }).outcome, "VOID_PENDING_REVIEW", "the postponed-Final-without-scores trap");
  assert.equal(gradeNflLeg({ market: "moneyline", side: "home" }, { status: "STATUS_FINAL", homePointsFT: -3, awayPointsFT: 14 }).outcome, "VOID_PENDING_REVIEW");
  assert.equal(gradeNflLeg({ market: "team_touchdowns", side: "over", line: 2.5 }, FINAL(21, 14)).outcome, "VOID_PENDING_REVIEW", "unknown markets refuse instead of improvising");
  assert.equal(gradeNflLeg({ market: "moneyline", side: "home" }, FINAL(21.5, 14)).outcome, "VOID_PENDING_REVIEW", "non-integer points refuse");
});

test("CORPUS · the contract agrees with all 1,001 settled finals, ties included", () => {
  const corpus = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data", "internal", "research", "nfl", "corpus-v1.json"), "utf8"));
  const rows = corpus.rows ?? corpus.games;
  assert.equal(rows.length, 1001, "the committed research corpus");
  let pushes = 0;
  for (const r of rows) {
    const verdict = gradeNflLeg({ market: "moneyline", side: "home" }, { status: r.statusRaw, homePointsFT: r.ftHome, awayPointsFT: r.ftAway });
    assert.notEqual(verdict.outcome, "VOID_PENDING_REVIEW", `corpus row ${r.providerEventId} must be gradeable — it is a settled final`);
    const expected = r.result === "H" ? "WIN" : r.result === "A" ? "LOSS" : "PUSH";
    assert.equal(verdict.outcome, expected, `${r.providerEventId}: contract says ${verdict.outcome}, corpus settled ${r.result} (${r.ftHome}-${r.ftAway})`);
    if (verdict.outcome === "PUSH") pushes += 1;
  }
  assert.equal(pushes, rows.filter((r) => r.result === "T").length, "every tie pushes and nothing else does");
  assert.ok(pushes >= 1, "the corpus contains real ties — the tie path is exercised by reality, not fixtures");
});

test("batch settle reconciles exactly (gap zero) and counts decisive = W+L only", () => {
  const legs = [
    { providerEventId: "a", market: "moneyline", side: "home" },
    { providerEventId: "a", market: "total_points", side: "over", line: 41 },
    { providerEventId: "b", market: "moneyline", side: "away" },
    { providerEventId: "missing", market: "moneyline", side: "home" },
  ];
  // a: 24-17 → home WIN; a totals: 41 on the 41 line → PUSH; b: 20-20 tie → moneyline PUSH; missing → VOID.
  const { summary } = settleNflSlate(legs, { a: FINAL(24, 17), b: FINAL(20, 20) });
  assert.deepEqual(
    { total: summary.total, wins: summary.wins, losses: summary.losses, pushes: summary.pushes, voids: summary.voids, decisive: summary.decisive, reconciles: summary.reconciles },
    { total: 4, wins: 1, losses: 0, pushes: 2, voids: 1, decisive: 1, reconciles: true },
  );
});

test("contract surface is closed: version 1, four outcomes, three markets", () => {
  assert.equal(NFL_SETTLEMENT_CONTRACT_VERSION, 1);
  assert.deepEqual([...OUTCOMES], ["WIN", "LOSS", "PUSH", "VOID_PENDING_REVIEW"]);
  assert.deepEqual([...MARKETS], ["moneyline", "point_spread", "total_points"]);
});

test("NO LEDGER WRITER: the contract module performs no filesystem writes", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "sports", "nfl", "settlement-contract.mjs"), "utf8");
  assert.ok(!/writeFileSync|appendFileSync|mkdirSync/.test(src), "one settlement writer exists in this repo and this is not it");
});
