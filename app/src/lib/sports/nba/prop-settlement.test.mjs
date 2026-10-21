/**
 * NBA player-prop grader: every outcome branch, combined families, push, DNP, missing player, non-final,
 * non-integer, tied final, immutability, totality, the shared-reader consistency with Top Board grading, the
 * read-only adapter, and a real-data smoke over the committed 2026-10-20 opening-night finals.
 *
 * Synthetic box scores come from the Top Board fixtures ("fx-" ids, invented players). No odds data is read
 * and no line here is a sportsbook line: every line is a TEST LINE.
 *
 * Run: npx tsx --test src/lib/sports/nba/prop-settlement.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  gradeNbaPlayerProp, settleNbaPlayerProps, NBA_PROP_SETTLEMENT_VERSION, PROP_FAMILIES, PROP_OUTCOMES, PROP_REASON, PROP_SIDES,
} from "./prop-settlement.mjs";
import { committedNbaPropResults, nbaBoxscoreDirs, nbaBoxscoreLocator, nbaPropResult, readNbaFinalsRecords } from "./prop-settlement-source.mjs";
import { boxscoreAthlete } from "./boxscore-line.mjs";
import { COMBO_KEYS } from "./game-sim.mjs";
import { gradeBoardRow, SETTLEMENT } from "./top-board-grading.mjs";
import { boxscore } from "./__fixtures__/top-board-fixtures.mjs";
import { boxscoreLocator as topBoardBoxscoreLocator } from "../../../../scripts/nba/grade-nba-top-boards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");

const EV = "fx-prop-1";
const leg = (over = {}) => ({ family: "pts", side: "OVER", line: 20.5, providerAthleteId: "1", eventId: EV, ...over });
/** A final result for athlete `id` from a fixture box score. */
const res = (players, { id = "1", status = "STATUS_FINAL", h = 110, a = 104, box = {} } = {}) => {
  const b = boxscore(EV, players, box);
  const available = b.boxscoreAvailable && /FINAL/.test(b.status);
  return { providerEventId: EV, status, homePointsFT: h, awayPointsFT: a, boxscoreAvailable: available, player: available ? boxscoreAthlete(b, id) : null };
};
const STAR = [{ id: 1, minutes: 34, pts: 27, reb: 8, ast: 6, threePm: 3 }, { id: 2, minutes: 20, pts: 9, reb: 3, ast: 1, threePm: 1 }];

// ── Contract surface ─────────────────────────────────────────────────────────────────────────────────

test("surface is closed: version 1, five outcomes, two sides, seven families (no minutes)", () => {
  assert.equal(NBA_PROP_SETTLEMENT_VERSION, 1);
  assert.deepEqual([...PROP_OUTCOMES], ["WIN", "LOSS", "PUSH", "NO_MEASUREMENT", "VOID_PENDING_REVIEW"]);
  assert.deepEqual([...PROP_SIDES], ["OVER", "UNDER"]);
  assert.deepEqual(Object.keys(PROP_FAMILIES), ["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst"]);
  assert.ok(!("minutes" in PROP_FAMILIES) && !("min" in PROP_FAMILIES));
  assert.ok(Object.isFrozen(PROP_FAMILIES) && Object.values(PROP_FAMILIES).every(Object.isFrozen));
});

test("combined families are the forecast's own combinations (game-sim COMBO_KEYS)", () => {
  for (const k of Object.keys(COMBO_KEYS)) assert.deepEqual([...PROP_FAMILIES[k]], [...COMBO_KEYS[k]], k);
  for (const k of ["pts", "reb", "ast", "threePm"]) assert.deepEqual([...PROP_FAMILIES[k]], [k]);
});

// ── Decisive grades ──────────────────────────────────────────────────────────────────────────────────

