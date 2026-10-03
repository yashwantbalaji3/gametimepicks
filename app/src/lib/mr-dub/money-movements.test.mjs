/**
 * Session 8 · A — the money movements reconcile dollar-by-dollar, and every money mutation the session
 * names LANDS on a copy of the real record and is CAUGHT. A probe that does not change the input fails
 * as a probe (`landed`), so a mutation can never pass vacuously.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { reconcileMoney, buildMoneyMovements, openPositions, ERA } from "./money-movements.mjs";
import { FINAL_STEP, HALT, foldReceipts, foldBacklog } from "./protected-fold.mjs";
import { readReceiptsFrom } from "./protected-invariant.mjs";
import { MOONSHOT_STEP_COUNT } from "../moonshot/moonshot-ladder.mjs";

const APP = process.cwd();
const read = (f) => JSON.parse(fs.readFileSync(path.join(APP, "public/data/mr-dub", f), "utf8"));
const real = () => ({
  portfolio: read("portfolio.json"),
  ledgerEvents: read("ledger.json").events,
  summaryDays: read("daily-summary.json").days,
  receipts: readReceiptsFrom(APP),
});
const clone = (x) => JSON.parse(JSON.stringify(x));

test("the real record reconciles: $100 + every movement = the bankroll; peak recomputed = crown", () => {
  const r = reconcileMoney(real());
  assert.deepEqual(r.reasons, []);
  const p = read("portfolio.json");
  assert.equal(r.summary.recomputedBankroll, p.currentBankroll);
  assert.equal(r.summary.peak, p.crownBankroll);
  assert.equal(r.summary.peak, p.highWaterMark);
  assert.equal(r.summary.deltaToPeak, Math.round((p.currentBankroll - p.crownBankroll) * 100) / 100);
  assert.ok(r.summary.rowsByEra[ERA.BASE] > 0 && r.summary.rowsByEra[ERA.RULE_S] > 0);
});

test("every Rule S movement names its card, its receipt and both money views", () => {
  const ms = buildMoneyMovements(real()).filter((m) => m.era === ERA.RULE_S);
  for (const m of ms) {
    assert.match(m.source.productReceipt, /^mr-dub\/settled\/\d{4}-\d{2}-\d{2}\.json#lanes\[\d+\]$/);
    assert.ok(Number.isFinite(m.stake) && Number.isFinite(m.economicPnl) && Number.isFinite(m.bankrollDelta));
    assert.equal(m.bankrollAfter, Math.round((m.bankrollBefore + m.bankrollDelta) * 100) / 100);
  }
  // the worked example in the module header
  const a4 = ms.find((m) => m.movementId === "rule-s:2026-09-30:bank-builder:A:4");
  assert.deepEqual([a4.stake, a4.economicPnl, a4.bankrollDelta, a4.result], [1435.47, -1435.47, -100, "LOSS"]);
});

test("FINAL_STEP is the live ladders' own rung count", async () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/bank-builder-ladder.ts"), "utf8");
  const bbRungs = (src.match(/BANK_BUILDER_LADDER[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1].match(/step:\s*\d+/g) ?? []).length;
  assert.equal(FINAL_STEP["bank-builder"], bbRungs);
  assert.equal(FINAL_STEP.moonshot, MOONSHOT_STEP_COUNT);
});

/* ---------------------------------------------------------------- mutation probes */

const probes = [
  ["settled loss omitted", (d) => { const r = d.receipts.find((x) => x.date === "2026-09-30"); r.lanes = r.lanes.filter((l) => !(l.product === "bank-builder" && l.lane === "A")); }],
  ["settled win double-applied", (d) => { const e = d.ledgerEvents.find((x) => x.eventId === "mrdub-crown-step5"); d.ledgerEvents.push(clone(e)); }],
  ["stake changed after freeze", (d) => { d.receipts.find((x) => x.date === "2026-09-30").lanes.find((l) => l.product === "bank-builder" && l.lane === "B").stake = 350; }],
  ["return changed after settlement", (d) => { d.receipts.find((x) => x.date === "2026-09-27").lanes.find((l) => l.product === "bank-builder" && l.lane === "B").potentialReturn = 420; }],
  ["pending counted as loss", (d) => { const day = d.portfolio.protectedFold.days.find((x) => x.date === "2026-10-01"); day.bankBuilder.lost += 1; day.delta -= 100; d.portfolio.currentBankroll -= 100; }],
  ["push counted as a loss", (d) => { const l = d.receipts.find((x) => x.date === "2026-09-30").lanes.find((x) => x.product === "bank-builder" && x.lane === "A"); l.result = "push"; l.status = "push"; }],
  ["void moves the bankroll", (d) => { const day = d.summaryDays.find((x) => x.date === "2026-09-30"); day.pl -= 25; day.closing -= 25; d.portfolio.currentBankroll -= 25; }],
  ["shadow card moves the bankroll", (d) => { d.receipts.find((x) => x.date === "2026-09-30").lanes.push({ product: "bb-c1-shadow", lane: "A", step: 1, stake: 100, status: "lost", result: "lost", potentialReturn: 250, legs: [] }); }],
  ["duplicate settlement", (d) => { const r = d.receipts.find((x) => x.date === "2026-09-30"); r.lanes.push(clone(r.lanes.find((l) => l.product === "bank-builder" && l.lane === "A"))); }],
  ["balanceBefore mismatch", (d) => { d.summaryDays.find((x) => x.date === "2026-09-30").opening += 10; }],
  ["balanceAfter mismatch", (d) => { d.summaryDays.find((x) => x.date === "2026-09-30").closing += 10; }],
  ["historical peak decreases", (d) => { d.portfolio.crownBankroll = 20000; d.portfolio.highWaterMark = 20000; }],
  ["historical row disappears", (d) => { d.ledgerEvents = d.ledgerEvents.filter((e) => e.eventId !== "mrdub-crown-step3"); }],
  ["running balance broken (bankroll edited)", (d) => { d.portfolio.currentBankroll += 0.01; }],
  ["completed ladder folded as a roll", (d) => { const l = d.receipts.find((x) => x.date === "2026-09-30").lanes.find((x) => x.product === "bank-builder" && x.lane === "B"); l.step = FINAL_STEP["bank-builder"]; }],
];

