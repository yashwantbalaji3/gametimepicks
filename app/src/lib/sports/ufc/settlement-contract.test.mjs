/**
 * UFC settlement contract guards (Program 162 · Release I).
 *
 * The corpus section grades all 1,716 research finals and cross-checks every verdict against the
 * corpus's own outcome column — including the 25 DRAW_OR_NC bouts, which must ALL quarantine
 * (the winner-only source cannot split draw from no-contest, so v1 refuses to guess) and must be
 * the ONLY quarantines. Zero pushes may exist in v1 by construction.
 *
 * Run: npx tsx --test src/lib/sports/ufc/settlement-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { UFC_SETTLEMENT_CONTRACT_VERSION, OUTCOMES, MARKETS, gradeUfcBout, settleUfcCard } from "./settlement-contract.mjs";

const FINAL = (red, blue) => ({ status: "STATUS_FINAL", redWinner: red, blueWinner: blue });

test("bout_winner grades the official winner; both-winners and no-winner finals quarantine with named reasons", () => {
  assert.equal(gradeUfcBout({ market: "bout_winner", side: "red" }, FINAL(true, false)).outcome, "WIN");
  assert.equal(gradeUfcBout({ market: "bout_winner", side: "blue" }, FINAL(true, false)).outcome, "LOSS");
  const noWinner = gradeUfcBout({ market: "bout_winner", side: "red" }, FINAL(false, false));
  assert.equal(noWinner.outcome, "VOID_PENDING_REVIEW");
  assert.match(noWinner.reason, /draw or no-contest/, "the ambiguity is named, never guessed");
  const both = gradeUfcBout({ market: "bout_winner", side: "red" }, FINAL(true, true));
  assert.equal(both.outcome, "VOID_PENDING_REVIEW");
  assert.match(both.reason, /source defect/);
});

test("only FINAL grades; unsupported markets and unknown sides refuse", () => {
  for (const status of ["STATUS_SCHEDULED", "STATUS_IN_PROGRESS", "STATUS_POSTPONED", "STATUS_CANCELED", undefined]) {
    assert.equal(gradeUfcBout({ market: "bout_winner", side: "red" }, { status, redWinner: true, blueWinner: false }).outcome, "VOID_PENDING_REVIEW", String(status));
  }
  const method = gradeUfcBout({ market: "method_of_victory", side: "ko" }, FINAL(true, false));
  assert.equal(method.outcome, "VOID_PENDING_REVIEW");
  assert.match(method.reason, /unsupported by the winner-only source/);
  assert.equal(gradeUfcBout({ market: "bout_winner", side: "champion" }, FINAL(true, false)).outcome, "VOID_PENDING_REVIEW");
});

test("CORPUS · all 1,716 settled finals agree with the outcome column; the 25 DRAW_OR_NC rows are the only quarantines; zero pushes", () => {
  const corpus = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data", "internal", "research", "ufc", "corpus-v1.json"), "utf8"));
  const rows = corpus.rows ?? corpus.bouts;
  assert.equal(rows.length, 1716, "the committed research corpus");
  let voids = 0, pushes = 0;
  for (const bout of rows) {
    const verdict = gradeUfcBout({ market: "bout_winner", side: "red" }, { status: bout.statusRaw, redWinner: bout.red?.winner === true, blueWinner: bout.blue?.winner === true });
    const expected = bout.outcome === "R" ? "WIN" : bout.outcome === "B" ? "LOSS" : "VOID_PENDING_REVIEW";
    assert.equal(verdict.outcome, expected, `${bout.providerBoutId}: contract says ${verdict.outcome}, corpus settled ${bout.outcome}`);
    if (verdict.outcome === "VOID_PENDING_REVIEW") voids += 1;
    if (verdict.outcome === "PUSH") pushes += 1;
  }
  assert.equal(voids, rows.filter((r) => r.outcome === "DRAW_OR_NC").length, "exactly the ambiguous finals quarantine — nothing else");
  assert.equal(voids, 25, "the corpus's 25 preserved draw/NC bouts");
  assert.equal(pushes, 0, "v1 cannot push: a push requires distinguishing draw from NC, which the source cannot");
});

test("card batch reconciles exactly with the decisive-denominator rule; card-bout separation via providerBoutId", () => {
  const legs = [
    { providerBoutId: "b1", market: "bout_winner", side: "red" },
    { providerBoutId: "b2", market: "bout_winner", side: "blue" },
    { providerBoutId: "b3", market: "bout_winner", side: "red" },
    { providerBoutId: "missing", market: "bout_winner", side: "red" },
  ];
  const { summary } = settleUfcCard(legs, { b1: FINAL(true, false), b2: FINAL(true, false), b3: FINAL(false, false) });
  assert.deepEqual(
    { total: summary.total, wins: summary.wins, losses: summary.losses, pushes: summary.pushes, voids: summary.voids, decisive: summary.decisive, reconciles: summary.reconciles },
    { total: 4, wins: 1, losses: 1, pushes: 0, voids: 2, decisive: 2, reconciles: true },
  );
});

test("closed surface: version 1, four outcomes, exactly one market; NO ledger writer in the module", () => {
  assert.equal(UFC_SETTLEMENT_CONTRACT_VERSION, 1);
  assert.deepEqual([...OUTCOMES], ["WIN", "LOSS", "PUSH", "VOID_PENDING_REVIEW"]);
  assert.deepEqual([...MARKETS], ["bout_winner"]);
  const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "sports", "ufc", "settlement-contract.mjs"), "utf8");
  assert.ok(!/writeFileSync|appendFileSync|mkdirSync/.test(src), "one settlement writer exists in this repo and this is not it");
});