test("single families: OVER and UNDER each WIN and LOSE on the right side of a half line", () => {
  const r = res(STAR);
  const cases = [["pts", 27], ["reb", 8], ["ast", 6], ["threePm", 3]];
  for (const [family, stat] of cases) {
    const above = stat - 0.5, below = stat + 0.5;
    assert.equal(gradeNbaPlayerProp(leg({ family, side: "OVER", line: above }), r).outcome, "WIN", `${family} over ${above}`);
    assert.equal(gradeNbaPlayerProp(leg({ family, side: "UNDER", line: above }), r).outcome, "LOSS", `${family} under ${above}`);
    assert.equal(gradeNbaPlayerProp(leg({ family, side: "OVER", line: below }), r).outcome, "LOSS", `${family} over ${below}`);
    assert.equal(gradeNbaPlayerProp(leg({ family, side: "UNDER", line: below }), r).outcome, "WIN", `${family} under ${below}`);
    const g = gradeNbaPlayerProp(leg({ family, line: above }), r);
    assert.equal(g.finalStat, stat);
    assert.equal(g.code, PROP_REASON.GRADED);
    assert.equal(g.bookRuleUnknown, false);
    assert.equal(g.minutes, 34);
  }
});

test("combined families are the sum of their parts, with the parts reported", () => {
  const r = res(STAR);
  const pra = gradeNbaPlayerProp(leg({ family: "pra", line: 40.5 }), r);
  assert.equal(pra.finalStat, 41);
  assert.deepEqual(pra.components, { pts: 27, reb: 8, ast: 6 });
  assert.equal(pra.outcome, "WIN");
  const pr = gradeNbaPlayerProp(leg({ family: "ptsReb", side: "UNDER", line: 35.5 }), r);
  assert.deepEqual([pr.finalStat, pr.outcome, pr.components], [35, "WIN", { pts: 27, reb: 8 }]);
  const pa = gradeNbaPlayerProp(leg({ family: "ptsAst", side: "OVER", line: 33.5 }), r);
  assert.deepEqual([pa.finalStat, pa.outcome, pa.components], [33, "LOSS", { pts: 27, ast: 6 }]);
  // A combined family needs EVERY part as an integer: one missing part is not read as 0.
  const b = res(STAR); b.player = { ...b.player, ast: null };
  assert.equal(gradeNbaPlayerProp(leg({ family: "pra", line: 0.5 }), b).outcome, "VOID_PENDING_REVIEW");
  assert.equal(gradeNbaPlayerProp(leg({ family: "ptsReb", line: 0.5 }), b).outcome, "WIN", "ptsReb does not read ast");
});

test("an integer line that lands exactly is PUSH for both sides; a half line never pushes", () => {
  const r = res(STAR);
  for (const side of PROP_SIDES) {
    assert.equal(gradeNbaPlayerProp(leg({ side, line: 27 }), r).outcome, "PUSH", side);
    assert.equal(gradeNbaPlayerProp(leg({ family: "pra", side, line: 41 }), r).outcome, "PUSH", `pra ${side}`);
  }
  assert.notEqual(gradeNbaPlayerProp(leg({ line: 26.5 }), r).outcome, "PUSH");
  // A zero line is legal: a player who played and scored 0 pushes it.
  const zero = res([{ id: 1, minutes: 12, pts: 0, reb: 0, ast: 0, threePm: 0 }]);
  assert.equal(gradeNbaPlayerProp(leg({ family: "threePm", line: 0 }), zero).outcome, "PUSH");
  assert.equal(gradeNbaPlayerProp(leg({ family: "threePm", line: 0.5, side: "UNDER" }), zero).outcome, "WIN");
});

// ── NO_MEASUREMENT ───────────────────────────────────────────────────────────────────────────────────

