/**
 * SAME-DAY BANK BUILDER SETTLEMENT — dedicated regression (2026-07-07).
 *
 * An operator-approved Bank Builder card can SETTLE on its own slate date (e.g. ~11pm ET), BEFORE the next-day
 * roll. When that happens the daily paper portfolio must NOT keep showing the just-WON card as an active,
 * $100-at-risk / pending bet: the seed is no longer at risk and the step is a cleared rung. The fix in
 * `approvedBankBuilderLanes` (accounting.ts) reads the ladder's per-step official result and renders a settled
 * approved step as `status: won|lost`, `exposure: 0`, `clearedSteps: step` — still VISIBLE as history, never
 * falling through to the auto-generation path. This is DISPLAY-ONLY: canonical money (portfolio.json bankroll/
 * crown/record) is never touched.
 *
 * Ground truth for 2026-07-07 (real artifacts): Lane A's approved Step-2 card (Colombia or Draw + Argentina to
 * win) settled WON → the lane rolled to $305.57 and ADVANCED to Step 3 (2 cleared). Bankroll $19,065.40, crown
 * $20,465.40, record 19-14 (a won step rolls unrealized — nothing here moved canonical money).
 *
 * The UNSETTLED counterpart (founder req 7: future-day approval intact) uses a temp `root` that keeps the same
 * approved Step-2 card but leaves its ladder step PENDING — it must still render active/$100.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPersistedDailyPortfolio } from "./daily-portfolio/accounting.ts";
import { readLaneRungs } from "./daily-portfolio/bank-builder-generation.ts";
import { makeSettledApprovedRoot } from "./__testsupport__/settled-ladder-root.mjs";

const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-07-07";
const NOW = "2026-07-07T12:00:00Z"; // pre-slate: before the 16:00Z Argentina/Egypt kickoff
const PORTFOLIO_MD5 = "affe6b21071f2b3be96bb2774eb347c3"; // canonical money fingerprint — must never change
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

// The July-21 REVIEW restart pushed the settled July-7 cycle down into each lane's `priorLane`. Reconstruct the
// pre-restart settled ladder (Lane A cycle-8 ADVANCED, Steps 1 & 2 settled WON) into a throwaway data root so the
// same-day-settlement invariants keep being validated. Canonical money (portfolio.json md5) is a byte copy, untouched.
const { tmp: SETTLED_TMP, dataRoot: SETTLED } = makeSettledApprovedRoot(root);
process.on("exit", () => fs.rmSync(SETTLED_TMP, { recursive: true, force: true }));

const build = () => buildPersistedDailyPortfolio(SETTLED, NOW, DATE, NOW, true);
const laneAOf = (dp) => dp.lanes.find((l) => l.product === "bank-builder" && l.lane === "A");

/** Temp `root` mirroring public/data with the approved Lane A Step-2 ladder step left UNSETTLED (pending), so
 *  the ACTIVE/$100 future-day path stays covered. Caller must rmSync the returned `tmp`. No real artifact touched. */
function makeUnsettledApprovedRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-bb-same-day-"));
  const dataRoot = path.join(tmp, "data");
  fs.cpSync(root, dataRoot, { recursive: true });
  const ladderPath = path.join(dataRoot, "methodology", "launch", "dual-bank-builder-active.json");
  const ladder = JSON.parse(fs.readFileSync(ladderPath, "utf8"));
  ladder.run.laneA.laneStatus = "active";
  const step2 = (ladder.run.laneA.steps ?? []).find((s) => s.step === 2);
  if (step2) { step2.status = "pending"; delete step2.result; delete step2.payout; } // un-settle the approved Step-2
  fs.writeFileSync(ladderPath, JSON.stringify(ladder, null, 1));
  return { tmp, dataRoot };
}

// 1 — a same-day SETTLED approved card does NOT render as "active" (renders "won").
test("1. a same-day-settled approved card renders WON, never active", () => {
  const a = laneAOf(build());
  assert.ok(a, "Lane A is present");
  assert.equal(a.status, "won", "settled Step-2 card renders WON (official result), not active");
  assert.notEqual(a.status, "active", "the just-won card is NOT an active $100-at-risk bet");
});

// 2 — daily-portfolio openExposure is $0 (and products.bankBuilder.exposure === 0) after the card settled.
test("2. openExposure and BB product exposure are $0 after the same-day settlement", () => {
  const dp = build();
  const a = laneAOf(dp);
  assert.equal(a.exposure, 0, "the settled lane places $0 exposure (seed no longer at risk)");
  assert.equal(dp.products.bankBuilder.exposure, 0, "products.bankBuilder.exposure is $0");
  // Bank Builder contributes nothing to open exposure; only the separate structured Moonshot paper can.
  assert.equal(dp.openExposure, Math.round(dp.products.moonshot.exposure * 100) / 100, "openExposure carries no settled-BB seed");
});

