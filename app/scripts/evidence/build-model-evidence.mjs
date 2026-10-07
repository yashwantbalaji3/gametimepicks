#!/usr/bin/env node
/**
 * MODEL EVIDENCE (Architecture slice E-1) — the §15 sequential evidence rule, computed REPORT-ONLY.
 *
 *   node scripts/evidence/build-model-evidence.mjs --now <ISO> [--check]
 *
 * Reads:
 *   data/internal/forecast-ledger/v1/*.jsonl          graded forecasts of record (append-only, one row per forecast)
 *   app/public/data/admin/model-health.json           the existing BREACHED alarm, read beside the evidence
 * Writes:
 *   data/internal/evidence/model-evidence.json        private; one entry per sport × family × model version
 *
 * For each entry: the paired loss difference against the family's pre-registered baseline (lib/evidence/baselines.mjs),
 * an always-valid slate-clustered 95% confidence sequence on its mean (lib/evidence/sequential.mjs), a calibration
 * fit, the "would be" §15 transition, and a separate market badge.
 *
 * REPORT ONLY. Nothing reads this file. It changes no status, maturity, label, eligibility or published number.
 * Wiring status to it is slice E-5, which needs founder sign-off on the first list of changes.
 *
 * METRIC RULE. Every entry is one family and one model version, scored one way. Nothing is pooled across families,
 * metric types or sports, and there is no overall figure.
 *
 * `--check` recomputes and exits 1 if the committed file differs (except generatedAt), so the artifact can only
 * come from this producer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clusterBySlate, confidenceSequence, confidencePath, calibrationFit, evidenceVerdict, marketBadge, ALPHA, DEFAULT_PLANNED_EVENTS, FLOORS, MAX_PRIOR_SLATES } from "../../src/lib/evidence/sequential.mjs";
import { BASELINE, FAMILY_BASELINES, HEALTH_IDS, WARMUP_EVENTS, pairedDifferences, exclusionReason, slateOf } from "../../src/lib/evidence/baselines.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const LEDGER_DIR = path.join(ROOT, "data/internal/forecast-ledger/v1");
const HEALTH = path.join(APP, "public/data/admin/model-health.json");
const OUT = path.join(ROOT, "data/internal/evidence/model-evidence.json");

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
const CHECK = process.argv.includes("--check");
if (!Number.isFinite(Date.parse(NOW ?? ""))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const manifest = readJson(path.join(LEDGER_DIR, "manifest.json"));
if (!manifest?.sports) { console.error("REFUSED: forecast-ledger manifest missing"); process.exit(1); }
const health = readJson(HEALTH);
const healthById = new Map((health?.families ?? []).map((f) => [f.id, f.state]));

/** Every ledger file the manifest names (missing file = refused: the evidence would silently drop a sport). */
const rows = [];
const inputs = {};
for (const sport of Object.keys(manifest.sports).sort()) {
  const { file, contentHash, rows: expected } = manifest.sports[sport];
  const p = path.join(LEDGER_DIR, file);
  if (!fs.existsSync(p)) { console.error(`REFUSED: ledger file ${file} missing`); process.exit(1); }
  const lines = fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim());
  if (expected != null && lines.length !== expected) { console.error(`REFUSED: ${file} has ${lines.length} rows, manifest says ${expected}`); process.exit(1); }
  for (const l of lines) rows.push(JSON.parse(l));
  inputs[sport] = { file: `data/internal/forecast-ledger/v1/${file}`, contentHash: contentHash ?? null, rows: lines.length };
}

const isDistribution = (kind) => kind === "CONTINUOUS_PROJECTION";
const groupKey = (r) => `${r.sport}|${r.family}|${r.modelId ?? ""}|${r.modelVersion ?? ""}`;
const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(4)));

// Families are scored family-wide first (a trailing-rate baseline needs the family's whole earlier history), then split
// by model version: the record of a version stays attached to that version.
const byFamily = new Map();
for (const r of rows) {
  const k = `${r.sport}|${r.family}`;
  if (!byFamily.has(k)) byFamily.set(k, []);
  byFamily.get(k).push(r);
}

