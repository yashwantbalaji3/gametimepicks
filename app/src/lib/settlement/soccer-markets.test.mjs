/**
 * Tests for the unified soccer settlement engine. All inputs here are SYNTHETIC unit-test fixtures that
 * exercise the grading RULES — they are not real match results and are never written to settled-history.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  gradeMatchTotalGoals, gradeBothTeamsToScore, gradeAnytimeGoalscorer, gradeLeg, settleCard,
  gradeDoubleChance, gradeDrawNoBet,
} from "./soccer-markets.ts";

test("double chance — '<team> or Draw' wins on that team's win OR a draw", () => {
  assert.equal(gradeDoubleChance("Japan or Draw", "Japan", "Sweden", 1, 1), "won");  // draw
  assert.equal(gradeDoubleChance("Japan or Draw", "Japan", "Sweden", 2, 0), "won");  // home win
  assert.equal(gradeDoubleChance("Japan or Draw", "Japan", "Sweden", 0, 2), "lost"); // away win
  assert.equal(gradeDoubleChance("Sweden or Draw", "Japan", "Sweden", 0, 1), "won"); // away team DC
  assert.equal(gradeDoubleChance("Sweden or Draw", "Japan", "Sweden", 1, 0), "lost");
});

test("double chance — '<team1> or <team2>' (12) wins on either win, loses on a draw", () => {
  assert.equal(gradeDoubleChance("Turkey or USA", "Turkey", "USA", 2, 1), "won");
  assert.equal(gradeDoubleChance("Turkey or USA", "Turkey", "USA", 0, 3), "won");
  assert.equal(gradeDoubleChance("Turkey or USA", "Turkey", "USA", 1, 1), "lost"); // draw not covered
});

test("draw no bet — draw is a push (void); else picked team must win", () => {
  assert.equal(gradeDrawNoBet("Mexico (draw no bet)", "Mexico", "Canada", 1, 1), "void");
  assert.equal(gradeDrawNoBet("Mexico (draw no bet)", "Mexico", "Canada", 2, 0), "won");
  assert.equal(gradeDrawNoBet("Mexico (draw no bet)", "Mexico", "Canada", 0, 1), "lost");
  assert.equal(gradeDrawNoBet("Canada (draw no bet)", "Mexico", "Canada", 0, 1), "won");
});

test("gradeLeg dispatches double_chance against the bundle (June-25 BB anchors → both won)", () => {
  const official = { date: "2026-06-25", source: "test", players: [], matches: [
    { matchId: 57, match: "Japan vs Sweden", homeGoals: 1, awayGoals: 1, status: "FT" },
    { matchId: 60, match: "Paraguay vs Australia", homeGoals: 0, awayGoals: 0, status: "FT" },
  ] };
  const a = gradeLeg({ id: "a", matchId: 57, market: "double_chance", selection: "Japan or Draw", oddsAmerican: -450 }, official);
  const b = gradeLeg({ id: "b", matchId: 60, market: "double_chance", selection: "Paraguay or Draw", oddsAmerican: -480 }, official);
  assert.equal(a.result, "won", "Japan or Draw on a 1-1 draw → won");
  assert.equal(b.result, "won", "Paraguay or Draw on a 0-0 draw → won");
});

test("match total goals over/under and push", () => {
  assert.equal(gradeMatchTotalGoals("over", 2, 1, 2.5), "won");   // 3 > 2.5
  assert.equal(gradeMatchTotalGoals("under", 2, 1, 2.5), "lost");
  assert.equal(gradeMatchTotalGoals("under", 1, 1, 3.5), "won");  // 2 < 3.5
  assert.equal(gradeMatchTotalGoals("over", 1, 1, 2), "void");    // exactly on the line → push
});

test("both teams to score yes/no", () => {
  assert.equal(gradeBothTeamsToScore("no", 1, 0, 1), "won");
  assert.equal(gradeBothTeamsToScore("no", 2, 1, 1), "lost");
  assert.equal(gradeBothTeamsToScore("yes", 2, 1, 1), "won");
  assert.equal(gradeBothTeamsToScore("yes", 1, 0, 1), "lost");
});

test("anytime goalscorer: scored, blanked, did not feature", () => {
  assert.equal(gradeAnytimeGoalscorer({ player: "X", matchId: 1, goals: 1 }), "won");
  assert.equal(gradeAnytimeGoalscorer({ player: "X", matchId: 1, goals: 0 }), "lost");
  assert.equal(gradeAnytimeGoalscorer(null), "void"); // DNP → void, never a loss
});

const OFFICIAL = {
  date: "2026-01-01", source: "synthetic test fixture",
  matches: [
    { matchId: 45, match: "Home A vs Away A", homeGoals: 1, awayGoals: 0, status: "FT" },
    { matchId: 46, match: "Home B vs Away B", homeGoals: 2, awayGoals: 2, status: "FT" },
    { matchId: 47, match: "Home C vs Away C", homeGoals: 0, awayGoals: 0, status: "1H" }, // not FT
  ],
  players: [
    { player: "Striker One", matchId: 45, goals: 1, assists: 0, shotsOnTarget: 3 },
    { player: "Playmaker Two", matchId: 46, goals: 0, assists: 1, shotsOnTarget: 1 },
  ],
};

test("gradeLeg dispatches team markets and refuses non-FT (pending)", () => {
  const ml = gradeLeg({ id: "a", matchId: 45, market: "moneyline_90", selection: "Home A", side: "home", oddsAmerican: -150 }, OFFICIAL);
  assert.equal(ml.result, "won");
  const btts = gradeLeg({ id: "b", matchId: 45, market: "btts", selection: "No", side: "no", oddsAmerican: -160 }, OFFICIAL);
  assert.equal(btts.result, "won"); // 1-0 → no
  const notFt = gradeLeg({ id: "c", matchId: 47, market: "match_total_goals", selection: "Over 2.5", side: "over", point: 2.5, oddsAmerican: -110 }, OFFICIAL);
  assert.equal(notFt.result, "pending"); // 1H → never graded
});

test("gradeLeg dispatches player markets; missing line ⇒ pending (never fabricated)", () => {
  const gs = gradeLeg({ id: "d", matchId: 45, market: "player_goal_scorer_anytime", selection: "Anytime GS", player: "Striker One", oddsAmerican: -120 }, OFFICIAL);
  assert.equal(gs.result, "won");
  const assist = gradeLeg({ id: "e", matchId: 46, market: "player_assists", selection: "Over 0.5 Assists", player: "Playmaker Two", point: 0.5, side: "over", oddsAmerican: 120 }, OFFICIAL);
  assert.equal(assist.result, "won");
  const missing = gradeLeg({ id: "f", matchId: 45, market: "player_assists", selection: "Over 0.5 Assists", player: "Unknown Player", point: 0.5, side: "over", oddsAmerican: 120 }, OFFICIAL);
  assert.equal(missing.result, "pending"); // no official line → pending, not a loss
});

test("settleCard: won parlay computes paper P/L; any pending leg holds the whole card", () => {
  const legs = [
    { id: "1", matchId: 45, market: "moneyline_90", selection: "Home A", side: "home", oddsAmerican: 100 },
    { id: "2", matchId: 45, market: "player_goal_scorer_anytime", selection: "Anytime GS", player: "Striker One", oddsAmerican: 100 },
  ];
  const settled = settleCard(legs, 20, OFFICIAL);
  assert.equal(settled.result, "won");
  assert.equal(settled.combinedDecimal, 4); // 2.0 × 2.0
  assert.equal(settled.payout, 80);
  assert.equal(settled.paperPnl, 60);

  const withPending = settleCard([...legs, { id: "3", matchId: 47, market: "btts", selection: "No", side: "no", oddsAmerican: -110 }], 20, OFFICIAL);
  assert.equal(withPending.result, "pending"); // match 47 is 1H → whole card holds
  assert.equal(withPending.paperPnl, 0);
});

import { findPlayerLine } from "./soccer-markets.ts";
test("findPlayerLine: matches abbreviated API names by surname+initial, scoped to match", () => {
  const o = { date: "x", source: "test", matches: [], players: [
    { player: "I. Perišić", matchId: 47, assists: 1 },
    { player: "J. Córdoba", matchId: 48, shotsOnTarget: 0 },
    { player: "J. Córdoba", matchId: 99, shotsOnTarget: 2 }, // same surname, different match
  ]};
  assert.equal(findPlayerLine(o, "Ivan Perisic", 47)?.assists, 1);     // accent + abbrev
  assert.equal(findPlayerLine(o, "Jhon Cordoba", 48)?.shotsOnTarget, 0); // match-scoped (not the 99 one)
  assert.equal(findPlayerLine(o, "Unknown Name", 47), null);
});

test("data quality: real API name variants resolve to the right player (settlement accuracy)", () => {
  // API-Football abbreviates first names + uses accents; the leg names are full/unaccented. These are the
  // exact collisions the settlement must get right (Perišić, Córdoba, Ronaldo, Kane, Fernandes).
  const o = { date: "x", source: "test", matches: [], players: [
    { player: "Cristiano Ronaldo", matchId: 45, goals: 2 },
    { player: "B. Fernandes", matchId: 45, assists: 1 },
    { player: "H. Kane", matchId: 46, goals: 0 },
    { player: "M. Rashford", matchId: 46, goals: 0, assists: 0 },
    { player: "I. Perišić", matchId: 47, assists: 0 },
    { player: "Jhon Córdoba", matchId: 48, shotsOnTarget: 0 },
    { player: "Jordan Córdoba", matchId: 48, shotsOnTarget: 1 }, // SAME surname + SAME initial, SAME match
  ]};
  assert.equal(findPlayerLine(o, "Cristiano Ronaldo", 45)?.goals, 2);    // exact
  assert.equal(findPlayerLine(o, "Bruno Fernandes", 45)?.assists, 1);    // B. ↔ Bruno
  assert.equal(findPlayerLine(o, "Harry Kane", 46)?.goals, 0);           // H. ↔ Harry
  assert.equal(findPlayerLine(o, "Marcus Rashford", 46)?.assists, 0);    // M. ↔ Marcus
  assert.equal(findPlayerLine(o, "Ivan Perisic", 47)?.assists, 0);       // accent + abbrev
  // Full name exact-matches the accented entry even with another Córdoba present:
  assert.equal(findPlayerLine(o, "Jhon Cordoba", 48)?.shotsOnTarget, 0);
  // Abbreviated name matching BOTH (same surname + initial) → ambiguous → null (never grade wrong one):
  assert.equal(findPlayerLine(o, "J. Cordoba", 48), null);
});
