/**
 * Parlay Lab V2 · per-tier history + the reduced-win payout defect. Run: npx tsx --test src/lib/parlays/v2/history.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { tierHistory, isReducedWin, isOverstatedReducedWin, combinedDecimalAsSettled, combinedDecimalReduced, SMALL_SAMPLE_N, PAYOUT_REVIEW_NOTE } from "./history.mjs";
import { PAYOUT_POLICY } from "../settlement.mjs";

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

test("a reduced win on a receipt written under the fix (it carries payoutDecimal) is NOT flagged", () => {
  const fixed = { sport: "mlb", tier: "high", result: "win", combinedDecimal: 2.451623, payoutDecimal: 1.505051, legs: ["win", "void"] };
  assert.equal(isReducedWin(fixed), true);
  assert.equal(isOverstatedReducedWin(fixed), false);
  assert.equal(isOverstatedReducedWin({ result: "win", legs: ["win", "void"] }), true, "a legacy receipt card has no payoutDecimal");
  const h = tierHistory([{ date: "2026-10-21", policyVersion: 2, payoutPolicy: PAYOUT_POLICY, cards: [fixed] }], ledger);
  assert.equal(h.high.payoutUnderReview, false);
  assert.equal(h.high.payoutNote, null);
});

/* ── THE SETTLEMENT DEFECT (fixed forward-only in PR #1141 · lib/parlays/settlement.mjs) ─────────────────────────
   Published receipt parlays/lab-settled/2026-08-18.json, slip_2026-08-18_conservative_9cbc273e3512 (MLB, medium):
   legs priced −198 and −159 (parlays/risk-ladder/2026-08-18.json), settled ['win', 'void'], recorded
   combinedDecimal 2.451623. The void leg's −159 is in the recorded figure; the reduced card is the −198 leg alone.
   The receipt itself is unchanged (append-only): settlement.test.mjs pins every historical card byte-for-byte. */
const LEGS = [-198, -159];
const RESULTS = ["win", "void"];
const RECORDED = 2.451623;

test("reproduction: the legacy arithmetic matches the published receipt and overstates the reduced win", () => {
  assert.equal(combinedDecimalAsSettled(LEGS), RECORDED);
  assert.equal(combinedDecimalReduced(LEGS, RESULTS), 1.505051);
  assert.ok(combinedDecimalAsSettled(LEGS) - combinedDecimalReduced(LEGS, RESULTS) > 0.9, "≈0.95 units overstated on one paper unit");
});

test("source pin: the settler no longer prices a payout inline — it routes through settlement.mjs under the receipt's own policy", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "parlays", "settle-lab-cards.mjs"), "utf8");
  const loop = src.slice(src.indexOf("for (const leg of card.legs ?? [])"), src.indexOf("const receipt = {"));
  assert.doesNotMatch(loop, /combined \*= dec\(leg\.odds\)/, "the inline full-card product is gone");
  assert.match(src, /from "\.\.\/\.\.\/src\/lib\/parlays\/settlement\.mjs"/);
  assert.match(loop, /receiptCard\(\{/);
  assert.match(src, /const policy = payoutPolicyForRun\(prior\);/, "the policy comes from the receipt already on disk");
});

test("intended: a reduced win is paid on its decisive winning legs only (formerly a todo; now the settled rule)", () => {
  // Receipts settled from now on carry payoutDecimal = combinedDecimalReduced. Legacy receipts keep their recorded
  // figure; restating them is a founder decision (docs/PARLAY_LAB_V2.md lists every affected card).
  assert.equal(combinedDecimalReduced(LEGS, RESULTS), 1.505051);
  assert.notEqual(combinedDecimalAsSettled(LEGS), combinedDecimalReduced(LEGS, RESULTS), "the historical figure is not restated");
});
