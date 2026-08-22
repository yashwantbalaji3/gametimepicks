/**
 * ONE COMPONENT, AND NEVER ONE CLAIM.
 *
 * Run: npx tsx --test src/lib/parlays/sport-lab-cards.test.mjs
 *
 * The three risk ladders do not choose their sides the same way, and the difference is the whole
 * point. UFC selects on ITS MODEL, because that model passed its preregistered bar. EPL and MLB
 * select on PRICE, because theirs did not — EPL's has never been scored against a no-vig line and
 * would currently pick Hull City to beat Manchester United at 42.2% against a market price of 10.6%.
 *
 * A shared component that composed its own caption would eventually render one sport's cards under
 * another's claim, and on the page the honest and dishonest versions look identical. So the sentence
 * lives on the ARTIFACT, each builder states its own, and a ladder that does not say is not loaded.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { legLabel, loadSportLabLadder } from "./sport-lab-cards.ts";

const APP = process.cwd();
const readLadder = (dir) => {
  const p = path.join(APP, "public/data/parlays", dir, "latest.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

test("THE COMPONENT COMPOSES NO CLAIM OF ITS OWN", () => {
  const comp = fs.readFileSync(path.join(APP, "src/components/sport-lab-cards.tsx"), "utf8");
  const code = comp.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // It may render `selection`; it may not decide what selection means for any sport.
  assert.match(code, /\{ladder\.selection\}|\$\{ladder\.selection\}/, "the sentence must come from the artifact");
  for (const banned of [/market's own favourite/i, /passed its preregistered bar/i, /model's own read/i]) {
    assert.doesNotMatch(code, banned, `the component must not hardcode a sport's claim: ${banned}`);
  }
});

test("a ladder that does not state how it selected is REFUSED, not narrated", () => {
  // There is no safe default. Every available one is a claim about a model, and the wrong one is
  // worse than showing nothing at all.
  const src = fs.readFileSync(path.join(APP, "src/lib/parlays/sport-lab-cards.ts"), "utf8");
  assert.match(src, /typeof raw\?\.selection !== "string"/);
});

test("EACH LADDER STATES ITS OWN SELECTION, and the two do not agree", () => {
  const ufc = readLadder("risk-ladder-ufc");
  const epl = readLadder("risk-ladder-epl");
  if (!ufc || !epl) return;
  assert.ok(ufc.selection?.length > 0 && epl.selection?.length > 0, "both must declare a selection");
  assert.notEqual(ufc.selection, epl.selection, "two sports that select differently must not read identically");
  // UFC is the one model that earned the right to pick a side; EPL's explicitly has not.
  assert.match(ufc.selection, /model's own read/i);
  assert.match(epl.selection, /market's own favourite/i);
  assert.match(epl.selection, /never this model's read/i);
});

test("a ladder for a DIFFERENT day is refused", () => {
  const ufc = readLadder("risk-ladder-ufc");
  if (!ufc) return;
  // Ladders are dated by the day of their FIXTURES. Serving one regardless is how a set of cards
  // came to carry three dates at once: written 08-18, fighting 08-22, published as 08-21.
  assert.equal(loadSportLabLadder("ufc", "1999-01-01"), null);
  assert.ok(loadSportLabLadder("ufc", ufc.date), "the ladder's own date must load");
});

test("an unknown sport loads nothing rather than guessing a directory", () => {
  assert.equal(loadSportLabLadder("nba", "2026-08-22"), null);
  assert.equal(loadSportLabLadder("epl", null), null);
});

test("leg labels read in the sport's own terms", () => {
  // A fight is a person against a person; a football draw names neither.
  assert.equal(legLabel({ player: "Gauge Young", opponent: "Stan Dorsainvil", market: "fight_winner", marketLabel: "Fight winner", side: "win" }), "Gauge Young to beat Stan Dorsainvil");
  assert.equal(legLabel({ player: null, team: null, matchup: "Everton v Crystal Palace", side: "draw", market: "match_result", marketLabel: "Match result" }), "Everton v Crystal Palace — draw");
  assert.equal(legLabel({ player: null, team: "Everton", matchup: "Everton v Crystal Palace", side: "home", market: "match_result", marketLabel: "Match result" }), "Everton — match result");
});

test("BUILT EXPORT · each sport's page carries its OWN sentence and not the other's", () => {
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : null);
  const eplPage = read(path.join(APP, "out/epl/index.html"));
  const ufcPage = read(path.join(APP, "out/ufc/index.html"));
  if (!eplPage || !ufcPage) return;   // export not built in this run
  if (eplPage.includes("Paper cards")) {
    assert.match(eplPage, /market&rsquo;s own favourite|market's own favourite/i);
    assert.doesNotMatch(eplPage, /passed its preregistered bar/i, "EPL must never claim a cleared bar");
  }
  if (ufcPage.includes("Paper cards")) {
    assert.match(ufcPage, /passed its preregistered bar/i);
    assert.doesNotMatch(ufcPage, /market&rsquo;s own favourite|market's own favourite/i, "UFC's cards are its model's read, not the price's");
  }
});
