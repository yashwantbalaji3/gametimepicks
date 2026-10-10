/**
 * TRUTH-001 · MLB run-line calls at the sportsbook's POSTED line (founder decision 2026-10-09, Option A).
 *
 * Run: npx tsx --test src/lib/mlb/prediction/run-line-posted.test.mjs
 *
 * Decision engine v1 picked ±1.5 off the SIMULATED favourite whatever the book posted: 218 of 579 committed v1
 * picks sat on the opposite sign to the book's line for that team (2026-10-05 849839 published "NYY +1.5" while
 * the book had NYY −1.5 / TB +1.5). v2 evaluates the pick AT the captured signed line, carries the book and
 * capture time, grades under its own market (`run_line_posted`) and never rewrites a v1 pick.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildGamePredictionDecision, postedRunLine, DECISION_ENGINE_VERSION } from "./decision.ts";
import { gradeGameFamilies, summariseGameLedger, GAME_MARKETS } from "./grade-games.mjs";
import { pauseMlbRunLine, MLB_RUN_LINE_FAMILY, MLB_RUN_LINE_POSTED_FAMILY, GATED_FAMILIES, POSTED_RUN_LINE_INHERITS_V1_RESTRICTIONS } from "../../ops/live-record-gate.mjs";

const APP = process.cwd();
const team = (side) => (side === "home" ? "HOME" : "AWAY");
// homeCover(L) = P(home wins by > L); awayCover(L) = P(away wins by > L).
const SIM_RL = [{ line: 1.5, homeCover: 0.30, awayCover: 0.25 }, { line: 2.5, homeCover: 0.20, awayCover: 0.15 }];
const game = (runLine, extra = {}) => ({ gamePk: 1, runLine: SIM_RL, market: { bookmaker: "draftkings", capturedAt: "2026-10-10T13:00:00Z", moneyline: null, total: null, runLine }, ...extra });

test("home LAYS −1.5: P(home −1.5) = homeCover(1.5); the away side is +1.5", () => {
  const { prediction: p } = postedRunLine(game({ line: -1.5, homeCover: 0.42 }), team);
  // home −1.5 covers 0.30; away +1.5 covers 0.70 → AWAY +1.5.
  assert.equal(p.basis, "POSTED_LINE");
  assert.equal(p.homeLine, -1.5);
  assert.equal(p.favorite, "home", "the book's favourite is the side laying");
  assert.equal(p.pick, "AWAY +1.5");
  assert.equal(p.pickSide, "away");
  assert.equal(p.pickLine, 1.5);
  assert.equal(p.coverProbability, 0.7);
  assert.equal(p.marketImpliedProbability, 0.58, "the book's no-vig price for the PICKED side at the same line");
  assert.equal(p.bookmaker, "draftkings");
  assert.equal(p.capturedAt, "2026-10-10T13:00:00Z");
});

test("home RECEIVES +1.5: P(home +1.5) = 1 − awayCover(1.5); the away side is −1.5", () => {
  const { prediction: p } = postedRunLine(game({ line: 1.5, homeCover: 0.64 }), team);
  // home +1.5 covers 1 − 0.25 = 0.75 → HOME +1.5; never "HOME −1.5", never the away side at +1.5.
  assert.equal(p.homeLine, 1.5);
  assert.equal(p.favorite, "away");
  assert.equal(p.pick, "HOME +1.5");
  assert.equal(p.pickSide, "home");
  assert.equal(p.pickLine, 1.5);
  assert.equal(p.coverProbability, 0.75);
  assert.equal(p.marketImpliedProbability, 0.64);
});

test("the pick can be the side LAYING the runs when the simulation favours it", () => {
  const strongHome = game({ line: -1.5, homeCover: 0.5 }, { runLine: [{ line: 1.5, homeCover: 0.62, awayCover: 0.12 }] });
  const { prediction: p } = postedRunLine(strongHome, team);
  assert.equal(p.pick, "HOME -1.5");
  assert.equal(p.pickLine, -1.5);
  assert.equal(p.coverProbability, 0.62);
  assert.equal(p.marketImpliedProbability, 0.5);
});

test("the picked side's line always has the sign the book posted for that side", () => {
  for (const homeLine of [-1.5, 1.5, -2.5, 2.5]) {
    const { prediction: p } = postedRunLine(game({ line: homeLine, homeCover: 0.5 }), team);
    assert.ok(p, `line ${homeLine}`);
    const bookLineForPickedSide = p.pickSide === "home" ? homeLine : -homeLine;
    assert.equal(p.pickLine, bookLineForPickedSide, `${homeLine}: ${p.pick}`);
    assert.ok(Math.abs(p.coverProbability + p.opposingCoverProbability - 1) < 1e-9);
  }
});

test("missing posted line → NO pick (never inferred from the simulated favourite or ±1.5)", () => {
  for (const runLine of [null, { line: null, homeCover: 0.5 }, { line: 0, homeCover: 0.5 }]) {
    const r = postedRunLine(game(runLine), team);
    assert.equal(r.prediction, null);
    assert.equal(r.unavailableReason, "Run line: no posted market line.");
  }
  assert.equal(postedRunLine({ gamePk: 1, runLine: SIM_RL, market: null }, team).prediction, null, "no market at all");
});

test("a posted magnitude the simulation did not publish, or an integer line that can push, is refused", () => {
  const alt = postedRunLine(game({ line: 3.5, homeCover: 0.47 }), team);
  assert.equal(alt.prediction, null);
  assert.match(alt.unavailableReason, /did not publish a 3.5-run margin/);
  const integer = postedRunLine(game({ line: -2, homeCover: 0.4 }), team);
  assert.equal(integer.prediction, null);
  assert.match(integer.unavailableReason, /can push/);
});

test("a missing book price never blocks the call and is never faked", () => {
  const { prediction: p } = postedRunLine(game({ line: -1.5, homeCover: null }), team);
  assert.ok(p);
  assert.equal(p.marketImpliedProbability, null);
});

test("the engine version is bumped and stamped on every decision", () => {
  assert.equal(DECISION_ENGINE_VERSION, "mlb-prediction-2026.10-v2");
});

/* ── real committed games: v2 never contradicts the posted sign ───────────────────────────────── */

