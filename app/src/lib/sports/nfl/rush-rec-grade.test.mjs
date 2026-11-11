/**
 * NFL rushing / receiving v0 · grader + statuses (rush-rec-grade.mjs). SYNTHETIC ROWS ONLY: no committed final is read
 * and no real outcome is graded (blind until the founder approves the rush / receiving pre-registration).
 * Run (from app/): npx tsx --test src/lib/sports/nfl/rush-rec-grade.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FOUNDER_TO_SET, RUSH_REC_APPROVED_PREREG_SHA256, RUSH_REC_CHALLENGERS, RUSH_REC_BARS, RUSH_REC_FAMILIES, RUSH_REC_MARKET_STATUS, RUSH_REC_PREREG_APPROVED_AT, RUSH_REC_SEEN_WEEKS,
  gradeRushRec, positionalBaseline, rushRecFamilyMetrics, rushRecForwardCounts, rushRecGradeRefusal, unsetBars,
} from "./rush-rec-grade.mjs";
import { MARKET_STATUS, mayFeedOfficialPicks } from "./qb-props-markets.mjs";

const q = (v) => ({ mean: v, p10: v, p25: v, p50: v, p75: v, p90: v });
const rb = (id, team, extra = {}) => ({ playerId: `nfl-athlete-${id}`, name: `RB${id}`, position: "RB", team, stats: { rushAtt: q(15), rushYds: q(60), rushTd: q(0), targets: q(3), rec: q(2), recYds: q(15), recTd: q(0) }, ...extra });
const wr = (id, team, extra = {}) => ({ playerId: `nfl-athlete-${id}`, name: `WR${id}`, position: "WR", team, stats: { targets: q(7), rec: q(5), recYds: q(60), recTd: q(0) }, ...extra });
const exactRb = { rushAtt: { 12: 5, 18: 5 }, rushYds: { "-2": 1, 40: 4, 80: 5 }, rushTd: { 0: 6, 1: 4 }, rec: { 1: 5, 3: 5 }, recYds: { 8: 5, 22: 5 }, recTd: { 0: 9, 1: 1 } };
const exactWr = { rec: { 3: 4, 6: 6 }, recYds: { 35: 4, 75: 6 }, recTd: { 0: 7, 1: 3 } };
const receipt = (eventId, start, players) => ({ eventId, generatedAt: `${start.slice(0, 10)}T12:00:00Z`, eventStart: start, playerStatDistributions: [...players, { playerId: "OTHER", team: "AAA", stats: { rushAtt: q(2) } }] });
const box = (id, team, s) => ({ playerId: `nfl-athlete-${id}`, teamAbbr: team, ...s });
const qb = (team) => box(team === "AAA" ? 90 : 91, team, { passAtt: 30, passCmp: 20, passYds: 200, passTd: 1, passInt: 0 });
const game = (id, week, date, players) => ({ providerEventId: id, season: 2026, seasonType: 2, week, dateUtc: date, players: [qb("AAA"), qb("BBB"), ...players] });

const entries = [
  { file: "s/11.json", receipt: receipt("11", "2026-11-16T18:00Z", [rb(1, "AAA", { exactCounts: exactRb }), wr(2, "BBB", { exactCounts: exactWr }), rb(3, "BBB")]) },
  { file: "s/12.json", receipt: receipt("12", "2026-10-19T17:00Z", [rb(1, "AAA", { exactCounts: exactRb })]) },
];
const games = [
  game("h1", 3, "2026-09-21T17:00Z", [box(1, "AAA", { rushAtt: 10, rushYds: 50, rushTd: 1, targets: 2, rec: 2, recYds: 10, recTd: 0 }), box(4, "AAA", { rushAtt: 5, rushYds: 10, rushTd: 0 }), box(2, "BBB", { targets: 8, rec: 6, recYds: 70, recTd: 1 })]),
  game("h2", 4, "2026-09-28T17:00Z", [box(1, "AAA", { rushAtt: 20, rushYds: 90, rushTd: 0 }), box(2, "BBB", { targets: 6, rec: 4, recYds: 40, recTd: 0 })]),
  game("12", 7, "2026-10-19T17:00Z", [box(1, "AAA", { rushAtt: 14, rushYds: 70, rushTd: 1 })]),
  // game 11: RB1 runs, WR2 catches, RB3 is in the box with no rushing line (0), nobody else
  game("11", 11, "2026-11-16T18:00Z", [box(1, "AAA", { rushAtt: 16, rushYds: 81, rushTd: 1, targets: 2, rec: 2, recYds: 9, recTd: 0 }), box(2, "BBB", { targets: 9, rec: 7, recYds: 88, recTd: 1 }), box(3, "BBB", {})]),
  // a SAME-WEEK and a LATER game: never inputs to week 11's positional baseline
  game("x1", 11, "2026-11-13T01:15Z", [box(1, "AAA", { rushAtt: 40, rushYds: 400, rushTd: 4 })]),
  game("x2", 12, "2026-11-23T18:00Z", [box(1, "AAA", { rushAtt: 40, rushYds: 400, rushTd: 4 })]),
];
const verified = new Map([["11", { teamPassYds: { AAA: 200, BBB: 200 } }], ["12", { teamPassYds: { AAA: 200 } }]]);
const positions = new Map([["nfl-athlete-1", "RB"], ["nfl-athlete-4", "RB"], ["nfl-athlete-2", "WR"], ["nfl-athlete-3", "RB"]]);
const SHA = "synthetic-rush-rec";
const filledBars = { ...RUSH_REC_BARS, eceLines: { rushAtt: [14.5], rushYds: [59.5], rushTd: [0.5], rec: [4.5], recYds: [49.5], recTd: [0.5] }, maeComparisonRule: "synthetic", eceAndMaeBothRequired: true };
const approved = { preregSha256: SHA, approvals: [SHA], approvalTimes: { [SHA]: "2026-11-11T00:00:00Z" }, approvedAt: "2026-11-11T00:00:00Z", bars: filledBars };

test("statuses: all six families IMPLEMENTED_EXPERIMENTAL, frozen, none may feed official picks", () => {
  assert.deepEqual(Object.keys(RUSH_REC_MARKET_STATUS), ["rushAtt", "rushYds", "rushTd", "rec", "recYds", "recTd"]);
  for (const s of Object.values(RUSH_REC_MARKET_STATUS)) { assert.equal(s, MARKET_STATUS.IMPLEMENTED_EXPERIMENTAL); assert.equal(mayFeedOfficialPicks(s), false); }
  assert.ok(Object.isFrozen(RUSH_REC_MARKET_STATUS));
  assert.deepEqual([...RUSH_REC_SEEN_WEEKS], [5, 6, 7, 8, 9, 10], "weeks 5–10 are exploratory");
  assert.deepEqual(RUSH_REC_CHALLENGERS.map((c) => [c.challengerId, c.version, c.receiptDir]), [["nfl-sim-v2-mkt02-yardage-split", "1.0.0", "data/internal/research/nfl/sim-v2/challengers/mkt02-yardage-split"]]);
});

test("bars copied from the market review; the rest is founder-to-set; nothing is approved", () => {
  assert.equal(RUSH_REC_BARS.minN, 400);
  assert.equal(RUSH_REC_BARS.eceMax, 0.03);
  assert.match(RUSH_REC_BARS.maeVsPositional, /positional/);
  assert.deepEqual(unsetBars(), ["eceLines", "maeComparisonRule", "eceAndMaeBothRequired"]);
  assert.equal(FOUNDER_TO_SET, null);
  assert.deepEqual([...RUSH_REC_APPROVED_PREREG_SHA256], []);
  assert.deepEqual({ ...RUSH_REC_PREREG_APPROVED_AT }, {});
});

test("blind: refused before any outcome is read — unapproved, untimestamped, or with founder-to-set gaps", () => {
  const trap = new Proxy([], { get() { throw new Error("an outcome was read"); } });
  const trapMap = new Proxy(new Map(), { get() { throw new Error("an outcome was read"); } });
  const run = (o) => gradeRushRec({ entries, games: trap, verified: trapMap, positions, ...o });
  assert.throws(() => run({}), /^Error: REFUSED: no approved rush \/ receiving pre-registration/);
  assert.throws(() => run({ preregSha256: SHA, approvals: [SHA] }), /REFUSED: the approved pre-registration has no approval timestamp/);
  assert.throws(() => run({ preregSha256: SHA, approvals: [SHA], approvalTimes: { [SHA]: "2026-11-11T00:00:00Z" } }), /REFUSED: pre-registration values still founder-to-set: eceLines, maeComparisonRule, eceAndMaeBothRequired/);
  assert.equal(rushRecGradeRefusal(SHA, { approvals: [SHA], approvedAt: { [SHA]: "t" }, bars: filledBars }), null);
});

test("forward counts (allowed before approval): rows per family from receipts alone, with model distribution", () => {
  const c = rushRecForwardCounts({ entries });
  assert.equal(c.receiptsOfRecord, 2);
  assert.deepEqual(c.total, { rushAtt: 3, rushYds: 3, rushTd: 3, rec: 4, recYds: 4, recTd: 4 }, "OTHER excluded; WR has no rush rows");
  assert.deepEqual(c.withModelDistribution, { rushAtt: 2, rushYds: 2, rushTd: 2, rec: 3, recYds: 3, recTd: 3 }, "RB3 has no exact counts");
  assert.doesNotMatch(JSON.stringify(c), /actual|absError|Mae/);
});

test("positional baseline: same season, strictly earlier weeks, players at the position with an opportunity", () => {
  const f = RUSH_REC_FAMILIES.find((x) => x.family === "rushYds");
  const b = positionalBaseline(games, positions, { season: 2026, key: 20260111, position: "RB", f });
  assert.deepEqual(b, { kind: "positional", mean: (50 + 10 + 90 + 70) / 4, n: 4 }, "weeks 3, 4 and 7 only; the week-11 and week-12 games never enter");
  const changed = games.map((g) => (g.week >= 11 ? { ...g, players: g.players.map((p) => ({ ...p, rushYds: 9999 })) } : g));
  assert.deepEqual(positionalBaseline(changed, positions, { season: 2026, key: 20260111, position: "RB", f }), b, "no leakage from the target week or later");
  const recYds = RUSH_REC_FAMILIES.find((x) => x.family === "recYds");
  assert.equal(positionalBaseline(games, positions, { season: 2026, key: 20260111, position: "WR", f: recYds }).mean, 55, "WR receiving: weeks 3 and 4");
});

test("approved (synthetic): verified finals only, did-not-play counted, absent field = 0, weeks 5–10 exploratory, metrics", () => {
  const g = gradeRushRec({ entries, games, verified, positions, ...approved });
  assert.deepEqual(g.rows.map((r) => `${r.eventId}:${r.playerId}:${r.window}`), ["11:nfl-athlete-1:CONFIRMATORY", "11:nfl-athlete-2:CONFIRMATORY", "11:nfl-athlete-3:CONFIRMATORY", "12:nfl-athlete-1:EXPLORATORY_SEEN_WEEKS_5_10"]);
  const r1 = g.rows[0].families;
  assert.equal(r1.rushYds.actual, 81);
  assert.equal(r1.rushYds.model.median, 40, "median of the exact counts {-2:1, 40:4, 80:5}");
  assert.equal(r1.rushYds.model.absError, 41);
  assert.equal(r1.rushYds.model.pOver[59.5], 0.5);
  assert.equal(r1.rushYds.positional.mean, 55);
  assert.equal(g.rows[2].families.rushAtt.actual, 0, "in the box with no rushing line ⇒ 0");
  assert.equal(g.rows[2].families.rushAtt.model, null, "no exact counts ⇒ no model score");
  assert.equal(g.rows[1].families.rushYds, null, "a WR with no rushing stat has no rushing row");
  const m = rushRecFamilyMetrics(g.rows.filter((r) => r.confirmatory), "rushYds", filledBars);
  assert.deepEqual([m.n, m.pairedN, m.noModelDistribution, m.modelMae, m.positionalMae], [1, 1, 1, 41, 26]);
  assert.ok("59.5" in m.ece);
  // a duplicate player-game outcome refuses the grade (the later-named file of the same instant is the receipt of record)
  const dup = [...entries, { file: "s/11z.json", receipt: { ...entries[0].receipt, generatedAt: "2026-11-16T12:00:00Z", playerStatDistributions: [...entries[0].receipt.playerStatDistributions, rb(1, "AAA", { exactCounts: exactRb })] } }];
  assert.throws(() => gradeRushRec({ entries: dup, games, verified, positions, ...approved }), /REFUSED: duplicate player-game outcome 11\|AAA\|nfl-athlete-1/);
});

test("deterministic: same inputs ⇒ byte-identical rows and metrics", () => {
  const a = gradeRushRec({ entries, games, verified, positions, ...approved });
  const b = gradeRushRec({ entries: [...entries].reverse(), games, verified, positions, ...approved });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