test("DNP, absent from the box score, and 0 minutes are NO_MEASUREMENT with bookRuleUnknown — never LOSS", () => {
  const cases = [
    ["DNP", res([{ id: 1, didNotPlay: true, dnpReason: "COACH'S DECISION" }, ...STAR.slice(1)])],
    ["NOT_IN_BOXSCORE", res(STAR.slice(1))],
    ["ZERO_MINUTES", res([{ id: 1, minutes: 0, pts: 0, reb: 0, ast: 0, threePm: 0 }])],
  ];
  for (const [code, r] of cases) {
    for (const family of Object.keys(PROP_FAMILIES)) for (const side of PROP_SIDES) for (const line of [0, 0.5, 20.5]) {
      const g = gradeNbaPlayerProp(leg({ family, side, line }), r);
      assert.equal(g.outcome, "NO_MEASUREMENT", `${code} ${family} ${side} ${line}`);
      assert.equal(g.code, PROP_REASON[code]);
      assert.equal(g.bookRuleUnknown, true);
      assert.equal(g.finalStat, null);
      assert.match(g.reason, /Not a loss/);
    }
  }
  assert.match(gradeNbaPlayerProp(leg(), cases[0][1]).reason, /COACH'S DECISION/);
});

test("a missing FEED is not a missing player: no final box score quarantines, never NO_MEASUREMENT", () => {
  for (const r of [
    res(STAR, { box: { available: false } }),
    res(STAR, { box: { status: "STATUS_IN_PROGRESS" } }),
    { ...res(STAR), boxscoreAvailable: undefined },
  ]) {
    const g = gradeNbaPlayerProp(leg(), r);
    assert.equal(g.outcome, "VOID_PENDING_REVIEW");
    assert.equal(g.code, PROP_REASON.NO_FINAL_BOXSCORE);
    assert.equal(g.bookRuleUnknown, false);
  }
});

// ── Quarantine branches ──────────────────────────────────────────────────────────────────────────────

test("only STATUS_FINAL grades: every other status quarantines", () => {
  for (const status of ["STATUS_SCHEDULED", "STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_END_PERIOD", "STATUS_POSTPONED", "STATUS_CANCELED", "PENDING", "FINAL_UNDER_REVIEW", "Final", "", null, undefined]) {
    const g = gradeNbaPlayerProp(leg(), { ...res(STAR), status }); // spread, so undefined is not defaulted away
    assert.deepEqual([g.outcome, g.code], ["VOID_PENDING_REVIEW", PROP_REASON.NOT_FINAL], String(status));
  }
  assert.equal(gradeNbaPlayerProp(leg(), res(STAR, { status: "STATUS_FINAL_OT" })).outcome, "WIN", "the team contract's /^STATUS_FINAL/ test");
});

test("a tied final quarantines (an NBA game cannot end tied), consistent with the team contract", () => {
  const g = gradeNbaPlayerProp(leg(), res(STAR, { h: 108, a: 108 }));
  assert.deepEqual([g.outcome, g.code], ["VOID_PENDING_REVIEW", PROP_REASON.TIED_FINAL]);
});

test("integer stats or nothing: non-integer scores, stats or minutes quarantine and are never read as 0", () => {
  for (const [h, a] of [[110.5, 104], [null, 104], ["110", 104], [-1, 104], [110, undefined]]) {
    assert.equal(gradeNbaPlayerProp(leg(), { ...res(STAR), homePointsFT: h, awayPointsFT: a }).code, PROP_REASON.NON_INTEGER_SCORE, `${h}-${a}`);
  }
  for (const [field, v] of [["pts", 27.5], ["pts", null], ["pts", "27"], ["pts", -3], ["pts", Number.NaN], ["minutes", null], ["minutes", 33.4], ["minutes", -1]]) {
    const r = res(STAR); r.player = { ...r.player, [field]: v };
    const g = gradeNbaPlayerProp(leg({ line: 0.5 }), r);
    assert.deepEqual([g.outcome, g.code], ["VOID_PENDING_REVIEW", PROP_REASON.NON_INTEGER_STAT], `${field} ${String(v)}`);
  }
});

test("unknown family or side, bad line or identity, and mismatched rows quarantine", () => {
  const r = res(STAR);
  const want = (l, result, code) => {
    const g = gradeNbaPlayerProp(l, result);
    assert.deepEqual([g.outcome, g.code], ["VOID_PENDING_REVIEW", code], JSON.stringify(l));
    assert.equal(g.bookRuleUnknown, false);
  };
  for (const family of ["minutes", "min", "PTS", "blk", "stl", "points", "", null, undefined, 7]) want(leg({ family }), r, PROP_REASON.UNKNOWN_FAMILY);
  assert.match(gradeNbaPlayerProp(leg({ family: "minutes" }), r).reason, /minutes is not a bettable market/);
  for (const side of ["over", "under", "YES", "home", "", null, undefined]) want(leg({ side }), r, PROP_REASON.UNKNOWN_SIDE);
  for (const line of [-0.5, Number.NaN, Infinity, "20.5", null, undefined]) want(leg({ line }), r, PROP_REASON.INVALID_LINE);
  for (const over of [{ providerAthleteId: null }, { providerAthleteId: "" }, { eventId: undefined }, { eventId: "  " }]) want(leg(over), r, PROP_REASON.INVALID_IDENTITY);
  want(leg(), null, PROP_REASON.NO_RESULT);
  want(leg(), undefined, PROP_REASON.NO_RESULT);
  want(leg(), { ...r, providerEventId: "fx-other" }, PROP_REASON.EVENT_MISMATCH);
  want(leg(), { ...r, providerEventId: undefined }, PROP_REASON.EVENT_MISMATCH);
  want(leg(), { ...r, player: { ...r.player, providerAthleteId: "2" } }, PROP_REASON.PLAYER_MISMATCH);
  want(leg(), { ...r, player: "1" }, PROP_REASON.PLAYER_MISMATCH);
  for (const bad of [null, undefined, 42, "leg", true]) want(bad, r, PROP_REASON.INVALID_LEG);
  // A numeric id matches its string form, exactly as the box-score reader compares.
  assert.equal(gradeNbaPlayerProp(leg({ providerAthleteId: 1 }), r).outcome, "WIN");
});

test("every reason code is reachable from some input", () => {
  const seen = new Set();
  const r = res(STAR);
  const inputs = [
    [null, r], [leg({ family: "x" }), r], [leg({ side: "x" }), r], [leg({ line: -1 }), r], [leg({ eventId: null }), r],
    [leg(), null], [leg(), { ...r, providerEventId: "x" }], [leg(), { ...r, status: "STATUS_IN_PROGRESS" }],
    [leg(), { ...r, homePointsFT: 1.5 }], [leg(), { ...r, awayPointsFT: 110 }], [leg(), { ...r, boxscoreAvailable: false }],
    [leg(), { ...r, player: { ...r.player, providerAthleteId: "9" } }], [leg(), { ...r, player: null }],
    [leg(), { ...r, player: { ...r.player, didNotPlay: true } }], [leg(), { ...r, player: { ...r.player, minutes: 0 } }],
    [leg(), { ...r, player: { ...r.player, pts: null } }], [leg(), r],
  ];
  for (const [l, x] of inputs) seen.add(gradeNbaPlayerProp(l, x).code);
  assert.deepEqual([...seen].sort(), Object.values(PROP_REASON).sort());
});

// ── Totality, determinism, immutability ──────────────────────────────────────────────────────────────

test("total: garbage never throws and always returns a known outcome", () => {
  const cyclic = {}; cyclic.self = cyclic;
  const r = res(STAR);
  const legs = [null, undefined, 0, "", [], {}, leg({ family: 10n }), leg({ side: Symbol("s") }), leg({ line: cyclic }), leg({ family: cyclic }), leg({ providerAthleteId: {} })];
  const results = [null, undefined, 0, "x", [], {}, { ...r, status: Symbol("s") }, { ...r, providerEventId: 10n }, { ...r, player: cyclic }, { ...r, player: { ...r.player, dnpReason: cyclic, didNotPlay: true } }, r];
  for (const l of legs) for (const x of results) {
    const g = gradeNbaPlayerProp(l, x);
    assert.ok(PROP_OUTCOMES.includes(g.outcome));
    assert.ok(Object.values(PROP_REASON).includes(g.code));
    assert.equal(typeof g.reason, "string");
    assert.equal(g.version, 1);
  }
});

test("deterministic: the same input grades identically, whatever the key order", () => {
  const r = res(STAR);
  const a = gradeNbaPlayerProp(leg({ family: "pra", line: 41 }), r);
  const flipped = Object.fromEntries(Object.entries(leg({ family: "pra", line: 41 })).reverse());
  const rFlipped = { ...Object.fromEntries(Object.entries(r).reverse()), player: Object.fromEntries(Object.entries(r.player).reverse()) };
  assert.deepEqual(gradeNbaPlayerProp(leg({ family: "pra", line: 41 }), r), a);
  assert.deepEqual(gradeNbaPlayerProp(flipped, rFlipped), a);
});

const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

test("never mutates its inputs (frozen inputs grade, and deep copies stay equal)", () => {
  const shapes = [
    [leg({ family: "pra", line: 41 }), res(STAR)],
    [leg(), res([{ id: 1, didNotPlay: true }])],
    [leg(), res(STAR.slice(1))],
    [leg(), res(STAR, { h: 100, a: 100 })],
    [leg({ family: "minutes" }), res(STAR)],
  ];
  for (const [l, r] of shapes) {
    const before = JSON.stringify([l, r]);
    const g = gradeNbaPlayerProp(deepFreeze(l), deepFreeze(r));
    assert.equal(JSON.stringify([l, r]), before);
    if (g.components) { g.components.pts = -1; assert.equal(r.player.pts, 27, "output is not aliased to the input row"); }
  }
});

test("batch settle: decisive is WIN+LOSS only; NO_MEASUREMENT and reviews sit beside it and reconcile", () => {
  const r1 = res(STAR);
  const results = { 1: r1, 2: res(STAR, { id: "2" }), 3: res(STAR.slice(1), { id: "3" }) };
  const legs = [
    leg({ line: 26.5 }),                                        // WIN
    leg({ providerAthleteId: "2", line: 9.5 }),                 // LOSS
    leg({ family: "pra", line: 41 }),                           // PUSH
    leg({ providerAthleteId: "3" }),                            // NO_MEASUREMENT
    leg({ family: "minutes" }),                                 // VOID
  ];
  const { graded, summary } = settleNbaPlayerProps(legs, (l) => results[l.providerAthleteId]);
  assert.deepEqual(graded.map((g) => g.outcome), ["WIN", "LOSS", "PUSH", "NO_MEASUREMENT", "VOID_PENDING_REVIEW"]);
  assert.deepEqual(summary, { version: 1, total: 5, wins: 1, losses: 1, pushes: 1, noMeasurement: 1, voids: 1, decisive: 2, bookRuleUnknown: 1, reconciles: true });
  assert.deepEqual(settleNbaPlayerProps([], () => null).summary.total, 0);
});

// ── Consistency with Top Board grading (the shared line reader) ──────────────────────────────────────

const SINGLE = ["pts", "reb", "ast", "threePm"];
const boardRow = (eventId, athleteId, stat) => ({
  rowId: `consistency|${stat}|${athleteId}`, category: stat, stat, eventId, player: { providerAthleteId: athleteId },
  projection: { p50: 10, mean: 10 }, range: { p10: 5, p90: 15 }, expectedMinutes: 30, marketLine: null,
});

/**
 * For one box score, grade every athlete × family both ways and check that the two graders agree:
 *   - a prop measurement's stat equals Top Board's actual (single family) or the sum of its actuals (combined);
 *   - prop NO_MEASUREMENT ⇔ Top Board VOID (DNP / not in box score) or Top Board graded a 0-minute row;
 *   - prop NON_INTEGER_STAT ⇔ Top Board UNGRADABLE on some part.
 */
function assertAgreement(box, result) {
  let checked = 0;
  const ids = [...new Set(box.players.map((p) => p.providerAthleteId).filter((x) => x != null)), "999999999"];
  for (const id of ids) {
    const tb = Object.fromEntries(SINGLE.map((s) => [s, gradeBoardRow(boardRow(box.providerEventId, id, s), { boxscore: box })]));
    for (const family of Object.keys(PROP_FAMILIES)) {
      const parts = PROP_FAMILIES[family];
      const g = gradeNbaPlayerProp({ family, side: "OVER", line: 0.5, providerAthleteId: id, eventId: box.providerEventId }, result(id));
      const t = parts.map((s) => tb[s]);
      const tag = `${box.providerEventId} ${id} ${family}`;
      if (g.code === PROP_REASON.GRADED) {
        assert.ok(t.every((x) => x.projectionStatus === "GRADED"), tag);
        assert.equal(g.finalStat, t.reduce((sum, x) => sum + x.accuracy.actual, 0), tag);
        for (const s of parts) assert.equal(g.components[s], tb[s].accuracy.actual, tag);
        assert.equal(g.minutes, t[0].accuracy.actualMinutes, tag);
      } else if (g.outcome === "NO_MEASUREMENT") {
        const voided = t.every((x) => x.settlement.status === SETTLEMENT.VOID);
        const zeroMinutes = t.every((x) => x.projectionStatus === "GRADED" && x.accuracy.actualMinutes === 0);
        assert.ok(voided || zeroMinutes, tag);
        if (voided) assert.equal(g.code, t[0].settlement.reason, tag); // NOT_IN_BOXSCORE / DNP: one vocabulary
      } else {
        assert.equal(g.code, PROP_REASON.NON_INTEGER_STAT, tag);
        assert.ok(t.some((x) => x.settlement.status === SETTLEMENT.UNGRADABLE), tag);
      }
      checked += 1;
    }
  }
  return checked;
}

test("consistency (synthetic): prop grades and Top Board grading read the same stat values", () => {
  const players = [...STAR, { id: 3, didNotPlay: true, dnpReason: "REST" }, { id: 4, minutes: 0 }, { id: 5, minutes: 18, pts: 6 }];
  const box = boxscore(EV, players);
  box.players[4].reb = null; // the fixture helper fills a missing stat with 0; this row must carry a real null
  const checked = assertAgreement(box, (id) => ({ providerEventId: EV, status: "STATUS_FINAL", homePointsFT: 99, awayPointsFT: 97, boxscoreAvailable: true, player: boxscoreAthlete(box, id) }));
  assert.equal(checked, 6 * 7);
});

test("consistency (real committed corpus box scores): every athlete × family agrees with Top Board grading", () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(REPO, "data", "internal", "research", "nba", "corpus-v1.json"), "utf8"));
  const finalsRecord = { finals: corpus.rows.map((r) => ({ providerEventId: String(r.providerEventId), ftHome: r.ftHome, ftAway: r.ftAway, statusRaw: r.statusRaw, winnerSide: null, home: {}, away: {}, phase: null })), conflicts: [] };
  const find = nbaBoxscoreLocator({ repoRoot: REPO });
  // Fixed historical games (2023-24 regular season) that between them hold DNPs and a 0-minute row.
  let checked = 0, noMeasurement = 0, graded = 0;
  for (const id of ["401584095", "401584122", "401584141"]) {
    const box = find(id);
    assert.ok(box, `committed corpus box score ${id}`);
    assert.equal(box.source, "corpus");
    checked += assertAgreement(box.doc, (athleteId) => nbaPropResult({ finalsRecord, boxscore: box.doc, providerEventId: id, providerAthleteId: athleteId }));
    for (const p of box.doc.players) {
      const g = gradeNbaPlayerProp({ family: "pra", side: "OVER", line: 0.5, providerAthleteId: p.providerAthleteId, eventId: id }, nbaPropResult({ finalsRecord, boxscore: box.doc, providerEventId: id, providerAthleteId: p.providerAthleteId }));
      if (g.outcome === "NO_MEASUREMENT") noMeasurement += 1;
      if (g.code === PROP_REASON.GRADED) graded += 1;
    }
  }
  assert.ok(checked > 150, `checked ${checked}`);
  assert.ok(noMeasurement >= 3 && graded >= 30, `noMeasurement ${noMeasurement} graded ${graded}`);
});

