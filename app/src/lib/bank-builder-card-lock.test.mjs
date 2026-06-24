/**
 * Approved-card lock for Bank Builder — once a lane is approved, a refresh must NOT silently swap its legs.
 * Verifies the live June-24 lock is honored (Lane A = the approved Morocco + Bosnia + Scotland/Brazil
 * Over 2.5 card; Lane B pinned), the card re-prices from its own legs, and canonical money is untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPersistedDailyPortfolio } from "./daily-portfolio/accounting.ts";

const root = path.join(process.cwd(), "public", "data");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));

const DATE = "2026-06-24";
const dp = buildPersistedDailyPortfolio(root, `${DATE}T08:00:00Z`, DATE, `${DATE}T08:00:00Z`, true);
const bb = dp.lanes.filter((l) => l.product === "bank-builder");
const laneA = bb.find((l) => l.lane === "A");
const laneB = bb.find((l) => l.lane === "B");

test("the approved-card lock file exists for the date and pins both lanes", () => {
  const lock = read("mr-dub/bank-builder-locks.json");
  assert.equal(lock.date, DATE);
  assert.ok(lock.lanes.A.legs.length >= 2 && lock.lanes.B.legs.length >= 2, "both lanes pinned");
});

test("Lane A is locked to the APPROVED card: Morocco + Bosnia + Scotland/Brazil Over 2.5", () => {
  assert.ok(laneA, "Lane A present");
  assert.equal(laneA.locked, true, "Lane A is locked");
  const sels = laneA.legs.map((l) => `${l.selection} (${l.matchup})`);
  assert.ok(sels.some((s) => /Morocco to win/.test(s)), "Morocco moneyline pinned");
  assert.ok(sels.some((s) => /Bosnia.*to win/.test(s)), "Bosnia moneyline pinned");
  assert.ok(laneA.legs.some((l) => /Scotland vs Brazil/.test(l.matchup) && /Over 2\.5/.test(l.selection)), "Scotland/Brazil Over 2.5 pinned (the reverted leg)");
  assert.ok(!laneA.legs.some((l) => /South Korea/.test(l.matchup)), "the South Korea leg that replaced Brazil is gone");
});

test("Lane B is locked + unchanged (Brazil moneyline + Switzerland Under)", () => {
  assert.ok(laneB?.locked, "Lane B locked");
  assert.ok(laneB.legs.some((l) => /Brazil to win/.test(l.selection)));
  assert.ok(laneB.legs.some((l) => /Under 2\.5/.test(l.selection) && /Switzerland/.test(l.matchup)));
});

test("locked card re-prices from its own legs (combined odds + potential reconcile)", () => {
  for (const lane of [laneA, laneB]) {
    const d = lane.legs.reduce((acc, l) => acc * dec(l.odds), 1);
    assert.ok(Math.abs(decToAmerican(d) - lane.combinedOdds) <= 2, `${lane.lane} combined odds reconcile`);
    assert.ok(Math.abs(lane.potentialReturn - lane.stake * d) < 0.5, `${lane.lane} potential = stake × combined`);
  }
});

test("Lane A locked card still reaches the $10k Step-5 goal", () => {
  assert.ok(laneA.potentialReturn >= 10000, `Lane A potential $${laneA.potentialReturn} ≥ $10,000`);
});

test("the lock NEVER mutates canonical money (bankroll/crown/record frozen)", () => {
  const p = read("mr-dub/portfolio.json");
  assert.equal(p.currentBankroll, 10176.17);
  assert.equal(p.crownBankroll, 10376.17);
  assert.deepEqual(p.record, { wins: 12, losses: 2, voids: 0, pending: 0 });
  assert.equal(dp.activeBankroll, 10176.17);
  assert.equal(dp.crownBankroll, 10376.17);
});

test("STABILITY: a second refresh keeps Lane A's locked legs identical (no silent swap)", () => {
  const again = buildPersistedDailyPortfolio(root, `${DATE}T20:00:00Z`, DATE, `${DATE}T20:00:00Z`, true);
  const a2 = again.lanes.find((l) => l.product === "bank-builder" && l.lane === "A");
  assert.deepEqual(a2.legs.map((l) => l.id).sort(), laneA.legs.map((l) => l.id).sort(), "Lane A legs unchanged across refreshes");
});
