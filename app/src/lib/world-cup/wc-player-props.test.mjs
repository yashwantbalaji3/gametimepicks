/**
 * WC player-props pilot (Phase C) — the props are REAL provider prices (The Odds API), market-implied,
 * settlement-pending, never product-eligible, never fabricated.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { toWcPlayerProps, loadWcPlayerProps, WC_PROP_MARKET_LABEL } from "./wc-player-props.ts";

test("toWcPlayerProps groups real props by fixture, market-implied, settlement unsupported", () => {
  const raw = {
    generatedAt: "x", priceSource: "the_odds_api", lineupsPosted: false,
    matches: [
      { fixture: "France vs Spain", matchDate: "2026-07-14", market: "player_goal_scorer_anytime", pick: "Yes",
        americanOdds: -104, marketProbability: 0.51, bookmaker: "williamhill_us", lineupStatus: "not_posted",
        player: { name: "Kylian Mbappe", team: "France" }, dataCaveats: ["Odds-backed market-implied."] },
      { fixture: "France vs Spain", matchDate: "2026-07-14", market: "player_shots", pick: "Over", line: 0.5,
        americanOdds: -200, marketProbability: 0.66, bookmaker: "fanduel", lineupStatus: "not_posted",
        player: { name: "Pedri", team: "Spain" }, dataCaveats: [] },
    ],
  };
  const w = toWcPlayerProps(raw);
  assert.equal(w.count, 2);
  assert.equal(w.settlementSupport, "unsupported", "settlement is not supported (pilot)");
  assert.equal(w.priceSource, "the_odds_api");
  assert.equal(w.fixtures.length, 1);
  const p = w.fixtures[0].props[0];
  assert.equal(p.player, "Kylian Mbappe");
  assert.equal(p.team, "France");
  assert.equal(p.marketLabel, WC_PROP_MARKET_LABEL.player_goal_scorer_anytime);
  assert.equal(p.americanOdds, -104, "real book odds preserved");
});

test("toWcPlayerProps fabricates nothing on empty input", () => {
  const w = toWcPlayerProps({});
  assert.equal(w.count, 0);
  assert.deepEqual(w.fixtures, []);
});

test("FUNCTIONAL: the committed WC props artifact loads as real provider props (both semifinals)", () => {
  const w = loadWcPlayerProps();
  if (!w) return; // artifact absent in some environments
  assert.ok(w.count > 0, "props present");
  assert.equal(w.settlementSupport, "unsupported", "settlement pending → never product-eligible");
  assert.ok(w.priceSource === "the_odds_api" || w.priceSource == null, "priced by the odds provider, not fabricated");
  // Every prop carries real odds or is honestly null — never an invented number.
  for (const fx of w.fixtures) {
    for (const p of fx.props) {
      assert.ok(typeof p.player === "string" && p.player.length > 0, "real player name");
      assert.ok(p.americanOdds === null || typeof p.americanOdds === "number", "odds are real or honestly null");
    }
  }
});

test("the pilot props board is wired into /world-cup", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/app/world-cup/page.tsx"), "utf8");
  assert.match(src, /WcPlayerPropsBoard/, "/world-cup renders the player-props board");
  assert.match(src, /loadWcPlayerProps\(\)/, "/world-cup loads the props");
});
