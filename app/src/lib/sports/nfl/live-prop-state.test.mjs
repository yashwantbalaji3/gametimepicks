/**
 * LIVE PLAYER-PROP STATE — replayed against a real finished game (Phase 5 · Release A).
 *
 * The fixture is ESPN's own summary for event 401872932 (DET @ BUF, 2026-09-18), trimmed to the
 * three stat blocks, the status, the score and the injuries. Every expected number below was read
 * off that response, so this is a replay rather than a mock agreeing with itself.
 *
 * Run: npx tsx --test src/lib/sports/nfl/live-prop-state.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LIVE_FAMILIES, liveFactual, liveRow, phaseOf, settle, statFor, touchdownsScored } from "./live-prop-state.mjs";

const SUMMARY = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nfl/__fixtures__/espn-nfl-summary-401872932.json"), "utf8"));
const GOFF = "3046779";        // Jared Goff, DET — 26/38, 327 yds, 4 pass TD
const STBROWN = "4374302";     // Amon-Ra St. Brown, DET — 9 rec, 142 yds, 2 rec TD
const GIBBS = "4429795";       // Jahmyr Gibbs, DET — 16 car, 52 yds, 0 rush TD
const AT = "2026-09-25T17:00:00Z";

test("every authorized family reads out of the free feed, by ESPN athlete id", () => {
  assert.deepEqual([...LIVE_FAMILIES].sort(), ["anytime_td", "player_pass_yds", "player_reception_yds", "player_receptions", "player_rush_yds"]);
  assert.equal(statFor(SUMMARY, GOFF, "player_pass_yds"), 327);
  assert.equal(statFor(SUMMARY, GIBBS, "player_rush_yds"), 52);
  assert.equal(statFor(SUMMARY, STBROWN, "player_reception_yds"), 142);
  assert.equal(statFor(SUMMARY, STBROWN, "player_receptions"), 9);
});

test("⚠ AN ANYTIME TOUCHDOWN IS SCORED, NEVER THROWN", () => {
  /*
   * The passing block's TD column counts touchdown PASSES. Goff threw four and scored none; reading
   * the wrong column would settle every starting quarterback in the league as a scorer.
   */
  assert.equal(statFor(SUMMARY, GOFF, "player_pass_yds"), 327, "he did throw for 327");
  assert.equal(touchdownsScored(SUMMARY, GOFF), 0, "and he scored none of the four touchdowns he threw");
  assert.equal(touchdownsScored(SUMMARY, STBROWN), 2, "St. Brown caught two");
  /* ⚠ AND THE SUM REALLY DOES SPAN BOTH BLOCKS. I first asserted 0 here on the assumption that a
     running back's touchdowns are rushing touchdowns; the replay said 1. Gibbs rushed for none and
     CAUGHT one, so reading only the rushing block would have settled his anytime-scorer market as a
     loss on a game he scored in. The fixture corrected the test, which is the point of replaying a
     real response instead of a mock that agrees with whatever was written. */
  assert.equal(touchdownsScored(SUMMARY, GIBBS), 1, "Gibbs rushed for none and caught one — 0 rush TD + 1 rec TD");
});

test("a player with no row is ABSENT, never zero", () => {
  assert.equal(statFor(SUMMARY, "999999999", "player_rush_yds"), null,
    "a player who does not appear in the block has no measurement — zero would be a claim nobody made");
  assert.equal(touchdownsScored(SUMMARY, "999999999"), null);
  assert.equal(settle({ summary: SUMMARY, espnId: "999999999", family: "player_rush_yds", frozenLine: 40.5, settledAt: AT }), null,
    "and an absent player never settles");
});

