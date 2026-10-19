/**
 * Parlay Lab V2 · per-tier history + the reduced-win payout defect. Run: npx tsx --test src/lib/parlays/v2/history.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { tierHistory, isReducedWin, combinedDecimalAsSettled, combinedDecimalReduced, SMALL_SAMPLE_N, PAYOUT_REVIEW_NOTE } from "./history.mjs";

const ledger = { policy: { version: 2, since: "2026-08-17" } };
const day = (date, cards, policyVersion = 2) => ({ date, policyVersion, cards: cards.map(([tier, result, legs = [result]]) => ({ sport: "mlb", tier, result, legs })) });

test("counts W / L / PUSH / VOID / PENDING / NO PLAY per tier; n = settled cards; rate travels with its denominator", () => {
  const docs = [
    day("2026-08-20", [["low", "win"], ["medium", "loss"], ["high", "push"]]),
    day("2026-08-21", [["low", "loss"], ["medium", "void"], ["longshot", "pending"]]),
    day("2026-08-22", [["low", "win", ["win", "void"]]]),
    day("2026-08-10", [["low", "win"]]),            // before policy.since — excluded
    day("2026-08-23", [["low", "win"]], 1),         // other policy version — excluded
  ];
  const h = tierHistory(docs, ledger, { sport: "mlb" });
  assert.deepEqual(Object.keys(h), ["low", "medium", "high", "longshot"]);
  assert.deepEqual(h.low.counts, { win: 2, loss: 1, push: 0, void: 0, pending: 0, noPlay: 0 });
  assert.equal(h.low.n, 3);
  assert.deepEqual(h.low.hitRate, { value: 2 / 3, wins: 2, of: 3 });
  assert.deepEqual(h.medium.counts, { win: 0, loss: 1, push: 0, void: 1, pending: 0, noPlay: 1 });
  assert.deepEqual(h.high.counts, { win: 0, loss: 0, push: 1, void: 0, pending: 0, noPlay: 2 });
  assert.equal(h.high.hitRate, null, "no decisive card ⇒ no rate, never 0%");
  assert.deepEqual(h.longshot.counts, { win: 0, loss: 0, push: 0, void: 0, pending: 1, noPlay: 2 });
  assert.equal(h.longshot.n, 0);
});

test("small-sample note below 30 settled cards, and not at 30", () => {
  const docs = Array.from({ length: SMALL_SAMPLE_N }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, "0")}`, [["medium", i % 2 ? "win" : "loss"]]));
  const h = tierHistory(docs, ledger);
  assert.equal(h.medium.n, 30);
  assert.equal(h.medium.smallSample, false);
  assert.equal(h.medium.smallSampleNote, null);
  const h2 = tierHistory(docs.slice(1), ledger);
  assert.equal(h2.medium.smallSample, true);
  assert.match(h2.medium.smallSampleNote, /fewer than 30/);
});

test("a tier with a reduced win (void or push leg on a winning card) is flagged 'ledger payout under review'", () => {
  assert.equal(isReducedWin({ result: "win", legs: ["win", "void"] }), true);
  assert.equal(isReducedWin({ result: "win", legs: ["push", "win"] }), true);
  assert.equal(isReducedWin({ result: "loss", legs: ["loss", "void"] }), false, "a loss returns nothing either way");
  assert.equal(isReducedWin({ result: "win", legs: ["win", "win"] }), false);
  const h = tierHistory([day("2026-09-01", [["high", "win", ["win", "void", "win"]], ["low", "win", ["win", "win"]]])], ledger);
  assert.equal(h.high.payoutUnderReview, true);
  assert.equal(h.high.payoutNote, PAYOUT_REVIEW_NOTE);
  assert.equal(h.low.payoutUnderReview, false);
  assert.equal(h.low.payoutNote, null);
});

/* ── THE SETTLEMENT DEFECT (settle-lab-cards.mjs ~line 335) ────────────────────────────────────────────────────
   Published receipt parlays/lab-settled/2026-08-18.json, slip_2026-08-18_conservative_9cbc273e3512 (MLB, medium):
   legs priced −198 and −159 (parlays/risk-ladder/2026-08-18.json), settled ['win', 'void'], recorded
   combinedDecimal 2.451623. The void leg's −159 is still multiplied in; the reduced card is the −198 leg alone. */
const LEGS = [-198, -159];
const RESULTS = ["win", "void"];
const RECORDED = 2.451623;

test("reproduction: the script's current arithmetic matches the published receipt and overstates the reduced win", () => {
  assert.equal(combinedDecimalAsSettled(LEGS), RECORDED);
  assert.equal(combinedDecimalReduced(LEGS, RESULTS), 1.505051);
  assert.ok(combinedDecimalAsSettled(LEGS) - combinedDecimalReduced(LEGS, RESULTS) > 0.9, "≈0.95 units overstated on one paper unit");
});

test("source pin: settle-lab-cards.mjs still multiplies every leg's price before voids are removed", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "parlays", "settle-lab-cards.mjs"), "utf8");
  const loop = src.slice(src.indexOf("for (const leg of card.legs ?? [])"), src.indexOf("const decisive = results.filter"));
  assert.match(loop, /if \(leg\.odds != null\) combined \*= dec\(leg\.odds\);/,
    "the defect moved or was fixed — update history.mjs combinedDecimalAsSettled, flip the todo test below, and drop the UI note once payouts are restated");
});

test("intended: a reduced win is paid on its decisive legs only", { todo: "payout restatement needs founder approval" }, () => {
  // Fails today by design (2.451623 ≠ 1.505051). Marked todo so the suite stays green until the founder approves
  // restating published payouts; settle-lab-cards.mjs and every published receipt are left unchanged.
  assert.equal(combinedDecimalAsSettled(LEGS), combinedDecimalReduced(LEGS, RESULTS));
});
