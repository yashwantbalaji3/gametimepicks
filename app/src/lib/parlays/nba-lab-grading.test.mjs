/**
 * Parlay Lab NBA leg grading: real committed finals + box scores, routed onto the existing NBA graders.
 * Run: npx tsx --test src/lib/parlays/nba-lab-grading.test.mjs
 *
 * Every LINE in this file is a TEST LINE placed around a real observed stat to exercise the rule. None is a
 * sportsbook line, none was offered, and nothing here counts toward any public record.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { gradeNbaLabLeg, nbaLabLegShape, nbaProviderEventId } from "./nba-lab-grading.mjs";
import { legGradingRoute, GRADER_SPORTS, GRADED_NOT_ADMITTED } from "./leg-grading-route.mjs";
import { SETTLEABLE_SPORTS } from "./multi-sport.mjs";
import { cardResult } from "./settlement.mjs";
import { classifyReceiptChange, RECEIPT_CHANGE } from "./receipt-completion.mjs";
import { committedNbaPropResults, nbaPropResult, readNbaFinalsRecords } from "../sports/nba/prop-settlement-source.mjs";

const REPO = path.resolve(process.cwd(), "..");
const resultsFor = (() => {
  const read = committedNbaPropResults({ repoRoot: REPO });
  return (eventId, athleteId) => read({ eventId, providerAthleteId: athleteId });
})();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(REPO, f), "utf8"));

// 2026-10-20 opening night, all three real finals (app/public/data/nba/results/finals-2026-27.json).
const BOS_DET = "401909088"; // BOS 113 @ DET 121
const PHI_NYK = "401909089"; // PHI 106 @ NYK 100
const OKC_SAS = "401909090"; // OKC 116 @ SAS 104
const D4_HOLD = "401901822"; // finals-record conflict (117-98 recorded vs 116-98 observed): HOLD, never resolved here
const box = (id) => readJson(`data/internal/research/nba/experimental/boxscores/${id}.json`);
const prop = (eventId, athleteId, family, side, line) => ({ sport: "nba", eventId, playerId: athleteId, family, market: null, side, line });

test("routing: nba now has a grader, but is still NOT admitted to any ladder", () => {
  assert.equal(legGradingRoute({ sport: "nba" }).route, "nba");
  assert.equal(legGradingRoute({ sport: "NBA" }).route, "nba");
  assert.ok(!SETTLEABLE_SPORTS.includes("nba"), "ladder admission (SETTLEABLE_SPORTS) is unchanged");
  assert.deepEqual(GRADED_NOT_ADMITTED, ["nba"]);
  for (const s of SETTLEABLE_SPORTS) assert.ok(GRADER_SPORTS.includes(s));
  for (const s of ["wnba", "ligue_1", "ncaaf"]) assert.equal(legGradingRoute({ sport: s }).route, null, s);
});

test("event ids: bare ESPN id or a canonical id ending in it; anything else holds", () => {
  assert.equal(nbaProviderEventId("401909088"), "401909088");
  assert.equal(nbaProviderEventId("nba:nba:2026-10-20:401909088"), "401909088");
  assert.equal(nbaProviderEventId("nba-401909088"), "401909088");
  for (const bad of [null, "", "nfl-401909088", "401909088x", "abc", "12"]) assert.equal(nbaProviderEventId(bad), null, String(bad));
  assert.equal(gradeNbaLabLeg({ sport: "nba", eventId: "abc", market: "moneyline", side: "home" }, resultsFor).result, "pending");
});

test("leg shapes: provider prop keys and our family keys reach the prop grader; team keys reach the team contract", () => {
  assert.equal(nbaLabLegShape({ market: "player_points_rebounds_assists", side: "Over", line: 30.5, playerId: "1" }).family, "pra");
  assert.equal(nbaLabLegShape({ family: "threePm", side: "under", line: 2.5, playerId: "1" }).side, "UNDER");
  assert.equal(nbaLabLegShape({ market: "h2h", side: "Home" }).market, "moneyline");
  assert.equal(nbaLabLegShape({ market: "spreads", side: "away", line: 4.5 }).market, "point_spread");
  assert.equal(nbaLabLegShape({ market: "player_minutes", side: "over", line: 30 }), null, "minutes is not a market");
});

test("real finals: team markets grade on the recorded final score", () => {
  const ml = (eventId, side) => gradeNbaLabLeg({ sport: "nba", eventId, market: "moneyline", side }, resultsFor);
  assert.equal(ml(BOS_DET, "home").result, "win");   // DET 121-113
  assert.equal(ml(BOS_DET, "away").result, "loss");
  assert.equal(ml(PHI_NYK, "away").result, "win");   // PHI 106-100 at NYK
  assert.equal(ml(OKC_SAS, "away").result, "win");   // OKC 116-104 at SAS
  const total = (side, line) => gradeNbaLabLeg({ sport: "nba", eventId: BOS_DET, market: "totals", side, line }, resultsFor).result;
  assert.equal(total("over", 233.5), "win");          // 234
  assert.equal(total("under", 233.5), "loss");
  assert.equal(total("over", 234), "push", "an integer TEST line landing exactly on the total pushes");
  const spread = (side, line) => gradeNbaLabLeg({ sport: "nba", eventId: BOS_DET, market: "spreads", side, line }, resultsFor).result;
  assert.equal(spread("home", -7.5), "win");          // DET by 8
  assert.equal(spread("home", -8), "push");
  assert.equal(spread("away", 7.5), "loss");
});

test("real box score: over / under / exact-line push / combination sums, read from the stored FINAL box score", () => {
  const doc = box(BOS_DET);
  const p = doc.players.find((x) => !x.didNotPlay && Number.isInteger(x.minutes) && x.minutes > 0 && Number.isInteger(x.pts));
  const g = (family, side, line) => gradeNbaLabLeg(prop(BOS_DET, p.providerAthleteId, family, side, line), resultsFor);
  assert.equal(g("pts", "OVER", p.pts - 0.5).result, "win");
  assert.equal(g("pts", "UNDER", p.pts - 0.5).result, "loss");
  assert.equal(g("pts", "OVER", p.pts + 0.5).result, "loss");
  assert.equal(g("pts", "UNDER", p.pts + 0.5).result, "win");
  assert.equal(g("pts", "OVER", p.pts).result, "push");
  const pra = p.pts + p.reb + p.ast;
  const comb = g("pra", "OVER", pra - 0.5);
  assert.equal(comb.result, "win");
  assert.equal(comb.finalStat, pra, "PRA is the sum of the three box-score stats");
  assert.equal(g("ptsReb", "UNDER", p.pts + p.reb + 0.5).finalStat, p.pts + p.reb);
  assert.equal(g("ptsAst", "OVER", p.pts + p.ast - 0.5).finalStat, p.pts + p.ast);
  assert.equal(g("threePm", "OVER", p.threePm - 0.5).finalStat, p.threePm);
  // The same leg keyed by the provider market name grades identically.
  assert.deepEqual(gradeNbaLabLeg({ ...prop(BOS_DET, p.providerAthleteId, null, "Over", pra - 0.5), market: "player_points_rebounds_assists" }, resultsFor), comb);
});

test("a real DNP and a player absent from the box score VOID (never LOSS), with the book rule marked unknown", () => {
  const doc = box(BOS_DET);
  const dnp = doc.players.find((x) => x.didNotPlay);
  assert.ok(dnp, "the real 10-20 box score has a DNP row");
  for (const side of ["OVER", "UNDER"]) {
    const g = gradeNbaLabLeg(prop(BOS_DET, dnp.providerAthleteId, "pts", side, 0.5), resultsFor);
    assert.equal(g.result, "void", side);
    assert.equal(g.outcome, "NO_MEASUREMENT");
    assert.equal(g.bookRuleUnknown, true);
  }
  const absent = gradeNbaLabLeg(prop(BOS_DET, "999999999", "reb", "UNDER", 4.5), resultsFor);
  assert.equal(absent.result, "void");
  assert.equal(absent.code, "NOT_IN_BOXSCORE");
});

test("holds: the D4 conflict, an unplayed game, a missing box score and an unknown market all PEND — never guessed", () => {
  const d4 = gradeNbaLabLeg({ sport: "nba", eventId: D4_HOLD, market: "moneyline", side: "home" }, resultsFor);
  assert.equal(d4.result, "pending", "the recorded/observed conflict on 401901822 is not resolved by any grader");
  assert.equal(d4.outcome, "VOID_PENDING_REVIEW");
  assert.ok(readNbaFinalsRecords({ repoRoot: REPO }).conflicts.some((c) => c.providerEventId === D4_HOLD), "D4 is still a recorded conflict");
  assert.equal(gradeNbaLabLeg(prop(D4_HOLD, "1", "pts", "OVER", 10.5), resultsFor).result, "pending");

  assert.equal(gradeNbaLabLeg({ sport: "nba", eventId: "401999999", market: "moneyline", side: "home" }, resultsFor).result, "pending", "not in the finals record");

  const fin = readNbaFinalsRecords({ repoRoot: REPO });
  const noBox = (eventId, athleteId) => nbaPropResult({ finalsRecord: fin, boxscore: null, providerEventId: eventId, providerAthleteId: athleteId });
  const g = gradeNbaLabLeg(prop(BOS_DET, box(BOS_DET).players[0].providerAthleteId, "pts", "OVER", 0.5), noBox);
  assert.equal(g.result, "pending");
  assert.equal(g.code, "NO_FINAL_BOXSCORE", "a missing feed is never a missing player");
  assert.equal(gradeNbaLabLeg({ sport: "nba", eventId: BOS_DET, market: "player_blocks", side: "over", line: 0.5, playerId: "1" }, resultsFor).result, "pending");
  assert.equal(gradeNbaLabLeg({ sport: "nba", eventId: BOS_DET, market: "moneyline", side: "home" }, () => { throw new Error("boom"); }).result, "pending", "a throwing source holds");
});

test("one stat reader: every graded Top Board row on 10-20 gives the lab grader the same actual stat", () => {
  const CATEGORY = { points: "pts", rebounds: "reb", assists: "ast", threes: "threePm" };
  const latest = new Map();
  for (const e of readJson("data/internal/research/nba/top-boards/v0.1/ledger.json").entries) latest.set(e.rowId, e);
  let compared = 0, voided = 0;
  for (const e of latest.values()) {
    if (e.date !== "2026-10-20") continue;
    const family = CATEGORY[e.category];
    if (e.projectionStatus === "GRADED") {
      const actual = e.accuracy.actual;
      // A zero actual takes UNDER 0.5 (a line below 0 is invalid, and the grader refuses it).
      const g = actual > 0
        ? gradeNbaLabLeg(prop(e.eventId, e.providerAthleteId, family, "OVER", actual - 0.5), resultsFor)
        : gradeNbaLabLeg(prop(e.eventId, e.providerAthleteId, family, "UNDER", 0.5), resultsFor);
      assert.equal(g.finalStat, actual, `${e.rowId}: Top Board actual ${actual}, lab grader ${g.finalStat}`);
      assert.equal(g.result, "win", e.rowId);
      compared += 1;
    } else if (e.settlement.status === "VOID") {
      const g = gradeNbaLabLeg(prop(e.eventId, e.providerAthleteId, family, "OVER", 0.5), resultsFor);
      assert.equal(g.result, "void", `${e.rowId}: a Top Board VOID (did not play) is a lab void, never a loss`);
      voided += 1;
    }
  }
  assert.ok(compared >= 30, `compared ${compared} graded Top Board rows`);
  console.log(`# 10-20 Top Board rows: ${compared} graded rows agree on the actual stat · ${voided} DNP rows void in both`);
});

test("card settlement: an NBA void reduces the card, a hold keeps it pending, a loss loses it", () => {
  assert.equal(cardResult(["win", "void"]), cardResult(["win"]));
  assert.equal(cardResult(["win", "pending"]), "pending");
  assert.equal(cardResult(["loss", "pending"]), "loss");
});

test("append-only: a later stat correction cannot silently replace a decided NBA grade", () => {
  const doc = box(BOS_DET);
  const p = doc.players.find((x) => !x.didNotPlay && Number.isInteger(x.pts) && x.minutes > 0);
  const fin = readNbaFinalsRecords({ repoRoot: REPO });
  const from = (d) => (eventId, athleteId) => nbaPropResult({ finalsRecord: fin, boxscore: d, providerEventId: eventId, providerAthleteId: athleteId });
  const leg = prop(BOS_DET, p.providerAthleteId, "pts", "OVER", p.pts - 0.5);
  const before = gradeNbaLabLeg(leg, from(doc)).result;
  // A synthetic correction (TEST ONLY): the same box score with this player's points lowered by 1.
  const corrected = { ...doc, players: doc.players.map((x) => (x === p ? { ...x, pts: x.pts - 1 } : x)) };
  const after = gradeNbaLabLeg(leg, from(corrected)).result;
  assert.equal(before, "win");
  assert.equal(after, "loss", "the grader itself follows the corrected stat");
  const priorCards = [{ slipId: "test-nba", legs: [before, "win"], result: cardResult([before, "win"]) }];
  const nextCards = [{ slipId: "test-nba", legs: [after, "win"], result: cardResult([after, "win"]) }];
  const change = classifyReceiptChange(priorCards, nextCards);
  assert.equal(change.state, RECEIPT_CHANGE.REWRITE, "decided → different decided is a rewrite, which the receipt writer refuses loudly");
  assert.ok(change.reasons.length > 0);
});

test("the settler routes NBA legs to this grader and names the NBA source only on a day that graded one", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "scripts/parlays/settle-lab-cards.mjs"), "utf8");
  assert.match(src, /import \{ gradeNbaLabLeg \} from "..\/..\/src\/lib\/parlays\/nba-lab-grading.mjs"/);
  assert.match(src, /if \(route === "nba"\) \{\s*const g = gradeNbaLabLeg\(leg, nbaResultsFor\)/);
  assert.match(src, /nbaLegsGraded \? "; NBA write-once finals record/, "no receipt without an NBA leg changes a byte");
  assert.doesNotMatch(src.slice(src.indexOf('if (route === "nba")'), src.indexOf("const box = await boxFor(leg.gamePk)")), /boxFor|actualFor/, "an NBA leg never reaches the MLB box-score reader");
});
