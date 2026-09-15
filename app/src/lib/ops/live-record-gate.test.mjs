/**
 * The live-record gate pauses a BREACHED call's probability everywhere it renders, keeps the rest untouched,
 * and never pauses on a verdict it did not measure (absent or stale scorecard).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  pausedFamiliesFrom, pauseMlbTotal, pauseMlbMoneyline, pauseMlbRunLine, pauseMlbMarkets,
  MLB_TOTAL_FAMILY, MLB_MONEYLINE_FAMILY, MLB_RUN_LINE_FAMILY, PAUSED_TOTAL_SHORT, PAUSED_MONEYLINE_SHORT,
} from "./live-record-gate.mjs";
import { compactPredictionLine } from "../mlb/prediction/summary.ts";
import { buildTodayPredictionRows } from "../mlb/prediction/slate.ts";

const NOW = Date.parse("2026-09-15T12:00:00Z");
const scorecard = (state, generatedAt = "2026-09-15T02:00:00Z") => ({ generatedAt, families: [{ id: "mlb_total", state }, { id: "mlb_moneyline", state: "WATCH" }] });
const decision = {
  homeTeam: "SF", awayTeam: "LAA",
  predictedWinner: { side: "home", team: "SF" },
  projectedScore: { away: 3, home: 4, label: "median" },
  total: { line: 8.5, pick: "OVER", overProbability: 0.58, underProbability: 0.4, pushProbability: 0.02, simulationMedian: 9, marketImpliedOver: 0.5, strengthLabel: "LEAN" },
  moneyline: { side: "home", team: "SF", simulationProbability: 0.6, marketImpliedProbability: 0.55, marketAgreement: "ALIGNED", strengthLabel: "LEAN" },
  runLine: { favorite: "home", line: 1.5, pick: "LAA +1.5", pickSide: "away", pickLine: 1.5, coverProbability: 0.62, opposingCoverProbability: 0.38, pushProbability: 0, strengthLabel: "LEAN" },
  unavailableReasons: [],
};

test("only BREACHED families pause; WATCH does not", () => {
  assert.deepEqual([...pausedFamiliesFrom(scorecard("BREACHED"), NOW)], ["mlb_total"]);
  assert.equal(pausedFamiliesFrom(scorecard("WATCH"), NOW).size, 0);
});

test("an absent, stale or future-dated scorecard pauses nothing", () => {
  assert.equal(pausedFamiliesFrom(null, NOW).size, 0);
  assert.equal(pausedFamiliesFrom(scorecard("BREACHED", "2026-09-10T02:00:00Z"), NOW).size, 0, "older than 72h");
  assert.equal(pausedFamiliesFrom(scorecard("BREACHED", "2026-09-16T02:00:00Z"), NOW).size, 0, "from the future");
});

test("a paused total renders as UNAVAILABLE with its reason; moneyline and simulation evidence untouched", () => {
  const out = pauseMlbTotal(decision, new Set([MLB_TOTAL_FAMILY]));
  assert.equal(out.total.pick, "UNAVAILABLE");
  assert.equal(out.total.overProbability, null);
  assert.equal(out.total.underProbability, null);
  assert.equal(out.total.unavailableReason, PAUSED_TOTAL_SHORT);
  assert.match(out.total.pausedReason, /coin flip/);
  assert.equal(out.total.simulationMedian, 9, "the simulated runs stay — they are evidence, not the call");
  assert.equal(out.moneyline, decision.moneyline);
  assert.equal(decision.total.pick, "OVER", "the input is never mutated");
  assert.equal(pauseMlbTotal(decision, new Set()), decision, "no pause, same object");
});

test("a paused moneyline withdraws the winner call AND the predicted winner; the projected score stays as evidence", () => {
  const out = pauseMlbMoneyline(decision, new Set([MLB_MONEYLINE_FAMILY]));
  assert.equal(out.moneyline, null);
  assert.equal(out.predictedWinner, null, "every surface derives the winner headline from predictedWinner — a pause that left it would publish the call in prose");
  assert.deepEqual(out.projectedScore, decision.projectedScore, "the simulated score is evidence, not the call");
  assert.equal(out.total, decision.total);
  assert.equal(out.runLine, decision.runLine);
  assert.match(out.pausedReasons.moneyline, /winner call .* coin flip/);
  assert.ok(out.unavailableReasons.some((r) => r.startsWith("Moneyline: ")));
  assert.equal(decision.moneyline.team, "SF", "the input is never mutated");
  assert.equal(pauseMlbMoneyline(decision, new Set([MLB_TOTAL_FAMILY])), decision, "a different family does not pause it");
});

test("a paused run line withdraws the cover call and records why", () => {
  const out = pauseMlbRunLine(decision, new Set([MLB_RUN_LINE_FAMILY]));
  assert.equal(out.runLine, null);
  assert.match(out.pausedReasons.runLine, /run-line call .* coin flip/);
  assert.equal(out.moneyline, decision.moneyline);
  assert.equal(out.predictedWinner, decision.predictedWinner);
});

test("pauseMlbMarkets applies every BREACHED family from one synthetic scorecard, and nothing without one", () => {
  const all = { generatedAt: "2026-09-15T02:00:00Z", families: [{ id: "mlb_total", state: "BREACHED" }, { id: "mlb_moneyline", state: "BREACHED" }, { id: "mlb_run_line", state: "BREACHED" }] };
  const out = pauseMlbMarkets(decision, pausedFamiliesFrom(all, NOW));
  assert.equal(out.total.pick, "UNAVAILABLE");
  assert.equal(out.moneyline, null);
  assert.equal(out.runLine, null);
  assert.deepEqual(Object.keys(out.pausedReasons).sort(), ["moneyline", "runLine"]);
  assert.equal(pauseMlbMarkets(decision, pausedFamiliesFrom(scorecard("WATCH"), NOW)), decision, "WATCH pauses nothing, same object");
});

test("the compact line and the /today row say paused, never a silent dash, and keep the calls that still stand", () => {
  const paused = pauseMlbMarkets(decision, new Set([MLB_MONEYLINE_FAMILY, MLB_RUN_LINE_FAMILY]));
  assert.equal(compactPredictionLine(paused), "OVER 8.5", "the total still stands; the paused calls are simply absent");
  assert.equal(compactPredictionLine({ ...decision, predictedWinner: null, moneyline: null }), null, "no winner and no pause = no directional prediction, as before");
  const game = { gamePk: 1, slug: "s", href: "/g", homeTeam: "SF", awayTeam: "LAA", homeTeamName: "Giants", awayTeamName: "Angels", homeLogo: null, awayLogo: null, firstPitchIso: "2026-09-15T20:00:00Z", prediction: { ...paused, status: "ready" } };
  const [row] = buildTodayPredictionRows([game]);
  assert.equal(row.moneyline, null);
  assert.equal(row.moneylinePaused, true);
  assert.equal(row.runLinePaused, true);
  assert.equal(row.totalPaused, undefined);
  assert.deepEqual(row.score, { away: 3, home: 4 });
});

test("SOURCE PIN · every MLB game-market surface goes through the gate", () => {
  const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  assert.match(src("src/lib/game-detail.ts"), /pauseMlbMarkets\(buildGamePredictionDecision\(fg, playerPicks\), livePauses\)/, "the one decision the /today table, game report and simulator read");
  assert.match(src("src/lib/top-reads.ts"), /MLB_TOTAL_FAMILY/, "the homepage strongest-reads list gates totals");
  assert.match(src("src/lib/top-reads.ts"), /MLB_MONEYLINE_FAMILY/, "and winner calls");
  assert.match(src("src/components/today/game-predictions.tsx"), /moneylinePaused \? <Paused/, "the /today moneyline column says paused");
  assert.match(src("src/components/today/game-predictions.tsx"), /runLinePaused \? <Paused/, "the /today run-line column says paused");
  assert.match(src("src/components/game/mlb-full-game-report.tsx"), /PAUSED_MONEYLINE_SHORT/, "the report hero's moneyline card");
  assert.match(src("src/components/game/mlb-full-game-report.tsx"), /PAUSED_RUN_LINE_SHORT/, "the report hero's run-line card");
  assert.match(src("src/lib/simulate/presentation/mlb.ts"), /pausedReasons\?\.moneyline/, "the simulator's outcome chapter");
  assert.match(src("src/lib/simulate/presentation/mlb.ts"), /pausedReasons\?\.runLine/, "the simulator's margin chapter");
  assert.match(src("src/components/entity/simulation-card.tsx"), /pausedReasons\?\.moneyline/, "the entity simulation card");
});

test("the PUBLISHED prediction artifacts never carry a pause — grading reads them, and a paused ledger could never lift its own pause", () => {
  const dir = path.join(process.cwd(), "public", "data", "mlb", "predictions");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-3) : [];
  assert.ok(files.length, "at least one published prediction artifact");
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    assert.doesNotMatch(text, /pausedReason/, `${f} carries a pause — the gate must stay at the reader hinge (game-detail.ts), never in the generator`);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "scripts/generate-mlb-predictions.mjs"), "utf8"), /live-record-gate/, "the generator does not import the gate");
});
