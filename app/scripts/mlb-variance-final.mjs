/**
 * PROGRAM 058–061 LANE C — the FINAL preregistered MLB variance/shrinkage protocol.
 *
 * Everything scored here was declared first in docs/experiments/MLB_VARIANCE_FINAL_PREREGISTRATION.md
 * (committed before this file existed — the git order is the proof). This runner:
 *
 *   · freezes and fingerprints the corpus (SHA-256 over the sorted row serialization);
 *   · fits every candidate on TRAIN only (≤ 2026-06-24);
 *   · selects the single decision-carrying independent candidate on VALIDATION only (07-01→07-11);
 *   · scores ONCE on the UNTOUCHED TEST window (07-21→07-27), with sub-window and
 *     leave-one-market-out stability checks;
 *   · applies the preregistered thresholds and the binding stopping rule;
 *   · refuses to run at all if the experiment framework's self-test fails (a void run).
 *
 * Read-only. No production probability changes. Usage:
 *   npx tsx scripts/mlb-variance-final.mjs [--json f]
 */
import crypto from "node:crypto";
import fs from "node:fs";

import { loadRows, fitPlattParams, plattFromParams } from "./model-learning-audit.mjs";
import { normInv, normCdf, varianceExpand, linearShrink, selfTest } from "./model-experiments.mjs";

const clip = (p, eps = 1e-6) => Math.min(1 - eps, Math.max(eps, p));
const mean = (xs) => (xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : null);
const brier = (rows, pick) => (rows.length ? rows.reduce((a, r) => a + (pick(r) - r.y) ** 2, 0) / rows.length : null);
const logLoss = (rows, pick) =>
  rows.length
    ? rows.reduce((a, r) => {
        const p = clip(pick(r));
        return a - (r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
      }, 0) / rows.length
    : null;

// ── preregistered constants (must match the registration document exactly) ─────

export const WINDOWS = {
  trainEnd: "2026-06-24",
  valStart: "2026-07-01",
  valEnd: "2026-07-11",
  testStart: "2026-07-21",
  testEnd: "2026-07-27",
};
export const SUB_WINDOWS = [
  ["2026-07-21", "2026-07-23"],
  ["2026-07-24", "2026-07-25"],
  ["2026-07-26", "2026-07-27"],
];
const K_GRID = Array.from({ length: 61 }, (_, i) => 1 + i * 0.05);
const S_GRID = Array.from({ length: 51 }, (_, i) => i * 0.02);
const W_GRID = Array.from({ length: 51 }, (_, i) => i * 0.02);
const PER_MARKET_MIN_TRAIN = 500;
const PER_MARKET_SHRINK_LAMBDA = 1000;
const MARGIN = 0.001; // OUTPERFORMS/PARITY band
const HONESTY_PP = 0.015; // |mean predicted − observed| for parity
const RAW_IMPROVE = 0.002; // IMPROVES_MODEL_ONLY bar vs raw
const FAMILY_MIN_TEST = 300;

export function splitWindows(rows) {
  const train = rows.filter((r) => r.date <= WINDOWS.trainEnd);
  const validation = rows.filter((r) => r.date >= WINDOWS.valStart && r.date <= WINDOWS.valEnd);
  const test = rows.filter((r) => r.date >= WINDOWS.testStart && r.date <= WINDOWS.testEnd);
  const leaked = rows.length - train.length - validation.length - test.length - rows.filter((r) => (r.date > WINDOWS.trainEnd && r.date < WINDOWS.valStart) || (r.date > WINDOWS.valEnd && r.date < WINDOWS.testStart) || r.date > WINDOWS.testEnd).length;
  if (leaked !== 0) throw new Error("window partition is not a partition");
  return { train, validation, test };
}

export function fingerprint(rows) {
  const canon = rows
    .map((r) => `${r.date}|${r.market}|${r.p.toFixed(6)}|${r.q.toFixed(6)}|${r.y}`)
    .sort()
    .join("\n");
  return crypto.createHash("sha256").update(canon).digest("hex");
}

// ── candidate fitting (train only) ──────────────────────────────────────────────

const gridFit = (train, candidates, makePick) => {
  let best = null;
  for (const v of candidates) {
    const s = brier(train, makePick(v));
    if (best === null || s < best.s) best = { v, s };
  }
  return best.v;
};

export function fitCandidates(train) {
  const kGlobal = gridFit(train, K_GRID, (k) => (r) => varianceExpand(k)(r.p));

  const byMarket = {};
  for (const m of [...new Set(train.map((r) => r.market))]) {
    const sub = train.filter((r) => r.market === m);
    if (sub.length < PER_MARKET_MIN_TRAIN) {
      byMarket[m] = kGlobal;
    } else {
      const kHat = gridFit(sub, K_GRID, (k) => (r) => varianceExpand(k)(r.p));
      byMarket[m] = (sub.length * kHat + PER_MARKET_SHRINK_LAMBDA * kGlobal) / (sub.length + PER_MARKET_SHRINK_LAMBDA);
    }
  }

  const s = gridFit(train, S_GRID, (s) => (r) => linearShrink(s)(r.p));
  const w = gridFit(train, W_GRID, (w) => (r) => w * clip(r.p) + (1 - w) * clip(r.q));

  const ve = varianceExpand(kGlobal);
  const plattParams = fitPlattParams(train.map((r) => ({ ...r, p: ve(r.p) })));
  const platt = plattFromParams(plattParams);

  return {
    C1: { label: "global variance widening", independent: true, params: { k: kGlobal }, predict: (r) => varianceExpand(kGlobal)(r.p) },
    C2: {
      label: "per-market variance widening (shrunk)",
      independent: true,
      params: { global: kGlobal, byMarket },
      predict: (r) => varianceExpand(byMarket[r.market] ?? kGlobal)(r.p),
    },
    C3: { label: "shrinkage toward 0.5", independent: true, params: { s }, predict: (r) => linearShrink(s)(r.p) },
    C4: {
      label: "shrinkage toward de-vigged market (HYBRID)",
      independent: false,
      params: { w },
      predict: (r) => w * clip(r.p) + (1 - w) * clip(r.q),
    },
    C5: {
      label: "variance widening then Platt",
      independent: true,
      params: { k: kGlobal, a: plattParams.a, b: plattParams.b },
      predict: (r) => platt(ve(r.p)),
    },
    C6: { label: "market-only control", independent: false, params: {}, predict: (r) => r.q },
  };
}

// ── preregistered verdict ───────────────────────────────────────────────────────

export function finalVerdict({ bSel, bMkt, bRaw, subWindowBeats, subWindowWorseThanRaw, lomoAllBelowMarket, honestyGapPp }) {
  if (subWindowWorseThanRaw) return "REJECT";
  if (bSel <= bMkt - MARGIN && subWindowBeats >= 2 && lomoAllBelowMarket) return "OUTPERFORMS_MARKET";
  if (Math.abs(bSel - bMkt) <= MARGIN && honestyGapPp <= HONESTY_PP * 100) return "REACHES_PARITY";
  if (bSel <= bRaw - RAW_IMPROVE && bSel > bMkt + MARGIN) return "IMPROVES_MODEL_ONLY";
  return "REJECT";
}

export function familyDecision({ testN, ciBelowHalf, bSelFamily, bMktFamily }) {
  if (testN < FAMILY_MIN_TEST) return "INSUFFICIENT_EVIDENCE";
  if (ciBelowHalf) return "DISABLE_PREDICTION";
  if (bSelFamily <= bMktFamily - MARGIN) return "CONTINUE_R&D";
  return "RESEARCH_CONTENT_ONLY";
}

// wilson CI lower/upper for full-corpus hit rate (same z as elsewhere)
const wilsonCi = (wins, n, z = 1.96) => {
  if (!n) return [0, 1];
  const phat = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = phat + (z * z) / (2 * n);
  const half = z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n));
  return [(centre - half) / denom, (centre + half) / denom];
};

