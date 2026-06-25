/**
 * Approved-card lock for Bank Builder — once a lane is approved, a refresh must NOT silently swap its legs.
 * POST JUNE-24: the June-24 approved cards have been officially SETTLED, so the lock is now CONSUMED — the
 * lock file is status "settled" with empty lanes (it no longer pins Morocco/Bosnia/Brazil). These tests
 * verify the consumed/settled state: the lock no longer pins any card, the settled June-24 cards landed
 * WON (Lane A) / LOST (Lane B) in the ladder artifact, and canonical money is frozen at the post-settlement
 * truth (13-3, bankroll 10076.17, crown 10376.17 immutable). The money-integrity guard is preserved.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPersistedDailyPortfolio } from "./daily-portfolio/accounting.ts";

const root = path.join(process.cwd(), "public", "data");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const DATE = "2026-06-24";
const dp = buildPersistedDailyPortfolio(root, `${DATE}T08:00:00Z`, DATE, `${DATE}T08:00:00Z`, true);
const bb = dp.lanes.filter((l) => l.product === "bank-builder");
const laneA = bb.find((l) => l.lane === "A");
const laneB = bb.find((l) => l.lane === "B");

test("the approved-card lock is CONSUMED for the date: status settled, lanes empty (no pinned cards)", () => {
  const lock = read("mr-dub/bank-builder-locks.json");
  assert.equal(lock.date, DATE);
  assert.equal(lock.status, "settled", "the lock is consumed/settled, not pinning live cards");
  assert.deepEqual(lock.lanes, {}, "no lanes pinned — settled cards must not be re-pinned by a refresh");
  assert.deepEqual(lock.bankBuilder, {}, "no Bank Builder card pinned");
  assert.deepEqual(lock.moonshot, {}, "no Moonshot card pinned");
});

test("the consumed lock no longer pins the June-24 approved legs (Morocco/Bosnia/Brazil)", () => {
  const lock = read("mr-dub/bank-builder-locks.json");
  const serialized = JSON.stringify(lock.lanes) + JSON.stringify(lock.bankBuilder);
  assert.ok(!/Morocco/i.test(serialized), "Morocco leg no longer pinned (card settled)");
  assert.ok(!/Bosnia/i.test(serialized), "Bosnia leg no longer pinned (card settled)");
  assert.ok(!/Brazil/i.test(serialized), "Brazil leg no longer pinned (card settled)");
});

test("Lane A's June-24 approved card SETTLED WON (Morocco + Bosnia + Scotland/Brazil Over 2.5 → $10,089.23, COMPLETED the ladder)", () => {
  const run = read("methodology/launch/dual-bank-builder-active.json").run;
  assert.equal(run.laneA.laneStatus, "completed", "Lane A completed the $10k ladder");
  assert.equal(run.laneA.currentStep, 5, "Lane A finished on the final rung");
  const step5 = (run.laneA.steps ?? []).find((s) => s.step === 5);
  assert.ok(step5, "Lane A Step 5 present");
  assert.equal(step5.status, "settled");
  assert.equal(step5.result, "won", "Lane A Step 5 WON");
  assert.equal(step5.payout, 10089.23, "Lane A final value $10,089.23");
});

test("Lane B's June-24 approved card SETTLED LOST (Brazil ML won, Switzerland/Canada Under 2.5 lost → lane stopped, $0 payout)", () => {
  const run = read("methodology/launch/dual-bank-builder-active.json").run;
  assert.equal(run.laneB.laneStatus, "stopped", "Lane B stopped on the loss");
  assert.equal(run.laneB.currentStep, 3, "Lane B stopped on Step 3");
  const step3 = (run.laneB.steps ?? []).find((s) => s.step === 3);
  assert.ok(step3, "Lane B Step 3 present");
  assert.equal(step3.status, "settled");
  assert.equal(step3.result, "lost", "Lane B Step 3 LOST");
  assert.equal(step3.payout, 0, "Lane B lost card pays $0");
});

test("Lane A's completion is operator-gated (PENDING_LADDER_COMPLETION), never an auto-bank", () => {
  const p = read("mr-dub/portfolio.json");
  const pending = (p.pendingLaneCompletions ?? []).find((c) => c.lane === "A");
  assert.ok(pending, "Lane A completion is flagged pending (operator-gated)");
  assert.equal(pending.step, 5);
  assert.equal(pending.finalValue, 10089.23, "pending completion carries the $10,089.23 final value");
  assert.equal(pending.slateDate, DATE);
  // The completion did NOT silently roll into the crown bankroll.
  assert.equal(p.crownBankroll, 10376.17, "crown unchanged — completion banking is operator-gated, not auto-applied");
});

test("the consumed lock NEVER mutates canonical money (bankroll/crown/record frozen at post-settlement truth)", () => {
  const p = read("mr-dub/portfolio.json");
  assert.equal(p.currentBankroll, 10076.17);
  assert.equal(p.crownBankroll, 10376.17);
  assert.deepEqual(p.record, { wins: 13, losses: 3, voids: 0, pending: 0 });
  assert.equal(dp.activeBankroll, 10076.17);
  assert.equal(dp.crownBankroll, 10376.17);
});

test("STABILITY: with the lock consumed, a refresh does NOT re-pin a settled lane (no resurrected Lane A card)", () => {
  // Lane A completed, so it must not reappear as a live BB card after the lock is consumed.
  assert.equal(laneA, undefined, "completed Lane A is not regenerated as a live card");
  const again = buildPersistedDailyPortfolio(root, `${DATE}T20:00:00Z`, DATE, `${DATE}T20:00:00Z`, true);
  const a2 = again.lanes.find((l) => l.product === "bank-builder" && l.lane === "A");
  assert.equal(a2, undefined, "Lane A stays absent across refreshes — settled card not resurrected");
  // Lane B (which stopped) is the only forward BB lane the daily view may regenerate.
  const b2 = again.lanes.find((l) => l.product === "bank-builder" && l.lane === "B");
  assert.deepEqual(
    (b2?.legs ?? []).map((l) => l.id).sort(),
    (laneB?.legs ?? []).map((l) => l.id).sort(),
    "Lane B legs unchanged across refreshes (no silent swap)"
  );
});