test("849839 (2026-10-05): v1 published NYY +1.5 against the book's NYY −1.5; v2 picks at the posted line", () => {
  const sims = JSON.parse(fs.readFileSync(path.join(APP, "public/data/mlb/full-game-simulations/2026-10-05.json"), "utf8"));
  const g = sims.games.find((x) => x.gamePk === 849839);
  const v1 = JSON.parse(fs.readFileSync(path.join(APP, "public/data/mlb/predictions/2026-10-05.json"), "utf8")).predictions.find((x) => x.gamePk === 849839);
  assert.equal(v1.runLine.pick, "NYY +1.5", "the v1 record is what it is");
  assert.equal(g.market.runLine.line, 1.5, "home (TB) received +1.5, so NYY laid −1.5");
  const v2 = buildGamePredictionDecision(g, null).runLine;
  assert.ok(v2.pick === "TB +1.5" || v2.pick === "NYY -1.5", `v2 picks one of the two POSTED sides, got ${v2.pick}`);
  assert.notEqual(v2.pick, "NYY +1.5");
});

test("EVERY committed game with a posted half-run line: the v2 pick is on a posted side", () => {
  const dir = path.join(APP, "public/data/mlb/full-game-simulations");
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const g of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).games ?? []) {
      if (g.status === "unavailable" || !g.winProbability || !g.runs || !g.totalRuns) continue;
      const L = g.market?.runLine?.line;
      const rl = buildGamePredictionDecision(g, null).runLine;
      if (typeof L !== "number" || L === 0 || Math.abs(L % 1) !== 0.5 || !g.runLine.some((r) => r.line === Math.abs(L))) {
        assert.equal(rl, null, `${f} ${g.gamePk}: no evaluable posted line → no pick`);
        continue;
      }
      n++;
      assert.equal(rl.pickLine, rl.pickSide === "home" ? L : -L, `${f} ${g.gamePk}`);
      assert.equal(rl.bookmaker, g.market.bookmaker);
      assert.equal(rl.capturedAt, g.market.capturedAt);
    }
  }
  assert.ok(n > 500, `checked ${n}`);
});

/* ── grading: two definitions, two records ─────────────────────────────────────────────────────── */

const FINAL = { isFinal: true, homeRuns: 3, awayRuns: 4 }; // away wins by one
const REV = { generatedAt: "2026-10-10T14:00:00Z", source: "snapshot:x" };

