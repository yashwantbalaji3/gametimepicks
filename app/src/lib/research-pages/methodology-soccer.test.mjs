/**
 * METHODOLOGY · Premier League and Ligue 1 cards (2026-10-05).
 *
 *  MS1 every count on the cards equals the artifact Soccer named for it (no typed-in number)
 *  MS2 the cards exist, use the facts module, and never say "validated" (Soccer's wording rule)
 *
 * Run: npx tsx --test src/lib/research-pages/methodology-soccer.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { eplFacts, ligue1Facts } from "./methodology-soccer.ts";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(APP, "public/data/soccer", rel), "utf8"));

test("MS1 card counts are the artifacts' own numbers", () => {
  const e = eplFacts();
  const f = read("epl/forecasts/latest.json").gradedRecord;
  assert.equal(e.matchGradedTotal, f.ledgerTotal);
  assert.equal(e.matchGradedCurrent, f.gradedUnderThisModel);
  assert.equal(e.matchGradedCurrent + e.matchGradedPrior, e.matchGradedTotal, "current + replaced = all graded");
  assert.equal(e.playerHoldoutN, read("epl/player-projections/latest.json").validation.holdout.n);
  const rows = fs.readFileSync(path.join(APP, "public/data/soccer/epl/results/graded-player-projections.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const count = (m, o) => rows.filter((r) => r.market === m && r.outcome === o).length;
  assert.deepEqual(e.scorer, { hit: count("anytime_goalscorer", "HIT"), miss: count("anytime_goalscorer", "MISS"), void: count("anytime_goalscorer", "VOID") });
  assert.deepEqual(e.shot, { hit: count("shots_on_goal_over_0_5", "HIT"), miss: count("shots_on_goal_over_0_5", "MISS"), void: count("shots_on_goal_over_0_5", "VOID") });

  const l = ligue1Facts();
  const g = read("ligue-1/results/graded.json").summary;
  const h = read("ligue-1/forecasts/latest.json").validation.holdout;
  assert.equal(l.graded, g.matches);
  assert.equal(l.gradedLogLoss, g.logLoss);
  assert.equal(l.holdoutMatches, h.matches);
  assert.equal(l.holdoutLogLoss, h.logLoss);
  assert.equal(l.tooSmall, g.sampleState !== "ACCUMULATING");
});

test("MS2 the cards read the facts module and follow the wording rule", () => {
  const src = fs.readFileSync(path.join(APP, "src/app/methodology/page.tsx"), "utf8");
  for (const name of ["Premier League", "Ligue 1"]) assert.match(src, new RegExp(`name="${name}"`), `${name} card`);
  assert.match(src, /eplFacts\(\)/);
  assert.match(src, /ligue1Facts\(\)/);
  const cards = src.slice(src.indexOf('name="Premier League"'), src.indexOf('name="Soccer / World Cup"'));
  assert.ok(cards.length > 200, "non-vacuous");
  assert.doesNotMatch(cards, /validat/i, "being graded is not being validated");
  // The graded counts move every matchday, so none of today's values may appear typed into the source.
  assert.doesNotMatch(cards, /\b(11,567|11567|1,046|1046|1,114|1114|0\.9613)\b/, "counts are read, not typed in");
});