// ── Adapter (read-only) ──────────────────────────────────────────────────────────────────────────────

const REC = {
  finals: [
    { providerEventId: EV, ftHome: 110, ftAway: 104, statusRaw: "STATUS_FINAL", winnerSide: "home", home: { tricode: "BOS" }, away: { tricode: "NYK" }, phase: "REGULAR" },
    { providerEventId: "fx-conflict", ftHome: 99, ftAway: 98, statusRaw: "STATUS_FINAL", winnerSide: "home", home: { tricode: "BOS" }, away: { tricode: "NYK" }, phase: "REGULAR" },
  ],
  conflicts: [{ providerEventId: "fx-conflict", recorded: {}, observed: {} }],
};

test("adapter: finals record + box score → the grader's input; pending, under-review and foreign box scores never grade", () => {
  const box = boxscore(EV, STAR);
  const ok = nbaPropResult({ finalsRecord: REC, boxscore: box, providerEventId: EV, providerAthleteId: "1", boxscoreSource: "fixture" });
  assert.deepEqual([ok.status, ok.homePointsFT, ok.awayPointsFT, ok.boxscoreAvailable, ok.player?.pts], ["STATUS_FINAL", 110, 104, true, 27]);
  assert.equal(gradeNbaPlayerProp(leg(), ok).outcome, "WIN");

  const pending = nbaPropResult({ finalsRecord: REC, boxscore: boxscore("fx-unrecorded", STAR), providerEventId: "fx-unrecorded", providerAthleteId: "1" });
  assert.deepEqual([pending.status, pending.homePointsFT], ["PENDING", null]);
  assert.equal(gradeNbaPlayerProp(leg({ eventId: "fx-unrecorded" }), pending).code, PROP_REASON.NOT_FINAL);

  const review = nbaPropResult({ finalsRecord: REC, boxscore: boxscore("fx-conflict", STAR), providerEventId: "fx-conflict", providerAthleteId: "1" });
  assert.equal(review.status, "FINAL_UNDER_REVIEW");
  assert.equal(gradeNbaPlayerProp(leg({ eventId: "fx-conflict" }), review).code, PROP_REASON.NOT_FINAL);

  for (const b of [boxscore("fx-other", STAR), boxscore(EV, STAR, { status: "STATUS_IN_PROGRESS" }), boxscore(EV, [], { available: false }), null]) {
    const r = nbaPropResult({ finalsRecord: REC, boxscore: b, providerEventId: EV, providerAthleteId: "1" });
    assert.deepEqual([r.boxscoreAvailable, r.player], [false, null]);
    assert.equal(gradeNbaPlayerProp(leg(), r).code, PROP_REASON.NO_FINAL_BOXSCORE);
  }
  const absent = nbaPropResult({ finalsRecord: REC, boxscore: box, providerEventId: EV, providerAthleteId: "77" });
  assert.equal(gradeNbaPlayerProp(leg({ providerAthleteId: "77" }), absent).outcome, "NO_MEASUREMENT");

  const recCopy = JSON.stringify(REC), boxCopy = JSON.stringify(box);
  nbaPropResult({ finalsRecord: deepFreeze(structuredClone(REC)), boxscore: deepFreeze(structuredClone(box)), providerEventId: EV, providerAthleteId: "1" });
  assert.equal(JSON.stringify(REC), recCopy);
  assert.equal(JSON.stringify(box), boxCopy);
});

