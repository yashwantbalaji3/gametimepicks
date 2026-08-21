#!/usr/bin/env node
/**
 * EPL MODEL v2 BAKE-OFF — measure recency weighting, ridge shrinkage and Dixon-Coles against the
 * bars frozen in data/internal/research/epl/preregistration-model-v2.json. PRIVATE RESEARCH.
 *
 *   node scripts/epl/bakeoff-epl-model-v2.mjs --now <iso> [--write]
 *
 * PROTOCOL DISCIPLINE IS THE POINT OF THIS FILE.
 *
 * Selection runs on DEVELOPMENT (2023-24 + 2024-25) and nothing else. The holdout season is scored
 * only AFTER the winning configuration is locked, and only for the control and that one winner — the
 * script cannot rank configurations by holdout because it never computes holdout for the losers. That
 * is enforced by control flow here rather than by intention, because "I looked but did not use it" is
 * not a property anyone can verify later.
 *
 * The arithmetic is the LIVE lib's (`strength-state.mjs`), driven through its optional parameters
 * with v1 defaults. A research fork would be free to drift from the model that actually ships; this
 * cannot, and the parity guard on the control's committed numbers proves it each run.
 *
 * Every variant that fails is REPORTED, not retried with a different bar. Programs 058-061, 181, 182
 * and 183 all ended in a recorded rejection, and that is a normal outcome of running this.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitEplStrength, scoreMatrix } from "../../src/lib/sports/epl/strength-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const RESEARCH = path.join(REPO, "data/internal/research/epl");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
const WRITE = process.argv.includes("--write");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("usage: bakeoff-epl-model-v2.mjs --now <iso> [--write]"); process.exit(1); }

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const prereg = readJson(path.join(RESEARCH, "preregistration-model-v2.json"));
const corpus = readJson(path.join(RESEARCH, "corpus-v1.json"));
const baselines = readJson(path.join(RESEARCH, "reports/baseline-evaluation-v1.json"));

const WARMUP = prereg.protocol.warmup.season;
const DEV_SEASONS = new Set(prereg.protocol.development.seasons);
const HOLDOUT_SEASONS = new Set(prereg.protocol.holdout.seasons);

const rows = [...corpus.rows].sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)));
const days = [...new Set(rows.map((m) => m.dateUtc.slice(0, 10)))];

/* ── One walk-forward pass for one configuration ─────────────────────────────────────────────── */
function predictAll(config) {
  const preds = [];
  let clamped = 0;
  for (const day of days) {
    const dayMatches = rows.filter((m) => m.dateUtc.slice(0, 10) === day);
    if (dayMatches.every((m) => m.season === WARMUP)) continue;   // warm-up folds, never scores
    const state = fitEplStrength({ rows, cutoffIso: `${day}T00:00:00Z`, halfLifeDays: config.halfLifeDays ?? null });
    for (const m of dayMatches) {
      if (m.season === WARMUP) continue;
      const mx = scoreMatrix(state, m.home, m.away, {
        shrinkK: config.shrinkK ?? 0,
        dixonColesRho: config.dixonColesRho ?? null,
      });
      clamped += mx.dcClamped ?? 0;
      preds.push({
        season: m.season,
        actual: m.ftHome > m.ftAway ? "H" : m.ftHome === m.ftAway ? "D" : "A",
        total: m.ftHome + m.ftAway,
        p: { H: mx.oneXTwo.home, D: mx.oneXTwo.draw, A: mx.oneXTwo.away },
        expTotal: mx.totals.expected,
        over25: mx.totals.over25,
      });
    }
  }
  return { preds, clamped };
}

/* ── Metrics ─────────────────────────────────────────────────────────────────────────────────── */
const EPS = 1e-15;
const clamp01 = (v) => Math.min(1 - EPS, Math.max(EPS, v));

