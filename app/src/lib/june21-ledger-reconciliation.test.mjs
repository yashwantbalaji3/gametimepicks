import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Source-of-truth ledger reconciliation guard (post cumulative-crown).
//
// Money-integrity invariant: the three real Lane B lost $100 seeds from the dual-lane phase are
// preserved as realized losses and never inflated by phantom placeholder rungs. After the operator
// BANKED the second completed $100→$10k ladder (Lane A, $10,089.23, June 24), the realized losses
// are recorded as a single `dual_lane_losses` settlement event (paperProfit -$300).
//
// Source of truth (cumulative crown = Σ completed-ladder finals):
//   Ladder #1 crown (protected, 5-0)    = $10,376.17
//   Ladder #2 Lane A BANKED (5-0)       = $10,089.23
//   => crown $20,465.40.
//   FOURTEEN real lost $100 seeds (preserved, not part of any completed ladder) = -$1400:
//     - dual-lane phase: three Lane B seeds (-$300, the single `dual_lane_losses` event)
//     - cycle-3: Lane B Step-1 LOST June 25 (-$100), Lane A Step-2 LOST June 26 (-$100)
//     - restart cycles: Lane B Step-2 LOST June 27 (-$100), Lane A Step-1 LOST June 27 (-$100)
//     - June-29 settlement: Lane A Step-1 LOST (-$100), Lane B Step-1 LOST (-$100)
//     - July-1 settlement: Lane A Step-1 WON (rolls, no seed lost), Lane B Step-1 LOST (-$100)
//     - July-2 settlement: Lane A Step-2 WON (rolls, no seed lost; Lane B stopped)
//     - July-3 settlement: Lane A Step-3 LOST (-$100), Lane B Step-1 LOST (-$100) — both lanes stopped
//     - July-5 settlement: Lane A Step-1 LOST (-$100), Lane B Step-1 LOST (-$100) — both lanes stopped
//   => currentBankroll $19,065.40, drawdown $1400, record 17-14-0-0; $0 open exposure (settled rungs released).
const portfolio = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
const ledger = JSON.parse(fs.readFileSync("public/data/mr-dub/ledger.json", "utf8"));

test("bankroll reconciles to crown less fourteen real lost seeds — above $19,000", () => {
  assert.equal(portfolio.crownBankroll, 20465.4, "protected cumulative crown immutable (Σ two banked $100→$10k finals)");
  assert.equal(portfolio.currentBankroll, 19065.4, "crown - $1400 (fourteen real lost seeds); pending cards don't realize");
  assert.ok(portfolio.currentBankroll > 19000, "portfolio is above $19,000");
  assert.equal(portfolio.drawdown, 1400, "drawdown = fourteen lost $100 seeds");
  assert.deepEqual(portfolio.record, { wins: 17, losses: 14, voids: 0, pending: 0 }, "17-14-0-0 (July-5 both lanes LOST)");
  assert.equal(portfolio.openExposure, 0, "canonical portfolio carries no open exposure; settled rungs released");
});

test("no phantom stops — realized Lane B losses are exactly -$300, recorded with a real date", () => {
  // The realized dual-lane losses are preserved as a single settled event (no coming_soon placeholders counted).
  const lossEvents = ledger.events.filter((e) => e.type === "dual_lane_losses");
  assert.equal(lossEvents.length, 1, "exactly one realized dual-lane-losses settlement event");
  const totalRealizedLoss = lossEvents.reduce((n, e) => n + e.paperProfit, 0);
  assert.equal(totalRealizedLoss, -300, "three real Lane B stops realize exactly -$300 (no triple-counted placeholders)");
  for (const e of lossEvents) {
    assert.ok(e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date), `realized loss has a real settlement date (got ${e.date})`);
    assert.equal(e.status, "settled", "realized loss is a settled (official) event");
    assert.equal(e.officialResultConfirmed, true, "realized loss confirmed from official sources");
  }
  // The phantom signature was a stop event with a null date — must never reappear.
  assert.ok(!ledger.events.some((e) => /loss|stop/i.test(e.type ?? "") && !e.date), "no null-date loss/stop events");
});

test("June 20 is a gap day — no June 20 card counted as a win/loss or exposure", () => {
  const jun20Settled = ledger.events.filter(
    (e) => e.date === "2026-06-20" && /won|loss|stop|banked/i.test(e.type ?? ""),
  );
  assert.equal(jun20Settled.length, 0, "no June 20 Bank Builder win/loss in the ledger (gap day)");
  // June 20 placed nothing; the dual-lane cards were June 18-24, never June 20.
  const jun20Open = ledger.events.filter((e) => e.date === "2026-06-20" && /open|placed/i.test(e.type ?? ""));
  assert.equal(jun20Open.length, 0, "no June 20 card placement (gap day)");
  assert.equal(portfolio.openExposure, 0, "no open exposure — both lanes settled, and June 20 placed nothing");
});
