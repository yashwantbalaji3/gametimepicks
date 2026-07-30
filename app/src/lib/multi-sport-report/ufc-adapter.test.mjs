/**
 * UFC → MultiSportGameReport adapter + honesty. Runs against the REAL committed UFC 329 artifacts so the
 * test breaks if the data or the honesty contract regresses.
 *
 * Proves: every fight report is a VALID market-implied report; it can never claim independent-sim / 10k /
 * EV / edge; win probs are two-sided and in [0,1]; the only lean is a market-implied moneyline favorite
 * (never a model pick, never method/round/distance); and provider-needed props stay out of the snapshot's
 * available set. `/ufc` no longer renders these reports — the hub was retired for the settled archive
 * (2026-07-30 cleanup; ufc-archive.test.mjs pins that the page carries no report shell) — but the adapter
 * remains the honesty contract for any loader that classifies UFC events.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ufcEventToReports, ufcFightToReport, UFC_SOURCE_LABEL, UFC_SIM_NOTE } from "./ufc-adapter.ts";
import { validateMultiSportGameReport } from "./schema.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const loadUfc = (name) => JSON.parse(read(path.join(process.cwd(), "public", "data", "ufc", name)));

const v1Proj = loadUfc("projections-latest.json");
const odds = loadUfc("odds-latest.json");
const reports = ufcEventToReports(v1Proj, odds);

test("1 · every UFC 329 fight report is a VALID market-implied report", () => {
  assert.ok(reports.length >= 1, "at least one fight report from the real card");
  for (const r of reports) {
    const v = validateMultiSportGameReport(r);
    assert.equal(v.valid, true, `${r.eventName}: ${v.errors.join("; ")}`);
    assert.equal(r.sport, "ufc");
    assert.equal(r.sourceMode, "market_implied_simulation");
    assert.equal(r.sourceLabel, "Market-implied simulation");
  }
  assert.equal(UFC_SOURCE_LABEL, "Market-implied simulation");
});

test("2 · a fight report NEVER claims independent sim / 10k runs / EV / edge; no run count", () => {
  for (const r of reports) {
    assert.equal(r.publicClaims.canClaimIndependentSimulation, false);
    assert.equal(r.publicClaims.canClaimTenThousandRuns, false);
    assert.equal(r.publicClaims.canClaimPositiveEV, false);
    assert.equal(r.publicClaims.canClaimModelEdge, false);
    assert.equal(r.simulationOutput.runCount, undefined);
  }
  assert.match(UFC_SIM_NOTE, /not an independent 10,000-run UFC model/);
});

test("3 · win probabilities are two-sided, in [0,1], and de-vigged (~sum to 1)", () => {
  for (const r of reports) {
    const wp = r.simulationOutput.winProbabilities ?? [];
    assert.equal(wp.length, 2, `${r.eventName}: both fighters`);
    for (const p of wp) assert.ok(p.probability >= 0 && p.probability <= 1);
    const sum = wp[0].probability + wp[1].probability;
    assert.ok(Math.abs(sum - 1) < 0.02, `${r.eventName}: de-vigged sum ≈ 1 (got ${sum.toFixed(3)})`);
  }
});

test("4 · the only lean is a market-implied MONEYLINE favorite — never a model pick / method / round", () => {
  for (const r of reports) {
    const available = new Set(r.marketSnapshot.markets.filter((m) => m.available && m.status === "available").map((m) => m.key));
    for (const l of r.topLeans) {
      assert.equal(l.market, "moneyline", `${r.eventName}: only moneyline leans`);
      assert.ok(available.has(l.market), "lean market is available");
      assert.equal(l.sourceMode, "market_implied_simulation");
      assert.match(l.rationale, /market-implied|Model pick gated/i);
      assert.doesNotMatch(l.selection, /model|best bet|edge|lock/i);
    }
  }
});

test("5 · method / round / distance are provider-needed, never available, never leans", () => {
  for (const r of reports) {
    for (const key of ["method", "rounds", "distance"]) {
      const m = r.marketSnapshot.markets.find((x) => x.key === key);
      assert.ok(m, `${key} present as a snapshot entry`);
      assert.equal(m.available, false);
      assert.equal(m.status, "provider_needed");
      assert.ok(!r.topLeans.some((l) => l.market === key), `${key} is never a lean`);
    }
  }
});

test("6 · model gating: with moneylineValidated=false, takeaways say the model pick is gated", () => {
  const gatedReports = ufcEventToReports({ ...v1Proj, moneylineValidated: false }, odds);
  for (const r of gatedReports) {
    assert.ok(r.keyTakeaways.some((t) => /gated|validat/i.test(t)), `${r.eventName}: gating stated`);
    // No public copy asserts a model pick / EV / edge.
    const blob = JSON.stringify(r);
    assert.doesNotMatch(blob, /best bet|positive EV|guaranteed|Model pick:/i);
  }
});

test("7 · a synthetic clear favorite yields a market-implied lean; a pick'em yields none", () => {
  const fav = ufcFightToReport(
    { boutId: "b1", fighter: "A Fighter", opponent: "B Fighter", oddsPrice: -400, marketImpliedProbability: 0.8 },
    { sides: [{ name: "A Fighter", price: -400, impliedProbability: 0.8 }, { name: "B Fighter", price: 300, impliedProbability: 0.25 }] },
    { eventName: "UFC Test" },
  );
  assert.equal(validateMultiSportGameReport(fav).valid, true);
  assert.equal(fav.topLeans.length, 1);
  assert.match(fav.topLeans[0].selection, /A Fighter/);

  const pk = ufcFightToReport(
    { boutId: "b2", fighter: "C", opponent: "D", oddsPrice: -110, marketImpliedProbability: 0.52 },
    { sides: [{ name: "C", price: -110, impliedProbability: 0.524 }, { name: "D", price: -110, impliedProbability: 0.524 }] },
    { eventName: "UFC Test" },
  );
  assert.equal(pk.topLeans.length, 0, "pick'em → no forced lean");
  assert.match(pk.mainRead.label, /pick'em/i);
});

test("8 · /ufc does NOT render fight reports — the archive carries no report shell or adapter wiring", () => {
  // Inverse of the old wiring pin: the retired hub rendered these reports; the settled archive must not.
  const page = read("src/app/ufc/page.tsx");
  assert.doesNotMatch(page, /ufcEventToReports/, "archive page never builds fight reports");
  assert.doesNotMatch(page, /MultiSportReportShell/, "archive page never renders the report shell");
});
