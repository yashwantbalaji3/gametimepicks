/**
 * Session 13 · Results V2 — the Forecast Record over the Universal Forecast Ledger. Metrics per kind, denominators,
 * the CSV = page agreement, and the Results mutation probes (each with a control).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { familyMetrics, forecastRecord, observedOf, reliabilityBins, statusCounts, toCsv, CSV_COLUMNS } from "./forecast-record.mjs";
import { familyRows, forecastRecordView, ledgerFamilies, readForecastLedger } from "./forecast-ledger-reader.ts";
import { familyCsvs } from "../../../../scripts/results/emit-forecast-record-assets.mjs";

const row = (over = {}) => ({
  forecastId: `fl1-${Math.random().toString(16).slice(2, 18).padEnd(16, "0")}`,
  sport: "NFL", family: "player_receptions", forecastKind: "CONTINUOUS_PROJECTION", publicationStatus: "PUBLISHED",
  // a scored forecast carries evidence it was published before its start (provenance.mjs hasPrestartPublicationEvidence)
  modelId: "m", eventStart: "2031-10-05T17:00Z", publishedAt: "2031-10-05T15:00:00Z", provenance: { owner: "nfl-prop-settlement", recovered: {} },
  projection: 5, rangeLow: 2, rangeHigh: 8, rangeCoverage: 0.8, probability: null,
  settlement: { state: "SETTLED", finalValue: 7 },
  measurement: { type: "CONTINUOUS_ERROR", absoluteError: 2, squaredError: 4, signedError: -2, insideRange: true, brier: null, logLoss: null, directionalResult: null, directionalBasis: null },
  ...over,
});

test("continuous metrics: errors, bias, coverage; no pick record without a published directional basis", () => {
  const rows = [row(), row({ measurement: { ...row().measurement, absoluteError: 4, squaredError: 16, signedError: 4, insideRange: false } })];
  const m = familyMetrics(rows);
  assert.equal(m.n, 2);
  assert.equal(m.mae, 3);
  assert.equal(m.rmse, Number(Math.sqrt(10).toFixed(3)));
  assert.equal(m.bias, 1);
  assert.equal(m.coverage.inside, 0.5);
  assert.equal(m.directional, null, "a projection gets no W/L");
});

test("binary metrics: calibration bins and the observed outcome (explicit, or recovered; p = 0.5 never guessed)", () => {
  const b = (p, y) => row({ forecastKind: "BINARY_PROBABILITY", probability: p, projection: null, measurement: { type: "PROBABILITY_SCORE", observed: y, brier: Number(((p - y) ** 2).toFixed(6)), logLoss: 0.5 } });
  const m = familyMetrics([b(0.2, 0), b(0.25, 1), b(0.8, 1), b(0.85, 1)]);
  assert.equal(m.n, 4);
  assert.equal(m.observedRate, 0.75);
  assert.equal(m.calibration.bins.reduce((a, x) => a + x.n, 0), 4);
  const old = { probability: 0.3, measurement: { brier: 0.49 } };
  assert.equal(observedOf(old), 1, "recovered from Brier when `observed` is absent");
  assert.equal(observedOf({ probability: 0.5, measurement: { brier: 0.25 } }), null, "ambiguous at 0.5 — left out");
  assert.equal(reliabilityBins([]).ece, null);
});

test("multiclass metrics: log loss, Brier, top class, and the uniform reference", () => {
  const r = row({ forecastKind: "MULTICLASS_PROBABILITY", classProbabilities: { home: 0.5, draw: 0.3, away: 0.2 }, measurement: { type: "MULTICLASS_SCORE", brier: 0.38, logLoss: 0.693, topClassHit: true } });
  const m = familyMetrics([r]);
  assert.equal(m.topClassAccuracy, 1);
  assert.equal(m.uniformReference.logLoss, Number(Math.log(3).toFixed(4)));
});

test("probe: a score table's top-1 hit is labelled as exactly that, never as a likeliest-outcome accuracy (control: 1X2 keeps its label)", () => {
  const x12 = row({ forecastKind: "MULTICLASS_PROBABILITY", classProbabilities: { home: 0.5, draw: 0.3, away: 0.2 }, measurement: { type: "MULTICLASS_SCORE", brier: 0.38, logLoss: 0.693, topClassHit: true } });
  assert.equal(familyMetrics([x12]).topClassLabel, null, "control: a 1X2 keeps the plain likeliest-outcome wording");
  const cp = { "1-1": 0.12, "1-0": 0.11, OTHER: 0.77 };
  assert.ok(Math.abs(Object.values(cp).reduce((a, v) => a + v, 0) - 1) < 1e-9, "the scored outcome space includes OTHER and sums to 1");
  const table = row({ family: "epl_scoreline", forecastKind: "MULTICLASS_PROBABILITY", classProbabilities: cp, measurement: { type: "MULTICLASS_SCORE", brier: 0.1, logLoss: 0.26, topClassHit: false } });
  const m = familyMetrics([table]);
  assert.match(m.topClassLabel, /^top-1 exact-score hit rate/);
  assert.equal(m.topClassAccuracy, 0);
});

// ── Results mutation probes (§E8) ─────────────────────────────────────────────────────────────────────────────────
test("probe: pending → loss and withdrawn → loss never enter a pick record (control: a settled published pick does)", () => {
  const pick = (over) => row({ measurement: { ...row().measurement, directionalResult: "LOSS", directionalBasis: "IMPLIED_SIDE_OF_FROZEN_LINE" }, ...over });
  assert.deepEqual(familyMetrics([pick({})]).directional?.loss, 1, "control");
  assert.equal(familyMetrics([pick({ settlement: { state: "PENDING" } })]).directional, null, "pending is never a loss");
  assert.equal(familyMetrics([pick({ publicationStatus: "WITHDRAWN", settlement: { state: "VOID" } })]).directional, null, "withdrawn is never a loss");
  assert.equal(familyMetrics([pick({ measurement: { ...row().measurement, directionalResult: "LOSS", directionalBasis: null } })]).directional, null, "a W/L with no published claim is not a pick");
  const c = statusCounts([row({ settlement: { state: "PENDING" }, measurement: {} }), row({ publicationStatus: "WITHDRAWN", settlement: { state: "VOID" }, measurement: {} })]);
  assert.deepEqual([c.measured, c.pending, c.void, c.withdrawn], [0, 1, 1, 1]);
});

test("probe: the same forecast twice is refused, never counted twice (control: distinct ids)", () => {
  const a = row();
  assert.equal(forecastRecord([a, row()]).kpis.forecasts, 2, "control");
  assert.throws(() => forecastRecord([a, { ...a }]), /duplicate forecastId/);
});

// ── the real ledger: page counts = ledger counts = CSV rows ───────────────────────────────────────────────────────
test("real ledger: KPI and per-family counts reconcile to the raw ledger and the manifest", () => {
  const { rows, manifest } = readForecastLedger();
  assert.ok(rows.length > 9000);
  const rec = forecastRecordView();
  assert.equal(rec.kpis.forecasts, rows.length);
  assert.equal(rec.kpis.forecasts, manifest.totals.rows);
  let sum = 0;
  for (const s of rec.sports) {
    const fams = s.families.reduce((a, f) => a + f.counts.published + f.counts.withdrawn, 0);
    assert.equal(fams, manifest.sports[s.sport].rows, `${s.sport} families sum to the manifest`);
    sum += fams;
    for (const f of s.families) {
      const c = f.counts;
      assert.equal(c.measured + c.noPrestartEvidence + c.pending + c.void + c.unmeasured, c.published + c.withdrawn, `${s.sport} ${f.family} states partition the rows`);
    }
  }
  assert.equal(sum, rows.length);
  assert.equal(rec.kpis.measured + rec.kpis.noPrestartEvidence + rec.kpis.pending + rec.kpis.voidCount + rec.kpis.unmeasured, rows.length);
});

test("real ledger: every family CSV holds exactly the rows its page counts", () => {
  const { rows } = readForecastLedger();
  const csvs = familyCsvs(rows);
  const fams = ledgerFamilies();
  assert.equal(Object.keys(csvs).length, fams.length);
  for (const { sport, family } of fams) {
    const slug = { NFL: "nfl", MLB: "mlb", EPL: "epl", LIGUE_1: "ligue-1", UFC: "ufc" }[sport];
    const text = csvs[`${slug}-${family.replace(/_/g, "-")}.csv`];
    assert.ok(text, `${sport} ${family} CSV`);
    const lines = text.trimEnd().split("\n");
    assert.equal(lines[0], CSV_COLUMNS.join(","));
    assert.equal(lines.length - 1, familyRows(sport, family).length, `${sport} ${family}: CSV rows = page rows`);
  }
  assert.match(toCsv([row({ matchup: 'A, "B"' })]).split("\n")[1], /"A, ""B"""/, "CSV escaping");
});

// ── scoring rule: no evidence of publication before the start → listed, labelled, exported, never scored ────────────
test("probe: a graded row with no pre-start publication evidence leaves every score, count and pick record (control: with evidence it counts)", () => {
  const b = (p, y, over = {}) => row({ forecastKind: "BINARY_PROBABILITY", probability: p, projection: null, measurement: { type: "PROBABILITY_SCORE", observed: y, brier: Number(((p - y) ** 2).toFixed(6)), logLoss: 0.5, directionalResult: y ? "WIN" : "LOSS", directionalBasis: "PUBLISHED_PICK" }, ...over });
  const ok = [b(0.2, 0), b(0.8, 1)];
  const control = familyMetrics(ok);
  assert.equal(control.n, 2);
  assert.equal(control.counts.measured, 2);
  assert.equal(control.directional.win, 1);
  const cases = {
    "no publication stamp": { publishedAt: null },
    "no event start": { eventStart: null },
    "stamped at the start": { publishedAt: "2031-10-05T17:00:00Z" },
  };
  for (const [why, over] of Object.entries(cases)) {
    const bad = b(0.9, 1, over);
    const m = familyMetrics([...ok, bad]);
    assert.equal(m.n, 2, `${why}: not in n`);
    assert.equal(m.brier, control.brier, `${why}: not in the Brier`);
    assert.equal(m.observedRate, control.observedRate, `${why}: not in calibration`);
    assert.equal(m.counts.measured, 2, `${why}: not counted as measured`);
    assert.equal(m.counts.noPrestartEvidence, 1, `${why}: counted on its own`);
    assert.equal(m.directional.win, 1, `${why}: not in the pick record`);
    assert.equal(toCsv([...ok, bad]).trimEnd().split("\n").length - 1, 3, `${why}: still exported`);
  }
  const recovered = b(0.9, 1, { publishedAt: null, provenance: { owner: "mlb-homer-nukes-settled", recovered: { publishedAt: { value: "2031-10-05T16:00:00Z", state: "GIT_HISTORY", source: "git:0123456789ab:f.json#generatedAt" } } } });
  assert.equal(familyMetrics([...ok, recovered]).n, 3, "a recovered pre-start stamp is evidence");
  const rec = forecastRecord([...ok, b(0.9, 1, { publishedAt: null })]);
  assert.equal(rec.kpis.measured, 2);
  assert.equal(rec.kpis.noPrestartEvidence, 1);
});

test("real ledger: rows without pre-start publication evidence are exactly the ones left out of each family's scores", async () => {
  const { hasPrestartPublicationEvidence } = await import("../../forecast-ledger/provenance.mjs");
  const rec = forecastRecordView();
  let excluded = 0;
  for (const s of rec.sports) for (const f of s.families) {
    const rs = familyRows(s.sport, f.family);
    const want = rs.filter((r) => r.measurement?.type && !hasPrestartPublicationEvidence(r)).length;
    assert.equal(f.counts.noPrestartEvidence, want, `${s.sport} ${f.family}`);
    assert.equal(f.counts.measured, rs.filter((r) => r.measurement?.type).length - want, `${s.sport} ${f.family}: measured excludes them`);
    excluded += want;
  }
  assert.equal(rec.kpis.noPrestartEvidence, excluded);
});
