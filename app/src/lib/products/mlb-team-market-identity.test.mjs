/**
 * DOUBLEHEADER-SAFE TEAM-LEG IDENTITY — the 2026-09-23 TOR @ BAL incident, frozen as fixtures.
 *
 * On 2026-09-23 Moonshot lane A carried "Over 7" on Toronto Blue Jays @ Baltimore Orioles. The 09-22
 * game (gamePk 824785) was postponed and replayed as game 1 of a 09-23 doubleheader; the originally
 * scheduled 09-23 game (gamePk 824784) became game 2. Both went final TOR 2 – BAL 4. The receipt leg
 * carries only `id` (with the odds provider's event id), `matchup` and `selection` — no gamePk — so
 * the team+date join found two games and refused, the lane stayed pending, and the protected fold
 * halted at 09-23.
 *
 * The slate's own artifacts already prove which game the leg was on: the odds schedule lists TWO
 * provider events for the pair (17:36Z and 22:36Z) and the board's StatsAPI schedule lists TWO
 * gamePks (17:35Z and 22:35Z). `resolveGamePks` (the doubleheader-safe owner in the MLB generator)
 * pairs them by a strict time-order bijection. These fixtures are copied from the committed
 * 2026-09-23 artifacts; nothing here touches the network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { findLinescore, gradeTeamLeg, resolveLegGameIdentity, legEventIdOf } from "./mlb-team-market-grading.mjs";
import { LEG } from "./lifecycle.mjs";

const D = "2026-09-23";
const TOR_BAL = "Toronto Blue Jays @ Baltimore Orioles";

/* app/public/data/mr-dub/settled/2026-09-23.json · moonshot lane A · leg 1, verbatim. */
const RECEIPT_LEG = Object.freeze({
  id: "MLB:cc3886440708c8649f6f878183416628:mlb_total_runs:Over_7",
  matchup: TOR_BAL, selection: "Over 7", player: null, market: "Total Runs", line: 7, official: null, result: "pending",
});

/* data/internal/mlb/linescores/2026-09-23.json — the two TOR @ BAL rows plus one unrelated game. */
const LINESCORES = Object.freeze([
  { gamePk: 824785, officialDate: D, homeTeam: "Baltimore Orioles", awayTeam: "Toronto Blue Jays", homeRuns: 4, awayRuns: 2, isFinal: true, status: "Final", abstractState: "Final", source: "statsapi" },
  { gamePk: 824784, officialDate: D, homeTeam: "Baltimore Orioles", awayTeam: "Toronto Blue Jays", homeRuns: 4, awayRuns: 2, isFinal: true, status: "Final", abstractState: "Final", source: "statsapi" },
  { gamePk: 824223, officialDate: D, homeTeam: "Detroit Tigers", awayTeam: "Washington Nationals", homeRuns: 2, awayRuns: 4, isFinal: true, status: "Final", abstractState: "Final", source: "statsapi" },
]);

/* app/public/data/mlb/schedule/2026-09-23.json — the odds provider's events for the slate. */
const ODDS_SCHEDULE = Object.freeze([
  { gameId: "ad00c94ceb671349678549cf07c393d5", home: "Detroit Tigers", away: "Washington Nationals", commenceTime: "2026-09-23T17:11:00Z", matchup: "Washington Nationals @ Detroit Tigers" },
  { gameId: "cc3886440708c8649f6f878183416628", home: "Baltimore Orioles", away: "Toronto Blue Jays", commenceTime: "2026-09-23T17:36:00Z", matchup: TOR_BAL },
  { gameId: "94d0c4d70e74a3ca8f70abe5a0859ea1", home: "Baltimore Orioles", away: "Toronto Blue Jays", commenceTime: "2026-09-23T22:36:00Z", matchup: TOR_BAL },
]);

