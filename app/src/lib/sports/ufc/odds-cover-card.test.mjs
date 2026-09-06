import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { oddsCoverCard, oddsUsableForCard, ODDS_COVER } from "./odds-cover-card.mjs";

const card = (evId, ids) => ({ event: { providerEventId: evId }, bouts: ids.map((b) => ({ boutId: b })) });

test("odds for a DIFFERENT event are NOT_YET, never drift and never usable", () => {
  // The live 2026-09-06 state: the card rolled to 600060772 while odds still held finished 600059993.
  const r = oddsCoverCard(card("600060772", ["1", "2", "3"]), card("600059993", ["9", "8"]));
  assert.equal(r.state, ODDS_COVER.NOT_YET);
  assert.match(r.reason, /no capture has run for it yet/);
  assert.equal(oddsUsableForCard(card("600060772", ["1"]), card("600059993", ["9"])), false);
});

test("same event, no shared bout, is DRIFT — a real defect", () => {
  const r = oddsCoverCard(card("E1", ["1", "2"]), card("E1", ["7", "8"]));
  assert.equal(r.state, ODDS_COVER.DRIFT);
  assert.match(r.reason, /must not drift/);
});

test("an empty odds artifact is NOT_YET — a card days out has no posted market", () => {
  assert.equal(oddsCoverCard(card("E1", ["1"]), card("E1", [])).state, ODDS_COVER.NOT_YET);
});

test("a genuine join COVERS, and is usable", () => {
  const r = oddsCoverCard(card("E1", ["1", "2", "3"]), card("E1", ["2", "3"]));
  assert.equal(r.state, ODDS_COVER.COVERS);
  assert.equal(r.overlap, 2);
  assert.equal(oddsUsableForCard(card("E1", ["1", "2"]), card("E1", ["2"])), true);
});

test("the three states are genuinely distinct", () => {
  const states = new Set([
    oddsCoverCard(card("A", ["1"]), card("B", ["2"])).state,
    oddsCoverCard(card("A", ["1"]), card("A", ["2"])).state,
    oddsCoverCard(card("A", ["1"]), card("A", ["1"])).state,
  ]);
  assert.equal(states.size, 3, "two states collapsed — that is the confusion this exists to end");
});

test("LIVE · the real artifacts resolve to a named state, and prices are only joined when they COVER", () => {
  const load = (n) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", n), "utf8"));
  const r = oddsCoverCard(load("card-latest.json"), load("odds-latest.json"));
  assert.ok(Object.values(ODDS_COVER).includes(r.state));
  assert.notEqual(r.state, ODDS_COVER.DRIFT, `the live artifacts are in genuine drift: ${r.reason}`);
});
