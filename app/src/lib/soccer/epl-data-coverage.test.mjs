/**
 * EPL `data` — the model's inputs, measured against the real slate rather than assumed.
 *
 * The gate asks for "the model's input fields present for a full slate". The corpus supplies exactly
 * what fitPoisson consumes ({home, away, ftHome, ftAway}) across four seasons, so the FIELDS are
 * present. What is NOT complete is the CLUBS: a promoted side has no top-flight history, and
 * predictFixture runs an unseen club at multiplier 1.0 — league average, stated in the code.
 *
 * That is why this stage stays PARTIAL rather than PROVEN. The fallback is honest, but a fixture
 * priced off a league-average stand-in is not a fixture whose inputs are present, and on opening
 * weekend it is 2 of 10 matches. These assertions pin the measurement so the number moves for a
 * real reason — clubs gaining history — and never by quietly widening what "covered" means.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { fitPoisson, predictFixture } from "./epl-poisson.mjs";

const APP = process.cwd();
const corpus = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/epl/corpus-v1.json"), "utf8"));
// Sorted, like every other consumer: `.find()` returns the OLDEST capture, which is how the
// forecast builder spent eighteen days publishing a stale fixture list (P215 R-C1).
const capFile = fs.readdirSync(path.join(APP, "public/data/soccer/epl/fixtures"))
  .filter((f) => f.startsWith("capture-") && f.endsWith(".json")).sort().at(-1);
const season = JSON.parse(fs.readFileSync(path.join(APP, "public/data/soccer/epl/fixtures", capFile), "utf8"));

const knownClubs = new Set(corpus.rows.flatMap((r) => [r.home, r.away]));
const seasonClubs = [...new Set(season.rows.flatMap((r) => [r.homeClub, r.awayClub]))].sort();
const unseen = seasonClubs.filter((c) => !knownClubs.has(c));

test("the corpus carries exactly the fields the model fits on", () => {
  assert.ok(corpus.rows.length >= 1520, `expected a multi-season corpus, got ${corpus.rows.length}`);
  for (const r of corpus.rows.slice(0, 50)) {
    for (const f of ["home", "away", "ftHome", "ftAway"]) {
      assert.ok(r[f] !== undefined && r[f] !== null, `corpus row missing ${f} — fitPoisson cannot fit`);
    }
  }
  const seasons = [...new Set(corpus.rows.map((r) => r.season))];
  assert.ok(seasons.length >= 4, `a single season is not a fit; got ${seasons.length}`);
});

test("club coverage is MEASURED, and the promoted sides are named", () => {
  assert.equal(seasonClubs.length, 20, "a Premier League season is 20 clubs");
  // 18/20 as of 2026-08-20. This must not silently improve: a club joins the covered set only by
  // playing top-flight matches that land in the corpus.
  assert.equal(seasonClubs.length - unseen.length, 18, `covered clubs changed — now ${seasonClubs.length - unseen.length}`);
  assert.deepEqual(unseen, ["Coventry City", "Hull City"], "the uncovered clubs must be named, never a bare count");
});

test("an unseen club is FLAGGED cold-start and gains no fabricated strength", () => {
  const fit = fitPoisson(corpus.rows);
  const a = predictFixture(fit, "Coventry City", "Hull City");

  // The model discloses the fallback itself rather than leaving the reader to infer it.
  assert.deepEqual(a.coldStart, { home: true, away: true }, "both unseen clubs must be flagged");

  // The real invariant is NOT symmetry — home advantage is a LEAGUE-level effect and correctly
  // applies to any fixture, including one between two clubs with no history. What must not happen
  // is differentiation appearing from nowhere: swap in different unseen clubs and the numbers are
  // identical, because there is nothing about either club to tell them apart.
  const b = predictFixture(fit, "Notreal United", "Nowhere Rovers");
  assert.deepEqual(a.threeWay, b.threeWay, "two cold-start clubs must price identically to any other two");

  const sum = a.threeWay.H + a.threeWay.D + a.threeWay.A;
  assert.ok(Math.abs(sum - 1) < 1e-9, `a fallback must still be a coherent distribution, summed ${sum}`);

  // A club WITH history must differ from the cold-start baseline, or the corpus is doing nothing.
  const known = predictFixture(fit, "Arsenal", "Hull City");
  assert.notDeepEqual(known.threeWay, a.threeWay, "a covered club must price differently from a cold start");
  assert.equal(known.coldStart.home, false, "Arsenal has history and must not be flagged cold-start");
});

test("the opening-slate exposure is pinned: 2 of 10 matchweek-1 fixtures lean on the fallback", () => {
  const mw1 = season.rows.filter((r) => r.matchweek === 1);
  assert.equal(mw1.length, 10);
  const affected = mw1.filter((r) => !knownClubs.has(r.homeClub) || !knownClubs.has(r.awayClub));
  assert.equal(affected.length, 2, "opening-weekend fallback exposure changed — restate the evidence");
  const seasonAffected = season.rows.filter((r) => !knownClubs.has(r.homeClub) || !knownClubs.has(r.awayClub));
  assert.equal(seasonAffected.length, 74, "season-wide fallback exposure changed — restate the evidence");
});