/* app/public/data/mlb/boards/2026-09-23.json — games[] (StatsAPI schedule) and the relevant leans. */
const BOARD = Object.freeze({
  games: [
    { gamePk: 824223, gameDate: "2026-09-23T17:10:00Z", awayTeamAbbr: "WSH", awayTeamName: "Washington Nationals", homeTeamAbbr: "DET", homeTeamName: "Detroit Tigers" },
    { gamePk: 824785, gameDate: "2026-09-23T17:35:00Z", awayTeamAbbr: "TOR", awayTeamName: "Toronto Blue Jays", homeTeamAbbr: "BAL", homeTeamName: "Baltimore Orioles" },
    { gamePk: 824784, gameDate: "2026-09-23T22:35:00Z", awayTeamAbbr: "TOR", awayTeamName: "Toronto Blue Jays", homeTeamAbbr: "BAL", homeTeamName: "Baltimore Orioles" },
  ],
  leans: [
    { gameId: "ad00c94ceb671349678549cf07c393d5", gamePk: 824223, commenceTime: "2026-09-23T17:11:00Z", awayTeamAbbr: "WSH", homeTeamAbbr: "DET" },
    { gameId: "cc3886440708c8649f6f878183416628", gamePk: 824785, commenceTime: "2026-09-23T17:36:00Z", awayTeamAbbr: "TOR", homeTeamAbbr: "BAL" },
  ],
});
const SLATE = Object.freeze({ schedule: ODDS_SCHEDULE, board: BOARD });

/* ── Reproduction ──────────────────────────────────────────────────────────────────────────── */

test("REPRO · the 09-23 receipt leg carries no gamePk, and team+date alone cannot pick a game", () => {
  assert.equal(RECEIPT_LEG.gamePk, undefined);
  assert.equal(RECEIPT_LEG.eventId, undefined);
  const r = findLinescore(RECEIPT_LEG, LINESCORES, D);
  assert.equal(r.ok, false);
  assert.match(r.reason, /2 games match .* \(doubleheader\)/);
  // …which is why the settler left it PENDING and the fold halted.
  assert.equal(gradeTeamLeg({ marketKey: "mlb_total_runs", selection: RECEIPT_LEG.selection, matchup: RECEIPT_LEG.matchup, line: null }).result, LEG.PENDING);
});

test("the leg's provider event id is read from either artifact shape", () => {
  assert.equal(legEventIdOf(RECEIPT_LEG), "cc3886440708c8649f6f878183416628");
  assert.equal(legEventIdOf({ eventId: "abc", id: "MLB:zzz:mlb_moneyline:X_to_win" }), "abc");
  assert.equal(legEventIdOf({ id: "garbage" }), null);
  assert.equal(legEventIdOf({}), null);
});

/* ── (b) doubleheader, identity provable → settles against exactly that game ─────────────── */

test("(b) DOUBLEHEADER · the slate's schedule proves the leg is game 1 (824785) — and only that game grades it", () => {
  const id = resolveLegGameIdentity(RECEIPT_LEG, SLATE);
  assert.equal(id.gamePk, 824785);
  assert.equal(id.resolved, true);
  assert.equal(id.method, "schedule-time-order");
  assert.equal(id.doubleheader, true);
  const r = findLinescore(RECEIPT_LEG, LINESCORES, D, id);
  assert.equal(r.ok, true);
  assert.equal(r.line.gamePk, 824785);
  const g = gradeTeamLeg({ marketKey: "mlb_total_runs", selection: "Over 7", matchup: TOR_BAL, line: r.line });
  assert.equal(g.result, LEG.LOST);   // 2 + 4 = 6 < 7
  assert.equal(g.actual, 6);

  // The twin event resolves to the OTHER game — a bijection, never both onto one gamePk.
  const twin = resolveLegGameIdentity({ ...RECEIPT_LEG, id: "MLB:94d0c4d70e74a3ca8f70abe5a0859ea1:mlb_total_runs:Over_7" }, SLATE);
  assert.equal(twin.gamePk, 824784);
});

test("(b) the join follows the gamePk, not row order — scores that differ prove which row graded", () => {
  const distinct = [
    { ...LINESCORES[1], homeRuns: 9, awayRuns: 1 },   // game 2 FIRST in the file: 10 runs
    LINESCORES[0],                                     // game 1: 6 runs
  ];
  const id = resolveLegGameIdentity(RECEIPT_LEG, SLATE);
  const r = findLinescore(RECEIPT_LEG, distinct, D, id);
  assert.equal(r.ok, true);
  assert.equal(r.line.gamePk, 824785);
  assert.equal(gradeTeamLeg({ marketKey: "mlb_total_runs", selection: "Over 7", matchup: TOR_BAL, line: r.line }).result, LEG.LOST);
  // A leg with eventId (the daily-portfolio shape) resolves identically.
  const dpLeg = { ...RECEIPT_LEG, eventId: "cc3886440708c8649f6f878183416628", startUtc: "2026-09-23T17:36:00Z" };
  assert.equal(resolveLegGameIdentity(dpLeg, SLATE).gamePk, 824785);
});

