#!/usr/bin/env node
/**
 * EPL SPARSE-SPLIT REPAIR EVALUATION — measure ridge shrinkage against the bars frozen in
 * data/internal/research/epl/preregistration-sparse-split-v1.json. PRIVATE RESEARCH.
 *
 *   node scripts/epl/evaluate-epl-sparse-split.mjs --now <iso> [--write]
 *
 * This is a TARGETED repair of a reproduced live defect (Chelsea v Hull: a one-match away split
 * with zero goals conceded produced a strength multiplier of exactly 0 and a floored λ of 0.05),
 * not a rerun of the rejected v2 bake-off. Selection of k happens on the DEVELOPMENT seasons'
 * SPARSE subpopulation only; the holdout season is scored once, for the control and the single
 * locked k — control flow enforces that, exactly as bakeoff-epl-model-v2.mjs does.
 *
 * Protocol disclosure carried from the preregistration: 2025-26 was scored by the v2 bake-off for
 * the control and decay:H=240 only. No shrink configuration has ever been scored on it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitEplStrength, scoreMatrix, normalizeClubName, EPL_POISSON_PARAMS } from "../../src/lib/sports/epl/strength-state.mjs";
import { loadEplCorpus } from "../../src/lib/sports/epl/corpus.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const RESEARCH = path.join(REPO, "data/internal/research/epl");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
const WRITE = process.argv.includes("--write");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("usage: evaluate-epl-sparse-split.mjs --now <iso> [--write]"); process.exit(1); }

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const prereg = readJson(path.join(RESEARCH, "preregistration-sparse-split-v1.json"));
const corpus = readJson(path.join(RESEARCH, "corpus-v1.json"));

const WARMUP = "2022-23";
const DEV_SEASONS = new Set(prereg.populations.development.seasons);
const HOLDOUT_SEASONS = new Set(prereg.populations.holdout.seasons);
const GRID = prereg.candidate.grid_k;

const rows = [...corpus.rows].sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)));
const days = [...new Set(rows.map((m) => m.dateUtc.slice(0, 10)))];

/** Sparse per the preregistration: the relevant split (home club's home split / away club's away
 *  split — the two counts lambdasFor actually divides by) has 1..4 folded matches. */
const isSparse = (state, home, away) => {
  const hg = state.stats.get(normalizeClubName(home))?.hg ?? 0;
  const ag = state.stats.get(normalizeClubName(away))?.ag ?? 0;
  return (hg >= 1 && hg <= 4) || (ag >= 1 && ag <= 4);
};

/* ── One walk-forward pass for one shrinkK ───────────────────────────────────────────────────── */
function predictAll(shrinkK, sourceRows = rows) {
  const srcDays = [...new Set(sourceRows.map((m) => m.dateUtc.slice(0, 10)))];
  const preds = [];
  let zeroMultipliers = 0;
  for (const day of srcDays) {
    const dayMatches = sourceRows.filter((m) => m.dateUtc.slice(0, 10) === day);
    if (dayMatches.every((m) => m.season === WARMUP)) continue;
    const state = fitEplStrength({ rows: sourceRows, cutoffIso: `${day}T00:00:00Z` });
    for (const m of dayMatches) {
      if (m.season === WARMUP) continue;
      // S6 bookkeeping: a club WITH folded matches in the relevant split whose multiplier is 0.
      const h = state.stats.get(normalizeClubName(m.home));
      const a = state.stats.get(normalizeClubName(m.away));
      const mult = (goals, games, mu) => (games ? (goals + shrinkK * mu) / (games + shrinkK) / mu : 1);
      for (const v of [
        h?.hg ? mult(h.hf, h.hg, state.muHome) : 1, h?.hg ? mult(h.ha, h.hg, state.muAway) : 1,
        a?.ag ? mult(a.af, a.ag, state.muAway) : 1, a?.ag ? mult(a.aa, a.ag, state.muHome) : 1,
      ]) if (v === 0) zeroMultipliers += 1;
      const mx = scoreMatrix(state, m.home, m.away, { shrinkK });
      preds.push({
        season: m.season,
        sparse: isSparse(state, m.home, m.away),
        actual: m.ftHome > m.ftAway ? "H" : m.ftHome === m.ftAway ? "D" : "A",
        total: m.ftHome + m.ftAway,
        p: { H: mx.oneXTwo.home, D: mx.oneXTwo.draw, A: mx.oneXTwo.away },
        expTotal: mx.totals.expected,
      });
    }
  }
  return { preds, zeroMultipliers };
}

