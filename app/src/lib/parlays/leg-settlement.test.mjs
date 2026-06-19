import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gradeSoccerMoneyline, gradeSoccerDrawNoBet, gradeOverUnder, gradeHitsRunsRbis, gradeParlayStep,
} from "./leg-settlement.ts";

test("soccer moneyline (90'): picked team must win in regulation", () => {
  assert.equal(gradeSoccerMoneyline(true, 4, 1), "won", "Switzerland 4-1 (home win) → won");
  assert.equal(gradeSoccerMoneyline(true, 1, 1), "lost", "draw → ML lost");
  assert.equal(gradeSoccerMoneyline(false, 1, 0), "lost", "picked away, home won → lost");
});

test("soccer draw-no-bet: win → won, draw → void, loss → lost", () => {
  assert.equal(gradeSoccerDrawNoBet(true, 1, 0), "won", "Mexico 1-0 (home win) → won");
  assert.equal(gradeSoccerDrawNoBet(true, 1, 1), "void", "draw refunds → void");
  assert.equal(gradeSoccerDrawNoBet(true, 0, 2), "lost", "regulation loss → lost");
});

test("over/under: line comparison, push, and DNP void", () => {
  assert.equal(gradeOverUnder("over", 2, 0.5, true), "won", "Soto 2 hits Over 0.5 → won");
  assert.equal(gradeOverUnder("over", 0, 0.5, true), "lost", "0 hits with a PA → lost");
  assert.equal(gradeOverUnder("over", 1, 0.5, false), "void", "DNP / no plate appearance → void");
  assert.equal(gradeOverUnder("under", 3, 4.5, true), "won", "under wins when below the line");
  assert.equal(gradeOverUnder("over", 2, 2, true), "void", "exactly on the line → push/void");
});

test("hits+runs+RBIs grading (Goldschmidt case): HRR=1 over 1.5 → lost", () => {
  assert.equal(gradeHitsRunsRbis("over", 1, 0, 0, 1.5, true), "lost", "1+0+0=1 ≤ 1.5 with a PA → lost");
  assert.equal(gradeHitsRunsRbis("over", 1, 1, 1, 1.5, true), "won", "1+1+1=3 > 1.5 → won");
  assert.equal(gradeHitsRunsRbis("over", 0, 0, 0, 1.5, false), "void", "DNP → void");
});

test("parlay step: one loss loses; a void drops out; all-void voids", () => {
  assert.equal(gradeParlayStep(["won", "won"]), "won", "both win → step won (Lane A Step 1)");
  assert.equal(gradeParlayStep(["won", "lost"]), "lost", "one loss → step lost (Lane B Step 2)");
  assert.equal(gradeParlayStep(["won", "void"]), "won", "a void drops out → reduces to the survivor");
  assert.equal(gradeParlayStep(["void", "void"]), "void", "all legs void → step void");
  assert.equal(gradeParlayStep(["lost", "void"]), "lost", "any loss still loses");
});

test("June 18 lanes settle exactly as graded from official numbers", () => {
  // Lane A Step 1: Mexico DNB (1-0 home win) + Soto Hits Over 0.5 (2 hits).
  const laneA = gradeParlayStep([
    gradeSoccerDrawNoBet(true, 1, 0),
    gradeOverUnder("over", 2, 0.5, true),
  ]);
  assert.equal(laneA, "won", "Lane A Step 1 → WON (advances)");
  // Lane B Step 2: Switzerland ML (4-1 home win) + Goldschmidt HRR Over 1.5 (HRR 1).
  const laneB = gradeParlayStep([
    gradeSoccerMoneyline(true, 4, 1),
    gradeHitsRunsRbis("over", 1, 0, 0, 1.5, true),
  ]);
  assert.equal(laneB, "lost", "Lane B Step 2 → LOST (stops)");
});
