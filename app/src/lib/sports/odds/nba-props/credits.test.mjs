/**
 * Odds-credit math for NBA prop captures (documented costing; nothing is spent). Run from app/:
 *   npx tsx --test src/lib/sports/odds/nba-props/credits.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  regionUnits, eventOddsWorstCase, eventOddsCostFromResponse, planNbaPropCapture, emptyCreditLedger, assertWithinCeiling,
  recordCall, parseNbaPropsReceipt, COSTING_SOURCE,
} from "./credits.mjs";
import { ELIGIBLE_OPERATOR_KEYS } from "../eligible-operators.mjs";
import { EVENT_1 } from "./__fixtures__/event-odds.fixture.mjs";

const APP = process.cwd();

test("region units: regions listed, or one per started group of 10 bookmakers — whichever is LARGER", () => {
  assert.equal(regionUnits({ regions: ["us"] }), 1);
  assert.equal(regionUnits({ regions: ["us", "us2"] }), 2);
  assert.equal(regionUnits({ bookmakers: ELIGIBLE_OPERATOR_KEYS }), 1, "nine eligible books = one region-equivalent");
  assert.equal(regionUnits({ bookmakers: Array.from({ length: 11 }, (_, i) => `b${i}`) }), 2);
  assert.equal(regionUnits({}), 0);
});

test("event-odds cost: unique markets returned × region units; empty markets cost nothing", () => {
  assert.equal(eventOddsWorstCase({ markets: ["player_points"], regions: ["us"] }), 1);
  assert.equal(eventOddsWorstCase({ markets: ["player_points", "player_rebounds", "player_points"], regions: ["us"] }), 2, "a repeated key is one market");
  // EVENT_1 returns player_points, player_rebounds, player_rebounds_assists (non-empty) across its books.
  assert.deepEqual(eventOddsCostFromResponse(EVENT_1, { regions: ["us"] }), { uniqueMarketsReturned: 3, regionUnits: 1, credits: 3 });
  assert.equal(eventOddsCostFromResponse({ bookmakers: [] }, { regions: ["us"] }).credits, 0);
  assert.equal(eventOddsCostFromResponse({ bookmakers: [{ markets: [{ key: "player_points", outcomes: [] }] }] }, { regions: ["us"] }).credits, 0);
});

test("the formula agrees with the committed 2026-06-10 probe: one market × one region moved `used` by 1; an empty market by 0", () => {
  const probe = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nba/market-probe-latest.json"), "utf8"));
  for (let i = 1; i < probe.probes.length; i++) {
    const p = probe.probes[i];
    const delta = Number(p.used) - Number(probe.probes[i - 1].used);
    assert.equal(delta, p.available ? 1 : 0, p.market);
  }
  assert.equal(probe.creditsUsed, probe.probes.filter((p) => p.available).length);
});

test("plan: points first by default; free events call + one event-odds call per event; worst case summed", () => {
  const p = planNbaPropCapture({ eventIds: ["1", "2", "3"], bookmakers: ["draftkings", "fanduel"] });
  assert.equal(p.ok, true);
  assert.deepEqual(p.markets, ["player_points"]);
  assert.equal(p.calls[0].worstCaseCredits, 0);
  assert.equal(p.calls.length, 4);
  assert.equal(p.worstCaseCredits, 3);
  assert.equal(p.costingSource, COSTING_SOURCE);
  const wide = planNbaPropCapture({ eventIds: ["1", "2"], markets: ["player_points", "player_rebounds", "player_assists", "player_threes", "player_points_rebounds_assists"], regions: ["us", "us2"] });
  assert.equal(wide.worstCaseCredits, 2 * 5 * 2);
  assert.equal(planNbaPropCapture({ eventIds: ["1"], markets: ["player_points_q1x"], regions: ["us"] }).ok, false);
  assert.equal(planNbaPropCapture({ eventIds: ["1"] }).ok, false, "a plan must name what it is charged by");
});

test("ledger: no ceiling → nothing allowed; a call that could cross the ceiling is stopped before it is made", () => {
  assert.equal(assertWithinCeiling(emptyCreditLedger(), 1).allowed, false);
  let l = emptyCreditLedger({ receiptPath: "docs/receipts/X.md", ceiling: 5 });
  assert.equal(assertWithinCeiling(l, 5).allowed, true);
  l = recordCall(l, { at: "t1", endpoint: "/events/{id}/odds", eventId: "1", markets: ["player_points"], regionUnits: 1, status: 200, headers: { "x-requests-last": "1", "x-requests-used": "101", "x-requests-remaining": "899" }, documentedCredits: 1 });
  l = recordCall(l, { at: "t2", endpoint: "/events/{id}/odds", eventId: "2", markets: ["player_points"], regionUnits: 1, status: 500, headers: { "x-requests-last": "1" }, documentedCredits: 0 });
  assert.equal(l.cumulativeCredits, 2, "a failed-but-charged call still counts, at the provider's figure");
  assert.equal(l.entries[1].disagreement, true, "documented vs provider disagreement is visible");
  assert.equal(l.entries[0].providerRemaining, 899);
  assert.equal(assertWithinCeiling(l, 4).allowed, false);
  assert.ok(!JSON.stringify(l).match(/apiKey|ODDS_API_KEY/), "the ledger never holds a key");
});

test("receipt parser fails closed: today's repository holds no NBA props receipt, and a partial one refuses", () => {
  const receipts = fs.readdirSync(path.join(APP, "..", "docs/receipts")).filter((f) => /ODDS_AUTHORIZATION/.test(f));
  for (const f of receipts) assert.equal(parseNbaPropsReceipt(fs.readFileSync(path.join(APP, "..", "docs/receipts", f), "utf8")).ok, false, f);
  assert.equal(parseNbaPropsReceipt("NBA player props only `basketball_nba` `player_points`").ok, false);
  const full = [
    "Scope: NBA player props only, `basketball_nba`, markets `player_points`.",
    "Effective cumulative ceiling: 40 credits",
    "| Expiry | the 40-credit ceiling |",
    "Do not retry blindly.",
    "Approved by: founder 2026-10-21",
  ].join("\n");
  assert.deepEqual(parseNbaPropsReceipt(full), { ok: true, ceiling: 40, markets: ["player_points"] });
  assert.equal(parseNbaPropsReceipt(full.replace("the 40-credit ceiling", "Program 300 close")).ok, false);
  assert.equal(parseNbaPropsReceipt(`${full}\nalso \`americanfootball_nfl\``).ok, false);
});
