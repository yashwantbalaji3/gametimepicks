/**
 * The pre-event boundary, at the simulation adapter.
 *
 * The board generator refuses a started event before it buys odds for it. This is the second wall:
 * even if a started game reaches the adapter with a full set of inputs, no probability may be
 * produced for it. The refusal lives in the adapter rather than in the calling script on purpose —
 * a script-level filter leaves the same forecast one careless caller away, whereas forcing
 * `unavailable` here makes `simulateFullGame` take its null-probability path, so the artifact
 * structurally cannot carry a win probability, a score distribution or a player line.
 *
 * Origin: 2026-08-27. The daily chain never fired; by the time the slate could be re-run, one of the
 * day's seven games was already in progress.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { gameInputsFromBoard } from "./board-adapter.ts";
import { simulateFullGame } from "./simulate.ts";

const MARKETS = ["batter_hits", "batter_total_bases", "batter_runs_scored", "pitcher_strikeouts"];

/** A board with ONE game and enough posted lines that it would otherwise simulate cleanly. */
function board({ startedBeforeGeneration }) {
  const leans = [];
  for (let i = 0; i < 9; i += 1) {
    for (const side of ["AWY", "HME"]) {
      leans.push({
        gameId: "evt-1",
        gamePk: 1,
        commenceTime: "2026-08-27T23:05:00Z",
        awayTeam: "Away Club",
        homeTeam: "Home Club",
        playerName: `${side} Batter ${i}`,
        playerId: (side === "AWY" ? 1000 : 2000) + i,
        playerTeamAbbr: side,
        marketKey: "batter_hits",
        line: 0.5,
        projection: 0.9,
        confidence: "Medium",
      });
    }
  }
  return {
    date: "2026-08-27",
    markets: MARKETS,
    games: [
      {
        gamePk: 1,
        date: "2026-08-27",
        venue: "Somewhere Park",
        gameDate: "2026-08-27T23:05:00Z",
        awayTeamAbbr: "AWY",
        homeTeamAbbr: "HME",
        awayTeamName: "Away Club",
        homeTeamName: "Home Club",
        awayProbablePitcherId: 11,
        awayProbablePitcherName: "Away Starter",
        homeProbablePitcherId: 22,
        homeProbablePitcherName: "Home Starter",
        ...(startedBeforeGeneration === undefined ? {} : { startedBeforeGeneration }),
      },
    ],
    leans,
  };
}

const opts = {
  runCount: 200,
  modelVersion: "test",
  simulationVersion: "test",
  generatedAt: "2026-08-27T18:10:00Z",
};

test("a game NOT flagged as started still simulates — the gate is not a blanket refusal", () => {
  const [input] = gameInputsFromBoard(board({ startedBeforeGeneration: false }));
  assert.notEqual(input.completeness.level, "unavailable");
  const sim = simulateFullGame(input, opts);
  assert.notEqual(sim.status, "unavailable");
  assert.ok(sim.winProbability, "the control case produces a win probability");
});

test("a game flagged as started is forced unavailable at the adapter", () => {
  const [input] = gameInputsFromBoard(board({ startedBeforeGeneration: true }));
  assert.equal(input.completeness.level, "unavailable");
  assert.equal(input.completeness.startedBeforeGeneration, true);
  assert.ok(
    input.completeness.missingFamilies.includes("pre_event_window"),
    "the reason is typed, not only prose",
  );
});

test("no probability of any kind survives for a started game", () => {
  const [input] = gameInputsFromBoard(board({ startedBeforeGeneration: true }));
  const sim = simulateFullGame(input, opts);
  assert.equal(sim.status, "unavailable");
  assert.equal(sim.runCount, 0, "zero games were simulated");
  // Each of these is a separate way a forecast could leak out of the artifact.
  assert.equal(sim.winProbability, null);
  assert.equal(sim.runs, null);
  assert.equal(sim.totalRuns, null);
  assert.equal(sim.runDifferential, null);
  assert.equal(sim.teamTotals, null);
  assert.equal(sim.players, null);
  assert.equal(sim.extraInningsProbability, null);
  assert.deepEqual(sim.runLine, []);
  assert.deepEqual(sim.finalScores, []);
});

test("a refused game still produces an entry, so the day's count reconciles", () => {
  // The alternative — dropping it — would report a seven-game day as a six-game day.
  const inputs = gameInputsFromBoard(board({ startedBeforeGeneration: true }));
  assert.equal(inputs.length, 1, "the game is present and refused, not absent");
});

test("an unflagged board (older artifact) is unchanged — the field is additive", () => {
  const [input] = gameInputsFromBoard(board({ startedBeforeGeneration: undefined }));
  assert.notEqual(input.completeness.level, "unavailable");
  assert.equal(input.completeness.startedBeforeGeneration, false);
});