test("settlement grades against the FROZEN line, and only when the provider says FINAL", () => {
  assert.equal(phaseOf(SUMMARY), "FINAL");
  const over = settle({ summary: SUMMARY, espnId: STBROWN, family: "player_reception_yds", frozenLine: 79.5, settledAt: AT });
  assert.equal(over.finalStat, 142);
  assert.equal(over.line, 79.5, "the line that settles is the one captured pre-game");
  assert.equal(over.lineResult, "OVER");

  const under = settle({ summary: SUMMARY, espnId: GIBBS, family: "player_rush_yds", frozenLine: 74.5, settledAt: AT });
  assert.equal(under.lineResult, "UNDER");

  const push = settle({ summary: SUMMARY, espnId: STBROWN, family: "player_receptions", frozenLine: 9, settledAt: AT });
  assert.equal(push.lineResult, "PUSH", "an exact landing is a push, never rounded into a win");

  const noLine = settle({ summary: SUMMARY, espnId: GIBBS, family: "player_rush_yds", frozenLine: null, settledAt: AT });
  assert.equal(noLine.finalStat, 52);
  assert.equal(noLine.lineResult, null, "with no frozen line the stat settles and no benchmark is invented");

  const atd = settle({ summary: SUMMARY, espnId: STBROWN, family: "anytime_td", settledAt: AT });
  assert.equal(atd.yesResult, true);
  assert.equal(settle({ summary: SUMMARY, espnId: GOFF, family: "anytime_td", settledAt: AT }).yesResult, false);
});

test("an unfinished game NEVER settles", () => {
  const inPlay = structuredClone(SUMMARY);
  inPlay.header.competitions[0].status = { type: { state: "in", completed: false }, displayClock: "8:42", period: 3 };
  assert.equal(phaseOf(inPlay), "IN_PROGRESS");
  assert.equal(settle({ summary: inPlay, espnId: STBROWN, family: "player_reception_yds", frozenLine: 79.5, settledAt: AT }), null,
    "a settled result on a game still being played is the worst thing this module could emit");
  const f = liveFactual({ summary: inPlay, espnId: STBROWN, family: "player_reception_yds", observedAt: AT });
  assert.equal(f.statValue, 142, "the stat so far is still reported");
  assert.equal(f.clock, "8:42");
  assert.equal(f.period, 3);
  assert.deepEqual(f.score, { home: 41, away: 31 });
});

test("⚠ A PRE-GAME READ CARRIES NO STAT AND NO SCORE", () => {
  /* Zero is a measurement nobody took. StatsAPI zeroing an MLB score at "Pre-Game" is the same
     defect, and it made unstarted games read as 0-0 contests. */
  const pre = structuredClone(SUMMARY);
  pre.header.competitions[0].status = { type: { state: "pre", completed: false } };
  const f = liveFactual({ summary: pre, espnId: STBROWN, family: "player_reception_yds", observedAt: AT });
  assert.equal(f.phase, "PRE");
  assert.equal(f.statValue, null);
  assert.equal(f.score, null);
  assert.equal(f.clock, null);
});

test("the frozen forecast and the frozen price are passed through UNTOUCHED", () => {
  /*
   * The whole point of the card: a price that moves after publication must never overwrite the
   * price we published. `frozen` comes back by reference, so there is no path that rewrites it.
   */
  const frozen = Object.freeze({
    model: Object.freeze({ median: 79, p10: 41, p90: 118 }),
    market: Object.freeze({ line: 79.5, overOdds: -114, underOdds: -108, sportsbook: "draftkings", capturedAt: "2026-09-17T14:00:00Z" }),
  });
  const row = liveRow({ frozen, summary: SUMMARY, espnId: STBROWN, family: "player_reception_yds", observedAt: AT });
  assert.equal(row.frozen, frozen, "the frozen block is the same object, not a rebuilt one");
  assert.equal(row.frozen.market.line, 79.5);
  assert.equal(row.frozen.market.capturedAt, "2026-09-17T14:00:00Z");
  assert.equal(row.live.settlement.lineResult, "OVER");
  assert.equal(row.live.factual.phase, "FINAL");
});

test("nothing in this module produces an on-track reading or a projected finish", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nfl/live-prop-state.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const banned of ["onTrack", "on_track", "projectedFinish", "liveProbability", "paceOf"]) {
    assert.ok(!src.includes(banned),
      `${banned} implies a conditional live model that has not been validated — a number that looks like a forecast is read as one however it is labelled`);
  }
  const row = liveRow({ frozen: {}, summary: SUMMARY, espnId: STBROWN, family: "player_reception_yds", observedAt: AT });
  assert.deepEqual(Object.keys(row.live).sort(), ["factual", "settlement"], "the live slot holds observations and settlement, nothing else");
});