test("a v2 pick grades under run_line_posted with its book evidence; a v1 pick stays run_line", () => {
  const v2Row = { gamePk: 1, slateDate: "2026-10-10", awayTeam: "AWAY", homeTeam: "HOME", decisionEngineVersion: "mlb-prediction-2026.10-v2",
    runLine: { basis: "POSTED_LINE", pick: "HOME +1.5", pickSide: "home", pickLine: 1.5, homeLine: 1.5, coverProbability: 0.75, marketImpliedProbability: 0.64, bookmaker: "draftkings", capturedAt: "2026-10-10T13:00:00Z" } };
  const [g2] = gradeGameFamilies({ row: v2Row, final: FINAL, revision: REV, firstPitchUtc: "2026-10-10T23:00:00Z" });
  assert.equal(g2.market, "run_line_posted");
  assert.equal(g2.outcome, "WIN", "home +1.5 covers a one-run loss");
  assert.equal(g2.decisionEngineVersion, "mlb-prediction-2026.10-v2");
  assert.equal(g2.marketImpliedProbability, 0.64);
  assert.deepEqual([g2.homeLine, g2.bookmaker, g2.marketCapturedAt], [1.5, "draftkings", "2026-10-10T13:00:00Z"]);

  const v1Row = { gamePk: 2, slateDate: "2026-10-05", awayTeam: "AWAY", homeTeam: "HOME", runLine: { pick: "AWAY +1.5", pickSide: "away", pickLine: 1.5, coverProbability: 0.6 } };
  const [g1] = gradeGameFamilies({ row: v1Row, final: FINAL, revision: REV, firstPitchUtc: "2026-10-10T23:00:00Z" });
  assert.equal(g1.market, "run_line");
  assert.equal(g1.marketImpliedProbability, null, "v1 recorded no run-line price; still absent, never faked");
  assert.equal(g1.decisionEngineVersion, null, "a revision without the field is not given one");
  assert.equal("bookmaker" in g1, false);

  const summary = summariseGameLedger([g1, g2]);
  assert.ok(GAME_MARKETS.includes("run_line_posted"));
  assert.deepEqual([summary.run_line.n, summary.run_line_posted.n], [1, 1], "never one pooled record");
});

test("EVERY committed graded row stays v1 run_line: nothing published is re-labelled", () => {
  const rows = fs.readFileSync(path.join(APP, "public/data/mlb/results/game-predictions-graded.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(rows.filter((r) => r.market === "run_line_posted").length, 0);
  assert.ok(rows.filter((r) => r.market === "run_line").length >= 810);
});

/* ── the live-record gate: each definition is paused only by its own record ──────────────────── */

test("FOUNDER SAFEGUARD · a v2 call inherits every v1 restriction, and is paused by its own record too", () => {
  const v2 = { runLine: { basis: "POSTED_LINE", pick: "HOME +1.5" }, unavailableReasons: [] };
  const v1 = { runLine: { pick: "HOME +1.5" }, unavailableReasons: [] };
  assert.ok(GATED_FAMILIES.has(MLB_RUN_LINE_POSTED_FAMILY));
  assert.equal(POSTED_RUN_LINE_INHERITS_V1_RESTRICTIONS, true, "ending the inheritance is a founder decision, not a default");
  // The rename cannot bypass a v1 pause: v1 BREACHED holds the v2 call.
  const held = pauseMlbRunLine(v2, new Set([MLB_RUN_LINE_FAMILY]));
  assert.equal(held.runLine, null, "a v1 pause holds v2 calls");
  assert.ok(held.pausedReasons.runLine, "the reason is on the record");
  assert.equal(pauseMlbRunLine(v2, new Set([MLB_RUN_LINE_POSTED_FAMILY])).runLine, null, "and v2's own record can pause it");
  assert.ok(pauseMlbRunLine(v2, new Set()).runLine, "nothing BREACHED → the call shows, as v1 calls do today");
  // v1 keeps its own gate; a v2 record never pauses (or lifts) a v1 call.
  assert.equal(pauseMlbRunLine(v1, new Set([MLB_RUN_LINE_FAMILY])).runLine, null);
  assert.ok(pauseMlbRunLine(v1, new Set([MLB_RUN_LINE_POSTED_FAMILY])).runLine);
});

test("FOUNDER SAFEGUARD · a zero-pick v2 family borrows no performance and qualifies for nothing", async () => {
  const { pausedFamiliesFrom } = await import("../../ops/live-record-gate.mjs");
  const now = Date.parse("2026-10-10T12:00:00Z");
  // A scorecard where v1 is BREACHED and v2 has no rows at all (the day v2 ships).
  const card = { generatedAt: "2026-10-10T06:00:00Z", families: [{ id: "mlb_run_line", state: "BREACHED", n: 810 }] };
  const paused = pausedFamiliesFrom(card, now);
  assert.ok(paused.has("mlb_run_line"));
  assert.equal(paused.has("mlb_run_line_posted"), false, "no record is not a verdict");
  assert.equal(pauseMlbRunLine({ runLine: { basis: "POSTED_LINE" }, unavailableReasons: [] }, paused).runLine, null,
    "yet the v2 call is held, through inheritance — an empty record cannot clear it");
  // No product reads the decision engine's run-line call: product legs come from the sportsbook team markets
  // under their own eligibility gates. Pin that, so a future consumer has to be a deliberate change.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const roots = ["src/lib/products", "src/lib/daily-portfolio", "src/lib/parlays", "src/lib/top10", "src/lib/multi-sport"];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of roots.flatMap((r) => walk(path.join(APP, r))).filter((f) => /\.(m?js|ts)$/.test(f) && !/\.test\./.test(f))) {
    const code = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(code, /mlb_run_line_posted|POSTED_LINE|prediction\??\.runLine|decision\??\.runLine/, `${path.relative(APP, f)} consumes the decision run line`);
  }
});