/** Expected calibration error over 10 bins, averaged across the three outcomes. */
function ece(preds) {
  const per = [];
  for (const outcome of ["H", "D", "A"]) {
    const bins = Array.from({ length: 10 }, () => ({ n: 0, sumP: 0, hits: 0 }));
    for (const q of preds) {
      const p = q.p[outcome];
      const b = Math.min(9, Math.floor(p * 10));
      bins[b].n += 1; bins[b].sumP += p; bins[b].hits += q.actual === outcome ? 1 : 0;
    }
    const n = preds.length;
    per.push(bins.filter((b) => b.n > 0).reduce((s, b) => s + (b.n / n) * Math.abs(b.sumP / b.n - b.hits / b.n), 0));
  }
  return { mean: per.reduce((s, v) => s + v, 0) / 3, byOutcome: { H: per[0], D: per[1], A: per[2] } };
}

function metrics(preds) {
  if (preds.length === 0) return null;
  let ll = 0, rps = 0, correct = 0, totalAbs = 0, over = 0, overPred = 0;
  for (const q of preds) {
    ll += -Math.log(clamp01(q.p[q.actual]));
    // Ranked probability score over the ordered outcome triple (H, D, A).
    const order = ["H", "D", "A"];
    let cumP = 0, cumA = 0, acc = 0;
    for (let i = 0; i < 2; i++) {
      cumP += q.p[order[i]]; cumA += q.actual === order[i] ? 1 : 0;
      acc += (cumP - cumA) ** 2;
    }
    rps += acc / 2;
    const best = order.reduce((a, b) => (q.p[a] >= q.p[b] ? a : b));
    if (best === q.actual) correct += 1;
    totalAbs += Math.abs(q.expTotal - q.total);
    over += q.total >= 3 ? 1 : 0;
    overPred += q.over25;
  }
  const n = preds.length;
  const e = ece(preds);
  return {
    n,
    logLoss: Number((ll / n).toFixed(4)),
    rps: Number((rps / n).toFixed(4)),
    accuracy: Number((correct / n).toFixed(4)),
    ece: Number(e.mean.toFixed(4)),
    eceByOutcome: Object.fromEntries(Object.entries(e.byOutcome).map(([k, v]) => [k, Number(v.toFixed(4))])),
    expectedTotalMae: Number((totalAbs / n).toFixed(4)),
    over25: { predictedRate: Number((overPred / n).toFixed(4)), observedRate: Number((over / n).toFixed(4)) },
  };
}

const split = (preds, seasons) => preds.filter((p) => seasons.has(p.season));
const bySeason = (preds) => Object.fromEntries(
  [...new Set(preds.map((p) => p.season))].sort().map((s) => [s, metrics(preds.filter((p) => p.season === s))]),
);

/* ── Phase 0 · the control, and a parity check against its committed numbers ─────────────────── */
const control = predictAll({});
const controlDev = metrics(split(control.preds, DEV_SEASONS));
const controlAll = metrics(control.preds);
const committed = baselines.models.poisson.overall;

console.log(`\nCONTROL (v1, flat weighting) — parity against committed baseline-evaluation-v1.json`);
console.log(`  scored n=${controlAll.n} (committed ${committed.n})  logLoss ${controlAll.logLoss} (committed ${committed.logLoss})`);
const parityOk = controlAll.n === committed.n && Math.abs(controlAll.logLoss - committed.logLoss) < 0.0005;
if (!parityOk) {
  console.error("REFUSED — the control does not reproduce its own committed evaluation. The protocol changed, so no");
  console.error("          variant measured against it would be comparable to the record. Fix parity before sweeping.");
  process.exit(2);
}
console.log(`  parity OK — the harness reproduces the committed control exactly`);

/* ── Phase 1 · DEVELOPMENT sweep. Selection happens here and ONLY here ───────────────────────── */
const G = prereg.stoppingRule.grids;
const candidates = [
  ...G.decay_halfLifeDays.map((h) => ({ id: `decay:H=${h}`, variant: "decay", halfLifeDays: h })),
  ...G.shrink_k.map((k) => ({ id: `shrink:k=${k}`, variant: "shrink", shrinkK: k })),
  ...G.dixonColes_rho.map((r) => ({ id: `dc:rho=${r}`, variant: "dixon-coles", dixonColesRho: r })),
];