/* A constructed summary — clearly not a replay. Used only for scoring shapes the DET @ BUF fixture
   does not contain (returns, defence), so the real-response tests above stay replays. */
const constructed = (blocks) => ({
  header: { competitions: [{ status: { type: { state: "post", completed: true } }, competitors: [{ homeAway: "home", score: "20" }, { homeAway: "away", score: "17" }] }] },
  boxscore: { players: [{ team: { abbreviation: "XX" }, statistics: Object.entries(blocks).map(([name, o]) => ({ name, labels: o.labels, athletes: [{ athlete: { id: "999", displayName: "Constructed Player" }, stats: o.stats }] })) }] },
});

test("⚠ A TOUCHDOWN IS NOT POSITION-SPECIFIC — returns and defence score too", () => {
  /* A returner who never touches the rushing or receiving block still scored. Settling him on those
     blocks alone would report a loss on a game he won the market in. */
  const kick = constructed({ kickReturns: { labels: ["NO", "YDS", "AVG", "LONG", "TD"], stats: ["3", "104", "34.7", "99", "1"] } });
  assert.equal(touchdownsScored(kick, "999"), 1, "a kick-return touchdown counts");

  const punt = constructed({ puntReturns: { labels: ["NO", "YDS", "AVG", "LONG", "TD"], stats: ["2", "61", "30.5", "55", "1"] } });
  assert.equal(touchdownsScored(punt, "999"), 1, "a punt-return touchdown counts");

  const both = constructed({
    rushing: { labels: ["CAR", "YDS", "AVG", "TD", "LONG"], stats: ["9", "41", "4.6", "1", "12"] },
    kickReturns: { labels: ["NO", "YDS", "AVG", "LONG", "TD"], stats: ["2", "70", "35.0", "50", "1"] },
  });
  assert.equal(touchdownsScored(both, "999"), 2, "two touchdowns in different blocks are two touchdowns");
});

test("⚠ A PICK-SIX IS ONE TOUCHDOWN, NOT TWO", () => {
  /*
   * ESPN reports a pick-six in BOTH the defensive block and the interceptions block. Summing them
   * displays 2 for a player who scored once — and the count is shown to readers, so the error is
   * visible even though the yes/no market settles the same either way.
   */
  const pickSix = constructed({
    defensive: { labels: ["TOT", "SOLO", "SACKS", "TFL", "PD", "QB HTS", "TD"], stats: ["6", "4", "0", "1", "2", "0", "1"] },
    interceptions: { labels: ["INT", "YDS", "TD"], stats: ["1", "42", "1"] },
  });
  assert.equal(touchdownsScored(pickSix, "999"), 1, "the same touchdown reported twice is still one touchdown");
  assert.equal(settle({ summary: pickSix, espnId: "999", family: "anytime_td", settledAt: AT }).yesResult, true);

  /* And a defender who did NOT score still resolves as a zero rather than an absence. */
  const noScore = constructed({ defensive: { labels: ["TOT", "SOLO", "SACKS", "TFL", "PD", "QB HTS", "TD"], stats: ["8", "5", "1", "2", "1", "3", "0"] } });
  assert.equal(touchdownsScored(noScore, "999"), 0, "present in a scoring block and did not score is zero, not null");
  assert.equal(settle({ summary: noScore, espnId: "999", family: "anytime_td", settledAt: AT }).yesResult, false);
});

test("a player in NO scoring block is absent, even when the game is final", () => {
  const empty = constructed({ passing: { labels: ["C/ATT", "YDS", "AVG", "TD", "INT", "SACKS", "QBR", "RTG"], stats: ["20/30", "240", "8.0", "3", "0", "1-7", "88.0", "110.0"] } });
  assert.equal(touchdownsScored(empty, "999"), null,
    "the passing block is not a scoring block — a quarterback who only threw touchdowns has no ANYTIME-TD measurement from it");
  assert.equal(settle({ summary: empty, espnId: "999", family: "anytime_td", settledAt: AT }), null,
    "and an absent measurement never settles");
});
