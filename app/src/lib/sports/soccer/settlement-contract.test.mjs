/**
 * Soccer settlement core guards (Session 6 · Soccer core).
 *
 * 1. EPL is unchanged: the wrapper reproduces the pre-extraction outputs byte-for-byte over a 1,680-row
 *    golden grid (every market × side × line × result shape, including the malformed ones).
 * 2. A second competition plugs in with no code: Ligue 1 grades from the registry alone.
 * 3. The format is read, not assumed: a competition with extra time grades only a declared 90-minute score.
 * 4. Grading is not publication: no stage, route or page changes, and a HOLD competition's gradeable leg
 *    does not make it publishable.
 *
 * Run: npx tsx --test src/lib/sports/soccer/settlement-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gradeSoccerLeg, settleSoccerSlate, competitionFormat } from "./settlement-contract.mjs";
import { gradeEplLeg, settleEplSlate } from "../epl/settlement-contract.mjs";
import { SOCCER_LEAGUES, soccerLeaguePages } from "./leagues.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(fs.readFileSync(path.join(HERE, "__fixtures__", "epl-settlement-golden.json"), "utf8"));
const RESULTS = [
  { fixtureId: "f", status: "FULL_TIME", homeGoalsFT: 2, awayGoalsFT: 1 },
  { fixtureId: "f", status: "FULL_TIME", homeGoalsFT: 1, awayGoalsFT: 1 },
  { fixtureId: "f", status: "FULL_TIME", homeGoalsFT: 0, awayGoalsFT: 0 },
  { fixtureId: "f", status: "FULL_TIME", homeGoalsFT: 0, awayGoalsFT: 3 },
  { fixtureId: "f", status: "FULL_TIME", homeGoalsFT: null, awayGoalsFT: 1 },
  { fixtureId: "f", status: "FULL_TIME", homeGoalsFT: -1, awayGoalsFT: 1 },
  { fixtureId: "f", status: "FULL_TIME", homeGoalsFT: 1.5, awayGoalsFT: 1 },
  { fixtureId: "f", status: "POSTPONED", homeGoalsFT: null, awayGoalsFT: null },
  { fixtureId: "f", status: "IN_PLAY", homeGoalsFT: 1, awayGoalsFT: 0 },
  null,
];
const FT = (h, a, extra = {}) => ({ fixtureId: "f", status: "FULL_TIME", homeGoalsFT: h, awayGoalsFT: a, ...extra });

test("EPL golden grid: every one of 1,680 pre-extraction outputs is reproduced byte-for-byte", () => {
  assert.equal(GOLDEN.grid.length, 1680);
  for (const g of GOLDEN.grid) {
    const leg = { market: g.market ?? undefined, side: g.side ?? undefined, line: g.line === "__undef__" ? undefined : g.line };
    assert.deepEqual(gradeEplLeg(leg, RESULTS[g.ri]), g.out, `drift at ${JSON.stringify(leg)} × result ${g.ri}`);
  }
  const slate = settleEplSlate(
    [{ fixtureId: "a", market: "match_result", side: "home" }, { fixtureId: "b", market: "total_goals", side: "over", line: 2.5 }, { fixtureId: "c", market: "match_result", side: "draw" }],
    { a: RESULTS[0], b: RESULTS[1], c: RESULTS[7] },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(slate)), GOLDEN.slate);
});

test("a second competition plugs in from the registry alone: Ligue 1 grades exactly as the shared rules say", () => {
  const ctx = { competition: "ligue-1" };
  assert.equal(gradeSoccerLeg({ market: "match_result", side: "home" }, FT(2, 1), ctx).outcome, "WIN");
  assert.equal(gradeSoccerLeg({ market: "match_result", side: "draw" }, FT(0, 0), ctx).outcome, "WIN");
  assert.equal(gradeSoccerLeg({ market: "total_goals", side: "under", line: 2.5 }, FT(2, 1), ctx).outcome, "LOSS");
  assert.equal(gradeSoccerLeg({ market: "total_goals", side: "over", line: 3 }, FT(2, 1), ctx).outcome, "PUSH");
  assert.equal(gradeSoccerLeg({ market: "match_result", side: "home" }, { ...FT(2, 1), status: "POSTPONED" }, ctx).outcome, "VOID_PENDING_REVIEW");
  const { summary } = settleSoccerSlate(
    [{ fixtureId: "x", market: "match_result", side: "away" }, { fixtureId: "y", market: "total_goals", side: "over", line: 2.5 }],
    { x: FT(0, 1), y: FT(1, 1) }, ctx,
  );
  assert.deepEqual(summary, { contractVersion: 1, total: 2, wins: 1, losses: 1, pushes: 0, voids: 0, decisive: 2, reconciles: true });
});

test("the format is READ: an extra-time competition grades only a declared 90-minute score", () => {
  assert.equal(competitionFormat("ucl").format.extraTime, true, "fixture premise: the registry says UCL has extra time");
  const ctx = { competition: "ucl" };
  const aet = gradeSoccerLeg({ market: "match_result", side: "home" }, FT(2, 1), ctx);
  assert.equal(aet.outcome, "VOID_PENDING_REVIEW", "an undeclared cup score may include extra time and must not grade");
  assert.match(aet.reason, /extra time/);
  assert.equal(gradeSoccerLeg({ market: "match_result", side: "draw" }, FT(1, 1, { regulationOnly: true }), ctx).outcome, "WIN");
  // The same undeclared score in a league with no extra time grades normally.
  assert.equal(gradeSoccerLeg({ market: "match_result", side: "home" }, FT(2, 1), { competition: "ligue-1" }).outcome, "WIN");
});

test("an unknown or missing competition grades nothing", () => {
  for (const competition of ["serie-z", undefined, ""]) {
    const out = gradeSoccerLeg({ market: "match_result", side: "home" }, FT(2, 1), { competition });
    assert.equal(out.outcome, "VOID_PENDING_REVIEW");
    assert.match(out.reason, /unknown competition/);
  }
});

test("grading is not publication: no stage, route or league page moved", () => {
  const snapshot = SOCCER_LEAGUES.map((l) => [l.key, l.stage, l.route]);
  assert.deepEqual(snapshot, [
    ["epl", "LIVE", "/epl"], ["laliga", "REJECTED_V1", null], ["serie-a", "REJECTED_V1", null], ["bundesliga", "REJECTED_V1", null],
    ["ligue-1", "ACCEPTED_V1", "/soccer/ligue-1"], ["championship", "PLANNED", null], ["mls", "PLANNED", null], ["eredivisie", "PLANNED", null],
    ["primeira", "PLANNED", null], ["ucl", "HOLD", null], ["uel", "HOLD", null], ["world-cup", "ARCHIVE", "/world-cup"],
  ], "a settlement change must not move any competition's publication state — change leagues.mjs deliberately, not here");
  assert.deepEqual(soccerLeaguePages().map((l) => l.key), ["ligue-1"]);
  // A HOLD competition can grade a declared 90-minute score and is STILL not a page.
  assert.equal(gradeSoccerLeg({ market: "match_result", side: "home" }, FT(1, 0, { regulationOnly: true }), { competition: "uel" }).outcome, "WIN");
  assert.ok(!soccerLeaguePages().some((l) => l.key === "uel"));
  const src = fs.readFileSync(path.join(HERE, "settlement-contract.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(src, /\.stage\b|\.route\b|oddsReceipt/, "the grader must not consult publication state");
});