test("adapter looks for box scores where Top Board grading does, in the same order", () => {
  const dirs = nbaBoxscoreDirs({ repoRoot: REPO }).map(([d, s]) => [path.relative(REPO, d), s]);
  assert.deepEqual(dirs[0], [path.join("data", "internal", "research", "nba", "boxscores"), "corpus"]);
  assert.deepEqual(dirs.slice(1).map(([, s]) => s), ["experimental-fetch", "experimental-v0.1-fetch", "experimental-v0.2-fetch", "experimental-v1-fetch"]);
  const ours = nbaBoxscoreLocator({ repoRoot: REPO });
  const theirs = topBoardBoxscoreLocator();
  // A corpus game, an experimental fetch-cache game, and an absent id.
  for (const id of ["401584095", "401898388", "0"]) {
    const a = ours(id), b = theirs(id);
    assert.deepEqual(a && { source: a.source, file: a.file, doc: a.doc }, b && { source: b.source, file: b.file, doc: b.doc }, id);
  }
  assert.equal(ours("401898388")?.source, "experimental-fetch");
});

// ── Real-data smoke: 2026-10-20 opening night ────────────────────────────────────────────────────────

const OPENING_NIGHT = Object.freeze({ "401909088": [121, 113], "401909089": [100, 106], "401909090": [104, 116] });