const entries = [];
for (const famKey of [...byFamily.keys()].sort()) {
  const famRows = byFamily.get(famKey);
  const [sport, family] = famKey.split("|");
  const { baselineId, items } = pairedDifferences(famRows, family);
  const itemsById = new Map(items.map((it) => [it.row.forecastId, it]));
  const versions = new Map();
  for (const r of famRows) {
    const k = groupKey(r);
    if (!versions.has(k)) versions.set(k, []);
    versions.get(k).push(r);
  }
  for (const vKey of [...versions.keys()].sort()) {
    const vRows = versions.get(vKey);
    const first = vRows[0];
    const kind = first.forecastKind;
    const excluded = {};
    const slateSources = {};
    const vItems = [];
    for (const r of vRows) {
      const why = exclusionReason(r) ?? (slateOf(r) ? null : "noSlateDate");
      if (why) { excluded[why] = (excluded[why] ?? 0) + 1; continue; }
      const s = slateOf(r);
      slateSources[s.source] = (slateSources[s.source] ?? 0) + 1;
      vItems.push(itemsById.get(r.forecastId));
    }
    const warmup = baselineId === "TRAILING_RATE" ? vItems.filter((it) => it.d == null).length : 0;
    if (warmup) excluded.warmup = warmup;

    const distribution = isDistribution(kind);
    const csOpts = { alpha: ALPHA, plannedEvents: DEFAULT_PLANNED_EVENTS };
    let primary;
    let verdict;
    let calibration = { state: "NOT_COMPUTABLE", reason: kind === "BINARY_PROBABILITY" ? null : "binary families only in v1" };
    const healthId = HEALTH_IDS[`${sport}:${family}`] ?? null;
    const healthState = healthId ? healthById.get(healthId) ?? null : null;
    if (baselineId === "NONE") {
      primary = { state: "NOT_COMPUTABLE", reason: distribution ? "no pre-registered model baseline for a projection in the ledger (E-2 / owner receipts add one)" : "no pre-registered baseline for this family" };
      const breached = healthState === "BREACHED";
      verdict = { meter: "NOT_COMPUTABLE", lean: null, wouldBe: breached ? "PAUSE_SIGNAL" : "NONE", floorsMet: null, reasons: breached ? [primary.reason, "model-health says BREACHED"] : [primary.reason] };
    } else {
      const clusters = clusterBySlate(vItems.filter((it) => it.d != null).map((it) => ({ slate: it.slate, d: it.d })));
      const cs = confidenceSequence(clusters, csOpts);
      if (kind === "BINARY_PROBABILITY") {
        calibration = calibrationFit(vItems.filter((it) => it.d != null).map((it) => ({ p: it.row.probability, y: it.row.measurement.observed })));
      }
      primary = { state: "COMPUTED", score: "log loss", ...cs, path: confidencePath(clusters, csOpts) };
      verdict = evidenceVerdict({ cs, distribution, calibration, healthState });
    }
    const mClusters = clusterBySlate(vItems.filter((it) => it.dMarket != null).map((it) => ({ slate: it.slate, d: it.dMarket })));
    const mcs = confidenceSequence(mClusters, csOpts);
    entries.push({
      sport,
      family,
      forecastKind: kind,
      modelId: first.modelId ?? null,
      modelVersion: first.modelVersion ?? null,
      baseline: BASELINE[baselineId],
      modelVersionRecorded: first.modelVersion != null,
      sample: {
        rows: vRows.length,
        settled: vItems.length,
        scored: baselineId === "NONE" ? 0 : vItems.filter((it) => it.d != null).length,
        excluded,
        slateDateSource: slateSources,
      },
      primary,
      calibration,
      modelHealth: healthId ? { id: healthId, state: healthState } : null,
      evidence: verdict,
      marketBadge: {
        score: distribution ? "absolute error vs the frozen line" : "log loss vs the recorded market probability",
        state: marketBadge(mcs, { distribution }),
        n: mcs.n,
        slates: mcs.slates,
        meanDiff: r4(mcs.meanDiff),
        lower: r4(mcs.lower),
        upper: r4(mcs.upper),
      },
    });
  }
}

const body = {
  schemaVersion: "model-evidence@1",
  artifact: "model-evidence",
  dataClass: "INTERNAL_RESEARCH",
  mode: "REPORT_ONLY",
  effect: "Changes no status, maturity, label, eligibility or published number. Status reads this only after slice E-5 and founder sign-off.",
  generatedAt: NOW,
  metricRule: "One entry = one sport × family × model version, one score. Never pooled across families, metric types or sports; no overall figure.",
  method: {
    difference: "d = loss(model) − loss(baseline); below zero = model better",
    bound: "asymptotic normal-mixture confidence sequence on mean(d), two-sided, slate-clustered (one ET day = one block); no bound before 3 slates; slate variance inflated (K+1)/(K-4) for few slates and floored at the event-level variance",
    validity: "asymptotic, not exact. Simulated false-verdict rate over 60 nightly looks: about 2% with independent events, about 4% with strong same-day correlation (sequential.test.mjs pins <= 5%)",
    alpha: ALPHA,
    plannedEvents: DEFAULT_PLANNED_EVENTS,
    floors: FLOORS,
    trailingRateWarmupEvents: WARMUP_EVENTS,
    backtestPrior: `a walk-forward backtest may enter worth at most ${MAX_PRIOR_SLATES} slates and never satisfies the forward floors; none is registered yet`,
    calibration: "binary families: logistic recalibration slope/intercept, Wald 95%, event-level",
    established: "upper < 0 AND slope interval contains 1 AND intercept interval contains 0 AND floors met AND model-health not BREACHED",
    pause: "lower > 0 OR model-health BREACHED",
    market: "separate badge: same bound with the recorded market as baseline; never the maturity baseline",
    excluded: "pending, void, withdrawn and unmeasured rows are excluded and counted, never scored as losses",
  },
  inputs: { ledger: inputs, modelHealth: health ? { file: "app/public/data/admin/model-health.json", generatedAt: health.generatedAt ?? null } : null },
  families: entries,
};

const text = `${JSON.stringify(body, null, 1)}\n`;
if (CHECK) {
  const prev = readJson(OUT);
  const strip = (d) => JSON.stringify({ ...d, generatedAt: null });
  if (!prev || strip(prev) !== strip(body)) { console.error("model-evidence.json is stale or hand-edited: rerun the producer"); process.exit(1); }
  console.log(`model-evidence.json up to date (${entries.length} entries)`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  const line = (e) => `${e.sport} ${e.family} [${e.modelId ?? "model unrecorded"}${e.modelVersion ? `@${e.modelVersion}` : ""}]: ${e.evidence.meter}${e.evidence.lean ? ` (${e.evidence.lean})` : ""} · would be ${e.evidence.wouldBe} · market ${e.marketBadge.state}`;
  for (const e of entries) console.log(line(e));
  console.log(`wrote ${path.relative(ROOT, OUT)} (${entries.length} entries, report-only)`);
}
