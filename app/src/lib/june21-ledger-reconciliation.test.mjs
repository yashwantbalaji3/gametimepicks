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
//   Lane B run 2 (prior): S1 lost       = -$100
//   Lane B restart: S1 won (rolled)     = +0 realized, +1 win
//   => bankroll $10,176.17, record 9-2, drawdown $200 (two realized prior Lane B losses).
//   June 22 settlement: Lane B Step 1 restart WON (rolled, $0 realized).
//   June 23 settlement: Lane A Step 3 WON (Jordan 1-2 Algeria FT, official) → rolled, $0 realized.
//   => $0 open exposure (both lanes settled WON, awaiting next card), record 10-2-0-0; won/rolled steps add no realized P/L.
const portfolio = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
const ledger = JSON.parse(fs.readFileSync("public/data/mr-dub/ledger.json", "utf8"));

test("bankroll reconciles to crown less two real Lane B lost seeds — above $10,000", () => {
  assert.equal(portfolio.crownBankroll, 10376.17, "protected crown immutable");
  assert.equal(portfolio.currentBankroll, 10176.17, "crown - $200 (two real Lane B stops); pending cards don't realize");
  assert.ok(portfolio.currentBankroll > 10000, "portfolio is above $10,000");
  assert.equal(portfolio.drawdown, 200, "drawdown = two lost $100 seeds");
  assert.deepEqual(portfolio.record, { wins: 10, losses: 2, voids: 0, pending: 0 }, "10-2-0-0 (Lane A Step 3 WON; Lane B Step 1 WON)");
  assert.equal(portfolio.openExposure, 0, "Lane A Step 3 settled WON + Lane B settled WON → both seeds released");
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
  // June 20 placed nothing; the cross-slate resume's cards were June 21/22, never June 20.
  const jun20Open = ledger.events.filter((e) => e.date === "2026-06-20" && e.type === "lane_step_open");
  assert.equal(jun20Open.length, 0, "no June 20 card placement (gap day)");
  assert.equal(portfolio.openExposure, 0, "no open exposure — both cross-slate cards settled WON, and June 20 placed nothing");
});