test("real-data smoke: the committed 2026-10-20 opening-night finals feed the grader, and nothing is read as a loss", () => {
  const record = readNbaFinalsRecords({ repoRoot: REPO });
  assert.ok(record.files.some((f) => f.endsWith("finals-2026-27.json")));
  const forecasts = JSON.parse(fs.readFileSync(path.join(REPO, "data", "internal", "research", "nba", "experimental-v0.1", "forecasts", "2026-10-20.json"), "utf8"));
  const resultFor = committedNbaPropResults({ repoRoot: REPO });
  const find = nbaBoxscoreLocator({ repoRoot: REPO });
  let legs = 0;
  for (const [eventId, [h, a]] of Object.entries(OPENING_NIGHT)) {
    const game = forecasts.games.find((g) => g.providerEventId === eventId);
    assert.ok(game, `frozen forecast for ${eventId}`);
    const athletes = [...game.forecast.players.home, ...game.forecast.players.away].map((p) => String(p.providerAthleteId));
    assert.ok(athletes.length >= 20, eventId);
    const box = find(eventId);
    for (const athleteId of athletes) {
      const r = resultFor({ eventId, providerAthleteId: athleteId });
      assert.deepEqual([r.status, r.homePointsFT, r.awayPointsFT], ["STATUS_FINAL", h, a], eventId);
      assert.equal(r.provenance.finals, "finals-record");
      for (const family of Object.keys(PROP_FAMILIES)) for (const side of PROP_SIDES) {
        const g = gradeNbaPlayerProp({ family, side, line: 0.5, providerAthleteId: athleteId, eventId }, r); // TEST LINE, not a market
        legs += 1;
        if (!box) {
          // Opening-night box scores are not committed yet: every leg waits, none is a measurement or a loss.
          assert.deepEqual([g.outcome, g.code], ["VOID_PENDING_REVIEW", PROP_REASON.NO_FINAL_BOXSCORE], `${eventId} ${athleteId} ${family}`);
        } else {
          assert.ok(PROP_OUTCOMES.includes(g.outcome));
          if (g.outcome === "LOSS") assert.equal(g.code, PROP_REASON.GRADED);
        }
      }
    }
    if (box) assert.ok(assertAgreement(box.doc, (athleteId) => resultFor({ eventId, providerAthleteId: athleteId })) > 0);
  }
  assert.ok(legs > 500, `legs ${legs}`);
});

