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

test("player markets stay unpublished, and the reason is the MODEL now — not the data", () => {
  /*
   * The state changed on 2026-08-21 and the guard changed with it. What must NOT change is that
   * nothing is published: a corpus is not a model, and five model improvements have been rejected
   * against preregistered bars in this repo. `available` flips when a backtest passes, never when
   * data lands — that distinction is the whole point of this file.
   */
  assert.equal(eplPlayerMarketsAvailable(), false, "no player number publishes without a cleared bar");
  const s = eplPlayerMarketStatus();
  assert.equal(s.state, "DATA_READY_MODEL_UNVALIDATED");
  assert.match(s.reason, /tested against results it has not seen/i, "the reason names the missing step");
  assert.equal(EPL_PLAYER_INPUTS.playerCorpus.state, "AVAILABLE");
  assert.equal(EPL_PLAYER_INPUTS.model.state, "MISSING", "the model is the one thing still missing");
  for (const [input, v] of Object.entries(EPL_PLAYER_INPUTS)) {
    assert.ok(v.note && v.note.length > 20, `${input} states its state in words`);
  }
});

test("the corpus the new state rests on is REAL — asserted against the file, not the prose", () => {
  const f = path.join(REPO, "data/internal/research/epl/players/espn-players-v1.jsonl");
  assert.ok(fs.existsSync(f), "the ESPN player corpus must exist for the state to claim AVAILABLE");
  const rows = fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(rows.length > 40000, `expected several seasons of player rows, got ${rows.length}`);
  const fixtures = new Set(rows.map((r) => r.espnEventId)).size;
  const seasons = new Set(rows.map((r) => r.season));
  /*
   * Whole seasons, not a fraction of one. A corpus 200 fixtures into a season would fit rates on a
   * biased slice — early-season form, one half of the fixture list — and nothing downstream would
   * show it. Asserted as a multiple of 380 rather than a fixed number so the corpus can grow.
   */
  assert.equal(fixtures % 380, 0, `${fixtures} fixtures is not a whole number of 380-match seasons`);
  assert.ok(seasons.size >= 3, `expected at least three seasons, got ${[...seasons].join(", ")}`);
  assert.equal(fixtures, seasons.size * 380, "every captured season must be complete");
  /* Participation is the term the NFL families lacked; assert it is OBSERVED, not assumed. */
  assert.ok(rows.some((r) => r.started === true), "starts are recorded");
  assert.ok(rows.some((r) => r.subbedIn === true), "substitute appearances are recorded");
  assert.ok(rows.some((r) => r.appeared === false), "non-appearances are recorded — the bench is the signal");
  /* League sanity: a corpus with the wrong scoring rate is a corpus of something else. */
  const goals = rows.reduce((s, r) => s + (r.goals ?? 0), 0);
  const perMatch = goals / fixtures;
  assert.ok(perMatch > 2.2 && perMatch < 3.2, `goals per match ${perMatch.toFixed(2)} is outside any real EPL season`);
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