/* ── (c) doubleheader, identity NOT provable → stays unresolved ──────────────────────────── */

test("(c) DOUBLEHEADER with a start-time TIE cannot be proven — held, never graded", () => {
  const tied = { ...SLATE, schedule: ODDS_SCHEDULE.map((e) => (e.gameId === "94d0c4d70e74a3ca8f70abe5a0859ea1" ? { ...e, commenceTime: "2026-09-23T17:36:00Z" } : e)) };
  const id = resolveLegGameIdentity(RECEIPT_LEG, tied);
  assert.equal(id.gamePk, null);
  assert.equal(id.resolved, false);
  assert.equal(id.doubleheader, true);
  const r = findLinescore(RECEIPT_LEG, LINESCORES, D, id);
  assert.equal(r.ok, false);
  assert.match(r.reason, /doubleheader/);
});

test("(c) a doubleheader whose twin is MISSING from the final cache is still refused without proof", () => {
  /*
   * The linescore fetcher keeps FINAL games only. If game 2 of a doubleheader is postponed, the cache
   * holds ONE TOR @ BAL row and the team+date join would happily grade a game-2 leg against game 1.
   * When the slate says "doubleheader" and the leg's game cannot be proven, that single row is not
   * evidence — the leg holds.
   */
  const onlyGame1 = [LINESCORES[0], LINESCORES[2]];
  const tied = { ...SLATE, schedule: ODDS_SCHEDULE.map((e) => (e.gameId === "94d0c4d70e74a3ca8f70abe5a0859ea1" ? { ...e, commenceTime: "2026-09-23T17:36:00Z" } : e)) };
  const r = findLinescore(RECEIPT_LEG, onlyGame1, D, resolveLegGameIdentity(RECEIPT_LEG, tied));
  assert.equal(r.ok, false);
  assert.match(r.reason, /doubleheader/);

  // …and a PROVEN game-2 leg must not borrow game 1's row either.
  const game2Leg = { ...RECEIPT_LEG, id: "MLB:94d0c4d70e74a3ca8f70abe5a0859ea1:mlb_total_runs:Over_7" };
  const r2 = findLinescore(game2Leg, onlyGame1, D, resolveLegGameIdentity(game2Leg, SLATE));
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /824784/);
});

test("(c) an event id absent from every slate artifact is not proof — doubleheader still refused", () => {
  const stranger = { ...RECEIPT_LEG, id: "MLB:ffffffffffffffffffffffffffffffff:mlb_total_runs:Over_7" };
  const id = resolveLegGameIdentity(stranger, SLATE);
  assert.equal(id.gamePk, null);
  assert.equal(findLinescore(stranger, LINESCORES, D, id).ok, false);
});

test("(c) a proven gamePk whose cache row names different teams is a contradiction — held", () => {
  const swapped = [{ ...LINESCORES[0], homeTeam: "Toronto Blue Jays", awayTeam: "Baltimore Orioles" }, LINESCORES[1]];
  const r = findLinescore(RECEIPT_LEG, swapped, D, resolveLegGameIdentity(RECEIPT_LEG, SLATE));
  assert.equal(r.ok, false);
  assert.match(r.reason, /contradict/);
});

/* ── (d) postponed original date → rescheduled game ──────────────────────────────────────── */

