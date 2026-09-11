import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PROTECTED_BASE, applyFold, foldReceipts, uncarriedWins, foldLedgerRows } from "./protected-fold.mjs";
import { checkProtectedLedger, historyHash, readReceiptsFrom } from "./protected-invariant.mjs";

const APP = process.cwd();
const receipts = readReceiptsFrom(APP);
const portfolio = JSON.parse(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"), "utf8"));
const through = (d) => receipts.filter((r) => r.date <= d);

test("RULE S on the official receipts through 2026-09-09 is the proposal's number: $18,015.40", () => {
  const f = foldReceipts(through("2026-09-09"));
  assert.equal(f.foldedThrough, "2026-09-09");
  assert.deepEqual([f.bankBuilder, f.moonshot], [{ won: 7, lost: 7 }, { won: 0, lost: 14 }]);
  assert.equal(f.bankrollDelta, -1050);
  const next = applyFold(portfolio, f, { foldedAt: "2026-09-11T05:00:00Z", receipts });
  assert.equal(next.currentBankroll, 18015.4);
  assert.deepEqual(next.record, { wins: 26, losses: 21, voids: 0, pending: 0 });
  assert.equal(next.crownBankroll, 20465.4, "the crown never moves");
  assert.equal(next.settledProfit, 17915.4);
  assert.equal(next.drawdown, 2450);
  assert.deepEqual(next.moonshot.record, { wins: 0, losses: 14, voids: 0, pending: 0 });
  assert.equal(next.moonshot.legacy?.card?.cardId, "moonshot-2026-06-21-cross-slate-restart", "the old lane is kept as history");
});

test("the never-placed rows of the frozen stretch are skipped, not folded and not blocking", () => {
  const f = foldReceipts(through("2026-09-09"));
  assert.ok(f.days.some((d) => d.date === "2026-08-17") && f.days.some((d) => d.date === "2026-09-06"));
  assert.equal(f.days.find((d) => d.date === "2026-08-25").delta, 0);
});

test("an OPEN placed day halts the fold — nothing after it folds", () => {
  const open = [...through("2026-09-09"), { date: "2026-09-10", lanes: [{ product: "bank-builder", lane: "A", step: 1, stake: 100, status: "active", result: "pending" }] }, { date: "2026-09-11", lanes: [{ product: "bank-builder", lane: "A", step: 1, stake: 100, status: "lost", result: "lost" }] }];
  const f = foldReceipts(open);
  assert.equal(f.foldedThrough, "2026-09-09");
  assert.equal(f.haltedAt, "2026-09-10");
});

test("history is untouched by the fold, and folding twice is folding once", () => {
  const f = foldReceipts(through("2026-09-09"));
  const once = applyFold(portfolio, f, { receipts }), twice = applyFold(once, f, { receipts });
  assert.equal(historyHash(once), historyHash(portfolio));
  assert.deepEqual({ ...twice, protectedFold: null }, { ...once, protectedFold: null });
  assert.deepEqual(twice.moonshot.legacy, once.moonshot.legacy, "the legacy card is not nested twice");
});

test("the uncarried wins are disclosed, not credited", () => {
  const u = uncarriedWins(receipts, { through: "2026-09-09" });
  assert.equal(u.length, 4, "four wins were replaced by a fresh Step 1 before 2026-09-10");
  assert.ok(u.every((w) => w.product === "bank-builder"));
});

test("INVARIANT · the committed record passes; tampering, restating, or touching history fails", () => {
  const good = applyFold(portfolio, foldReceipts(through("2026-09-09")), { receipts });
  assert.equal(checkProtectedLedger(portfolio, receipts).ok, true, "the unfolded July record is intact");
  assert.equal(checkProtectedLedger(good, receipts).ok, true);
  assert.equal(checkProtectedLedger({ ...good, currentBankroll: 19000 }, receipts).ok, false, "a tampered bankroll fails");
  assert.equal(checkProtectedLedger({ ...good, crownBankroll: 1 }, receipts).ok, false, "a moved crown fails");
  assert.equal(checkProtectedLedger({ ...good, completedLadders: [] }, receipts).ok, false, "rewritten history fails");
  const restated = receipts.map((r) => (r.date === "2026-09-07" ? { ...r, lanes: r.lanes.map((l) => (l.product === "bank-builder" && l.lane === "A" ? { ...l, result: "won" } : l)) } : r));
  assert.equal(checkProtectedLedger(good, restated).ok, false, "a restated settled day fails");
  assert.equal((PROTECTED_BASE.protectedFold?.base?.currentBankroll ?? PROTECTED_BASE.currentBankroll), 19065.4);
});

test("the fold's ledger rows chain from the July base, close on the bankroll, and never restate a day", () => {
  const fold = { days: [
    { date: "2026-09-01", bankBuilder: { won: 1, lost: 1 }, moonshot: { won: 0, lost: 2 }, delta: -150 },
    { date: "2026-09-02", bankBuilder: { won: 0, lost: 0 }, moonshot: { won: 0, lost: 0 }, delta: 0 },
    { date: "2026-09-03", bankBuilder: { won: 2, lost: 0 }, moonshot: { won: 0, lost: 0 }, delta: 0 },
  ] };
  const baseDays = [{ date: "2026-07-07", opening: 19065.4, closing: 19065.4 }];
  const r = foldLedgerRows(fold, { foldedAt: "2026-09-04T05:00:00Z", ledgerEvents: [{ category: "bank_builder", paperProfit: 18965.4 }], summaryDays: baseDays });
  assert.equal(r.added, 2, "a day that settled nothing gets no money row");
  assert.equal(r.events.reduce((s, e) => s + e.paperProfit, 0), 18965.4 - 150, "Σ ledger moves by exactly the fold's delta");
  assert.deepEqual(r.days.slice(1).map((d) => [d.opening, d.closing]), [[19065.4, 18915.4], [18915.4, 18915.4]]);
  // Re-running adds nothing and keeps the original timestamps.
  const again = foldLedgerRows(fold, { foldedAt: "2026-09-05T05:00:00Z", ledgerEvents: r.events, summaryDays: r.days });
  assert.equal(again.added, 0);
  assert.equal(again.events.at(-1).timestamp, "2026-09-04T05:00:00Z", "a folded day keeps its timestamp");
  // A derivation that disagrees with a folded day is refused, never written over it.
  const restated = { days: [{ ...fold.days[0], moonshot: { won: 0, lost: 1 }, delta: -125 }, ...fold.days.slice(1)] };
  assert.throws(() => foldLedgerRows(restated, { foldedAt: "x", ledgerEvents: r.events, summaryDays: r.days }), /refusing to restate/);
});
