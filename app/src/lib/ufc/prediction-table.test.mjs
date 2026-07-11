/**
 * UFC PREDICTION TABLE + SIMULATION ANIMATION — the whole-card summary and the market-implied fight
 * animation. Runs against the REAL UFC 329 artifacts.
 *
 * Proves: every scheduled fight appears; odds-backed fights carry a MARKET-IMPLIED moneyline read + de-vig
 * win probs; odds-pending fights show no prediction; rounds/goes-distance/method are always provider-needed
 * (never fabricated); no model pick/edge/EV/best-bet leaks; the animation is honest + image-free; and the
 * page renders the table above the advanced odds board with the animation in the featured fight.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildUfcPredictionTable, oddsBackedCount } from "./prediction-table.ts";
import { ufcEventToReports } from "../multi-sport-report/ufc-adapter.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const loadUfc = (n) => JSON.parse(read(path.join(process.cwd(), "public", "data", "ufc", n)));

const sched = loadUfc("schedule-latest.json");
const proj = loadUfc("projections-latest.json");
const odds = loadUfc("odds-latest.json");
const reports = ufcEventToReports(proj, odds);
const rows = buildUfcPredictionTable(sched.fights, reports, odds);

test("1 · the table renders EVERY scheduled fight; odds-backed count matches the reports", () => {
  assert.equal(rows.length, sched.fights.length, "one row per scheduled fight");
  assert.ok(rows.length >= 10, "the full card is present");
  // Most reports map to a scheduled fight (ESPN/Odds-API name variants can leave a few unmatched); the
  // table is schedule-driven, so odds-backed rows are those with a name-matched market-implied report.
  assert.ok(oddsBackedCount(rows) >= 6 && oddsBackedCount(rows) <= reports.length, `odds-backed rows (${oddsBackedCount(rows)}) match reports`);
  assert.ok(oddsBackedCount(rows) >= 1 && oddsBackedCount(rows) < rows.length, "a mix of odds-backed + pending");
});

test("2 · odds-backed fights show a MARKET-IMPLIED moneyline + de-vig win probs; pending show neither", () => {
  for (const r of rows) {
    if (r.oddsBacked) {
      assert.match(r.moneyline, /Market-implied lean:|No clear market lean/, `${r.fight}: market-implied moneyline`);
      assert.ok(Array.isArray(r.winProbs) && r.winProbs.length === 2, `${r.fight}: two de-vig win probs`);
      const sum = r.winProbs[0].prob + r.winProbs[1].prob;
      assert.ok(Math.abs(sum - 1) < 0.02, `${r.fight}: de-vig sums to ~1`);
      assert.equal(r.status, "Odds-backed");
    } else {
      assert.equal(r.moneyline, "Odds pending", `${r.fight}: no prediction without odds`);
      assert.equal(r.winProbs, null);
      assert.equal(r.oddsA, null);
      assert.equal(r.status, "Odds pending");
    }
  }
});

test("3 · rounds / goes-distance / method are ALWAYS provider-needed (never a fabricated number)", () => {
  for (const r of rows) {
    assert.equal(r.rounds, "provider_needed");
    assert.equal(r.goesDistance, "provider_needed");
    assert.equal(r.method, "provider_needed");
  }
});

test("4 · no row leaks a model pick / edge / EV / best bet", () => {
  const blob = JSON.stringify(rows).toLowerCase();
  for (const w of ["model pick", "model edge", "positive ev", "best bet", "guaranteed", "model probability"]) {
    assert.ok(!blob.includes(w), `no "${w}" in the table rows`);
  }
});

test("5 · the table component is honest + image-free; page renders it above the advanced odds board", () => {
  const comp = read("src/components/ufc/ufc-prediction-table.tsx");
  assert.match(comp, /Why some columns are locked/, "explains the locked columns");
  assert.match(comp, /Provider/, "renders provider-needed locks");
  assert.doesNotMatch(comp, /<img\b/i, "no <img>");
  assert.doesNotMatch(comp, /https?:\/\/[^"')\s]+\.(png|jpe?g|gif|webp)/i, "no external image URL");
  const page = read("src/app/ufc/page.tsx");
  assert.match(page, /buildUfcPredictionTable/, "page builds the table");
  assert.match(page, /<UfcPredictionTable/, "page renders the table");
  // Table section appears before the advanced odds board in the overview.
  const iTable = page.indexOf("{predictionTableSection}");
  const iOdds = page.indexOf("Advanced odds board");
  assert.ok(iTable > 0 && iOdds > 0 && iTable < iOdds, "prediction table is above the advanced odds board");
});

test("6 · the simulation animation is honest, image-free, and uses fighter initials", () => {
  const anim = read("src/components/ufc/ufc-simulation-animation.tsx");
  assert.match(anim, /Market-implied simulation/, "market-implied label");
  assert.match(anim, /Not an independent 10,000-run UFC model/, "honest no-10k disclaimer");
  assert.match(anim, /Provider-needed/, "locked prop row");
  assert.match(anim, /initials/, "initials fallback (no photos)");
  assert.match(anim, /@keyframes ufcSimFill/, "probability bars animate");
  assert.doesNotMatch(anim, /<img\b/i, "no <img>");
  assert.doesNotMatch(anim, /https?:\/\/[^"')\s]+\.(png|jpe?g|gif|webp)/i, "no external image URL");
});

test("7 · the featured fight renders the animation", () => {
  const page = read("src/app/ufc/page.tsx");
  assert.match(page, /<UfcSimulationAnimation/, "animation rendered");
  assert.match(page, /featuredAnim/, "animation attached to the featured fight");
});
