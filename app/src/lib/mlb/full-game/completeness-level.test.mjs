/**
 * `ready` IS A CLAIM ABOUT PROJECTIONS, NOT ABOUT OCCUPIED SLOTS.
 *
 * Run: npx tsx --test src/lib/mlb/full-game/completeness-level.test.mjs
 *
 * For as long as a batter existed only because a book had posted a line for him, `realCount` and
 * `ratedCount` were the same number — the prop-derived path sets both from `real.length` — and
 * `fullyReady` could read either one. The confirmed batting order (2026-08-22) separated them:
 * the confirmed path returns `realCount: 9` unconditionally, nine slots filled from StatsAPI,
 * while `ratedCount` goes on counting the batters who actually have a posted line.
 *
 * `fullyReady` kept reading `realCount`, so it became a test a confirmed order could not fail.
 * READY per slate went from 1-4 through 2026-08-21 to 12-15 from 2026-08-22, the day confirmed
 * sides went 0 -> 15. The end of it is gamePk 824706 on 2026-09-25: both nine-man orders
 * confirmed, zero of the eighteen batters with a posted line, every one priced at replacement
 * level, and the artifact calling itself `ready` while its own notes said "9 of 9 have no posted
 * prop line" twice.
 *
 * These are behavioral: they build inputs and read the level the adapter assigns. Reverting
 * `fullyReady` to `realCount` fails the first two.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { gameInputsFromBoard } from "./board-adapter.ts";

const GAME_PK = 700001;

const game = () => ({
  gamePk: GAME_PK,
  date: "2026-09-25",
  venue: "Somewhere",
  gameDate: "2026-09-25T22:05:00Z",
  awayTeamAbbr: "AAA",
  homeTeamAbbr: "HHH",
  awayTeamName: "Aways",
  homeTeamName: "Homes",
  awayProbablePitcherId: 900,
  awayProbablePitcherName: "A Starter",
  homeProbablePitcherId: 901,
  homeProbablePitcherName: "H Starter",
  startedBeforeGeneration: false,
});

/** A confirmed nine for one side. Identity and slot only — nothing here says how well anyone hits. */
const confirmedSide = (offset) => ({
  capturedAt: "2026-09-25T20:00:00Z",
  batters: Array.from({ length: 9 }, (_, i) => ({
    playerId: offset + i,
    name: `P${offset + i}`,
    battingOrderSlot: i + 1,
  })),
});

/** A posted `batter_hits` line for one player — the thing that makes him RATED. */
const hitLean = (playerId, team) => ({
  gamePk: GAME_PK,
  playerId,
  playerName: `P${playerId}`,
  playerTeamAbbr: team,
  playerRole: "batter",
  marketKey: "batter_hits",
  projection: 0.9,
});

/** Both starters get a strikeout line, so the starter half of `fullyReady` is never what moves. */
const starterLeans = () => [
  { gamePk: GAME_PK, playerId: 900, playerName: "A Starter", playerTeamAbbr: "AAA", playerRole: "pitcher", marketKey: "pitcher_strikeouts", projection: 5.5 },
  { gamePk: GAME_PK, playerId: 901, playerName: "H Starter", playerTeamAbbr: "HHH", playerRole: "pitcher", marketKey: "pitcher_strikeouts", projection: 5.5 },
];

function levelFor({ awayRated, homeRated }) {
  const leans = [...starterLeans()];
  for (let i = 0; i < awayRated; i += 1) leans.push(hitLean(100 + i, "AAA"));
  for (let i = 0; i < homeRated; i += 1) leans.push(hitLean(200 + i, "HHH"));
  const confirmed = new Map([[GAME_PK, { away: confirmedSide(100), home: confirmedSide(200) }]]);
  const [input] = gameInputsFromBoard({ date: "2026-09-25", games: [game()], leans }, undefined, confirmed);
  return input.completeness;
}

test("824706 · a confirmed order with NO posted line on either side is not `ready`", () => {
  const c = levelFor({ awayRated: 0, homeRated: 0 });

  // The premise, stated so the test cannot pass for the wrong reason: the slots ARE filled.
  assert.equal(c.awayLineupCount, 9, "nine confirmed slots, away");
  assert.equal(c.homeLineupCount, 9, "nine confirmed slots, home");
  assert.equal(c.awayLineupSource, "confirmed");
  assert.equal(c.homeLineupSource, "confirmed");

  // And not one of the eighteen carries a projection.
  assert.equal(c.awayRatedCount, 0);
  assert.equal(c.homeRatedCount, 0);

  assert.equal(
    c.level,
    "degraded",
    "eighteen batters at replacement level is a degraded simulation, whatever the batting order says",
  );

  // The notes must say it in the artifact's own words, not only in the level.
  assert.ok(
    c.notes.some((n) => n.includes("9 of 9 have no posted prop line")),
    `the artifact must state the gap: ${JSON.stringify(c.notes)}`,
  );
});

test("one unrated batter on one side is enough to leave `ready`", () => {
  assert.equal(levelFor({ awayRated: 8, homeRated: 9 }).level, "degraded", "8/9 away");
  assert.equal(levelFor({ awayRated: 9, homeRated: 8 }).level, "degraded", "8/9 home");
});

test("a confirmed order with every batter rated is still `ready`", () => {
  const c = levelFor({ awayRated: 9, homeRated: 9 });
  assert.equal(c.awayRatedCount, 9);
  assert.equal(c.homeRatedCount, 9);
  assert.equal(c.level, "ready", "the repair must not make `ready` unreachable");
  assert.ok(
    c.notes.some((n) => n.includes("all 9 with posted prop lines")),
    "and the notes say why",
  );
});

test("CAN THIS BE SIMULATED is still a question about slots", () => {
  /*
   * `enoughToSimulate` must keep reading `realCount`. A confirmed nine with no posted line is a
   * degraded simulation, not a refusal: the order is known, the engine runs, and the artifact says
   * plainly what it is missing. Collapsing the two questions would delete a real forecast.
   */
  const c = levelFor({ awayRated: 0, homeRated: 0 });
  assert.notEqual(c.level, "unavailable", "a known batting order is enough to simulate");
});

test("without a confirmed order, the two counts still agree — the pre-2026-08-22 behaviour is intact", () => {
  const leans = [...starterLeans()];
  for (let i = 0; i < 9; i += 1) leans.push(hitLean(100 + i, "AAA"));
  for (let i = 0; i < 9; i += 1) leans.push(hitLean(200 + i, "HHH"));
  const [input] = gameInputsFromBoard({ date: "2026-09-25", games: [game()], leans }, undefined, undefined);
  const c = input.completeness;
  assert.equal(c.awayLineupSource, "prop-derived");
  assert.equal(c.awayRatedCount, c.awayLineupCount, "prop-derived sets both from the same count");
  assert.equal(c.level, "ready", "nine posted lines per side was `ready` before the confirmed order and still is");
});