// ── No writer, client-safe ───────────────────────────────────────────────────────────────────────────

test("the grader is client-safe: no node built-ins, no I/O, imports only import-free pure modules", () => {
  const src = fs.readFileSync(path.join(HERE, "prop-settlement.mjs"), "utf8");
  const imports = [...src.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["./boxscore-line.mjs", "./game-sim.mjs"]);
  for (const f of ["prop-settlement.mjs", "boxscore-line.mjs", "game-sim.mjs"]) {
    const s = fs.readFileSync(path.join(HERE, f), "utf8");
    assert.ok(!/from "node:|require\(|\bfetch\(|process\.env|writeFileSync|readFileSync/.test(s), `${f} must stay pure`);
  }
  for (const f of ["boxscore-line.mjs", "game-sim.mjs"]) assert.ok(!/^import /m.test(fs.readFileSync(path.join(HERE, f), "utf8")), `${f} has no imports`);
});

test("the adapter only reads: no writes, no network, no odds API", () => {
  const src = fs.readFileSync(path.join(HERE, "prop-settlement-source.mjs"), "utf8");
  assert.ok(!/writeFileSync|appendFileSync|mkdirSync|renameSync|unlinkSync|rmSync|createWriteStream|\bfetch\(|https?:\/\/|odds/i.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
});
