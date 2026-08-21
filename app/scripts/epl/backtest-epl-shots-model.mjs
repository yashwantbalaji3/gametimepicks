#!/usr/bin/env node
/**
 * EPL SHOTS / SHOTS-ON-GOAL BACKTEST — run the bars frozen in preregistration-shots-v1.json.
 *
 *   node scripts/epl/backtest-epl-shots-model.mjs [--write]
 *
 * Two targets, each swept and judged INDEPENDENTLY, both verdicts reported whichever way they fall.
 * Selection runs on DEVELOPMENT only; the holdout season is scored after the configuration is locked,
 * and only for that configuration and the two baselines — the script cannot rank configurations by
 * holdout because it never computes holdout for the losers.
 *
 * Walk-forward by match date: rates for a match are fitted on matches dated strictly earlier.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitCountRates, predictCount, predictCountRaw, predictCountPositional, participationState } from "../../src/lib/sports/epl/player-rates.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const RESEARCH = path.join(REPO, "data/internal/research/epl");
const WRITE = process.argv.includes("--write");

const prereg = JSON.parse(fs.readFileSync(path.join(RESEARCH, "preregistration-shots-v1.json"), "utf8"));
const rows = fs.readFileSync(path.join(RESEARCH, "players/espn-players-v1.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

const WARMUP = prereg.protocol.warmup.season;
const DEV_SEASONS = new Set(prereg.protocol.development.seasons);
const HOLD_SEASON = prereg.protocol.holdout.season;

const byFixture = new Map();
for (const r of rows) {
  if (!byFixture.has(r.espnEventId)) byFixture.set(r.espnEventId, { date: r.dateUtc, season: r.season, rows: [] });
  byFixture.get(r.espnEventId).rows.push(r);
}
const fixtures = [...byFixture.entries()].map(([id, v]) => ({ id, ...v }))
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));
const DEV = new Set(fixtures.filter((f) => DEV_SEASONS.has(f.season)).map((f) => f.id));
const HOLD = new Set(fixtures.filter((f) => f.season === HOLD_SEASON).map((f) => f.id));
if (DEV.size === 0 || HOLD.size === 0) { console.error(`REFUSED — dev ${DEV.size} / holdout ${HOLD.size}`); process.exit(2); }
console.log(`corpus ${fixtures.length} fixtures · warm-up ${WARMUP} · dev ${DEV.size} · holdout ${HOLD.size} (${HOLD_SEASON})`);

/* ── Metrics ─────────────────────────────────────────────────────────────────────────────────── */
const clip = (p) => Math.min(1 - 1e-15, Math.max(1e-15, p));
function metrics(preds) {
  const usable = preds.filter((r) => r.p != null);
  const n = usable.length;
  if (n === 0) return null;
  let ll = 0, brier = 0, sumP = 0, obs = 0;
  for (const r of usable) {
    ll += -(r.y * Math.log(clip(r.p)) + (1 - r.y) * Math.log(1 - clip(r.p)));
    brier += (r.p - r.y) ** 2; sumP += r.p; obs += r.y;
  }
  const bins = Array.from({ length: 10 }, () => ({ n: 0, sumP: 0, hits: 0 }));
  for (const r of usable) { const b = Math.min(9, Math.floor(r.p * 10)); bins[b].n += 1; bins[b].sumP += r.p; bins[b].hits += r.y; }
  const ece = bins.filter((b) => b.n > 0).reduce((s, b) => s + (b.n / n) * Math.abs(b.sumP / b.n - b.hits / b.n), 0);
  return {
    n, coverage: Number((n / preds.length).toFixed(4)),
    logLoss: Number((ll / n).toFixed(5)), brier: Number((brier / n).toFixed(5)), ece: Number(ece.toFixed(5)),
    predictedOver: Number(sumP.toFixed(1)), observedOver: obs,
    countError: Number((Math.abs(sumP - obs) / Math.max(1, obs)).toFixed(4)),
  };
}
const on = (preds, split) => metrics(preds.filter((r) => r.split === split));

/** One walk-forward pass for one target and one predictor. */
function walkForward(field, line, predictFn) {
  const out = [];
  const prior = [];
  let fit = fitCountRates([], field);
  let lastDate = null;
  for (const f of fixtures) {
    if (f.date !== lastDate) { fit = fitCountRates(prior, field); lastDate = f.date; }
    if (DEV.has(f.id) || HOLD.has(f.id)) {
      for (const r of f.rows) {
        const state = participationState(r);
        if (!state) continue;
        const p = predictFn(fit, { playerId: r.playerId, position: r.position, state });
        out.push({ split: DEV.has(f.id) ? "dev" : "holdout", y: Number(r[field] ?? 0) > line ? 1 : 0, p: p ? p.probability : null });
      }
    }
    prior.push(...f.rows);
  }
  return out;
}

const FIELD = { shots_over_0_5: "shots", sog_over_0_5: "shotsOnGoal" };
const results = [];