test("(d) POSTPONED-THEN-RESCHEDULED · 824785 keeps its gamePk across 09-22 → 09-23 and the proof follows it", () => {
  /*
   * StatsAPI (verified 2026-09-30, free feed): gamePk 824785 was scheduled 2026-09-22T22:35Z, went
   * Postponed with rescheduleDate 2026-09-23T17:35Z, and was played as DH game 1 carrying
   * rescheduledFrom 2026-09-22. Its Postponed stub reports officialDate 2026-09-23 too. A cache that
   * holds BOTH rows of the same gamePk still has exactly one RESULT — the final one.
   */
  const withStub = [
    { gamePk: 824785, officialDate: D, homeTeam: "Baltimore Orioles", awayTeam: "Toronto Blue Jays", homeRuns: null, awayRuns: null, isFinal: false, status: "Postponed", abstractState: "Final", source: "statsapi" },
    ...LINESCORES,
  ];
  const r = findLinescore(RECEIPT_LEG, withStub, D, resolveLegGameIdentity(RECEIPT_LEG, SLATE));
  assert.equal(r.ok, true);
  assert.equal(r.line.gamePk, 824785);
  assert.equal(r.line.isFinal, true);

  // Before the makeup is played, the stub alone grades nothing.
  const stubOnly = [withStub[0], LINESCORES[1]];
  const held = findLinescore(RECEIPT_LEG, stubOnly, D, resolveLegGameIdentity(RECEIPT_LEG, SLATE));
  assert.equal(held.ok, true);
  assert.equal(gradeTeamLeg({ marketKey: "mlb_total_runs", selection: "Over 7", matchup: TOR_BAL, line: held.line }).result, LEG.PENDING);

  // Two FINAL rows under one gamePk disagree with each other — refuse rather than choose.
  const dupFinal = [LINESCORES[0], { ...LINESCORES[0], homeRuns: 7 }];
  assert.equal(findLinescore(RECEIPT_LEG, dupFinal, D, resolveLegGameIdentity(RECEIPT_LEG, SLATE)).ok, false);

  // The rescheduled game is NOT pulled back onto the original date's slate: the 09-22 cache has no
  // row for it, and the join stays date-scoped.
  assert.equal(findLinescore(RECEIPT_LEG, LINESCORES, "2026-09-22", { gamePk: 824785, resolved: true, method: "x", doubleheader: false }).ok, false);
});

/* ── (a) single game → unchanged ─────────────────────────────────────────────────────────── */

test("(a) SINGLE GAME · identity-aware join returns the very same row the legacy join returns", () => {
  const leg = { id: "MLB:ad00c94ceb671349678549cf07c393d5:mlb_moneyline:Detroit_Tigers_to_win", matchup: "Washington Nationals @ Detroit Tigers", selection: "Detroit Tigers to win" };
  const legacy = findLinescore(leg, LINESCORES, D);
  const id = resolveLegGameIdentity(leg, SLATE);
  assert.equal(id.gamePk, 824223);
  assert.equal(id.doubleheader, false);
  const withId = findLinescore(leg, LINESCORES, D, id);
  assert.deepEqual(withId, legacy);
  assert.equal(withId.line, legacy.line);   // the same object, not a copy
  assert.equal(JSON.stringify(gradeTeamLeg({ marketKey: "mlb_moneyline", selection: leg.selection, matchup: leg.matchup, line: withId.line })),
    JSON.stringify(gradeTeamLeg({ marketKey: "mlb_moneyline", selection: leg.selection, matchup: leg.matchup, line: legacy.line })));
});

test("(a) no slate artifacts on disk → no identity → the legacy join, byte-for-byte", () => {
  assert.equal(resolveLegGameIdentity(RECEIPT_LEG, {}), undefined);
  assert.equal(resolveLegGameIdentity(RECEIPT_LEG, { schedule: null, board: null }), undefined);
  const leg = { matchup: "Washington Nationals @ Detroit Tigers" };
  assert.deepEqual(findLinescore(leg, LINESCORES, D, undefined), findLinescore(leg, LINESCORES, D));
  assert.deepEqual(findLinescore(RECEIPT_LEG, LINESCORES, D, undefined), findLinescore(RECEIPT_LEG, LINESCORES, D));
});

test("(a) an unresolved identity on a NON-doubleheader pair falls back to the legacy join unchanged", () => {
  const leg = { id: "MLB:ad00c94ceb671349678549cf07c393d5:mlb_moneyline:Detroit_Tigers_to_win", matchup: "Washington Nationals @ Detroit Tigers" };
  const unresolved = { gamePk: null, resolved: false, method: "unresolved-no-schedule", doubleheader: false };
  assert.deepEqual(findLinescore(leg, LINESCORES, D, unresolved), findLinescore(leg, LINESCORES, D));
});
