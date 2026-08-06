/**
 * Model-ranked list parity guards (Program 142, Train 1 step 3B).
 *
 * These exist because of what happened in Program 141: the full ranked board was removed from
 * `/picks` on the belief it was duplicated elsewhere, when `/picks` was its only full rendering.
 * The merge gate is "the destination must provide the capability BEFORE the source is retired", and
 * a gate nobody can check is not a gate. These check it.
 *
 * Run: npx tsx --test src/lib/markets/ranked-list.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

const RANKED = "src/components/markets/model-ranked-list.tsx";

test("THE MERGE GATE · Market Center renders the FULL ranked list, not a slice", () => {
  const src = read(RANKED);
  // `/today` deliberately shows a top-6 preview. The destination for the merge must show everything,
  // or retiring /picks would quietly reduce what a user can see.
  assert.match(src, /board\.overall \?\? \[\]/, "the full overall ranking must be rendered");
  assert.doesNotMatch(src, /\.slice\(0,\s*\d+\)/, "the destination must not truncate the ranking");

  const page = read("src/app/markets/page.tsx");
  assert.match(page, /<ModelRankedList/, "the ranked list must actually be on /markets");
  assert.match(page, /buildTop10Board/, "it must read the same ranked data /picks uses");
});

test("every field /picks showed per pick survives on the destination", () => {
  const src = read(RANKED);
  for (const [field, why] of [
    ["selection", "what the pick is"],
    ["pick.game", "which matchup"],
    ["pick.market", "which market"],
    ["modelProbability", "the model view"],
    ["marketProbability", "the market view"],
    ["pick.odds", "the price"],
    ["pick.reason", "the rationale — a ranked list without it is just a leaderboard"],
    ["pick.risk", "the stated limitation"],
    ["startsAt", "when it starts"],
  ]) {
    assert.ok(src.includes(field), `the ranked row must render ${field} (${why})`);
  }
});

test("the difference is pp and matches Market Center's own convention", () => {
  const src = read(RANKED);
  assert.match(src, /modelProbability - pick\.marketProbability/, "model minus market, the same direction as Gap");
  assert.match(src, /\.toFixed\(1\)\} pp/, "the unit is pp");
  assert.doesNotMatch(src, /\.toFixed\(1\)\} pts/, "'pts' means scoring points on this site");
  assert.match(src, /percentage points/, "the abbreviation carries its expansion");
});

test("a missing probability is WITHHELD, never rendered as a zero difference", () => {
  const src = read(RANKED);
  assert.match(src, /if \(typeof pick\.modelProbability !== "number" \|\| typeof pick\.marketProbability !== "number"\) return null/,
    "an absent probability must produce null, not 0");
  assert.match(src, /no comparison/, "the withheld state must be visible to the reader");
});

test("the ranked list does not re-define terms — one glossary per page", () => {
  const src = read(RANKED);
  // The reading key on the same page owns the definitions. A second set would drift from the first.
  for (const term of ["American odds", "Market-implied probability", "Moneyline"]) {
    assert.ok(!src.includes(term), `${term} is defined in HowToReadMarkets, not duplicated here`);
  }
  assert.match(src, /defined in the reading key/i, "it must point at the single glossary");
});

test("ranking is not presented as profit, and an empty board is not an outage", () => {
  const src = read(RANKED).replace(/\s+/g, " ");
  assert.match(src, /<strong>not<\/strong> a prediction of profit/i, "ranking must not imply profit");
  assert.match(src, /not ordered by the size of the difference/i, "a big gap is not the ranking");
  assert.match(src, /not a missing update/i, "an empty ranking is the model's answer, not a failure");
  // Word-bounded: a bare /lock/ matched className="block". The repo's existing copy guards use
  // spaced forms (" lock ") for the same reason.
  assert.doesNotMatch(src, /guaranteed|best bet|sure thing|\block\b|\blocks in\b/i);
});

test("it is a native collapsed disclosure placed BELOW the beginner default", () => {
  const src = read(RANKED);
  assert.match(src, /<details/, "keyboard-operable for free");
  assert.match(src, /<summary/);
  // Match the JSX ATTRIBUTE, not the word: "Open the full simulation" is a link label and was
  // tripping a bare /open/ check.
  assert.doesNotMatch(src, /<details[^>]*\sopen[\s>]/, "it must not default to open — that is the second wall the fix removed");

  const page = read("src/app/markets/page.tsx");
  // The reading key must come before the ranked list, and both before the raw comparison grid.
  assert.ok(page.indexOf("<HowToReadMarkets") < page.indexOf("<ModelRankedList"),
    "the glossary must precede the ranked list a reader would use it on");
});

test("PRODUCTION TRUTH · the built /markets carries the ranked list and no probability-gap 'pts'", () => {
  const out = path.join(APP, "out/markets/index.html");
  if (!fs.existsSync(out)) return;                      // no build in this run
  const html = fs.readFileSync(out, "utf8");
  assert.match(html, /Model-ranked picks/, "the ranked section must be in the export");
  assert.ok(!/[0-9]\.[0-9] pts/.test(html), "a probability difference must never render as pts");
});