console.log(`\nDEVELOPMENT sweep — ${prereg.protocol.development.seasons.join(" + ")} (n=${controlDev.n}), selection metric = log loss`);
console.log(`  ${"config".padEnd(20)} ${"logLoss".padStart(8)} ${"vs ctrl".padStart(9)}  ${"acc".padStart(6)} ${"ece".padStart(7)}`);
console.log(`  ${"control".padEnd(20)} ${controlDev.logLoss.toFixed(4).padStart(8)} ${"—".padStart(9)}  ${controlDev.accuracy.toFixed(4).padStart(6)} ${controlDev.ece.toFixed(4).padStart(7)}`);

const devResults = [];
for (const c of candidates) {
  const { preds, clamped } = predictAll(c);
  const m = metrics(split(preds, DEV_SEASONS));
  const delta = m.logLoss - controlDev.logLoss;
  devResults.push({ ...c, dev: m, clamped, delta: Number(delta.toFixed(4)) });
  console.log(`  ${c.id.padEnd(20)} ${m.logLoss.toFixed(4).padStart(8)} ${(delta >= 0 ? "+" : "") + delta.toFixed(4)}`.padEnd(42)
    + `  ${m.accuracy.toFixed(4).padStart(6)} ${m.ece.toFixed(4).padStart(7)}${clamped ? `  (dc clamped ${clamped})` : ""}`);
}

/* Best per variant family, then the single best overall — all on DEV. */
const families = [...new Set(devResults.map((r) => r.variant))];
const bestPerFamily = families.map((f) => devResults.filter((r) => r.variant === f).reduce((a, b) => (a.dev.logLoss <= b.dev.logLoss ? a : b)));

/*
 * The declared "combined" variant: every single-change family whose OWN best config improves on the
 * control by the B1 margin, applied together. A family that did not earn its place alone does not get
 * carried in on someone else's improvement.
 */
const B1_MARGIN = 0.005;
const qualifying = bestPerFamily.filter((r) => controlDev.logLoss - r.dev.logLoss >= B1_MARGIN);
let combined = null;
if (qualifying.length > 1) {
  const cfg = { id: `combined:${qualifying.map((q) => q.id).join("+")}`, variant: "combined" };
  for (const q of qualifying) {
    if (q.halfLifeDays != null) cfg.halfLifeDays = q.halfLifeDays;
    if (q.shrinkK != null) cfg.shrinkK = q.shrinkK;
    if (q.dixonColesRho != null) cfg.dixonColesRho = q.dixonColesRho;
  }
  const { preds, clamped } = predictAll(cfg);
  const m = metrics(split(preds, DEV_SEASONS));
  combined = { ...cfg, dev: m, clamped, delta: Number((m.logLoss - controlDev.logLoss).toFixed(4)) };
  devResults.push(combined);
  console.log(`  ${cfg.id.slice(0, 20).padEnd(20)} ${m.logLoss.toFixed(4).padStart(8)} ${(combined.delta >= 0 ? "+" : "") + combined.delta.toFixed(4)}`.padEnd(42)
    + `  ${m.accuracy.toFixed(4).padStart(6)} ${m.ece.toFixed(4).padStart(7)}`);
}

const locked = devResults.reduce((a, b) => (a.dev.logLoss <= b.dev.logLoss ? a : b));
console.log(`\nLOCKED on development: ${locked.id}  (dev logLoss ${locked.dev.logLoss}, ${locked.delta >= 0 ? "+" : ""}${locked.delta} vs control)`);
console.log("The holdout season has not been scored for any configuration up to this line.");

/* ── Phase 2 · HOLDOUT, once, for the control and the locked config only ─────────────────────── */
const lockedFull = predictAll(locked);
const lockedHold = metrics(split(lockedFull.preds, HOLDOUT_SEASONS));
const controlHold = metrics(split(control.preds, HOLDOUT_SEASONS));
const eloHold = baselines.models.elo.bySeason[[...HOLDOUT_SEASONS][0]];

const lockedSeasons = bySeason(lockedFull.preds);
const controlSeasons = bySeason(control.preds);

/* ── The five bars ───────────────────────────────────────────────────────────────────────────── */
const worstSeasonRegression = Object.keys(controlSeasons)
  .map((s) => Number((lockedSeasons[s].logLoss - controlSeasons[s].logLoss).toFixed(4)))
  .reduce((a, b) => Math.max(a, b), -Infinity);

