/**
 * Session 9 · A — completion banking C1: a completed ladder banks (final settled value − original seed), once.
 *
 * Every scenario starts from the REAL protected record (folded through 2026-10-01) and appends synthetic
 * receipts dated after it, continuing the lanes from where they really stand (BB B carried $951.89 into
 * step 3; Moonshot B carried $100.17 into step 2) so the stake-carry identity holds on real history. The
 * pipeline is the nightly one: foldReceipts → applyFold → foldLedgerRows → reconcileMoney + the invariant.
 *
 * Mutation probes LAND on a copy of a correctly folded record and must be CAUGHT; a probe that changes
 * nothing fails as a probe.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  COMPLETION_POLICY, FINAL_STEP, HALT, LADDER_GOALS, PROTECTED_BASE, SEED,
  applyFold, completesLadder, foldBacklog, foldLedgerRows, foldReceipts, nextStepAfterWin, uncarriedWins,
} from "./protected-fold.mjs";
import { reconcileMoney } from "./money-movements.mjs";
import { checkProtectedLedger, readReceiptsFrom } from "./protected-invariant.mjs";
import { positionFromReceipts } from "../products/ladder-position.mjs";
import { MOONSHOT_LADDER } from "../moonshot/moonshot-ladder.mjs";

const APP = process.cwd();
const read = (f) => JSON.parse(fs.readFileSync(path.join(APP, "public/data/mr-dub", f), "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const REAL = {
  portfolio: read("portfolio.json"),
  ledgerEvents: read("ledger.json").events,
  summaryDays: read("daily-summary.json").days,
  receipts: readReceiptsFrom(APP).filter((r) => r.date <= "2026-10-01"),
};
const BB_LADDER = LADDER_GOALS["bank-builder"].map((goal, i) => ({ step: i + 1, goal }));

const lane = (product, laneId, step, stake, result, potentialReturn) => ({
  product, lane: laneId, step, stake, status: result === "pending" ? "active" : result, result, potentialReturn, legs: [],
});
const day = (date, ...lanes) => ({ date, settledAt: `${date}T09:00:00Z`, source: "test", lanes });

/** BB B climbs 3 → 4 → 5 and completes ABOVE target (a real price beat the goal), then restarts and loses. */
const BB_RUN = [
  day("2026-10-03", lane("bank-builder", "B", 3, 951.89, "won", 1500)),
  day("2026-10-04", lane("bank-builder", "B", 4, 1500, "won", 3600)),
  day("2026-10-05", lane("bank-builder", "B", 5, 3600, "won", 10120.5)),
  day("2026-10-06", lane("bank-builder", "B", 1, 100, "lost", 210)),
];
/** Moonshot B: step 2 → step 3 → completes EXACTLY on its $1,000 target. */
const MS_RUN = [
  day("2026-10-03", lane("moonshot", "B", 2, 100.17, "won", 420)),
  day("2026-10-04", lane("moonshot", "B", 3, 420, "won", 1000)),
  day("2026-10-05", lane("moonshot", "B", 1, 25, "won", 101)),
];
const merge = (...runs) => {
  const byDate = new Map();
  for (const r of runs.flat()) byDate.set(r.date, byDate.has(r.date) ? { ...byDate.get(r.date), lanes: [...byDate.get(r.date).lanes, ...r.lanes] } : clone(r));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

/** The nightly pipeline over REAL + extra receipts. */
function nightly(extra, base = REAL) {
  const receipts = [...base.receipts, ...clone(extra)];
  const fold = foldReceipts(receipts);
  const portfolio = applyFold(base.portfolio, fold, { foldedAt: "2026-10-07T06:00:00Z", receipts });
  const rows = foldLedgerRows(fold, { foldedAt: "2026-10-07T06:00:00Z", ledgerEvents: base.ledgerEvents, summaryDays: base.summaryDays });
  return { fold, rows, data: { portfolio, ledgerEvents: rows.events, summaryDays: rows.days, receipts } };
}
const verdict = (data) => {
  const m = reconcileMoney(data);
  const inv = checkProtectedLedger(data.portfolio, data.receipts);
  return { ok: m.ok && inv.ok, reasons: [...m.reasons, ...inv.reasons], m };
};

test("the policy is C1, versioned, and prospective from the first unfolded day", () => {
  assert.equal(COMPLETION_POLICY.id, "COMPLETION_BANKING_C1");
  assert.equal(REAL.portfolio.protectedFold.foldedThrough, "2026-10-01");
  assert.ok(COMPLETION_POLICY.effectiveFrom > REAL.portfolio.protectedFold.foldedThrough, "C1 must not reach into a folded day");
  assert.deepEqual(LADDER_GOALS.moonshot, MOONSHOT_LADDER.map((r) => r.goal), "Moonshot goals pinned to the live ladder");
  const src = fs.readFileSync(path.join(APP, "src/lib/bank-builder-ladder.ts"), "utf8");
  const goals = [...src.matchAll(/step:\s*\d+,\s*start:\s*\d+,\s*goal:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(LADDER_GOALS["bank-builder"], goals, "Bank Builder goals pinned to the live ladder");
});

test("no historical receipt completes a ladder, so C1 changes no folded day (receipts and record unchanged)", () => {
  const all = readReceiptsFrom(APP);
  assert.deepEqual(all.flatMap((r) => (r.lanes ?? []).filter(completesLadder).map((l) => `${r.date} ${l.product} ${l.lane}`)), []);
  const fresh = foldReceipts(REAL.receipts);
  assert.equal(JSON.stringify(fresh.days), JSON.stringify(REAL.portfolio.protectedFold.days), "every folded day byte-identical under C1");
  assert.ok(fresh.days.every((d) => !("completions" in d)));
  assert.deepEqual(checkProtectedLedger(REAL.portfolio, REAL.receipts).reasons, []);
});

test("Bank Builder completion above target banks final − seed once; the lane restarts; the fold keeps going", () => {
  const { fold, rows, data } = nightly(BB_RUN);
  assert.equal(fold.foldedThrough, "2026-10-06", "a completion no longer blocks every later day");
  assert.equal(fold.haltReason, null);
  const c = fold.days.find((d) => d.date === "2026-10-05").completions;
  assert.equal(c.length, 1);
  assert.deepEqual(
    [c[0].policy, c[0].product, c[0].lane, c[0].step, c[0].seed, c[0].finalValue, c[0].banked, c[0].effectiveFrom, c[0].source],
    ["COMPLETION_BANKING_C1", "bank-builder", "B", 5, 100, 10120.5, 10020.5, "2026-10-02", "mr-dub/settled/2026-10-05.json#lanes[0]"],
  );
  assert.ok(Number.isInteger(c[0].cycle) && c[0].cycle > 1, "the completion names its lane cycle");
  assert.equal(data.portfolio.currentBankroll, Math.round((15240.4 + 10020.5 - 100) * 100) / 100);
  assert.equal(data.portfolio.crownBankroll, PROTECTED_BASE.crownBankroll, "the June crown is a history key and never moves");
  assert.equal(data.portfolio.highWaterMark, 25260.9, "the HWM recomputes from the path (10-05 close)");
  assert.equal(data.portfolio.drawdown, 100);
  assert.equal(rows.added, 4);
  const v = verdict(data);
  assert.deepEqual(v.reasons, []);
  const done = v.m.movements.filter((m) => m.kind === "ladder_completed");
  assert.equal(done.length, 1);
  assert.equal(done[0].bankrollDelta, 10020.5);
  assert.equal(v.m.summary.peak, 25260.9);
  assert.equal(v.m.summary.completionsBanked, 10020.5);
  // the lane machine agrees: a new cycle at the seed after the completion
  const pos = positionFromReceipts({ receipts: data.receipts.filter((r) => r.date <= "2026-10-05"), product: "bank-builder", lane: "B", ladder: BB_LADDER, seed: 100 });
  assert.deepEqual([pos.nextStep, pos.rolledStake, pos.basis.completed], [1, 100, true]);
  assert.deepEqual(uncarriedWins(data.receipts), uncarriedWins(REAL.receipts), "a completion is not an uncarried win");
});

test("Moonshot completion exactly on target banks $1,000 − $25 = $975", () => {
  const { fold, data } = nightly(MS_RUN);
  const c = fold.days.find((d) => d.date === "2026-10-04").completions;
  assert.deepEqual([c[0].product, c[0].finalValue, c[0].banked, c[0].seed], ["moonshot", 1000, 975, 25]);
  assert.equal(data.portfolio.currentBankroll, 16215.4);
  assert.deepEqual(verdict(data).reasons, []);
  assert.equal(data.portfolio.highWaterMark, PROTECTED_BASE.crownBankroll, "below the crown: the HWM stays the June peak");
});

test("both products completing in the same run reconcile together", () => {
  const { data } = nightly(merge(BB_RUN, MS_RUN));
  const v = verdict(data);
  assert.deepEqual(v.reasons, []);
  assert.equal(v.m.summary.completions, 2);
  assert.equal(v.m.summary.completionsBanked, 10995.5);
});

test("a duplicate nightly fold / bot rerun banks nothing twice", () => {
  const first = nightly(BB_RUN);
  const receipts = first.data.receipts;
  const again = foldReceipts(receipts);
  const p2 = applyFold(first.data.portfolio, again, { foldedAt: "2026-10-08T06:00:00Z", receipts });
  assert.equal(p2.currentBankroll, first.data.portfolio.currentBankroll);
  const rows2 = foldLedgerRows(again, { foldedAt: "2026-10-08T06:00:00Z", ledgerEvents: first.rows.events, summaryDays: first.rows.days });
  assert.equal(rows2.added, 0, "no new ledger row on a rerun");
  assert.equal(rows2.events.filter((e) => e.completions?.length).length, 1);
  assert.deepEqual(verdict({ ...first.data, portfolio: p2, ledgerEvents: rows2.events, summaryDays: rows2.days }).reasons, []);
});

test("a pending final rung banks nothing: the fold halts on the open day", () => {
  const run = [BB_RUN[0], BB_RUN[1], day("2026-10-05", lane("bank-builder", "B", 5, 3600, "pending", 10120.5))];
  const { fold, data } = nightly(run);
  assert.deepEqual([fold.foldedThrough, fold.haltedAt, fold.haltReason], ["2026-10-04", "2026-10-05", HALT.OPEN_DAY]);
  assert.ok(!fold.days.some((d) => d.completions));
  assert.equal(data.portfolio.currentBankroll, 15240.4);
  assert.deepEqual(verdict(data).reasons, []);
});

test("a push / void final rung is not a completion: $0, and the same rung is played again", () => {
  for (const res of ["push", "void"]) {
    const run = [BB_RUN[0], BB_RUN[1], day("2026-10-05", lane("bank-builder", "B", 5, 3600, res, 10120.5)), day("2026-10-06", lane("bank-builder", "B", 5, 3600, "won", 9800))];
    const { fold, data } = nightly(run);
    assert.ok(!fold.days.find((d) => d.date === "2026-10-05").completions, res);
    assert.equal(fold.days.find((d) => d.date === "2026-10-05").delta, 0, res);
    assert.equal(fold.days.find((d) => d.date === "2026-10-06").completions[0].banked, 9700, `${res}: the replayed final rung completes (final rung = completion even below goal)`);
    assert.deepEqual(verdict(data).reasons, [], res);
  }
});

test("a payout that clears the FINAL goal from an earlier rung completes the run — the fold agrees with the lane machine", () => {
  const run = [BB_RUN[0], day("2026-10-04", lane("bank-builder", "B", 4, 1500, "won", 10400)), day("2026-10-05", lane("bank-builder", "B", 1, 100, "won", 205))];
  const { fold, data } = nightly(run);
  assert.deepEqual(fold.days.find((d) => d.date === "2026-10-04").completions.map((c) => [c.step, c.banked]), [[4, 10300]]);
  assert.deepEqual(verdict(data).reasons, []);
  const pos = positionFromReceipts({ receipts: data.receipts.filter((r) => r.date <= "2026-10-04"), product: "bank-builder", lane: "B", ladder: BB_LADDER, seed: 100 });
  assert.deepEqual([pos.nextStep, pos.basis.completed], [1, true]);
});

test("completesLadder and nextStepAfterWin are the lane machine's rule on every rung and payout band", () => {
  for (const [product, goals, seed] of [["bank-builder", LADDER_GOALS["bank-builder"], 100], ["moonshot", LADDER_GOALS.moonshot, 25]]) {
    const ladder = goals.map((goal, i) => ({ step: i + 1, goal }));
    for (let step = 1; step <= goals.length; step += 1) {
      for (const payout of [...goals.flatMap((g) => [g - 0.01, g, g + 0.01]), seed * 1.5]) {
        const row = { product, lane: "A", step, stake: seed, status: "won", result: "won", potentialReturn: payout };
        const pos = positionFromReceipts({ receipts: [{ date: "2026-10-03", lanes: [row] }], product, lane: "A", ladder, seed });
        assert.equal(completesLadder(row), pos.basis?.completed === true, `${product} step ${step} payout ${payout}`);
        if (!completesLadder(row)) assert.equal(nextStepAfterWin(row), pos.nextStep, `${product} step ${step} payout ${payout}`);
      }
    }
  }
});

test("a completion dated before C1 took effect still halts (never banked retroactively)", () => {
  const receipts = REAL.receipts.filter((r) => r.date <= "2026-09-29");
  const before = foldReceipts([...receipts, day("2026-09-30", lane("moonshot", "B", FINAL_STEP.moonshot, 400, "won", 1010))]);
  assert.deepEqual([before.haltedAt, before.haltReason], ["2026-09-30", HALT.COMPLETION]);
  assert.deepEqual(foldBacklog([...receipts, day("2026-09-30", lane("moonshot", "B", 3, 400, "won", 1010))], { after: "2026-09-29" }).haltReason, HALT.COMPLETION);
});

test("a completed card without a real settled value halts instead of banking a guess", () => {
  const f = foldReceipts([...REAL.receipts, BB_RUN[0], BB_RUN[1], day("2026-10-05", lane("bank-builder", "B", 5, 3600, "won", undefined))]);
  assert.deepEqual([f.foldedThrough, f.haltReason], ["2026-10-04", HALT.COMPLETION_VALUE_MISSING]);
});

/* ---------------------------------------------------------------- mutation probes (A7 / §13) */

const GOOD = nightly(BB_RUN).data;
const completionDay = (d) => d.portfolio.protectedFold.days.find((x) => x.date === "2026-10-05");
const completionEvent = (d) => d.ledgerEvents.find((e) => e.date === "2026-10-05" && e.category === "protected_fold");
const completionSummary = (d) => d.summaryDays.find((x) => x.date === "2026-10-05");
/** Shift every recorded figure after a completion by `by` — the record agrees with ITSELF, so only a re-derivation catches it. */
const shiftRecord = (d, by) => {
  const cd = completionDay(d); cd.delta += by; cd.completions[0].banked += by;
  d.portfolio.protectedFold.bankrollDelta += by; d.portfolio.currentBankroll = Math.round((d.portfolio.currentBankroll + by) * 100) / 100;
  d.portfolio.highWaterMark = Math.max(PROTECTED_BASE.crownBankroll, d.portfolio.highWaterMark + by);
  const ev = completionEvent(d); ev.paperProfit += by; ev.completions[0].banked += by;
  for (const s of d.summaryDays.filter((x) => x.date >= "2026-10-05")) { if (s.date === "2026-10-05") s.pl += by; else s.opening += by; s.closing += by; }
};

const probes = [
  ["C2 — bank the full final value", (d) => shiftRecord(d, 100)],
  ["C3 — forfeit the run (bank zero)", (d) => shiftRecord(d, -10020.5)],
  ["seed double-counted (bank final − 2×seed)", (d) => shiftRecord(d, -100)],
  ["wrong seed on the completion receipt", (d) => { completionDay(d).completions[0].seed = 25; }],
  ["duplicate completion bank (the completed card appears twice)", (d) => { const r = d.receipts.find((x) => x.date === "2026-10-05"); r.lanes.push(clone(r.lanes[0])); }],
  ["duplicate completion bank (ledger row applied twice)", (d) => { d.ledgerEvents.push({ ...clone(completionEvent(d)), eventId: "mrdub-rule-s-2026-10-05-dup" }); }],
  ["final value changed after banking", (d) => { d.receipts.find((x) => x.date === "2026-10-05").lanes[0].potentialReturn = 12000; }],
  ["banked before settlement (final rung still pending)", (d) => { const l = d.receipts.find((x) => x.date === "2026-10-05").lanes[0]; l.result = "pending"; l.status = "active"; }],
  ["historical June row rewritten", (d) => { const e = d.ledgerEvents.find((x) => x.eventId === "mrdub-crown-step5"); e.paperProfit += 500; }],
  ["historical crown raised to the new peak", (d) => { d.portfolio.crownBankroll = d.portfolio.highWaterMark; }],
  ["completion folded as a $0 roll (completion dropped)", (d) => { const cd = completionDay(d); delete cd.completions; }],
  ["high-water mark not recomputed", (d) => { d.portfolio.highWaterMark = PROTECTED_BASE.crownBankroll; }],
];

for (const [name, mutate] of probes) {
  test(`C1 mutation probe — ${name}: lands and is caught`, () => {
    const d = clone(GOOD);
    mutate(d);
    assert.notDeepEqual(d, GOOD, "the probe did not land (vacuous)");
    const v = verdict(d);
    assert.equal(v.ok, false, `not caught: ${name}`);
  });
}

test("a completed run never remains permanently blocking (the C1 version of the Session 8 halt)", () => {
  const { fold } = nightly([...BB_RUN, day("2026-10-07", lane("bank-builder", "B", 2, 210, "lost", 700))].map((r, i, a) =>
    r.date === "2026-10-06" ? day("2026-10-06", lane("bank-builder", "B", 1, 100, "won", 210)) : r));
  assert.equal(fold.foldedThrough, "2026-10-07");
});

test("SEED is still Rule S's ($100 Bank Builder, $25 Moonshot) — C1 changes no other rule", () => {
  assert.deepEqual({ ...SEED }, { "bank-builder": 100, moonshot: 25 });
});
