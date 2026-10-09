/**
 * TRUTH-001 — a day with no games, or a producer that ran and found nothing, is never "data pending".
 *
 * Run: npx tsx --test src/lib/products/no-games-day-states.test.mjs
 *
 * 2026-10-09 is a real no-games MLB day: `mlb/boards/2026-10-09.json` has 0 games; the risk ladder ran at 15:18Z
 * with `cards: []`; the daily portfolio's lanes say "the 2026-10-09 slate holds no games"; Homer Nukes wrote no file
 * (NO_SLATE by design). Surfaces said "Data pending" (/build, /build/custom), "not been published yet"
 * (/homer-nukes), "Not published today · stale" from the retired legacy lane (/moonshot) and "No-play" (/today).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { picksSurfaceStatus } from "./surface-status.mjs";

const APP = process.cwd();
const json = (rel) => JSON.parse(fs.readFileSync(path.join(APP, "public/data", rel), "utf8"));
const src = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("the state rule", () => {
  assert.equal(picksSurfaceStatus({ shownCount: 3, slateDate: "2026-10-10", today: "2026-10-10", producerRan: true }), "pregame");
  assert.equal(picksSurfaceStatus({ shownCount: 3, slateDate: "2026-10-08", today: "2026-10-10", producerRan: true }), "review");
  assert.equal(picksSurfaceStatus({ shownCount: 0, slateDate: "2026-10-09", today: "2026-10-09", producerRan: true }), "no_qualifying");
  assert.equal(picksSurfaceStatus({ shownCount: 0, slateDate: "2026-10-09", today: "2026-10-09", producerRan: false }), "data_pending");
});

test("2026-10-09 (real): the producers ran and found nothing, so /build is 'No qualifying card'", () => {
  const ladder = json("parlays/risk-ladder/2026-10-09.json");
  assert.equal(ladder.date, "2026-10-09");
  assert.equal(ladder.cards.length, 0);
  assert.ok(ladder.skipped.length > 0, "the producer stated why");
  assert.equal(picksSurfaceStatus({ shownCount: 0, slateDate: "2026-10-09", today: "2026-10-09", producerRan: true }), "no_qualifying");
  const header = src("src/components/picks-surface-header.tsx");
  assert.match(header, /no_qualifying: \{ label: "No qualifying card"/);
});

test("/homer-nukes: no board + a 0-game MLB board reads 'no games', not 'not published yet'", () => {
  assert.equal(json("mlb/boards/2026-10-09.json").games.length, 0, "premise");
  assert.equal(fs.existsSync(path.join(APP, "public/data/mlb/homer-nukes/2026-10-09.json")), false, "premise: no file by design");
  const page = src("src/app/homer-nukes/page.tsx");
  assert.match(page, /mlbSlateGames === 0 \?/);
  assert.match(page, /No MLB games are scheduled today, so there is no home-run board/);
});

test("/moonshot: today's producer output decides the badge, never the retired legacy lane", () => {
  const page = src("src/app/moonshot/page.tsx");
  assert.match(page, /const todayRanWithoutCard = moonshotLanes\.length === 0 && dailyPortfolio\.date === today/);
  assert.match(page, /status = \(todayRanWithoutCard \? "no_qualifying" : signature\.surfaceStatus\)/);
  const dp = json("mr-dub/daily-portfolio.json");
  if (dp.date === "2026-10-09") {
    assert.ok(dp.lanes.some((l) => l.product === "moonshot" && /no games/.test(l.activationEligibility?.reason ?? "")), "the lane says why");
  }
});

test("/today: a no-games day is not a no-play call", () => {
  const page = src("src/app/today/page.tsx");
  assert.match(page, /const noGamesToday = todayAcross\.state !== "UNKNOWN" && todayAcross\.eventsToday === 0;/);
  assert.match(page, /bbNoPlay \? \(noGamesToday \? "No games today" : "No-play"\)/);
  assert.match(page, /moonshotActive \? "Active" : noGamesToday \? "No games today" : "No-play"/);
});