// ── run ─────────────────────────────────────────────────────────────────────────

export function runFinalProtocol(rows) {
  const voidCheck = selfTest();
  if (voidCheck.length) throw new Error(`framework self-test failed — run is VOID:\n${voidCheck.join("\n")}`);

  const { train, validation, test } = splitWindows(rows);
  const candidates = fitCandidates(train);

  // Selection on validation, independent candidates only.
  const independents = ["C1", "C2", "C3", "C5"];
  const valScores = Object.fromEntries(independents.map((id) => [id, brier(validation, candidates[id].predict)]));
  const selectedId = independents.reduce((a, b) => (valScores[a] <= valScores[b] ? a : b));
  const sel = candidates[selectedId];

  // Single TEST scoring.
  const bRaw = brier(test, (r) => r.p);
  const bMkt = brier(test, (r) => r.q);
  const testScores = Object.fromEntries(
    Object.entries(candidates).map(([id, c]) => [
      id,
      { brier: brier(test, c.predict), logLoss: logLoss(test, c.predict), meanPredicted: mean(test.map(c.predict)) },
    ]),
  );
  const bSel = testScores[selectedId].brier;

  // Stability: sub-windows.
  const subs = SUB_WINDOWS.map(([a, b]) => {
    const w = test.filter((r) => r.date >= a && r.date <= b);
    return { window: `${a}→${b}`, n: w.length, sel: brier(w, sel.predict), market: brier(w, (r) => r.q), raw: brier(w, (r) => r.p) };
  });
  const subWindowBeats = subs.filter((s) => s.sel < s.market).length;
  const subWindowWorseThanRaw = subs.some((s) => s.sel > s.raw);

  // Stability: leave-one-market-out (only matters for the OUTPERFORMS gate).
  const families = [...new Set(test.map((r) => r.market))];
  const lomo = families.map((m) => {
    const w = test.filter((r) => r.market !== m);
    return { excluded: m, sel: brier(w, sel.predict), market: brier(w, (r) => r.q) };
  });
  const lomoAllBelowMarket = lomo.every((x) => x.sel <= x.market);

  const honestyGapPp = Math.abs((testScores[selectedId].meanPredicted - mean(test.map((r) => r.y))) * 100);

  const verdict = finalVerdict({ bSel, bMkt, bRaw, subWindowBeats, subWindowWorseThanRaw, lomoAllBelowMarket, honestyGapPp });
  const stoppingRuleTriggered = verdict === "IMPROVES_MODEL_ONLY" || verdict === "REJECT";

  // Per-market decisions.
  const perMarket = families.map((m) => {
    const fam = test.filter((r) => r.market === m);
    const all = rows.filter((r) => r.market === m);
    const wins = all.reduce((a, r) => a + r.y, 0);
    const [lo, hi] = wilsonCi(wins, all.length);
    const d = {
      market: m,
      testN: fam.length,
      corpusN: all.length,
      corpusHitRate: wins / all.length,
      ci: [lo, hi],
      selBrier: brier(fam, sel.predict),
      marketBrier: brier(fam, (r) => r.q),
      rawBrier: brier(fam, (r) => r.p),
    };
    d.decision = familyDecision({ testN: d.testN, ciBelowHalf: hi < 0.5, bSelFamily: d.selBrier, bMktFamily: d.marketBrier });
    return d;
  });

  return {
    preregistration: "docs/experiments/MLB_VARIANCE_FINAL_PREREGISTRATION.md",
    corpus: { rows: rows.length, dates: [...new Set(rows.map((r) => r.date))].length, first: rows[0]?.date, last: rows.at(-1)?.date, sha256: fingerprint(rows) },
    windows: { train: train.length, validation: validation.length, test: test.length },
    candidates: Object.fromEntries(Object.entries(candidates).map(([id, c]) => [id, { label: c.label, independent: c.independent, params: c.params }])),
    validationScores: valScores,
    selectedId,
    testScores,
    baselines: { rawBrier: bRaw, marketBrier: bMkt, observed: mean(test.map((r) => r.y)) },
    stability: { subWindows: subs, subWindowBeats, subWindowWorseThanRaw, leaveOneMarketOut: lomo, lomoAllBelowMarket, honestyGapPp },
    verdict,
    stoppingRuleTriggered,
    perMarket,
  };
}

