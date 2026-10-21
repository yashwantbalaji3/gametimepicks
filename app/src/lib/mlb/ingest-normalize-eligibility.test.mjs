/**
 * MLB props ingest selects prices from ELIGIBLE operators only (2026-10-18). Before, it took the
 * bettor-best price across the whole `us` region, which put BetOnline.ag on the public /mlb board.
 *
 * Run: npx tsx --test src/lib/mlb/ingest-normalize-eligibility.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMlbProps } from "./ingest-normalize.ts";

const ev = (bookmakers) => ({
  id: "ev1", commence_time: "2026-10-18T23:08:00Z", home_team: "Cleveland Guardians", away_team: "Tampa Bay Rays", bookmakers,
});
const book = (key, title, price) => ({ key, title, markets: [{ key: "batter_hits", outcomes: [{ name: "Over", description: "Steven Kwan", point: 0.5, price }] }] });

test("an offshore book's better price is never selected", () => {
  const out = normalizeMlbProps([ev([book("betonlineag", "BetOnline.ag", -150), book("draftkings", "DraftKings", -217)])], "2026-10-18", "2026-10-18T13:00:00Z");
  assert.equal(out.props.length, 1);
  assert.equal(out.props[0].provider, "DraftKings");
  assert.equal(out.props[0].americanOdds, -217);
});

test("a prop only offshore books priced is absent, not filled", () => {
  const out = normalizeMlbProps([ev([book("bovada", "Bovada", -120), book("mybookieag", "MyBookie.ag", -125)])], "2026-10-18", "2026-10-18T13:00:00Z");
  assert.deepEqual(out.props, []);
});
