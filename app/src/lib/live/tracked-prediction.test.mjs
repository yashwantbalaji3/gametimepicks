/**
 * The sport-neutral tracked-prediction contract (§6), and the §5.2 rule it exists to make
 * unbreakable: a live statistic that has passed a threshold is a FACT, not a win.
 *
 * Run: cd app && npx tsx --test src/lib/live/tracked-prediction.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MEASUREMENT_STATES as M,
  FINALITY,
  SETTLEMENT_STATUS,
  MARKET_KIND,
  RAIL_STATE as R,
  RESULT_RAIL_STATES,
  NFL_TRACKING_STATE_TO_MEASUREMENT,
  makeTrackedPrediction,
  railStateOf,
  railGeometry,
  isResultState,
  registerSportAdapter,
  buildTrackedPredictions,
  registeredSports,
} from "./tracked-prediction.mjs";
import { TRACKING_STATES } from "./tracked-forecast.mjs";

const base = (o = {}) => makeTrackedPrediction({
  sport: "nfl",
  eventId: "401872960",
  participantId: "nfl-athlete-4361050",
  marketFamily: "player_reception_yds",
  marketKind: MARKET_KIND.ADDITIVE,
  pregame: { modelPrediction: 62.5, line: 58.5, capturedAt: "2026-09-25T18:25:54Z", sportsbook: "draftkings" },
  live: { measurementState: M.MEASURED, currentValue: 41 },
  ...o,
});

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE RULE. Exhaustive, because a spot check on three cases is how the fourth ships.
 * ───────────────────────────────────────────────────────────────────────────────────────────── */

test("§5.2 · NO combination of live inputs can produce a win, a loss or a push", () => {
  const finalities = [FINALITY.NOT_FINAL, FINALITY.FINAL_PROVISIONAL];
  const measurements = Object.values(M);
  const kinds = Object.values(MARKET_KIND);
  const values = [null, 0, 1, 57, 58.5, 59, 1000, -3];
  const lines = [null, 0.5, 58.5, 100];
  // settlement is deliberately filled in with a WIN, so the only thing keeping it off the rail is
  // the finality check itself — the mutation this test is really aimed at.
  const settlements = [
    { status: SETTLEMENT_STATUS.SETTLED, forecastResult: "HIT" },
    { status: SETTLEMENT_STATUS.SETTLED, forecastResult: "MISS" },
    { status: SETTLEMENT_STATUS.PENDING, forecastResult: null },
  ];

  let checked = 0;
  for (const finality of finalities)
    for (const measurementState of measurements)
      for (const marketKind of kinds)
        for (const currentValue of values)
          for (const line of lines)
            for (const settlement of settlements) {
              const p = base({
                marketKind,
                pregame: { modelPrediction: 62.5, line, capturedAt: "2026-09-25T18:25:54Z" },
                live: { measurementState, currentValue },
                final: { finality },
                settlement,
              });
              const state = railStateOf(p);
              assert.equal(
                isResultState(state), false,
                `finality=${finality} measurement=${measurementState} kind=${marketKind} value=${currentValue} line=${line} settlement=${settlement.forecastResult} → ${state}`,
              );
              checked += 1;
            }
  // A guard that ran zero assertions is the vacuous class this repository keeps rediscovering.
  assert.ok(checked >= 1000, `the sweep must actually cover the space (covered ${checked})`);
});

test("a crossed threshold in play is CURRENTLY_ABOVE_LINE — factual, and not green", () => {
  assert.equal(railStateOf(base({ live: { measurementState: M.MEASURED, currentValue: 90 } })), R.CURRENTLY_ABOVE_LINE);
  assert.equal(railStateOf(base({ live: { measurementState: M.MEASURED, currentValue: 10 } })), R.CURRENTLY_BELOW_LINE);
  assert.equal(railStateOf(base({ live: { measurementState: M.MEASURED, currentValue: 58.5 } })), R.CURRENTLY_AT_LINE);
});

test("an UNDER that is 'already won' in the third quarter has no way to say so", () => {
  /* The Under case §5.2 names explicitly: 4 receiving yards against a 58.5 line with the game live.
     The honest rail is BELOW LINE. Anything in the FINAL_ family here would be a claim the fourth
     quarter can still take away. */
  const p = base({ live: { measurementState: M.MEASURED, currentValue: 4 }, final: { finality: FINALITY.NOT_FINAL } });
  assert.equal(railStateOf(p), R.CURRENTLY_BELOW_LINE);
  assert.equal(isResultState(railStateOf(p)), false);
});

test("FINAL_PROVISIONAL is not a settlement — a provider 'Final' still shows a measurement", () => {
  const p = base({
    live: { measurementState: M.MEASURED, currentValue: 91 },
    final: { finality: FINALITY.FINAL_PROVISIONAL, actualValue: 91 },
    settlement: { status: SETTLEMENT_STATUS.SETTLED, forecastResult: "HIT" },
  });
  assert.equal(railStateOf(p), R.CURRENTLY_ABOVE_LINE, "provisional must not spend the result");
});

