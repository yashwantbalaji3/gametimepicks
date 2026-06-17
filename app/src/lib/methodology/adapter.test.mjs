/**
 * Methodology adapter contract — proves the wiring is leakage-safe and honest:
 *   1. target-event data is excluded (leakage gate rejects windows that reach the event)
 *   2. stale critical inputs lower confidence
 *   3. missing critical inputs can force No Bet
 *   4. planned/not_available registry features are NOT used as live inputs
 *   5. market-aware and no-market paths remain separable
 *   6. runMethodology emits the full PredictionOutput shape (leakage/confidence/risk/factors/flags)
 *
 * Imports the .ts adapter directly under tsx (projection-framework is pure + import-free; the only
 * @/-aliased import in the chain is type-only in types.ts and erased at runtime).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adaptMlbLean,
  runMethodology,
  buildMlbSnapshot,
  buildRollingWindows,
  liveFeatureNames,
  isLiveInput,
  surfacedContextFlags,
  supportedSports,
} from "./adapter.ts";
import { registryFor } from "./sport-feature-groups.ts";

const SPORTS = ["MLB", "NBA", "UFC", "WORLD_CUP"];

// A realistic, leakage-clean board: generated ~4h BEFORE first pitch, recent games all pre-event.
const BOARD = {
  generatedFor: "2026-06-16",
  date: "2026-06-16",
  generatedAt: "2026-06-16T18:00:00+00:00",
  oddsSource: "the_odds_api",
};

const PITCHER_LEAN = {
  id: "g1-Ace-pitcher_strikeouts-6.5",
  gameId: "g1",
  commenceTime: "2026-06-16T23:00:00Z", // after generatedAt → no leakage
  playerName: "Ace Carter",
  playerRole: "pitcher",
  marketKey: "pitcher_strikeouts",
  marketLabel: "Strikeouts",
  line: 6.5,
  oddsOver: -120,
  oddsUnder: 100,
  projection: 7.4,
  sigma: 1.5,
  samples: 20,
  recentSeries: [7, 8, 6, 9, 7, 8, 6, 7, 9, 8, 7, 6, 8, 7, 9, 7, 8, 6, 7, 8],
  recentGames: [
    { date: "2026-05-01", value: 7 },
    { date: "2026-06-10", value: 8 },
  ],
  lean: "Over",
  modelProbOver: 0.62,
  modelProbUnder: 0.38,
  riskFlags: [],
};

// ── 1. target-event data is excluded ─────────────────────────────────────────────────────────────
test("accepts a clean pre-event lean and builds a target-excluding rolling window", () => {
  const { output, leakage, rollingWindows } = adaptMlbLean(PITCHER_LEAN, BOARD);
  assert.equal(leakage.passed, true, "clean lean passes leakage");
  assert.equal(output.leakageValidationPassed, true);
  assert.ok(rollingWindows.length >= 1);
  for (const w of rollingWindows) {
    assert.equal(w.includesTargetEventFlag, false, "window must exclude the target event");
    assert.ok(Date.parse(w.windowEndTime) <= Date.parse(PITCHER_LEAN.commenceTime), "window ends before the event");
  }
});

test("rejects a lean whose rolling window reaches past the event start (leakage)", () => {
  // A recent game dated AFTER first pitch would mean the window includes the target → must fail.
  const leaky = { ...PITCHER_LEAN, recentGames: [{ date: "2026-05-01", value: 7 }, { date: "2026-06-17", value: 8 }] };
  const { output, leakage } = adaptMlbLean(leaky, BOARD);
  assert.equal(leakage.passed, false, "window past the event must fail leakage");
  assert.equal(output.leakageValidationPassed, false);
  assert.equal(output.confidenceScore, "No Bet", "a leaking prediction is forced to No Bet");
  assert.ok(output.missingDataFlags.some((f) => f.field === "leakage" && f.critical));
});

test("rejects a prediction made at/after the event start (leakage)", () => {
  const started = { ...PITCHER_LEAN, commenceTime: "2026-06-16T17:00:00Z" }; // before generatedAt 18:00
  const { leakage } = adaptMlbLean(started, BOARD);
  assert.equal(leakage.passed, false, "prediction after kickoff must fail");
});

test("never reads post-event result fields — output is exactly the PredictionOutput schema", () => {
  // Even if the board lean carries settled/result junk, the adapter must ignore it.
  const settled = { ...PITCHER_LEAN, result: "win", actualStrikeouts: 11, finalScore: "5-3", graded: true };
  const { output } = adaptMlbLean(settled, BOARD);
  const allowed = new Set([
    "eventId", "sport", "predictionTarget", "participant", "line", "marketOdds",
    "marketImpliedProbability", "modelProjection", "modelProbability", "edge",
    "confidenceScore", "riskScore", "dataQuality", "modelMode", "topPositiveFactors",
    "topNegativeFactors", "missingDataFlags", "staleDataFlags", "smallSampleFlags",
    "leakageValidationPassed",
  ]);
  for (const k of Object.keys(output)) assert.ok(allowed.has(k), `unexpected output field leaked: ${k}`);
  // projection comes from the model input, never from a settled actual.
  assert.equal(output.modelProjection, 7.4);
});

// ── 2. stale critical inputs lower confidence ──────────────────────────────────────────────────
test("stale market snapshot lowers confidence and adds a stale flag", () => {
  const fresh = adaptMlbLean(PITCHER_LEAN, BOARD).output;
  // Odds captured ~10h before the prediction → far beyond the 120-min market threshold.
  const staleLean = { ...PITCHER_LEAN, marketSnapshotTime: "2026-06-16T08:00:00+00:00" };
  const stale = adaptMlbLean(staleLean, BOARD).output;
  assert.ok(stale.staleDataFlags.some((f) => f.field === "market"), "stale market flag present");
  assert.ok(stale.staleDataFlags.length > fresh.staleDataFlags.length, "more stale flags than the fresh case");
  const rank = { "No Bet": 0, Low: 1, Medium: 2, High: 3 };
  assert.ok(rank[stale.confidenceScore] <= rank[fresh.confidenceScore], "stale confidence is not higher than fresh");
});

// ── 3. missing critical inputs can force No Bet ────────────────────────────────────────────────
test("a lean with no model projection is forced to No Bet (missing critical input)", () => {
  const insufficient = { ...PITCHER_LEAN, projection: null, modelProbOver: null, modelProbUnder: null, samples: 0 };
  const { output } = adaptMlbLean(insufficient, BOARD);
  assert.equal(output.confidenceScore, "No Bet");
  assert.ok(output.missingDataFlags.some((f) => f.field === "modelProbability" && f.critical));
});

test("market-aware lean with no market price flags a critical miss → No Bet", () => {
  const noOdds = { ...PITCHER_LEAN, oddsOver: null, oddsUnder: null };
  const { output } = adaptMlbLean(noOdds, BOARD, { marketAware: true });
  assert.equal(output.marketImpliedProbability, null);
  assert.equal(output.confidenceScore, "No Bet");
  assert.ok(output.missingDataFlags.some((f) => f.field === "marketOdds" && f.critical));
});

// ── 4. planned/not_available features are NOT used as live inputs ───────────────────────────────
test("live inputs are implemented-only; planned/not_available are excluded and surfaced", () => {
  for (const sport of SPORTS) {
    const live = new Set(liveFeatureNames(sport));
    const reg = registryFor(sport);
    for (const f of reg.features) {
      if (f.status === "implemented") {
        assert.ok(live.has(f.name), `${sport}:${f.name} implemented → must be live`);
        assert.equal(isLiveInput(sport, f.name), true);
      } else {
        assert.ok(!live.has(f.name), `${sport}:${f.name} (${f.status}) must NOT be a live input`);
        assert.equal(isLiveInput(sport, f.name), false);
      }
    }
    // Every planned/not_available feature is surfaced as missing/planned context.
    const surfaced = new Set(surfacedContextFlags(sport).map((m) => m.field));
    for (const f of reg.features) {
      if (f.status === "planned" || f.status === "not_available") {
        assert.ok(surfaced.has(f.name), `${sport}:${f.name} must be surfaced as context`);
      }
    }
  }
});

test("MLB output surfaces planned/not_available registry features as context flags", () => {
  const { output } = adaptMlbLean(PITCHER_LEAN, BOARD);
  const planned = output.missingDataFlags.filter((f) => /planned|not_available/.test(f.reason)).map((f) => f.field);
  assert.ok(planned.includes("home_plate_umpire_tendency"), "umpire (not_available) surfaced");
  assert.ok(planned.includes("pitch_count_projection"), "pitch count (planned) surfaced");
});

// ── 5. market-aware and no-market paths remain separable ───────────────────────────────────────
test("market-aware vs no-market paths are separable", () => {
  const mkt = adaptMlbLean(PITCHER_LEAN, BOARD, { marketAware: true }).output;
  const nom = adaptMlbLean(PITCHER_LEAN, BOARD, { marketAware: false }).output;

  assert.equal(mkt.modelMode, "market_aware_model");
  assert.notEqual(mkt.marketImpliedProbability, null);
  assert.notEqual(mkt.edge, null);
  assert.notEqual(mkt.marketOdds, null);

  assert.equal(nom.modelMode, "no_market_model");
  assert.equal(nom.marketImpliedProbability, null);
  assert.equal(nom.edge, null);
  assert.equal(nom.marketOdds, null);

  // The model projection/probability is identical and present in BOTH paths.
  assert.equal(mkt.modelProbability, nom.modelProbability);
  assert.notEqual(nom.modelProbability, null);
});

// ── 6. runMethodology output shape ──────────────────────────────────────────────────────────────
test("runMethodology splits on leakage and emits full PredictionOutput rows", () => {
  const board = { ...BOARD, leans: [PITCHER_LEAN, { ...PITCHER_LEAN, id: "g1-b", playerRole: "batter", playerName: "Bat Jones", marketKey: "batter_hits", marketLabel: "Hits", line: 0.5, samples: 60 }] };
  const res = runMethodology(board, "MLB", { marketAware: true });
  assert.equal(res.sport, "MLB");
  assert.equal(res.modelMode, "market_aware_model");
  assert.equal(res.accepted.length + res.rejectedByLeakage.length, 2);
  for (const { output } of res.accepted) {
    assert.ok(["High", "Medium", "Low", "No Bet"].includes(output.confidenceScore));
    assert.ok(typeof output.riskScore === "number" && output.riskScore >= 0 && output.riskScore <= 1);
    assert.equal(typeof output.leakageValidationPassed, "boolean");
    assert.ok(Array.isArray(output.topPositiveFactors));
    assert.ok(Array.isArray(output.topNegativeFactors));
    assert.ok(Array.isArray(output.missingDataFlags));
    assert.ok(Array.isArray(output.staleDataFlags));
    assert.ok(Array.isArray(output.smallSampleFlags));
    assert.ok(["A", "B", "C", "D", "unavailable"].includes(output.dataQuality));
  }
  // The batter (unconfirmed lineup) carries a DNP/lineup risk that the pitcher does not.
  const batter = res.accepted.concat(res.rejectedByLeakage).find((x) => x.output.participant === "Bat Jones");
  assert.ok(batter.output.missingDataFlags.some((f) => f.field === "confirmed_lineup"));
});

test("all four sports are wired; supportedSports is explicit", () => {
  assert.deepEqual(supportedSports().sort(), ["MLB", "NBA", "UFC", "WORLD_CUP"]);
});

test("buildMlbSnapshot records prediction/event/feature times within the leakage rule", () => {
  const m = buildMlbSnapshot(PITCHER_LEAN, BOARD);
  assert.ok(Date.parse(m.featureSnapshotTime) <= Date.parse(m.predictionTime));
  assert.ok(Date.parse(m.predictionTime) < Date.parse(m.eventStartTime));
  // a batter lineup is not modeled → null (becomes a missing flag), never a guessed time
  const batterSnap = buildMlbSnapshot({ ...PITCHER_LEAN, playerRole: "batter" }, BOARD);
  assert.equal(batterSnap.lineupSnapshotTime, null);
});