const bars = [
  { id: "B1_development_margin", pass: controlDev.logLoss - locked.dev.logLoss >= 0.005,
    detail: `dev ${locked.dev.logLoss} vs control ${controlDev.logLoss} — improvement ${(controlDev.logLoss - locked.dev.logLoss).toFixed(4)}, need >= 0.005` },
  { id: "B2_holdout_generalises", pass: controlHold.logLoss - lockedHold.logLoss >= 0.005,
    detail: `holdout ${lockedHold.logLoss} vs control ${controlHold.logLoss} — improvement ${(controlHold.logLoss - lockedHold.logLoss).toFixed(4)}, need >= 0.005` },
  { id: "B3_elo_floor", pass: lockedHold.logLoss <= eloHold.logLoss,
    detail: `holdout ${lockedHold.logLoss} vs Elo ${eloHold.logLoss} — need <= Elo (1X2 head only)` },
  { id: "B4_calibration_does_not_degrade", pass: lockedHold.ece - controlHold.ece <= 0.010,
    detail: `holdout ECE ${lockedHold.ece} vs control ${controlHold.ece} — degradation ${(lockedHold.ece - controlHold.ece).toFixed(4)}, allowed <= 0.010` },
  { id: "B5_no_season_collapse", pass: worstSeasonRegression <= 0.010,
    detail: `worst single-season regression ${worstSeasonRegression.toFixed(4)}, allowed <= 0.010` },
];
const verdict = bars.every((b) => b.pass) ? "ACCEPTED" : "REJECTED";

console.log(`\nHOLDOUT ${[...HOLDOUT_SEASONS].join(", ")} (n=${lockedHold.n}) — scored once, for the control and ${locked.id} only`);
console.log(`  control ${controlHold.logLoss} · locked ${lockedHold.logLoss} · elo ${eloHold.logLoss}`);
console.log(`\nBARS`);
for (const b of bars) console.log(`  ${b.pass ? "PASS" : "FAIL"}  ${b.id.padEnd(34)} ${b.detail}`);
console.log(`\nVERDICT: ${verdict}${verdict === "REJECTED" ? " — v1 stays live. The rejection is the finding; the bars are not renegotiated." : " — every preregistered bar cleared."}`);

const report = {
  schemaVersion: 1,
  artifact: "epl-model-v2-bakeoff",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  generatedAt: NOW,
  preregistration: { file: "preregistration-model-v2.json", registeredAt: prereg.registeredAt },
  protocol: prereg.protocol,
  parity: { reproducedCommittedControl: true, controlLogLoss: controlAll.logLoss, committedLogLoss: committed.logLoss },
  control: { dev: controlDev, holdout: controlHold, bySeason: controlSeasons },
  developmentSweep: devResults.map((r) => ({ id: r.id, variant: r.variant, halfLifeDays: r.halfLifeDays ?? null, shrinkK: r.shrinkK ?? null, dixonColesRho: r.dixonColesRho ?? null, devLogLoss: r.dev.logLoss, deltaVsControl: r.delta, devEce: r.dev.ece, dcClamped: r.clamped })),
  locked: { id: locked.id, halfLifeDays: locked.halfLifeDays ?? null, shrinkK: locked.shrinkK ?? null, dixonColesRho: locked.dixonColesRho ?? null },
  holdout: { locked: lockedHold, control: controlHold, eloBaseline: eloHold, bySeason: lockedSeasons },
  bars,
  verdict,
  note: verdict === "ACCEPTED"
    ? "Every preregistered bar cleared on a holdout season that no hyperparameter was chosen on."
    : "At least one preregistered bar failed. v1 remains the live model. Recorded rather than retried with a weaker bar.",
};

if (WRITE) {
  fs.writeFileSync(path.join(RESEARCH, "reports/model-v2-bakeoff.json"), JSON.stringify(report, null, 1) + "\n");
  console.log(`\nwrote data/internal/research/epl/reports/model-v2-bakeoff.json`);
} else {
  console.log(`\ndry run — pass --write to persist the report.`);
}