test("only FINAL_CANONICAL spells an outcome, and each outcome maps once", () => {
  const at = (forecastResult, status = SETTLEMENT_STATUS.SETTLED) => railStateOf(base({
    final: { finality: FINALITY.FINAL_CANONICAL, actualValue: 91 },
    settlement: { status, forecastResult },
  }));
  assert.equal(at("HIT"), R.FINAL_WIN);
  assert.equal(at("MISS"), R.FINAL_LOSS);
  assert.equal(at("PUSH"), R.FINAL_PUSH);
  assert.equal(at("VOID"), R.FINAL_VOID);
  assert.equal(at("NO_MEASUREMENT"), R.FINAL_NO_MEASUREMENT);
  // Canonical but ungraded is an honest unknown, NEVER a loss.
  assert.equal(at(null), R.FINAL_NO_MEASUREMENT);
  assert.equal(at(null, SETTLEMENT_STATUS.UNGRADED), R.FINAL_NO_MEASUREMENT);
  assert.equal(at("HIT", SETTLEMENT_STATUS.VOID), R.FINAL_VOID, "void outranks a graded result");
});

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * MISSING IS NOT ZERO
 * ───────────────────────────────────────────────────────────────────────────────────────────── */

test("§3 · a feed carrying no row is NOT_YET_RECORDED for a binary market, never a zero", () => {
  const td = (o) => base({ marketFamily: "anytime_td", marketKind: MARKET_KIND.BINARY, ...o });
  assert.equal(railStateOf(td({ live: { measurementState: M.NO_MEASUREMENT, currentValue: null } })), R.NOT_YET_RECORDED);
  assert.equal(railStateOf(td({ live: { measurementState: M.MEASURED, currentValue: 0 } })), R.NOT_YET_RECORDED);
  assert.equal(railStateOf(td({ live: { measurementState: M.MEASURED, currentValue: 1 } })), R.RECORDED);
  assert.equal(railStateOf(td({ live: { measurementState: M.MEASURED, currentValue: 3 } })), R.RECORDED);
});

test("§3 · a value is dropped unless its measurement state may bear one", () => {
  // A caller passing a number alongside NO_MEASUREMENT must not get that number back.
  const p = makeTrackedPrediction({
    sport: "mlb", eventId: "e", marketFamily: "batter_hits", marketKind: MARKET_KIND.ADDITIVE,
    live: { measurementState: M.NO_MEASUREMENT, currentValue: 2 },
  });
  assert.equal(p.live.currentValue, null, "a value may not survive a state that says there is none");

  const stale = makeTrackedPrediction({
    sport: "mlb", eventId: "e", marketFamily: "batter_hits", marketKind: MARKET_KIND.ADDITIVE,
    live: { measurementState: M.SOURCE_STALE, currentValue: 2 },
  });
  assert.equal(stale.live.currentValue, 2, "a stale reading is still a reading, and is labelled");
  assert.equal(railStateOf(stale), R.PROVIDER_DELAY);
});

test("an unstamped pregame block is PRE_GAME_SNAPSHOT_MISSING, not PRE", () => {
  const awaiting = { measurementState: M.AWAITING_EVENT, currentValue: null };
  assert.equal(railStateOf(base({ live: awaiting })), R.PRE);
  assert.equal(
    railStateOf(base({ live: awaiting, pregame: { modelPrediction: 62.5, line: 58.5, capturedAt: null } })),
    R.PRE_GAME_SNAPSHOT_MISSING,
  );
});

test("§3 · with NO purchased line, the model's median may not be dressed up as one", () => {
  /*
   * ⚠ THE DEFECT THIS PINS, and I wrote it. The first cut of `railStateOf` read
   * `pregame.line ?? pregame.modelPrediction` and returned CURRENTLY_ABOVE_LINE. GameTime buys no
   * NFL player-prop lines — `tracked-forecast.mjs` says so in its own header — so on every NFL row
   * that fallback would have invented a sportsbook line out of a model output and labelled a live
   * yard count as beating it. A band gets band words, and a missing line stays missing.
   */
  const band = (currentValue) => railStateOf(base({
    pregame: { modelPrediction: 62.5, line: null, modelRange: { low: 41, high: 88 }, capturedAt: "2026-09-25T18:25:54Z" },
    live: { measurementState: M.MEASURED, currentValue },
  }));
  assert.equal(band(95), R.CURRENTLY_ABOVE_RANGE);
  assert.equal(band(60), R.CURRENTLY_INSIDE_RANGE);
  assert.equal(band(12), R.CURRENTLY_BELOW_RANGE);

  // And none of them is the LINE vocabulary, which asserts a market number we do not hold.
  for (const v of [95, 60, 12, 62, 63]) {
    const state = band(v);
    assert.equal(/_LINE$/.test(state), false, `${v} produced ${state}, which claims a line we never bought`);
  }

  // Neither a line nor a band: a measurement with nothing published to compare it to.
  assert.equal(railStateOf(base({
    pregame: { modelPrediction: null, line: null, capturedAt: "2026-09-25T18:25:54Z" },
    live: { measurementState: M.MEASURED, currentValue: 41 },
  })), R.NO_MEASUREMENT);
});