/* ── Metrics (log loss primary; ECE as in the bake-off) ──────────────────────────────────────── */
const EPS = 1e-15;
const clamp01 = (v) => Math.min(1 - EPS, Math.max(EPS, v));
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
  return per.reduce((s, v) => s + v, 0) / 3;
}
function metrics(preds) {
  if (preds.length === 0) return null;
  let ll = 0, correct = 0, totalAbs = 0;
  for (const q of preds) {
    ll += -Math.log(clamp01(q.p[q.actual]));
    const best = ["H", "D", "A"].reduce((x, y) => (q.p[x] >= q.p[y] ? x : y));
    if (best === q.actual) correct += 1;
    totalAbs += Math.abs(q.expTotal - q.total);
  }
  const n = preds.length;
  return {
    n,
    logLoss: Number((ll / n).toFixed(4)),
    accuracy: Number((correct / n).toFixed(4)),
    ece: Number(ece(preds).toFixed(4)),
    expectedTotalMae: Number((totalAbs / n).toFixed(4)),
  };
}
const inSeasons = (preds, seasons) => preds.filter((p) => seasons.has(p.season));
const sparseOf = (preds) => preds.filter((p) => p.sparse);

/* ── Control ─────────────────────────────────────────────────────────────────────────────────── */
const control = predictAll(0);
const ctlDev = inSeasons(control.preds, DEV_SEASONS);
const ctlDevSparse = metrics(sparseOf(ctlDev));
const ctlDevAll = metrics(ctlDev);
console.log(`\nCONTROL (shrinkK=0) — dev sparse n=${ctlDevSparse.n} logLoss ${ctlDevSparse.logLoss} · dev overall n=${ctlDevAll.n} logLoss ${ctlDevAll.logLoss}`);

/* ── DEVELOPMENT sweep: lock k on dev-sparse log loss subject to the S2 guardrail ────────────── */
console.log(`\nDEVELOPMENT sweep — sparse subpopulation is the selection metric`);
const sweep = [];
for (const k of GRID) {
  const { preds } = predictAll(k);
  const dev = inSeasons(preds, DEV_SEASONS);
  const s = metrics(sparseOf(dev));
  const o = metrics(dev);
  sweep.push({ k, devSparse: s, devOverall: o, full: preds });
  console.log(`  k=${String(k).padEnd(3)} sparse ${s.logLoss} (Δ ${(s.logLoss - ctlDevSparse.logLoss).toFixed(4)})  overall ${o.logLoss} (Δ ${(o.logLoss - ctlDevAll.logLoss).toFixed(4)})  sparse-ece ${s.ece}`);
}
const eligible = sweep.filter((r) => r.devOverall.logLoss - ctlDevAll.logLoss <= 0.002);
if (eligible.length === 0) {
  console.error("\nNo k satisfies the S2 overall guardrail on development — the repair is REJECTED before holdout.");
  process.exit(3);
}
const locked = eligible.reduce((a, b) => (a.devSparse.logLoss <= b.devSparse.logLoss ? a : b));
console.log(`\nLOCKED on development sparse: k=${locked.k}. The holdout has not been scored for any configuration up to this line.`);

/* ── HOLDOUT, once, control + locked only ────────────────────────────────────────────────────── */
const ctlHold = inSeasons(control.preds, HOLDOUT_SEASONS);
const lockHold = inSeasons(locked.full, HOLDOUT_SEASONS);
const ctlHoldSparse = metrics(sparseOf(ctlHold)); const ctlHoldAll = metrics(ctlHold);
const lockHoldSparse = metrics(sparseOf(lockHold)); const lockHoldAll = metrics(lockHold);
console.log(`\nHOLDOUT 2025-26 — sparse n=${ctlHoldSparse.n}: control ${ctlHoldSparse.logLoss} vs locked ${lockHoldSparse.logLoss}`);
console.log(`  overall n=${ctlHoldAll.n}: control ${ctlHoldAll.logLoss} vs locked ${lockHoldAll.logLoss} · ece ${ctlHoldAll.ece} vs ${lockHoldAll.ece}`);

/* ── Forward 2026-27, OBSERVATIONAL ONLY (never gates) ───────────────────────────────────────── */
const full = loadEplCorpus(REPO);
const fullSorted = [...full.rows].sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)));
const fwdSeason = "2026-27";
const fwdCtl = predictAll(0, fullSorted).preds.filter((p) => p.season === fwdSeason);
const fwdLock = predictAll(locked.k, fullSorted).preds.filter((p) => p.season === fwdSeason);
const forward = {
  season: fwdSeason, observationalOnly: true,
  control: { sparse: metrics(sparseOf(fwdCtl)), overall: metrics(fwdCtl) },
  locked: { sparse: metrics(sparseOf(fwdLock)), overall: metrics(fwdLock) },
};

/* ── S6 structural + live fixture check ──────────────────────────────────────────────────────── */
const lockedZeroMultipliers = predictAll(locked.k).zeroMultipliers;
const liveState = fitEplStrength({ rows: fullSorted, cutoffIso: NOW });
const liveCtl = scoreMatrix(liveState, "Chelsea", "Hull City", { shrinkK: 0 });
const liveLock = scoreMatrix(liveState, "Chelsea", "Hull City", { shrinkK: locked.k });
const floorLeft = liveLock.lambdas.home > EPL_POISSON_PARAMS.LAMBDA_FLOOR;
console.log(`\nLive Chelsea v Hull: control λH ${liveCtl.lambdas.home} → locked λH ${liveLock.lambdas.home}; home win ${liveCtl.oneXTwo.home} → ${liveLock.oneXTwo.home}`);