// 3 — the settled Lane A Step-2 remains VISIBLE as history (still in lanes[], with its legs).
test("3. the settled Lane A Step-2 stays visible as history (not hidden/dropped)", () => {
  const a = laneAOf(build());
  assert.ok(a, "the settled lane is still present in lanes[] — not dropped");
  assert.equal(a.step, 2, "it is the Step-2 rung");
  assert.equal(a.legCount, 2, "both approved legs are retained");
  assert.deepEqual(a.legs.map((l) => l.selection), ["Colombia or Draw", "Argentina to win"], "the approved legs are preserved verbatim");
});

// 4 — Lane A awaits Step 3 with next stake $305.57 (asserted via readLaneRungs).
test("4. Lane A advanced to Step 3 with rolled stake $305.57 (via readLaneRungs)", () => {
  const { laneA } = readLaneRungs(SETTLED);
  assert.ok(laneA, "Lane A has a forward rung");
  assert.equal(laneA.nextStep, 3, "the forward rung is Step 3");
  assert.equal(laneA.clearedSteps, 2, "two cleared steps (Step-1 + the just-won Step-2)");
  assert.equal(laneA.rolledStake, 305.57, "the WON Step-2 payout ($305.57) rolled into the Step-3 stake");
});

// 5 — NO auto-generated Step-3 card is minted; the settled approved lane stays in place.
test("5. no auto-generated Step-3 candidate is minted — the settled approved lane stays in place", () => {
  const bb = build().lanes.filter((l) => l.product === "bank-builder" && l.lane === "A");
  assert.equal(bb.length, 1, "exactly one Lane A bank-builder entry (no fallthrough to a fresh Step-3 candidate)");
  const a = bb[0];
  // The served entry is the SETTLED APPROVED card (id = the approved-pin id + locked), NOT a generated candidate
  // (whose id is `bank-builder-lane-a-step-N`).
  assert.match(a.id, /^bank-builder-approved-lane-a-2026-07-07$/, "the entry is the approved-pin lane, not a generated candidate");
  assert.ok(!/^bank-builder-lane-a-step-\d+$/.test(a.id), "not a generated Step-N candidate id");
  assert.equal(a.locked, true, "the served entry is the operator-approved (locked) card");
  assert.equal(a.status, "won", "it stays the settled approved card, not a fresh Step-3 proposal");
});

// 6 — NO canonical money change: portfolio.json md5 (and bankroll/crown/record) unchanged.
test("6. canonical money is untouched (portfolio.json md5 + bankroll/crown/record unchanged)", () => {
  build(); // building the daily portfolio must not write or change canonical money
  const raw = fs.readFileSync(path.join(root, "mr-dub", "portfolio.json"));
  const md5 = crypto.createHash("md5").update(raw).digest("hex");
  assert.equal(md5, PORTFOLIO_MD5, "portfolio.json md5 is the canonical fingerprint (display-only fix touches no money)");
  const p = readJson("mr-dub/portfolio.json");
  assert.equal(p.currentBankroll, 19065.4, "bankroll unchanged");
  assert.equal(p.crownBankroll, 20465.4, "crown unchanged");
  assert.deepEqual(p.record, { wins: 19, losses: 14, voids: 0, pending: 0 }, "record 19-14 unchanged (losses stay 14)");
  // The daily view also reconciles to that canonical money.
  const dp = build();
  assert.equal(dp.activeBankroll, 19065.4, "daily activeBankroll reconciles to canonical");
  assert.equal(dp.crownBankroll, 20465.4, "daily crown reconciles to canonical");
  assert.equal(dp.settlement.realizedPnl, 0, "no realized P/L asserted by the daily view (official settlement owns the money)");
});

// 7 — future-day / UNSETTLED approved behavior intact: an unsettled approved step still renders active/$100.
test("7. an UNSETTLED approved step still renders active / $100 (future-day approval mechanism intact)", () => {
  const { tmp, dataRoot } = makeUnsettledApprovedRoot();
  try {
    const dp = buildPersistedDailyPortfolio(dataRoot, NOW, DATE, NOW, true);
    const a = dp.lanes.find((l) => l.product === "bank-builder" && l.lane === "A");
    assert.ok(a, "the approved lane is present");
    assert.equal(a.status, "active", "an unsettled approved step is ACTIVE (a placed card)");
    assert.equal(a.exposure, 100, "it risks the $100 seed");
    assert.equal(dp.products.bankBuilder.exposure, 100, "BB exposure = one active $100 seed");
    assert.deepEqual(a.legs.map((l) => l.selection), ["Colombia or Draw", "Argentina to win"], "same approved legs, just not yet settled");
    // The general mechanism must not have moved canonical money either.
    assert.equal(dp.activeBankroll, 19065.4, "active bankroll unchanged");
    assert.equal(dp.crownBankroll, 20465.4, "crown unchanged");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
