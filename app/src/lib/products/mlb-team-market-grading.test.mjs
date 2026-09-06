import test from "node:test";
import assert from "node:assert/strict";
import { gradeTeamLeg, findLinescore, teamMarketKeyOf, isTeamMarket, TEAM_MARKETS } from "./mlb-team-market-grading.mjs";
import { LEG } from "./lifecycle.mjs";
import fs from "node:fs";

const line = (o = {}) => ({ gamePk: 1, officialDate: "2026-09-06", homeTeam: "Seattle Mariners", awayTeam: "Athletics", homeRuns: 5, awayRuns: 3, isFinal: true, status: "Final", ...o });
const MU = "Athletics @ Seattle Mariners";

test("the market key is read from the real leg id shape", () => {
  assert.equal(teamMarketKeyOf({ id: "MLB:35ced11ee1bb21f179e3ac5a39a75fd2:mlb_moneyline:Seattle_Mariners_to_win" }), "mlb_moneyline");
  assert.equal(teamMarketKeyOf({ legId: "MLB:abc:mlb_total_runs:Under_9.5" }), "mlb_total_runs");
  assert.equal(teamMarketKeyOf({ id: "MLB:abc:batter_hits:Someone" }), null);
  for (const m of TEAM_MARKETS) assert.equal(isTeamMarket(m), true, m);
  assert.equal(isTeamMarket("batter_hits"), false);
});

test("moneyline grades from the final score, both directions", () => {
  assert.equal(gradeTeamLeg({ marketKey: "mlb_moneyline", selection: "Seattle Mariners to win", matchup: MU, line: line() }).result, LEG.WON);
  assert.equal(gradeTeamLeg({ marketKey: "mlb_moneyline", selection: "Athletics to win", matchup: MU, line: line() }).result, LEG.LOST);
});

test("total runs grades against the posted number, and an exact total pushes", () => {
  const l = line();   // 3 + 5 = 8
  assert.equal(gradeTeamLeg({ marketKey: "mlb_total_runs", selection: "Over 7", matchup: MU, line: l }).result, LEG.WON);
  assert.equal(gradeTeamLeg({ marketKey: "mlb_total_runs", selection: "Under 7", matchup: MU, line: l }).result, LEG.LOST);
  const p = gradeTeamLeg({ marketKey: "mlb_total_runs", selection: "Over 8", matchup: MU, line: l });
  assert.equal(p.result, LEG.PUSH);
  assert.equal(p.actual, 8);
});

test("the run line applies the handicap to the right side", () => {
  const l = line();   // home wins 5-3, margin +2
  assert.equal(gradeTeamLeg({ marketKey: "mlb_run_line", selection: "Seattle Mariners -1.5", matchup: MU, line: l }).result, LEG.WON);
  assert.equal(gradeTeamLeg({ marketKey: "mlb_run_line", selection: "Athletics +1.5", matchup: MU, line: l }).result, LEG.LOST);
  // and a whole-number line can push
  assert.equal(gradeTeamLeg({ marketKey: "mlb_run_line", selection: "Athletics +2", matchup: MU, line: l }).result, LEG.PUSH);
});

test("nothing grades before the game is final", () => {
  const r = gradeTeamLeg({ marketKey: "mlb_moneyline", selection: "Seattle Mariners to win", matchup: MU, line: line({ isFinal: false, status: "In Progress" }) });
  assert.equal(r.result, LEG.PENDING);
  assert.match(r.note, /In Progress/);
  assert.equal(gradeTeamLeg({ marketKey: "mlb_moneyline", selection: "x", matchup: MU, line: null }).result, LEG.PENDING);
});

test("a selection naming neither side is UNAVAILABLE, never a loss", () => {
  const r = gradeTeamLeg({ marketKey: "mlb_moneyline", selection: "Chicago Cubs to win", matchup: MU, line: line() });
  assert.equal(r.result, LEG.UNAVAILABLE);
  assert.notEqual(r.result, LEG.LOST);
});

test("a tie pushes the moneyline rather than losing it", () => {
  assert.equal(gradeTeamLeg({ marketKey: "mlb_moneyline", selection: "Athletics to win", matchup: MU, line: line({ homeRuns: 4, awayRuns: 4 }) }).result, LEG.PUSH);
});

