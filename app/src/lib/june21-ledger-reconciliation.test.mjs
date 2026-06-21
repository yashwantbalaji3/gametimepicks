import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// June 21 source-of-truth ledger reconciliation guard.
//
// Bug fixed: the Mr. Dub ledger builder iterated `priorLane.steps` without a settled guard, so a
// stopped lane's `coming_soon` placeholder rungs (Steps 3-5, no slateDate) were each counted as a
// -$100 loss. That triple-counted Lane B's single lost seed and dragged the bankroll from its true
// $10,176.17 down to $9,876.17 with a fake 8-5 record. The fix only counts SETTLED rungs.
//
// Source of truth:
//   crown (protected, 5-0)              = $10,376.17
//   Lane A Steps 1+2 won (riding)       = +0 realized, +2 wins
//   Lane B run 1: S1 won, S2 lost       = +1 win, -$100
//   Lane B restart: S1 lost             = -$100
//   => bankroll $10,176.17, record 8-2, exposure $0, drawdown $200.
const portfolio = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
const ledger = JSON.parse(fs.readFileSync("public/data/mr-dub/ledger.json", "utf8"));

test("bankroll reconciles to crown less two real Lane B lost seeds — above $10,000", () => {
  assert.equal(portfolio.crownBankroll, 10376.17, "protected crown immutable");
  assert.equal(portfolio.currentBankroll, 10176.17, "crown - $200 (two real Lane B stops)");
  assert.ok(portfolio.currentBankroll > 10000, "portfolio is above $10,000");
  assert.equal(portfolio.drawdown, 200, "drawdown = two lost $100 seeds");
  assert.deepEqual(portfolio.record, { wins: 8, losses: 2, voids: 0, pending: 0 }, "8-2 source of truth");
  assert.equal(portfolio.openExposure, 0, "no open exposure (June 20 gap day, no card placed)");
});

test("no phantom stops — exactly two lane_stopped events, both with real dates", () => {
  const stops = ledger.events.filter((e) => e.type === "lane_stopped");
  assert.equal(stops.length, 2, "exactly two real Lane B stops (no coming_soon placeholders counted)");
  for (const s of stops) {
    assert.ok(s.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date), `stop has a real settlement date (got ${s.date})`);
    assert.equal(s.paperProfit, -100, "each stop realizes exactly one $100 seed");
  }
  // The phantom signature was a lane_stopped with a null date — must never reappear.
  assert.ok(!ledger.events.some((e) => e.type === "lane_stopped" && !e.date), "no null-date stop events");
});

test("June 20 is a gap day — no June 20 card counted as a win/loss or exposure", () => {
  const jun20Settled = ledger.events.filter(
    (e) => e.date === "2026-06-20" && (e.type === "lane_step_won" || e.type === "lane_stopped"),
  );
  assert.equal(jun20Settled.length, 0, "no June 20 Bank Builder win/loss in the ledger (gap day)");
  assert.equal(portfolio.openExposure, 0, "no June 20 placement counts as exposure");
});
