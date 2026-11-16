/**
 * Scenario builder card — synthetic legs only (no real price or player).
 * Run (from app/): npx tsx --test src/components/products/scenario-builder.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: SB, clampStakeGoal } = await import("./scenario-builder.tsx");
/* a leg as the page ships it: the line section's line (value + text), the chosen row's price, book key + label, ET time */
const leg = (id, ev, team, price, tier = "5/5", probability = null) => ({ playerId: id, name: `P${id}`, team, eventId: ev, family: "player_receptions", side: "over", line: { line: 4.5, lineText: "4.5", price, sportsbook: "draftkings", label: "DraftKings", capturedAt: "2026-11-15T12:00:00Z", captured: "Nov 15, 7:00 AM ET" }, tier, decimal: price > 0 ? 1 + price / 100 : 1 + 100 / -price, probability });

test("empty: exact refusal reasons, no amount-driven invention", () => {
  const html = renderToStaticMarkup(React.createElement(SB, { product: "bankBuilder", legs: [], candidates: 1150, refusedBy: { NO_OBSERVED_LINE: 1150 }, asOf: "slate" }));
  assert.match(html, /data-scenario-state="NO_QUALIFYING_BUILD"/);
  assert.match(html, /Of 1,150 candidate legs, 0 passed/);
  assert.match(html, /1,150<\/td><td>no sportsbook line captured before kickoff/);
  assert.doesNotMatch(html, /Illustrative gross return/);
});

test("built across games: gross return from prices, independence stated; any miss loses all", async () => {
  const html = renderToStaticMarkup(React.createElement(SB, { product: "bankBuilder", legs: [leg("a", "e1", "A", -150, "5/5", 0.6), leg("b", "e2", "B", -150, "5/5", 0.6)], candidates: 2, refusedBy: {}, asOf: "slate" }));
  assert.match(html, /data-scenario-state="BUILT"/);
  assert.match(html, /\$139</, "$50 × (5/3)² = $138.89, shown to the dollar above $100");
  assert.match(html, /Model chance all legs win: 36\.0%/);
  assert.match(html, /Any single losing leg loses the whole \$50\b/);
  assert.match(html, /a ranking from history, not a probability or a guarantee/);
  assert.match(html, /not a promise of any return/);
  assert.equal((html.match(/href="\/nfl\/game\/e[12]\/?#recent-form"/g) ?? []).length, 2, "every leg links its game's Recent form");
  // every leg names its line, book and ET capture time; a printed book carries the availability disclosure
  assert.equal((html.match(/4\.5 at DraftKings, captured Nov 15, 7:00 AM ET/g) ?? []).length, 2, "the section's caption: book label, ET quote time");
  assert.doesNotMatch(html, /at draftkings/, "never the raw provider key");
  assert.doesNotMatch(html, /captured \d\d:\d\dZ/, "no bare UTC clock time");
  const { BOOK_AVAILABILITY_NOTE } = await import("../../lib/sports/odds/eligible-operators.mjs");
  assert.ok(html.includes(BOOK_AVAILABILITY_NOTE), "book names print with BOOK_AVAILABILITY_NOTE");
});

test("same game: no combined chance; Moonshot copy names the long shot", () => {
  const html = renderToStaticMarkup(React.createElement(SB, { product: "moonshot", legs: [leg("a", "e1", "A", 200, "5/5", 0.4), leg("b", "e1", "B", 200, "5/5", 0.4)], candidates: 2, refusedBy: {}, asOf: "slate" }));
  assert.match(html, /data-joint="JOINT_PROBABILITY_UNAVAILABLE"/);
  assert.doesNotMatch(html, /Model chance all legs win/);
  assert.match(html, /Same-game legs/);
  assert.match(html, /usually loses the whole stake/);
});

test("refusal copy: push and official-projection refusals are named; below 4 of 5 says what it means", () => {
  const html = renderToStaticMarkup(React.createElement(SB, { product: "bankBuilder", legs: [], candidates: 9, refusedBy: { PUSH_IN_RECORD: 3, PROJECTION_NOT_OFFICIAL: 2, TREND_BELOW_4_OF_5: 2, LINE_NOT_COMPARED: 2 }, asOf: "slate" }));
  assert.match(html, /3<\/td><td>a result equal to the line in the last 5 \(a push\), so no 5-of-5 or 4-of-5 record/);
  assert.match(html, /2<\/td><td>no official projection for this market \(an estimate, or not published\)/);
  assert.match(html, /2<\/td><td>2 or fewer of the last 5 against the line/);
  assert.match(html, /a captured line we do not compare against/);
  assert.doesNotMatch(html, /fewer than 3 of 5/);
});

test("the custom stake is always below the goal", async () => {
  for (const cap of [5000, 1000]) {
    for (const [stake, goal] of [[cap, cap], [cap + 50, 100], [999999, cap], [cap - 1, cap - 1], [1, 1], [0, 0], [250, 250], [250, 100], [100, 250], [2.4, 3]]) {
      const c = clampStakeGoal(stake, goal, cap);
      assert.ok(c.stake >= 1 && c.stake < c.goal && c.goal <= cap, `${cap}: ${stake}/${goal} → ${JSON.stringify(c)}`);
    }
  }
  assert.deepEqual(clampStakeGoal(100, 250, 5000), { stake: 100, goal: 250 }, "a valid pair is unchanged");
  assert.deepEqual(clampStakeGoal(300, 250, 5000), { stake: 300, goal: 600 }, "a goal at or below the stake becomes 2x the stake");
  assert.deepEqual(clampStakeGoal(5000, 5000, 5000), { stake: 4999, goal: 5000 }, "the stake stops one dollar below the cap");
  const src = (await import("node:fs")).readFileSync(new URL("./scenario-builder.tsx", import.meta.url), "utf8");
  assert.match(src, /max=\{cap - 1\}/);
  assert.match(src, /const pickStake = \(v: number\) => \{ const c = clampStakeGoal\(v, goal, cap\)/);
  assert.match(src, /const pickGoal = \(v: number\) => \{ if \(!Number\.isFinite\(v\)\) return; const c = clampStakeGoal\(stake, v, cap\)/);
});