test("THE DOUBLEHEADER IS REFUSED, not guessed", () => {
  /*
   * Two games share date and team names. The leg carries the board's content-derived gameId, not a
   * gamePk, so nothing distinguishes them — and grading a card against the wrong game of a
   * doubleheader is worse than leaving it pending.
   */
  const two = [line({ gamePk: 1 }), line({ gamePk: 2 })];
  const r = findLinescore({ matchup: MU }, two, "2026-09-06");
  assert.equal(r.ok, false);
  assert.match(r.reason, /doubleheader/);
  // one game resolves cleanly
  const one = findLinescore({ matchup: MU }, [line({ gamePk: 7 })], "2026-09-06");
  assert.equal(one.ok, true);
  assert.equal(one.line.gamePk, 7);
});

test("the join is date-scoped — yesterday's game must not settle today's leg", () => {
  const yesterday = [line({ officialDate: "2026-09-05", gamePk: 99 })];
  assert.equal(findLinescore({ matchup: MU }, yesterday, "2026-09-06").ok, false);
  assert.equal(findLinescore({ matchup: MU }, yesterday, "2026-09-05").ok, true);
});

test("a malformed matchup refuses rather than half-matching", () => {
  assert.equal(findLinescore({ matchup: "Athletics vs Seattle Mariners" }, [line()], "2026-09-06").ok, false);
  assert.equal(findLinescore({ matchup: "" }, [line()], "2026-09-06").ok, false);
});

test("LIVE · today's published legs are all recognised team markets", () => {
  // The defect this closes: on 2026-09-06 every leg of four ACTIVE cards graded settleable=false.
  const dp = JSON.parse(fs.readFileSync("public/data/mr-dub/daily-portfolio.json", "utf8"));
  const legs = (dp.lanes ?? []).flatMap((l) => l.legs ?? []);
  if (!legs.length) return;
  for (const leg of legs) {
    const k = teamMarketKeyOf(leg);
    assert.ok(k && isTeamMarket(k), `published leg ${leg.id} has no settleable market key`);
    assert.match(String(leg.matchup ?? ""), /\s@\s/, `leg ${leg.id} has no joinable matchup`);
  }
});

test("LIVE · every published leg joins and grades against a final linescore for its own game", () => {
  /*
   * THE WHOLE CHAIN, on production leg shapes.
   *
   * Unit tests above prove the arithmetic. This proves the thing that was actually broken: that a
   * leg as the generator writes it — content-derived gameId in the id, no player, no gamePk, matchup
   * as "away @ home" — can be joined to the linescore cache and graded. On 2026-09-06 none of them
   * could, and four cards worth $250 of paper exposure were published anyway.
   */
  const dp = JSON.parse(fs.readFileSync("public/data/mr-dub/daily-portfolio.json", "utf8"));
  const legs = (dp.lanes ?? []).flatMap((l) => l.legs ?? []);
  if (!legs.length) return;

  // One synthetic FINAL linescore per distinct matchup on the card. Synthetic scores, real leg shapes.
  const byMatchup = new Map();
  for (const leg of legs) {
    const [away, home] = String(leg.matchup).split(/\s+@\s+/);
    if (away && home) byMatchup.set(leg.matchup, { gamePk: byMatchup.size + 1, officialDate: dp.date, homeTeam: home, awayTeam: away, homeRuns: 6, awayRuns: 3, isFinal: true, status: "Final" });
  }
  const linescores = [...byMatchup.values()];
  assert.ok(linescores.length > 0, "no matchups parsed — the leg shape has changed");

  let decided = 0;
  for (const leg of legs) {
    const key = teamMarketKeyOf(leg);
    const found = findLinescore(leg, linescores, dp.date);
    assert.equal(found.ok, true, `${leg.matchup}: ${found.ok ? "" : found.reason}`);
    const g = gradeTeamLeg({ marketKey: key, selection: leg.selection, matchup: leg.matchup, line: found.line });
    assert.notEqual(g.result, LEG.UNAVAILABLE, `${leg.selection} (${key}) could not be graded: ${g.note}`);
    assert.notEqual(g.result, LEG.PENDING, `${leg.selection} stayed pending against a FINAL linescore: ${g.note}`);
    decided += 1;
  }
  assert.equal(decided, legs.length, "not every published leg reached a decision");
  assert.ok(decided >= 4, `only ${decided} legs asserted — too small a population to prove anything`);
});