for (const target of prereg.targets) {
  const field = FIELD[target.id];
  const line = target.line;
  console.log(`\n${"=".repeat(70)}\nTARGET ${target.id} — ${target.market}, line ${line}`);

  /* Baselines are computed under BOTH distributions and the better one is used, so the model is never
     compared against a baseline handicapped by a distribution nobody would have chosen for it. */
  const baseline = (name, fn) => {
    const best = ["poisson", "negbin"].map((distribution) => {
      const preds = walkForward(field, line, (fit, x) => fn(fit, x, { distribution }));
      return { distribution, preds, dev: on(preds, "dev") };
    }).reduce((a, b) => (a.dev.logLoss <= b.dev.logLoss ? a : b));
    console.log(`  baseline ${name.padEnd(11)} dev logLoss ${best.dev.logLoss} (${best.distribution})`);
    return best;
  };
  const pos = baseline("positional", predictCountPositional);
  const raw = baseline("player_raw", predictCountRaw);

  console.log(`  DEVELOPMENT sweep`);
  const sweep = [];
  for (const distribution of prereg.stoppingRule.grid.distribution) {
    for (const k of prereg.stoppingRule.grid.k) {
      const preds = walkForward(field, line, (fit, x) => predictCount(fit, x, { k, distribution }));
      const m = on(preds, "dev");
      sweep.push({ k, distribution, dev: m });
      console.log(`    ${distribution.padEnd(8)} k=${String(k).padEnd(3)} logLoss ${m.logLoss.toFixed(5)}  ece ${m.ece.toFixed(4)}`);
    }
  }
  const locked = sweep.reduce((a, b) => (a.dev.logLoss <= b.dev.logLoss ? a : b));
  console.log(`  LOCKED: ${locked.distribution} k=${locked.k} (dev logLoss ${locked.dev.logLoss})`);
  console.log(`  The holdout season has not been scored for any configuration up to this line.`);

  const lockedPreds = walkForward(field, line, (fit, x) => predictCount(fit, x, { k: locked.k, distribution: locked.distribution }));
  const mHold = on(lockedPreds, "holdout");
  const posHold = on(pos.preds, "holdout");
  const rawHold = on(raw.preds, "holdout");

  console.log(`  HOLDOUT (n=${mHold.n})`);
  console.log(`    model      logLoss ${mHold.logLoss}  ece ${mHold.ece}  predicted ${mHold.predictedOver} vs observed ${mHold.observedOver}`);
  console.log(`    positional logLoss ${posHold.logLoss}  ece ${posHold.ece}`);
  console.log(`    raw        logLoss ${rawHold.logLoss}`);

  const bars = [
    { id: "S1_beats_positional", pass: posHold.logLoss - mHold.logLoss >= 0.005, detail: `${mHold.logLoss} vs ${posHold.logLoss} — improvement ${(posHold.logLoss - mHold.logLoss).toFixed(5)}, need >= 0.005` },
    { id: "S2_shrinkage_earns_it", pass: mHold.logLoss <= rawHold.logLoss, detail: `${mHold.logLoss} vs raw ${rawHold.logLoss}` },
    { id: "S3_calibrated", pass: mHold.ece <= 0.020, detail: `ECE ${mHold.ece}, allowed <= 0.020` },
    { id: "S4_count_sane", pass: mHold.countError <= 0.10, detail: `predicted ${mHold.predictedOver} vs observed ${mHold.observedOver} — ${(mHold.countError * 100).toFixed(1)}%, allowed <= 10%` },
    { id: "S5_no_abstention_gaming", pass: mHold.coverage >= 0.95, detail: `coverage ${(mHold.coverage * 100).toFixed(1)}%` },
  ];
  const verdict = bars.every((b) => b.pass) ? "ACCEPTED" : "REJECTED";
  console.log(`  BARS`);
  for (const b of bars) console.log(`    ${b.pass ? "PASS" : "FAIL"}  ${b.id.padEnd(24)} ${b.detail}`);
  console.log(`  VERDICT: ${verdict}`);

  results.push({
    target: target.id, market: target.market, line,
    locked: { k: locked.k, distribution: locked.distribution },
    developmentSweep: sweep.map((s) => ({ k: s.k, distribution: s.distribution, devLogLoss: s.dev.logLoss, devEce: s.dev.ece })),
    baselines: { positional: { distribution: pos.distribution, holdout: posHold }, playerRaw: { distribution: raw.distribution, holdout: rawHold } },
    model: { dev: locked.dev, holdout: mHold },
    bars, verdict,
  });
}

console.log(`\n${"=".repeat(70)}`);
for (const r of results) console.log(`${r.target.padEnd(18)} ${r.verdict}`);

const report = {
  schemaVersion: 1,
  artifact: "epl-shots-model-v1-backtest",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  generatedAt: new Date().toISOString(),
  preregistration: { file: "preregistration-shots-v1.json", registeredAt: prereg.registeredAt },
  protocol: prereg.protocol,
  targets: results,
};

if (WRITE) {
  fs.writeFileSync(path.join(RESEARCH, "reports/shots-model-v1-backtest.json"), JSON.stringify(report, null, 1) + "\n");
  console.log(`\nwrote data/internal/research/epl/reports/shots-model-v1-backtest.json`);
} else {
  console.log(`\ndry run — pass --write to persist.`);
}
