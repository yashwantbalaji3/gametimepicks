/**
 * NFL PLAYER PAGE PRINTS THE GAME PAGE'S DIGITS (Track B, 2026-10-29; defect found by Track D).
 *
 * /players/nfl/[slug] (and /my) printed buildMyPlayerRows' 1-dp numbers — receiving yards "86.5 (range 32–164.4)" —
 * while the game page and the Top boards print "87 (32–164)" and receptions "8.0". Same official value, contradictory
 * strings. The read model now carries `display`, formatted from the exact board values by forecast-view formatValue.
 * This renders the GAME PAGE's PlayerRow for every week-8 official row of two committed games and asserts the
 * player-page strings equal the rendered digits, and that the anytime-TD chance the join carries prints identically.
 *
 * Run (from app/): npx tsx --test src/lib/consistency/nfl-player-page-render-parity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { loadForecastView } from "../sports/nfl/forecast-view-load.mjs";
import { MARKET_KEY, PLAYER_FAMILIES } from "../sports/nfl/forecast-view.mjs";
import { buildMyPlayerRows, nflAnytimeTdDisplay } from "../my/read-model.ts";
import { nflPlayerForecasts } from "../research-pages/forecast-join.ts";

globalThis.React = React;
const { default: PlayerRow } = await import("../../components/nfl/forecast/player-row.tsx");

const APP = process.cwd();
const EVENTS = ["401873023", "401873026"]; // CAR @ GB (Thu), BAL @ BUF (Sun), week 8
const VIEW_KEY = Object.fromEntries(Object.entries(MARKET_KEY).map(([v, m]) => [m, v]));
const unescape = (s) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

/** The game page's rendered headline + range for one player family. */
function gamePageStrings(p, viewKey) {
  const fam = PLAYER_FAMILIES.find((f) => f.key === viewKey);
  const html = renderToStaticMarkup(React.createElement(PlayerRow, { player: p, entry: p.families[viewKey], family: fam }));
  const value = unescape(html.match(/<b class="nf-num">([^<]*)/)[1]);
  const range = html.match(/<span>80%: ([^<]*)<\/span>/)?.[1] ?? null;
  return { value, range: range && unescape(range) };
}

test("week 8: every player-page market string equals the game page's rendered PlayerRow digits", () => {
  const rows = buildMyPlayerRows();
  let checked = 0; let td = 0;
  for (const id of EVENTS) {
    const view = loadForecastView(path.join(APP, "public"), id);
    assert.ok(view, `${id}: game page view`);
    for (const p of view.players) {
      const mine = rows.find((r) => r.playerId === p.playerId && r.matchup === p.matchup);
      for (const [viewKey, e] of Object.entries(p.families)) {
        if (viewKey === "anytimeTd") {
          if (mine?.anytimeTd == null) continue;
          assert.equal(nflAnytimeTdDisplay(mine.anytimeTd), gamePageStrings(p, viewKey).value, `${p.name} anytime TD`);
          td += 1;
          continue;
        }
        const m = mine?.markets.find((x) => VIEW_KEY[x.key] === viewKey);
        if (!m) continue; // a family the player page does not publish (not PUBLISHED on the board) prints nothing
        const g = gamePageStrings(p, viewKey);
        assert.equal(m.display.value, g.value, `${p.name} ${e.marketKey} headline: player page "${m.display.value}" vs game page "${g.value}"`);
        assert.equal(m.display.range, g.range, `${p.name} ${e.marketKey} range: player page "${m.display.range}" vs game page "${g.range}"`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 20, `checked ${checked} markets`);
  assert.ok(td >= 20, `checked ${td} anytime-TD chances`);
});

test("the player page renders the display strings and the anytime-TD chance, never the 1-dp numbers", () => {
  const page = fs.readFileSync(path.join(APP, "src/app/players/[sport]/[slug]/page.tsx"), "utf8");
  assert.match(page, /\{m\.display\.value\} <span[^>]*>\(range \{m\.display\.range\}\)/);
  assert.doesNotMatch(page, /\{m\.median\}|\{m\.p10\}–\{m\.p90\}/);
  assert.match(page, /nflAnytimeTdDisplay\(f\.anytimeTd\)/);
  const my = fs.readFileSync(path.join(APP, "src/components/my/my-gametime.tsx"), "utf8");
  assert.match(my, /m\.display\?\.value/);
  // the section still renders only for a player with a published range (composition.test FJ1); within it, the anytime-TD
  // chance the join carries is printed
  const withBoth = buildMyPlayerRows().find((r) => r.markets.length > 0 && r.anytimeTd != null);
  assert.ok(withBoth && nflPlayerForecasts(withBoth.playerId).some((r) => r.anytimeTd === withBoth.anytimeTd), "the join carries the anytime-TD chance to the player page");
});
