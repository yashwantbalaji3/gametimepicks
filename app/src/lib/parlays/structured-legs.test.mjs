/**
 * STRUCTURED-LEG CLOSURE guards (P210 · Release B).
 *
 * One seed-map owner (lib/parlays/seedable-cards) spans the MLB ladder, every sport lane ladder
 * and the identity-complete suggested families; the World Cup producers left ACTIVE composition
 * under the archive contract (history renders where it is history; an active lobby may not carry
 * a producer that can never publish again). Synthetic fixtures only — never today's data.
 *
 * Run: npx tsx --test src/lib/parlays/structured-legs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { legKey } from "../slip/leg-identity.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p) => fs.readFileSync(path.join(APP, p), "utf8");
/* The denial trap: an honest comment naming what was removed must not trip the removal guard. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const hasBuild = fs.existsSync(path.join(APP, "out", "cards", "ufc", "index.html"));

test("the seed map has ONE owner and the builder page uses it", () => {
  const lib = read("src/lib/parlays/seedable-cards.ts");
  assert.match(lib, /loadRiskLadder/, "MLB tier ladder in the one owner");
  assert.match(lib, /loadCurrentSportLabLadder/, "sport lane ladders via the SAME loader the lane pages render");
  assert.match(lib, /loadSuggestedCards/, "identity-complete suggested families");
  const page = read("src/app/build/custom/page.tsx");
  assert.match(page, /buildSeedableCards\(dataRoot, ladderDate\)/, "the page consumes the owner");
  assert.doesNotMatch(page, /loadRiskLadder|loadCurrentSportLabLadder/, "…and composes no second map");
});

test("lane legs map to canonical identities under the documented participant convention", () => {
  // Fighter leg (UFC): the named participant is the subject.
  const ufc = { eventId: "401905191", player: "Julia Polastri", team: null, opponent: "Jingnan Xiong", market: "fight_winner", marketLabel: "Fight winner", side: "win", line: null, odds: -240 };
  // Team leg (EPL match result): no named participant — the team is the subject.
  const eplTeam = { eventId: "e1", player: null, team: "Arsenal", opponent: "Leeds United", matchup: "Arsenal v Leeds United", market: "match_result", marketLabel: "Match result", side: "home", line: null, odds: -150 };
  // Total leg: neither — the fixture is the subject.
  const eplTotal = { eventId: "e1", player: null, team: null, opponent: null, matchup: "Arsenal v Leeds United", market: "total_goals", marketLabel: "Total goals", side: "over", line: 2.5, odds: -110 };
  const lib = read("src/lib/parlays/seedable-cards.ts");
  assert.match(lib, /l\.player \?\? l\.team \?\? l\.matchup \?\? "—"/, "the convention is in the owner, verbatim");
  // The convention produces stable, distinct canonical keys.
  const k = (l, sport) => legKey({ sport, player: l.player ?? l.team ?? l.matchup ?? "—", marketLabel: l.marketLabel, side: l.side, line: l.line ?? null });
  assert.equal(k(ufc, "ufc"), "ufc|julia polastri|fight winner|win|");
  assert.equal(k(eplTeam, "epl"), "epl|arsenal|match result|home|");
  assert.equal(k(eplTotal, "epl"), "epl|arsenal v leeds united|total goals|over|2.5");
  assert.notEqual(k(eplTeam, "epl"), k(eplTotal, "epl"));
});

test("WORLD CUP DISPOSITION · the archived producers are out of active composition, history intact", () => {
  const suggested = stripComments(read("src/lib/picks/suggested-cards.ts"));
  assert.doesNotMatch(suggested, /normalizeWcCards/, "the active lobby no longer composes WC cards");
  const custom = stripComments(read("src/app/build/custom/page.tsx"));
  assert.doesNotMatch(custom, /buildWcPlayerLegs/, "the active pool no longer calls the WC producer");
  // History renders where it is history: the archived game-detail surface still reads WC cards.
  const archive = read("src/lib/game-detail.ts");
  assert.match(archive, /normalizeWcCards/, "the archive surface keeps its era's cards");
});

test("lane cards in the export offer Customize or a reasoned browse-only state — never a silent card", () => {
  if (!hasBuild) return; // no build in this run (CI unit lane)
  for (const sport of ["ufc", "epl", "nfl"]) {
    const f = path.join(APP, "out", "cards", sport, "index.html");
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    const hasCards = /Customize this card|Browse-only|No .* ladder is published|ladder for today/i.test(html) || !/slipId/.test(html);
    assert.ok(hasCards, `/cards/${sport}: a rendered card carries the action or its reason`);
    if (/Customize this card/.test(html)) {
      assert.match(html, /href="\/build\/custom\/?\?card=/, `/cards/${sport}: Customize links the shared draft`);
    }
  }
});
