/**
 * Session 7 — a product's "why no card today" is the LANE'S OWN published reason, never a generic sentence.
 * On 2026-10-02 (an MLB postseason off day / no priced slate yet) /today said Bank Builder had "no card that
 * reaches this step's price" — a different fact. Run: npx tsx --test src/lib/mr-dub/lane-reason.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDailyPortfolio } from "./daily-portfolio.ts";

const OFF_DAY = "no MLB games are scheduled for 2031-10-02 — a postseason off day (41 postseason game(s) still to be played, next on 2031-10-03)";
function root(lanes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-lane-reason-"));
  fs.cpSync(path.join(process.cwd(), "public/data/mr-dub"), path.join(dir, "mr-dub"), { recursive: true });
  fs.writeFileSync(path.join(dir, "mr-dub", "daily-portfolio.json"), JSON.stringify({ date: "2031-10-02", startingBankroll: 100, activeBankroll: 100, crownBankroll: 0, lanes }));
  return dir;
}
const lane = (product, lane, reason) => ({ id: `${product}-${lane}`, product, lane, status: "awaiting", stake: 100, combinedOdds: 0, potentialReturn: 100, legCount: 0, targetLegs: 2, legs: [], shortfallNote: "Fewer than 2 eligible legs available — awaiting a full card.", activationEligibility: { eligible: false, reason } });

test("the read model carries each lane's own published reason verbatim", () => {
  const p = buildDailyPortfolio(root([lane("bank-builder", "A", OFF_DAY), lane("moonshot", "A", OFF_DAY)]), "2031-10-02T15:00:00Z", "2031-10-02");
  assert.ok(p, "the persisted portfolio for the date must load");
  for (const c of p.cards) assert.equal(c.laneReason, OFF_DAY);
});

test("a lane with no published reason carries null — never a borrowed or invented one", () => {
  const p = buildDailyPortfolio(root([lane("bank-builder", "A", undefined)]), "2031-10-02T15:00:00Z", "2031-10-02");
  assert.equal(p.cards[0].laneReason, null);
});

test("/today renders the lane's reason first; the generic sentence is only the fallback", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/app/today/page.tsx"), "utf8");
  assert.match(src, /bbReason = bbNoPlay\s*\?\s*bbLaneReason \?\?/);
  assert.match(src, /msLaneReason \?\? "No Moonshot card today/);
  assert.match(src, /c\.laneReason\)\?\.laneReason \?\? dailyPortfolio\.cards\.find\(\(c\) => c\.product === "moonshot" && c\.shortfallNote\)/);
});

test("/moonshot's WAITING sentence carries the lane's own reason; the generic one is only the fallback", async () => {
  const { deriveMoonshotState } = await import("../products/moonshot-state.mjs");
  const base = { lane: null, portfolioMoonshot: { record: { wins: 0, losses: 0 } }, productLedger: null, hasScheduledGenerator: true, hasWiredSettler: true, today: "2031-10-02", todayLaneCount: 2 };
  const withReason = deriveMoonshotState({ ...base, todayLaneReason: OFF_DAY });
  const without = deriveMoonshotState(base);
  assert.equal(withReason.lifecycle, "WAITING", "the fixture must reach WAITING, or this test proves nothing");
  assert.match(withReason.publicNote, /postseason off day/);
  assert.doesNotMatch(withReason.publicNote, /reaches the rung's price/);
  assert.match(without.publicNote, /reaches the rung's price/);
});