test("a purchased line still gets the line vocabulary, and outranks the band", () => {
  const p = base({
    pregame: { line: 58.5, modelPrediction: 62.5, modelRange: { low: 41, high: 88 }, capturedAt: "2026-09-25T18:25:54Z" },
    live: { measurementState: M.MEASURED, currentValue: 70 },
  });
  // 70 is above the 58.5 line and INSIDE the 41–88 band. The purchased number is the one that counts.
  assert.equal(railStateOf(p), R.CURRENTLY_ABOVE_LINE);
});

test("§9 · a TERMINAL market in play is LIVE_UNRESOLVED and nothing cleverer", () => {
  const bout = base({
    sport: "ufc", participantType: "FIGHTER", marketFamily: "fight_winner",
    marketKind: MARKET_KIND.TERMINAL,
    live: { measurementState: M.MEASURED, currentValue: 1, periodState: "R2" },
  });
  assert.equal(railStateOf(bout), R.LIVE_UNRESOLVED);
});

test("§13 · modelProbability is null unless given, and a market price cannot occupy that field", () => {
  const p = base();
  assert.equal(p.pregame.modelProbability, null);
  // The field exists and accepts a real one; what the contract forbids is SUBSTITUTION, which is a
  // producer rule. What it enforces here is that absence stays absent.
  assert.equal(makeTrackedPrediction({ sport: "nfl", eventId: "e", marketFamily: "m",
    pregame: { modelProbability: 0.58 } }).pregame.modelProbability, 0.58);
});

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * GEOMETRY · arithmetic over two public numbers, and nothing more
 * ───────────────────────────────────────────────────────────────────────────────────────────── */

test("§5.2 · the rail handles values beyond the threshold without reading as complete at the line", () => {
  const g = (currentValue, line) => railGeometry({ currentValue, line });
  const atLine = g(58.5, 58.5);
  assert.ok(atLine.valueFraction < 1, "crossing the line must not fill the rail");
  assert.equal(atLine.beyondTarget, false);

  const beyond = g(117, 58.5);
  assert.equal(beyond.beyondTarget, true);
  assert.equal(beyond.ratio, 2);
  assert.ok(beyond.valueFraction <= 1 && beyond.valueFraction > atLine.valueFraction);

  // Absurd overflow stays on the rail rather than overflowing the layout.
  assert.ok(g(100000, 58.5).valueFraction <= 1);
  // Nothing to draw is null, not a zero-length bar that looks like a measured zero.
  assert.equal(g(null, 58.5), null);
  assert.equal(g(41, null), null);
  assert.equal(g(41, 0), null);
});

test("a binary rail is 0 or 1 and never interpolates", () => {
  const g = (v) => railGeometry({ currentValue: v, line: null, marketKind: MARKET_KIND.BINARY });
  assert.equal(g(0).valueFraction, 0);
  assert.equal(g(1).valueFraction, 1);
  assert.equal(g(4).valueFraction, 1);
  assert.equal(g(null), null);
});

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE ADAPTER BOUNDARY
 * ───────────────────────────────────────────────────────────────────────────────────────────── */

test("§6 · an unregistered sport refuses; it does not borrow another sport's rules", () => {
  const out = buildTrackedPredictions("cricket", {});
  assert.deepEqual(out.rows, []);
  assert.equal(out.refused, "SPORT_NOT_REGISTERED");
});

test("§6 · a registered adapter supplies the rows and the shape stays shared", () => {
  registerSportAdapter({
    sport: "test-sport",
    rows: () => [base({ sport: "test-sport" })],
  });
  assert.ok(registeredSports().includes("test-sport"));
  const out = buildTrackedPredictions("test-sport", {});
  assert.equal(out.rows.length, 1);
  assert.equal(out.counts[M.MEASURED], 1);
  assert.equal(out.refused, null);
});

test("the NFL vocabulary maps onto this one exactly — no member is lost or invented", () => {
  const nflMembers = Object.values(TRACKING_STATES).sort();
  const mapped = Object.keys(NFL_TRACKING_STATE_TO_MEASUREMENT).sort();
  assert.deepEqual(mapped, nflMembers, "every NFL tracking state must have a stated translation");
  for (const [, v] of Object.entries(NFL_TRACKING_STATE_TO_MEASUREMENT)) {
    assert.ok(Object.values(M).includes(v), `${v} is not a measurement state`);
  }
});

test("the contract runs in both runtimes — no node import may appear in it", () => {
  /* The gateway and the browser both load this file. `contract.mjs` records the same constraint;
     a behavioural test cannot catch it because the test runner is always Node. */
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/live/tracked-prediction.mjs"), "utf8");
  assert.equal(/from\s+"node:/.test(src), false, "tracked-prediction.mjs must not import a node builtin");
  assert.equal(/require\(/.test(src), false);
});

test("this module never writes and never settles — enforced by absence", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/live/tracked-prediction.mjs"), "utf8");
  assert.equal(/writeFile|fetch\(/.test(src), false, "a contract that fetches or writes is not a contract");
});