// ── main ────────────────────────────────────────────────────────────────────────

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function main() {
  const rows = loadRows();
  if (!rows.length) {
    console.error("no settled rows found — run from app/");
    process.exit(1);
  }
  const R = runFinalProtocol(rows);
  const f4 = (x) => (x == null ? "—" : x.toFixed(4));
  const pct = (x) => (x == null ? "—" : `${(100 * x).toFixed(2)}%`);

  console.log(`=== FINAL preregistered MLB variance protocol ===`);
  console.log(`  corpus ${R.corpus.rows} rows · ${R.corpus.dates} dates · sha256 ${R.corpus.sha256.slice(0, 16)}…`);
  console.log(`  windows train ${R.windows.train} / validation ${R.windows.validation} / untouched test ${R.windows.test}\n`);
  console.log(`  validation Brier (independent candidates): ${Object.entries(R.validationScores).map(([k, v]) => `${k} ${f4(v)}`).join(" · ")}`);
  console.log(`  SELECTED on validation: ${R.selectedId} — ${R.candidates[R.selectedId].label} ${JSON.stringify(R.candidates[R.selectedId].params).slice(0, 90)}\n`);
  console.log(`  TEST window: raw ${f4(R.baselines.rawBrier)} · market ${f4(R.baselines.marketBrier)} · observed ${pct(R.baselines.observed)}`);
  for (const [id, s] of Object.entries(R.testScores)) {
    console.log(`    ${id} ${R.candidates[id].label.padEnd(42).slice(0, 42)} Brier ${f4(s.brier)} · logLoss ${f4(s.logLoss)} · meanPred ${pct(s.meanPredicted)}${id === R.selectedId ? "   ← selected" : ""}`);
  }
  console.log(`\n  stability: sub-windows beating market ${R.stability.subWindowBeats}/3 · worse-than-raw anywhere: ${R.stability.subWindowWorseThanRaw} · LOMO all ≤ market: ${R.stability.lomoAllBelowMarket} · honesty gap ${R.stability.honestyGapPp.toFixed(2)}pp`);
  console.log(`\n  VERDICT: ${R.verdict}${R.stoppingRuleTriggered ? "  → STOPPING RULE TRIGGERED: independent sportsbook-beating objective SUSPENDED" : ""}\n`);
  console.log(`  per-market decisions (selected candidate on TEST):`);
  for (const m of R.perMarket) {
    console.log(`    ${m.market.padEnd(24)} testN ${String(m.testN).padStart(4)} · sel ${f4(m.selBrier)} vs mkt ${f4(m.marketBrier)} · corpus ${pct(m.corpusHitRate)} CI [${pct(m.ci[0])}, ${pct(m.ci[1])}] → ${m.decision}`);
  }

  const json = arg("--json");
  if (json) {
    fs.writeFileSync(json, JSON.stringify(R, null, 2));
    console.log(`\n  wrote ${json}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
