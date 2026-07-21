/**
 * CANDIDATE ≠ PLACED CARD (2026-07-07 regression). A Bank Builder "candidate" is a PROPOSAL pending
 * founder approval — it must NEVER render as a placed/active card with a profit projection. Only an
 * APPROVED card (status "active") is a placed card. This pins the fix on both surfaces that render the
 * daily portfolio's Bank Builder lane:
 *   • /bank-builder (ClimbHero): the lane's `card` is selected with `c.status === "active"`.
 *   • /today (ProductLanesLadder): the lane-ladder is filtered to `c.status === "active"`.
 * Origin: a rejected Under-2.5 candidate was rendering with a "+$489 profit / $700 Goal" card.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSettledApprovedRoot } from "./__testsupport__/settled-ladder-root.mjs";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const bbPage = read("src/app/bank-builder/page.tsx");
const todayPage = read("src/app/today/page.tsx");

/** Temp `root` mirroring public/data with the approved Lane A Step-2 ladder step left UNSETTLED, so an ACTIVE
 *  BB lane genuinely surfaces (the real July-7 approved card has since settled WON). Caller rmSyncs the dir. */
function makeUnsettledApprovedRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-bb-cand-"));
  const dataRoot = path.join(tmp, "data");
  fs.cpSync(path.join(app, "public", "data"), dataRoot, { recursive: true });
  const ladderPath = path.join(dataRoot, "methodology", "launch", "dual-bank-builder-active.json");
  const ladder = JSON.parse(fs.readFileSync(ladderPath, "utf8"));
  ladder.run.laneA.laneStatus = "active";
  const step2 = (ladder.run.laneA.steps ?? []).find((s) => s.step === 2);
  if (step2) { step2.status = "pending"; delete step2.result; delete step2.payout; }
  fs.writeFileSync(ladderPath, JSON.stringify(ladder, null, 1));
  return { tmp, dataRoot };
}

test("/bank-builder selects the placed card by status === 'active' (a candidate never becomes the card)", () => {
  assert.match(
    bbPage,
    /product === "bank-builder" && c\.lane === letter && c\.status === "active"/,
    "the ClimbHero lane card is gated on the ACTIVE status",
  );
});

test("/today builds the Bank Builder lane-ladder from ACTIVE cards only (candidates fall through to no-play)", () => {
  assert.match(
    todayPage,
    /product === "bank-builder" && c\.status === "active"/,
    "bankBuilderLadder is filtered to the ACTIVE status",
  );
});

test("the daily-portfolio model can distinguish candidate from active (the field the fix relies on)", async () => {
  const { buildPersistedDailyPortfolio } = await import("./daily-portfolio/accounting.ts");
  // Exercise the candidate/active distinction on an UNSETTLED approved lane: `buildPersistedDailyPortfolio`
  // renders that lane ACTIVE (a placed card, $100 seed), while any Moonshot below its floor stays a CANDIDATE.
  // (The real July-7 Lane A card has since settled WON — see the settled-status assertion below — so we build a
  // temp root that keeps its ladder step unsettled to keep the active-vs-candidate distinction genuinely covered.)
  const { tmp, dataRoot } = makeUnsettledApprovedRoot();
  try {
    const dp = buildPersistedDailyPortfolio(dataRoot, "2026-07-07T12:00:00Z", "2026-07-07", "2026-07-07T12:00:00Z", true);
    const bb = dp.lanes.filter((c) => c.product === "bank-builder");
    for (const c of bb) assert.ok(["active", "candidate", "awaiting", "won", "lost"].includes(c.status), `lane ${c.lane} has a real status`);
    const activeA = bb.find((c) => c.lane === "A");
    assert.equal(activeA?.status, "active", "the unsettled approved lane is ACTIVE (a placed card)");
    // A candidate with legs must NOT be counted as an active/placed card.
    const placed = dp.lanes.filter((c) => c.status === "active" && (c.legs ?? []).length > 0);
    const candidates = dp.lanes.filter((c) => c.status === "candidate");
    assert.ok(candidates.length > 0, "at least one candidate lane surfaces (below-floor Moonshot)");
    assert.ok(candidates.every((c) => !placed.includes(c)), "candidates are never in the placed set");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("SAME-DAY SETTLED: the real July-7 build renders Lane A as a settled status (won), never a bare active/candidate", async () => {
  // The candidate/active distinction must ALSO recognise a same-day-settled rung: the real July-7 Lane A card
  // settled WON, so the daily-portfolio adapter surfaces it with a settled status (not active, not candidate) and
  // no BB exposure — a finished rung kept as history.
  // SLATE ADVANCED July-7 → July-8: the live daily-portfolio.json is now the July-8 no-play, so we build the
  // July-7 view EXPLICITLY from the July-7 approved card + settled ladder (the settled-WON invariant is
  // unchanged — it is still reconstructed from canonical July-7 sources, just no longer the live file).
  const { buildPersistedDailyPortfolio } = await import("./daily-portfolio/accounting.ts");
  // The July-21 review restart pushed the settled July-7 cycle into the live ladder's priorLane; reconstruct the
  // pre-restart settled ladder so the same-day-settled (WON) invariant is validated against canonical July-7 state.
  const { tmp, dataRoot } = makeSettledApprovedRoot(path.join(app, "public", "data"));
  let dp;
  try {
    dp = buildPersistedDailyPortfolio(dataRoot, "2026-07-07T14:00:00Z", "2026-07-07", "2026-07-07T14:00:00Z", true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const bb = (dp.lanes ?? []).filter((c) => c.product === "bank-builder");
  const a = bb.find((c) => c.lane === "A");
  assert.ok(a, "Lane A present as history");
  assert.equal(a.status, "won", "same-day settled → won, not active/candidate");
  assert.ok(!bb.some((c) => c.status === "active"), "no active BB card once Lane A settled");
  assert.equal(dp.products.bankBuilder.exposure, 0, "BB exposure $0 after the same-day settlement");
});
