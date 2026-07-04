/**
 * Approved-card lock for Bank Builder — once a lane is approved, a refresh must NOT silently swap its legs.
 * POST JUNE-24: the June-24 approved cards were officially SETTLED, so the lock is CONSUMED — the lock file is
 * status "settled" with empty lanes (it no longer pins Morocco/Bosnia/Brazil). POST-BANKING + FRESH CYCLE-2:
 * the operator then BANKED Lane A's completed $100→$10k ladder (Ladder #2, final $10,089.23) and started a
 * FRESH June-25 dual cycle. The settled June-24 run is archived in dual-bank-builder-2026-06-24-completed.json;
 * the LIVE dual-bank-builder-active.json then ran the fresh cycle two more days. These tests verify: the lock
 * stays consumed (no re-pin), the settled June-24 cards landed WON (Lane A) / LOST (Lane B) in the ARCHIVE, the
 * completion was operator-gated BANKED (not pending, not a silent roll), and canonical money is the post-settlement
 * truth (JULY-3: record 17-12 after both lanes lost, bankroll 19265.40, cumulative crown 20465.40
 * = Σ two banked finals). The money-integrity guard is preserved.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPersistedDailyPortfolio } from "./daily-portfolio/accounting.ts";

const root = path.join(process.cwd(), "public", "data");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const DATE = "2026-06-24";
const LOCK_DATE = "2026-06-27"; // the consumed lock's own date (rolls forward independently of the archive DATE)
const ARCHIVE = "methodology/launch/dual-bank-builder-2026-06-24-completed.json";
const dp = buildPersistedDailyPortfolio(root, `${DATE}T08:00:00Z`, DATE, `${DATE}T08:00:00Z`, true);
const bb = dp.lanes.filter((l) => l.product === "bank-builder");
const laneA = bb.find((l) => l.lane === "A");
const laneB = bb.find((l) => l.lane === "B");

test("the approved-card lock is CONSUMED for the date: status settled, lanes empty (no pinned cards)", () => {
  const lock = read("mr-dub/bank-builder-locks.json");
  assert.equal(lock.date, LOCK_DATE, "lock carries its own settled date (the latest consumed slate)");
  assert.equal(lock.status, "settled", "the lock is consumed/settled, not pinning live cards");
  assert.deepEqual(lock.lanes ?? {}, {}, "no lanes pinned — settled cards must not be re-pinned by a refresh");
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

test("Lane A's June-24 approved card SETTLED WON (Morocco + Bosnia + Scotland/Brazil Over 2.5 → $10,089.23, COMPLETED the ladder) — now in the ARCHIVE", () => {
  // POST-BANKING: the completed June-24 run was archived (the live artifact restarted to a fresh cycle), so the
  // settled-WON Lane A history now lives in dual-bank-builder-2026-06-24-completed.json — never erased.
  const run = read(ARCHIVE).run;
  assert.equal(run.laneA.laneStatus, "completed", "archived Lane A completed the $10k ladder");
  assert.equal(run.laneA.currentStep, 5, "archived Lane A finished on the final rung");
  const step5 = (run.laneA.steps ?? []).find((s) => s.step === 5);
  assert.ok(step5, "Lane A Step 5 present in the archive");
  assert.equal(step5.status, "settled");
  assert.equal(step5.result, "won", "Lane A Step 5 WON");
  assert.equal(step5.payout, 10089.23, "Lane A final value $10,089.23");
  const serialized = JSON.stringify(step5.legs ?? []);
  assert.ok(/Morocco/i.test(serialized) && /Bosnia/i.test(serialized) && /Brazil/i.test(serialized), "Step 5 legs are Morocco + Bosnia + Scotland/Brazil Over 2.5");
});

test("Lane B's June-24 approved card SETTLED LOST (Brazil ML won, Switzerland/Canada Under 2.5 lost → lane stopped, $0 payout) — now in the ARCHIVE", () => {
  const run = read(ARCHIVE).run;
  assert.equal(run.laneB.laneStatus, "stopped", "archived Lane B stopped on the loss");
  assert.equal(run.laneB.currentStep, 3, "archived Lane B stopped on Step 3");
  const step3 = (run.laneB.steps ?? []).find((s) => s.step === 3);
  assert.ok(step3, "Lane B Step 3 present in the archive");
  assert.equal(step3.status, "settled");
  assert.equal(step3.result, "lost", "Lane B Step 3 LOST");
  assert.equal(step3.payout, 0, "Lane B lost card pays $0");
});

test("Lane A's completion was operator-gated then BANKED (Ladder #2) — never an auto-bank, never a silent roll", () => {
  const p = read("mr-dub/portfolio.json");
  // POST-BANKING: the completion is no longer held PENDING — the operator banked it, so pendingLaneCompletions
  // was removed and the completed ladder appears as a banked entry. Operator-gating is still proven: it took an
  // explicit banking step (recorded in banked-ladders.json + completedLadders), never an auto-roll.
  assert.ok(!(p.pendingLaneCompletions ?? []).some((c) => c.lane === "A"), "Lane A completion is no longer pending — it was banked");
  const banked = read("mr-dub/banked-ladders.json");
  const ladder2 = (banked.ladders ?? []).find((b) => b.ladder === 2);
  assert.ok(ladder2, "Lane A's completed ladder is banked as Ladder #2");
  assert.equal(ladder2.final, 10089.23, "banked Ladder #2 carries the $10,089.23 final value");
  assert.equal(ladder2.official, true, "banked from an official settlement");
  const completed2 = (p.completedLadders ?? []).find((c) => c.ladder === 2);
  assert.ok(completed2 && completed2.final === 10089.23, "portfolio records Ladder #2 as a completed $100→$10k ladder");
  // The completion rolled into the CUMULATIVE crown only via the banking step: crown = Σ both finals.
  assert.equal(p.crownBankroll, 20465.4, "crown = Σ two banked-ladder finals (10,376.17 + 10,089.23)");
});

test("the consumed lock NEVER mutates canonical money (bankroll/crown/record are the post-banking truth)", () => {
  const p = read("mr-dub/portfolio.json");
  assert.equal(p.currentBankroll, 19265.4);
  assert.equal(p.crownBankroll, 20465.4);
  assert.deepEqual(p.record, { wins: 17, losses: 12, voids: 0, pending: 0 });
  assert.equal(dp.activeBankroll, 19265.4);
  assert.equal(dp.crownBankroll, 20465.4);
});

test("STABILITY: the consumed lock does NOT re-pin settled cards; the live cycle awaits a fresh slate stably", () => {
  // The lock is consumed (status settled, empty lanes), so a refresh must not resurrect the SETTLED June-24
  // cards. JULY-3 SETTLED STATE: both lanes are STOPPED (Lane A lost its July-3 Step-3, Lane B lost its July-3
  // Step-1), so NEITHER surfaces a forward card — both await a fresh qualified card. No served lane carries the
  // consumed June-24 legs, and the served state (zero lanes) must be stable across refreshes. The prior
  // settlements are preserved in the live artifact's priorLane chains.
  const lock = read("mr-dub/bank-builder-locks.json");
  assert.equal(lock.status, "settled");
  assert.deepEqual(lock.lanes ?? {}, {}, "consumed lock pins nothing");
  assert.equal(bb.length, 0, "zero Bank Builder lanes served — both lanes stopped (awaiting a fresh card)");
  assert.ok(!laneA, "Lane A not served (stopped, awaiting a fresh card)");
  assert.ok(!laneB, "Lane B not served (stopped, awaiting a fresh card)");
  // BANK BUILDER exposure is $0 while both lanes are stopped. Total open exposure also carries the structured
  // Moonshot product's paper exposure — a separate product, so this test (about the consumed BANK BUILDER lock)
  // asserts the served lane seeds, and that total reconciles from products.
  assert.equal(dp.products.bankBuilder.exposure, 0, "no served lanes → $0 BB exposure (both lanes stopped)");
  assert.equal(dp.openExposure, Math.round((dp.products.bankBuilder.exposure + dp.products.moonshot.exposure) * 100) / 100, "total open exposure reconciles from products (BB two-lane seeds + structured Moonshot paper)");
  // The consumed June-24 card's legs (Morocco/Bosnia/Brazil, from the archive) must NOT be re-pinned onto any
  // served card — compare leg IDs (with no served lanes the served set is empty, which trivially excludes them).
  const archivedStep5 = (read(ARCHIVE).run.laneA.steps ?? []).find((s) => s.step === 5);
  const consumedIds = new Set((archivedStep5.legs ?? []).map((l) => l.legId));
  const servedIds = [...(laneA?.legs ?? []), ...(laneB?.legs ?? [])].map((l) => l.id);
  assert.ok(servedIds.every((id) => !consumedIds.has(id)), "served cards do not re-pin the consumed June-24 leg IDs");
  // Refreshing does not silently change the served state (stable across two builds at different clocks).
  const again = buildPersistedDailyPortfolio(root, `${DATE}T12:00:00Z`, DATE, `${DATE}T12:00:00Z`, true);
  const againBb = again.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(againBb.length, bb.length, "Bank Builder lane count unchanged across refreshes (no silent swap)");
  for (const lane of ["A", "B"]) {
    const served = bb.find((l) => l.lane === lane);
    const a2 = again.lanes.find((l) => l.product === "bank-builder" && l.lane === lane);
    assert.deepEqual((a2?.legs ?? []).map((l) => l.id).sort(), (served?.legs ?? []).map((l) => l.id).sort(), `Lane ${lane} legs unchanged across refreshes (no silent swap)`);
  }
});