/* ── Bars ────────────────────────────────────────────────────────────────────────────────────── */
const bars = [
  { id: "S1_sparse_dev_improves", pass: ctlDevSparse.logLoss - locked.devSparse.logLoss >= 0.010,
    detail: `dev sparse ${locked.devSparse.logLoss} vs control ${ctlDevSparse.logLoss} — improvement ${(ctlDevSparse.logLoss - locked.devSparse.logLoss).toFixed(4)}, need >= 0.010 (n=${ctlDevSparse.n})` },
  { id: "S2_overall_dev_guardrail", pass: locked.devOverall.logLoss - ctlDevAll.logLoss <= 0.002,
    detail: `dev overall ${locked.devOverall.logLoss} vs control ${ctlDevAll.logLoss} — degradation ${(locked.devOverall.logLoss - ctlDevAll.logLoss).toFixed(4)}, allowed <= 0.002` },
  { id: "S3_sparse_holdout_generalises", pass: lockHoldSparse.logLoss < ctlHoldSparse.logLoss,
    detail: `holdout sparse ${lockHoldSparse.logLoss} vs control ${ctlHoldSparse.logLoss} (n=${ctlHoldSparse.n}) — need any improvement` },
  { id: "S4_overall_holdout_guardrail", pass: lockHoldAll.logLoss - ctlHoldAll.logLoss <= 0.002,
    detail: `holdout overall ${lockHoldAll.logLoss} vs control ${ctlHoldAll.logLoss} — degradation ${(lockHoldAll.logLoss - ctlHoldAll.logLoss).toFixed(4)}, allowed <= 0.002` },
  { id: "S5_calibration_guardrail", pass: lockHoldAll.ece - ctlHoldAll.ece <= 0.010,
    detail: `holdout ECE ${lockHoldAll.ece} vs control ${ctlHoldAll.ece} — degradation ${(lockHoldAll.ece - ctlHoldAll.ece).toFixed(4)}, allowed <= 0.010` },
  { id: "S6_structural_no_zero_multiplier", pass: lockedZeroMultipliers === 0 && floorLeft,
    detail: `walk-forward zero multipliers with k=${locked.k}: ${lockedZeroMultipliers} (control had a structural path to 0); live Chelsea λH ${liveLock.lambdas.home} > floor ${EPL_POISSON_PARAMS.LAMBDA_FLOOR}: ${floorLeft}` },
];
const verdict = bars.every((b) => b.pass) ? "ACCEPTED" : "REJECTED";
console.log(`\nBARS`);
for (const b of bars) console.log(`  ${b.pass ? "PASS" : "FAIL"}  ${b.id.padEnd(34)} ${b.detail}`);
console.log(`\nVERDICT: ${verdict}`);

const strip = ({ full: _f, ...rest }) => rest;
const report = {
  schemaVersion: 1,
  artifact: "epl-sparse-split-repair-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  generatedAt: NOW,
  preregistration: { file: "preregistration-sparse-split-v1.json", registeredAt: prereg.registeredAt },
  holdoutDisclosure: prereg.populations.holdout.disclosure,
  control: { devSparse: ctlDevSparse, devOverall: ctlDevAll, holdoutSparse: ctlHoldSparse, holdoutOverall: ctlHoldAll },
  developmentSweep: sweep.map((r) => strip({ ...r })),
  locked: { k: locked.k },
  holdout: { lockedSparse: lockHoldSparse, lockedOverall: lockHoldAll, controlSparse: ctlHoldSparse, controlOverall: ctlHoldAll },
  forward2026_27: forward,
  liveFixtureCheck: {
    fixture: "Chelsea v Hull City 2026-09-12", cutoff: NOW,
    control: { lambdas: liveCtl.lambdas, oneXTwo: liveCtl.oneXTwo },
    locked: { lambdas: liveLock.lambdas, oneXTwo: liveLock.oneXTwo },
  },
  bars,
  verdict,
  note: verdict === "ACCEPTED"
    ? "Every preregistered bar cleared. Adoption per the preregistration's onSuccess: shrinkK flows to the live generator, the model id bumps, and only pre-event fixtures regenerate."
    : "At least one preregistered bar failed. shrinkK stays 0; the recorded original stands with the bounded suspect-output labeling from the preregistration's onFailure.",
};

if (WRITE) {
  fs.writeFileSync(path.join(RESEARCH, "reports/sparse-split-repair.json"), JSON.stringify(report, null, 1) + "\n");
  console.log(`\nwrote data/internal/research/epl/reports/sparse-split-repair.json`);
} else {
  console.log(`\ndry run — pass --write to persist the report.`);
}
