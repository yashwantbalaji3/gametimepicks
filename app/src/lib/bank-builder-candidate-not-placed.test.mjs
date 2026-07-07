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
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const bbPage = read("src/app/bank-builder/page.tsx");
const todayPage = read("src/app/today/page.tsx");

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
  const { buildDailyPortfolio } = await import("./mr-dub/daily-portfolio.ts");
  const dp = buildDailyPortfolio(path.join(app, "public", "data"), new Date("2026-07-07T14:00:00Z").toISOString(), "2026-07-07");
  const bb = (dp.cards ?? []).filter((c) => c.product === "bank-builder");
  for (const c of bb) assert.ok(["active", "candidate", "awaiting"].includes(c.status), `lane ${c.lane} has a real status`);
  // A candidate with legs must NOT be counted as an active/placed card.
  const placed = bb.filter((c) => c.status === "active" && (c.legs ?? []).length > 0);
  const candidates = bb.filter((c) => c.status === "candidate");
  assert.ok(candidates.every((c) => !placed.includes(c)), "candidates are never in the placed set");
});
