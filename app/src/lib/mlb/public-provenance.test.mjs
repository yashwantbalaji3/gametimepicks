/**
 * Tests for the MLB public provenance/transparency view-model. Covers pregame + post-start + missing capture,
 * timezone + DST formatting, the completeness-status model (no pending-labeled-confirmed, no post-start-as-pregame),
 * and the market-vs-sim explanation (no forbidden vocabulary). Run: npx tsx --test src/lib/mlb/public-provenance.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildTimestamps, completenessStatus, buildExplanation, formatEtTime, humanDuration, COMPLETENESS_LABEL, distributionBand } from "./public-provenance.ts";

const game = (over = {}) => ({ status: "ready", marketSnapshot: { capturedAt: "2026-07-22T15:22:00Z" }, freshness: { generatedAt: "2026-07-22T19:13:00Z" }, unavailableModules: [], ...over });
const FIRST_PITCH = "2026-07-22T17:06:00Z"; // 1h 44m after capture

test("1 · pregame capture ⇒ 'captured Nh Nm before first pitch' + capturedPregame true", () => {
  const ts = buildTimestamps(game(), FIRST_PITCH);
  assert.equal(ts.capturedPregame, true);
  assert.equal(ts.minutesBeforeFirstPitch, 104);
  assert.match(ts.captureLabel, /1h 44m before first pitch/);
});

test("2 · post-start capture is NEVER labelled pregame", () => {
  const ts = buildTimestamps(game({ marketSnapshot: { capturedAt: "2026-07-22T17:30:00Z" } }), FIRST_PITCH);
  assert.equal(ts.capturedPregame, false);
  assert.match(ts.captureLabel, /AFTER first pitch/);
  assert.doesNotMatch(ts.captureLabel, /before first pitch/);
});

test("3 · missing capture time ⇒ 'Capture time unavailable' (distinct from a real 0)", () => {
  const ts = buildTimestamps(game({ marketSnapshot: { capturedAt: null }, freshness: {} }), FIRST_PITCH);
  assert.equal(ts.marketCapturedAt, null);
  assert.equal(ts.minutesBeforeFirstPitch, null);
  assert.equal(ts.captureLabel, "Capture time unavailable");
});

test("4 · postponed / missing first pitch ⇒ shows capture time, no bogus duration", () => {
  const ts = buildTimestamps(game(), null);
  assert.equal(ts.minutesBeforeFirstPitch, null);
  assert.equal(ts.capturedPregame, null);
  assert.match(ts.captureLabel, /Market captured/);
});

test("5 · ET formatting + DST: a July (EDT) and January (EST) instant both render *ET, offset applied", () => {
  const summer = formatEtTime("2026-07-22T19:13:00Z"); // 15:13 EDT
  const winter = formatEtTime("2026-01-15T19:13:00Z"); // 14:13 EST
  assert.match(summer, /3:13 PM ET/);
  assert.match(winter, /2:13 PM ET/, "DST offset differs by an hour");
  assert.equal(formatEtTime(null), null);
  assert.equal(humanDuration(104), "1h 44m");
  assert.equal(humanDuration(12), "12m");
});

test("6 · completeness: a batter prop is LINEUP_PENDING (never 'confirmed')", () => {
  const ts = buildTimestamps(game(), FIRST_PITCH);
  const st = completenessStatus(game(), { market: "batter_hits", marketProbability: 0.5 }, ts);
  assert.equal(st, "LINEUP_PENDING");
  assert.doesNotMatch(COMPLETENESS_LABEL[st], /confirmed/i);
});

test("7 · completeness: missing market ⇒ MARKET_PENDING (not 'complete'); started game ⇒ GAME_STARTED", () => {
  const ts = buildTimestamps(game(), FIRST_PITCH);
  assert.equal(completenessStatus(game(), { market: "pitcher_strikeouts", marketProbability: null }, ts), "MARKET_PENDING");
  assert.equal(completenessStatus(game({ status: "live" }), { market: "pitcher_strikeouts", marketProbability: 0.5 }, ts), "GAME_STARTED");
});

test("8 · completeness: a post-first-pitch capture forces GAME_STARTED (never labelled pregame-complete)", () => {
  const ts = buildTimestamps(game({ marketSnapshot: { capturedAt: "2026-07-22T18:00:00Z" } }), FIRST_PITCH);
  assert.equal(completenessStatus(game(), { market: "pitcher_strikeouts", marketProbability: 0.5 }, ts), "GAME_STARTED");
});

test("9 · a pitcher prop with market + pregame capture + no missing modules ⇒ FULLY_SUPPORTED", () => {
  const ts = buildTimestamps(game(), FIRST_PITCH);
  assert.equal(completenessStatus(game(), { market: "pitcher_strikeouts", marketProbability: 0.55 }, ts), "FULLY_SUPPORTED");
});

test("10 · explanation is a neutral difference with NO forbidden vocabulary + no research-eligibility leak", () => {
  const ts = buildTimestamps(game(), FIRST_PITCH);
  const pick = { market: "pitcher_strikeouts", modelProbability: 0.66, marketProbability: 0.45, reasonBullets: ["Strong recent K rate", "Weak opposing lineup"] };
  const ex = buildExplanation(pick, ts, "FULLY_SUPPORTED");
  assert.equal(ex.differencePts, 21);
  assert.ok(ex.differencePts >= 0, "difference is a magnitude, never signed 'edge'");
  assert.deepEqual(ex.strongestAvailableFactors, ["Strong recent K rate", "Weak opposing lineup"]);
  const scan = JSON.stringify(ex).toLowerCase();
  for (const t of ["\"edge\"", "value pick", "lock", "best bet", "profitable", "market mistake", "researcheligible", "data/internal"]) assert.ok(!scan.includes(t), `no "${t}"`);
  assert.match(ex.limitationText, /not a claim the simulation is more accurate/);
});

test("11 · explanation missingFactors reflects the completeness status honestly", () => {
  const ts = buildTimestamps(game(), FIRST_PITCH);
  assert.deepEqual(buildExplanation({ market: "batter_hits", modelProbability: 0.5 }, ts, "MARKET_PENDING").missingFactors, ["a captured market line"]);
  assert.deepEqual(buildExplanation({ market: "batter_hits", modelProbability: 0.5, marketProbability: 0.5 }, ts, "LINEUP_PENDING").missingFactors, ["a confirmed lineup"]);
});

test("12 · distributionBand derives p10/median/p90 labels from real bin mass (Gerrit Cole K's fixture ⇒ 3/6/9)", () => {
  // The real 2026-07-22 Gerrit Cole strikeouts histogram (16 bins, 10k samples) resolves to p10=3, p50=6, p90=9.
  const bins = [
    { label: "0", probability: 0.0124 }, { label: "1", probability: 0.0242 }, { label: "2", probability: 0.0478 },
    { label: "3", probability: 0.0815 }, { label: "4", probability: 0.114 }, { label: "5", probability: 0.142 },
    { label: "6", probability: 0.155 }, { label: "7", probability: 0.142 }, { label: "8", probability: 0.114 },
    { label: "9", probability: 0.082 }, { label: "10", probability: 0.05 }, { label: "11", probability: 0.021 },
    { label: "12", probability: 0.0087 }, { label: "13", probability: 0.0034 }, { label: "14", probability: 0.0009 }, { label: "15", probability: 0.0002 },
  ];
  const band = distributionBand(bins, 10000);
  assert.equal(band.p10, "3"); assert.equal(band.median, "6"); assert.equal(band.p90, "9");
  assert.equal(band.sampleCount, 10000);
});

test("13 · distributionBand never fabricates a spread: empty / zero-mass bins ⇒ null (distinct from a real narrow spike)", () => {
  assert.equal(distributionBand([], 10000), null);
  assert.equal(distributionBand(null), null);
  assert.equal(distributionBand([{ label: "0", probability: 0 }, { label: "1", probability: 0 }]), null);
  // a single-bin spike is a REAL (narrow) distribution, not a missing one
  const spike = distributionBand([{ label: "1", probability: 1 }], 10000);
  assert.deepEqual([spike.p10, spike.median, spike.p90], ["1", "1", "1"]);
});
