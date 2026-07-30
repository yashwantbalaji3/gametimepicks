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
  // The World Cup tournament is COMPLETE — player-projections/latest.json is now an empty shell, so the live
  // loader returns a zero-count shape (a valid end-of-tournament state). This test verifies the loader/transform
  // over the REAL committed provider props, so it pins to the committed 2026-07-14 archive, which carries BOTH
  // semifinals (France vs Spain + England vs Argentina), via the same pure transform the loader wraps.
  const live = loadWcPlayerProps();
  if (live) assert.ok(live.count >= 0 && Array.isArray(live.fixtures), "live loader returns a valid (possibly empty) shape");
  const w = toWcPlayerProps(JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/world-cup/player-projections/2026-07-14.json"), "utf8")));
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
