import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { leanMatchup } from "./lean-matchup.ts";

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");

test("both sides known → the player's own team leads, unchanged", () => {
  const m = leanMatchup({ playerTeamAbbr: "TB", opponentAbbr: "BAL", homeTeamAbbr: "TB", awayTeamAbbr: "BAL" });
  assert.equal(m.kind, "SIDED");
  assert.equal(m.label, "TB vs BAL");
});

test("side unknown but game known → states the GAME and claims nothing about the side", () => {
  const m = leanMatchup({ playerTeamAbbr: null, opponentAbbr: null, homeTeamAbbr: "TB", awayTeamAbbr: "BAL" });
  assert.equal(m.kind, "GAME_ONLY");
  assert.equal(m.label, "BAL @ TB");
  assert.doesNotMatch(m.label, /—/, "a dash is not an answer to which game this is");
});

test("it never guesses the side — a GAME_ONLY label carries no vs", () => {
  const m = leanMatchup({ homeTeamAbbr: "TB", awayTeamAbbr: "BAL" });
  assert.equal(m.kind, "GAME_ONLY");
  assert.doesNotMatch(m.label, /\bvs\b/, "'vs' asserts a side; this row does not know one");
});

test("one team alone is not a game — half a matchup is worse than none", () => {
  assert.equal(leanMatchup({ homeTeamAbbr: "TB", awayTeamAbbr: null }), null);
  assert.equal(leanMatchup({ homeTeamAbbr: null, awayTeamAbbr: "BAL" }), null);
  assert.equal(leanMatchup({ playerTeamAbbr: "TB", opponentAbbr: null, homeTeamAbbr: null, awayTeamAbbr: null }), null);
});

test("nothing known → null, so the caller omits the line instead of printing dashes", () => {
  assert.equal(leanMatchup({}), null);
  assert.equal(leanMatchup({ playerTeamAbbr: "", opponentAbbr: "  ", homeTeamAbbr: "", awayTeamAbbr: null }), null);
});

test("no output ever contains an em dash — that was the defect", () => {
  const cases = [
    { playerTeamAbbr: "TB", opponentAbbr: "BAL" },
    { homeTeamAbbr: "TB", awayTeamAbbr: "BAL" },
    { playerTeamAbbr: null, opponentAbbr: "BAL", homeTeamAbbr: "TB", awayTeamAbbr: "BAL" },
  ];
  for (const c of cases) {
    const m = leanMatchup(c);
    if (m) assert.doesNotMatch(m.label, /—/, `${JSON.stringify(c)} produced ${m.label}`);
  }
});

test("THE REAL BOARDS: every lean that lost its player join still names its game", () => {
  /*
   * The population this exists for. `playerTeamAbbr` is null on ~6.6% of a day's leans because the
   * provider's unaccented spelling never matched the canonical name — but the SCHEDULE join held, so
   * the game is known and must be stated. If a board ever produced a lean with neither the side nor
   * the game, that is a different and worse defect, and this says so rather than papering over it.
   */
  const dir = path.join(APP, "public/data/mlb/boards");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, "no committed boards — this guard would pass vacuously");

  let sideless = 0, rescued = 0, unplaceable = [];
  for (const f of files) {
    let board;
    try { board = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    for (const l of board.leans ?? []) {
      if (l.playerTeamAbbr && l.opponentAbbr) continue;
      sideless += 1;
      const m = leanMatchup(l);
      if (m) rescued += 1;
      else unplaceable.push(`${f}:${l.playerName ?? "?"}`);
    }
  }
  assert.ok(sideless > 0, "no side-less leans in the corpus — the guard is measuring nothing");
  assert.deepEqual(
    unplaceable.slice(0, 5), [],
    `${unplaceable.length} of ${sideless} side-less leans know neither their side nor their game`,
  );
  assert.equal(rescued, sideless, "every side-less lean is placeable by its game");
});