for (const [name, mutate] of probes) {
  test(`mutation probe — ${name}: lands and is caught`, () => {
    const base = real();
    const d = clone(base);
    mutate(d);
    assert.notDeepEqual(d, base, "the probe did not land (vacuous)");
    const r = reconcileMoney(d);
    assert.equal(r.ok, false, `not caught: ${name}`);
    assert.ok(r.reasons.length > 0);
  });
}

test("a candidate (awaiting) card is not exposure; a placed open card is — at its seed", () => {
  const rs = [{ date: "2026-10-05", lanes: [
    { product: "bank-builder", lane: "A", step: 1, stake: 100, status: "awaiting", result: "pending" },
    { product: "moonshot", lane: "B", step: 2, stake: 100.17, status: "active", result: "pending" },
  ] }];
  const open = openPositions(rs, "2026-10-01");
  assert.equal(open.length, 1);
  assert.deepEqual([open[0].product, open[0].seedAtRisk, open[0].stake], ["moonshot", 25, 100.17]);
});

test("a completed ladder no longer halts the fold: since C1 it banks (final − seed) and later days fold (Session 9)", () => {
  const receipts = readReceiptsFrom(APP).filter((r) => r.date <= "2026-10-01");
  const done = [...receipts, { date: "2026-10-03", lanes: [{ product: "moonshot", lane: "B", step: FINAL_STEP.moonshot, stake: 400, status: "won", result: "won", potentialReturn: 1010 }] },
    { date: "2026-10-04", lanes: [{ product: "bank-builder", lane: "A", step: 1, stake: 100, status: "lost", result: "lost" }] }];
  const f = foldReceipts(done);
  assert.deepEqual([f.foldedThrough, f.haltReason], ["2026-10-04", null]);
  assert.equal(f.days.find((d) => d.date === "2026-10-03").completions[0].banked, 985);
  assert.equal(f.days.find((d) => d.date === "2026-10-03").delta, 985);
  assert.equal(foldBacklog(done, { after: "2026-10-01" }).haltReason, null);
  // the Session 8 halt survives for a completion the policy does not cover (dated before it took effect)
  const early = foldReceipts([...receipts.filter((r) => r.date <= "2026-09-29"), { date: "2026-09-30", lanes: [{ product: "moonshot", lane: "B", step: FINAL_STEP.moonshot, stake: 400, status: "won", result: "won", potentialReturn: 1010 }] }]);
  assert.deepEqual([early.haltedAt, early.haltReason], ["2026-09-30", HALT.COMPLETION]);
  // a non-final win still rolls and folds
  const roll = foldReceipts([...receipts, { date: "2026-10-03", lanes: [{ product: "moonshot", lane: "B", step: FINAL_STEP.moonshot - 1, stake: 100, status: "won", result: "won", potentialReturn: 410 }] }]);
  assert.equal(roll.foldedThrough, "2026-10-03");
  assert.equal(roll.haltReason, null);
  assert.equal(roll.days.at(-1).delta, 0);
});

test("an unknown product halts the fold — only official products move money", () => {
  const receipts = readReceiptsFrom(APP).filter((r) => r.date <= "2026-10-01");
  const f = foldReceipts([...receipts, { date: "2026-10-03", lanes: [{ product: "sp-v2-shadow", lane: "A", step: 1, stake: 100, status: "lost", result: "lost" }] }]);
  assert.deepEqual([f.foldedThrough, f.haltReason], ["2026-10-01", HALT.UNKNOWN_PRODUCT]);
});
