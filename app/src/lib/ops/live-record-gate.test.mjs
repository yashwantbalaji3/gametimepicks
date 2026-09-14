/**
 * The live-record gate pauses a BREACHED call's probability everywhere it renders, keeps the rest untouched,
 * and never pauses on a verdict it did not measure (absent or stale scorecard).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pausedFamiliesFrom, pauseMlbTotal, MLB_TOTAL_FAMILY, PAUSED_TOTAL_SHORT } from "./live-record-gate.mjs";

const NOW = Date.parse("2026-09-15T12:00:00Z");
const scorecard = (state, generatedAt = "2026-09-15T02:00:00Z") => ({ generatedAt, families: [{ id: "mlb_total", state }, { id: "mlb_moneyline", state: "WATCH" }] });
const decision = { homeTeam: "SF", total: { line: 8.5, pick: "OVER", overProbability: 0.58, underProbability: 0.4, pushProbability: 0.02, simulationMedian: 9, marketImpliedOver: 0.5, strengthLabel: "LEAN" }, moneyline: { team: "SF", simulationProbability: 0.6 } };

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

test("SOURCE PIN · every MLB total surface goes through the gate", () => {
  const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  assert.match(src("src/lib/game-detail.ts"), /pauseMlbTotal\(buildGamePredictionDecision\(fg, playerPicks\), livePauses\)/, "the one decision the /today table, game report and simulator read");
  assert.match(src("src/lib/top-reads.ts"), /MLB_TOTAL_FAMILY/, "the homepage strongest-reads list");
});
