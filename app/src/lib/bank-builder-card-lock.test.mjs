/**
 * Approved-card lock for Bank Builder — once a lane is approved, a refresh must NOT silently swap its legs.
 * POST JUNE-24: the June-24 approved cards were officially SETTLED, so the lock is CONSUMED — the lock file is
 * status "settled" with empty lanes (it no longer pins Morocco/Bosnia/Brazil). POST-BANKING + FRESH CYCLE-2:
 * the operator then BANKED Lane A's completed $100→$10k ladder (Ladder #2, final $10,089.23) and started a
 * FRESH June-25 dual cycle. The settled June-24 run is archived in dual-bank-builder-2026-06-24-completed.json;
 * the LIVE dual-bank-builder-active.json then ran the fresh cycle two more days. These tests verify: the lock
 * stays consumed (no re-pin), the settled June-24 cards landed WON (Lane A) / LOST (Lane B) in the ARCHIVE, the
 * completion was operator-gated BANKED (not pending, not a silent roll), and canonical money is the post-settlement
 * truth (JULY-7: record 19-14 after Lane A WON its July-6 cycle-8 Step-1 and its July-7 Step-2, bankroll 19065.40
 * UNCHANGED — a won step rolls unrealized, cumulative crown 20465.40 = Σ two banked finals). The money-integrity guard is preserved.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPersistedDailyPortfolio } from "./daily-portfolio/accounting.ts";
import { makeSettledApprovedRoot } from "./__testsupport__/settled-ladder-root.mjs";
import { pinnedLaneRoot } from "./bank-builder/fixtures/root.mjs";

const root = pinnedLaneRoot();
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const DATE = "2026-06-24";
const LOCK_DATE = "2026-06-27"; // the consumed lock's own date (rolls forward independently of the archive DATE)
const ARCHIVE = "methodology/launch/dual-bank-builder-2026-06-24-completed.json";
const dp = buildPersistedDailyPortfolio(root, `${DATE}T08:00:00Z`, DATE, `${DATE}T08:00:00Z`, true);
const bb = dp.lanes.filter((l) => l.product === "bank-builder");
const laneA = bb.find((l) => l.lane === "A");
const laneB = bb.find((l) => l.lane === "B");

// P192 · PINNED LANE STATE. This regression is about a specific historical lane state, so it reads a
// pinned snapshot instead of the live ladder. Reading `public/data` directly made the running
// product double as a fixture: Bank Builder and Moonshot could not advance to a live card without
// breaking assertions that require July's state to still be on disk. The assertions are unchanged —
// only where their data comes from is.
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
  assert.equal(p.currentBankroll, 19065.4);
  assert.equal(p.crownBankroll, 20465.4);
  assert.deepEqual(p.record, { wins: 19, losses: 14, voids: 0, pending: 0 });
  assert.equal(dp.activeBankroll, 19065.4);
  assert.equal(dp.crownBankroll, 20465.4);
});

test("STABILITY: the consumed lock does NOT re-pin settled cards; the live cycle serves the approved July-7 card stably", () => {
  // The lock is consumed (status settled, empty lanes), so a refresh must not resurrect the SETTLED June-24
  // cards. JULY-7 ACTIVATED STATE, SAME-DAY POST-SETTLEMENT: Lane A's operator-approved cycle-8 Step-2 card
  // — Colombia or Draw (double chance) + Argentina to win (match result) — SETTLED WON at ~11pm ET, so it now
  // renders WON / $0 exposure (a finished rung), NOT an active $100-at-risk card. It is still SERVED (visible
  // history) with its approved legs preserved. Lane B is a deliberate NO-PLAY (absent). The served card comes
  // from the date-gated approved pin, NEVER from the consumed June-24 lock, and the served state must be stable
  // across refreshes. The prior settlements stay in the live artifact's priorLane chains.
  const lock = read("mr-dub/bank-builder-locks.json");
  assert.equal(lock.status, "settled");
  assert.deepEqual(lock.lanes ?? {}, {}, "consumed lock pins nothing");
  const LIVE_DATE = "2026-07-07";
  // The settled July-7 cycle now lives in the live ladder's priorLane (July-21 review restart). Reconstruct the
  // pre-restart settled ladder so this "served card stays stable, never re-pins the consumed June-24 legs" invariant
  // is validated against the same-day-SETTLED Lane A it was ground-truthed to. Lock + archive reads stay on `root`.
  const { tmp: settledTmp, dataRoot: settled } = makeSettledApprovedRoot(root);
  let live, again;
  try {
    live = buildPersistedDailyPortfolio(settled, `${LIVE_DATE}T12:00:00Z`, LIVE_DATE, `${LIVE_DATE}T12:00:00Z`, true);
    // Refreshing does not silently change the served state (stable across two builds at different pre-kickoff clocks).
    again = buildPersistedDailyPortfolio(settled, `${LIVE_DATE}T14:00:00Z`, LIVE_DATE, `${LIVE_DATE}T14:00:00Z`, true);
  } finally {
    fs.rmSync(settledTmp, { recursive: true, force: true });
  }
  const liveBb = live.lanes.filter((l) => l.product === "bank-builder");
  const liveA = liveBb.find((l) => l.lane === "A");
  const liveB = liveBb.find((l) => l.lane === "B");
  assert.equal(liveBb.length, 1, "one Bank Builder lane served — only Lane A (cycle-8 Step 2, settled WON; Lane B no-play)");
  assert.equal(liveA?.status, "won", "Lane A served WON (cycle-8 Step 2 settled same-day; seed no longer at risk)");
  assert.equal(liveA?.exposure, 0, "settled Lane A places $0 exposure");
  assert.equal(liveA?.clearedSteps, 2, "Step 2 counts as a cleared rung");
  assert.ok(!liveB, "Lane B absent — deliberate July-7 no-play, never fabricated back in");
  // BANK BUILDER exposure is $0 after the same-day settlement (the seed is no longer at risk). Total open
  // exposure carries only the separate structured Moonshot product's paper exposure — this test (about the
  // consumed BANK BUILDER lock) asserts the settled lane places nothing, and that the total reconciles from products.
  assert.equal(live.products.bankBuilder.exposure, 0, "settled Lane A → $0 BB exposure");
  assert.equal(live.openExposure, Math.round((live.products.bankBuilder.exposure + live.products.moonshot.exposure) * 100) / 100, "total open exposure reconciles from products (settled BB Lane A + structured Moonshot paper)");
  // The consumed June-24 card's legs (Morocco/Bosnia/Brazil, from the archive) must NOT be re-pinned onto any
  // served card — the served card is the approved July-6 Lane A legs, compared by leg ID.
  const archivedStep5 = (read(ARCHIVE).run.laneA.steps ?? []).find((s) => s.step === 5);
  const consumedIds = new Set((archivedStep5.legs ?? []).map((l) => l.legId));
  const servedIds = [...(liveA?.legs ?? [])].map((l) => l.id);
  assert.ok(servedIds.length > 0, "served card carries legs (approved July-7 Lane A card)");
  assert.ok(servedIds.every((id) => !consumedIds.has(id)), "served card does not re-pin the consumed June-24 leg IDs");
  const servedText = JSON.stringify([liveA?.legs ?? []]);
  assert.ok(/Colombia or Draw/.test(servedText) && /Argentina to win/.test(servedText), "Lane A serves the approved July-7 survival legs");
  assert.ok(!/Morocco/i.test(servedText) && !/Bosnia/i.test(servedText), "no consumed June-24 selections resurface");
  const againBb = again.lanes.filter((l) => l.product === "bank-builder");
  assert.equal(againBb.length, liveBb.length, "Bank Builder lane count unchanged across refreshes (no silent swap)");
  for (const lane of ["A"]) {
    const served = liveBb.find((l) => l.lane === lane);
    const a2 = again.lanes.find((l) => l.product === "bank-builder" && l.lane === lane);
    assert.deepEqual((a2?.legs ?? []).map((l) => l.id).sort(), (served?.legs ?? []).map((l) => l.id).sort(), `Lane ${lane} legs unchanged across refreshes (no silent swap)`);
  }
});
