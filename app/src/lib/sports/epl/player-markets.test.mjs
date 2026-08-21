/**
 * EPL player markets — guards on a DOCUMENTED REFUSAL.
 *
 * The thing being protected is not code behaviour; it is that nobody quietly fills in a category the
 * data cannot support. Programs 182 and 183 rejected NFL player families twice after measuring them,
 * and the EPL case is stronger still: there is no player data here at all, so anything published
 * would be invented rather than merely weak.
 *
 * Run: npx tsx --test src/lib/sports/epl/player-markets.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { eplPlayerMarketsAvailable, eplPlayerMarketStatus, EPL_PLAYER_INPUTS } from "./player-markets.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");

test("EPL player markets are unavailable, and say why in a reader's words", () => {
  assert.equal(eplPlayerMarketsAvailable(), false);
  const s = eplPlayerMarketStatus();
  assert.equal(s.state, "UNAVAILABLE_NO_DATA");
  assert.match(s.reason, /no player-level/i);
  for (const [input, v] of Object.entries(EPL_PLAYER_INPUTS)) {
    assert.equal(v.state, "MISSING", `${input} must be MISSING while no corpus exists`);
    assert.ok(v.note && v.note.length > 20, `${input} states what is missing`);
  }
});

test("THE FACT THE REFUSAL RESTS ON: the corpus carries no player field", () => {
  /*
   * Asserted against the real committed corpus rather than trusting the prose above it. If a player
   * corpus ever lands, THIS test fails — which is the correct moment to revisit the refusal, and far
   * better than a stale refusal outliving its reason the way three evidence strings did on 2026-08-20.
   */
  const corpus = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/epl/corpus-v1.json"), "utf8"));
  const fields = new Set(Object.keys(corpus.rows[0]));
  assert.ok(corpus.rows.length > 1000, "the corpus is the real one");
  for (const playerish of ["players", "lineups", "scorers", "events", "appearances", "minutes"]) {
    assert.ok(!fields.has(playerish), `corpus row carries "${playerish}" — the refusal's premise no longer holds, revisit it`);
  }
  assert.deepEqual([...fields].sort(), ["away", "dateUtc", "ftAway", "ftHome", "home", "matchday", "providerRef", "result", "season", "sourceFile"],
    "the corpus is match-level only; a changed shape must force this refusal to be re-read");
});

test("no EPL surface publishes a player projection", () => {
  /*
   * The forecast artifact is the only thing the public EPL surfaces read. If a player key ever
   * appears in it, a page could render it — so the artifact is where this is enforced.
   */
  const art = JSON.parse(fs.readFileSync(path.join(APP, "public/data/soccer/epl/forecasts/latest.json"), "utf8"));
  const blob = JSON.stringify(art);
  for (const term of ["playerId", "playerName", "anytimeGoalscorer", "shotsOnTarget", "playerProps"]) {
    assert.ok(!blob.includes(term), `the public EPL forecast artifact carries "${term}" — player markets are refused`);
  }
});
