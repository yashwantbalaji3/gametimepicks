#!/usr/bin/env node
/**
 * EPL PLAYER MODEL BACKTEST — run the bars frozen in preregistration-player-v2.json.
 *
 * v1's run cleared every bar and was VOIDED: its positional baseline classified all 13,486 substitute
 * rows as defenders and blended centre-backs with centre-forwards, so the bar it beat was not the bar
 * that was written down. v2 repairs the baseline, drops the season v1 burned, and keeps the five bars
 * exactly as they were.
 *
 *   node scripts/epl/backtest-epl-player-model.mjs [--write]
 *
 * PROTOCOL DISCIPLINE IS THE POINT OF THIS FILE, exactly as it was for the team bake-off.
 *
 * Selection runs on DEVELOPMENT and nowhere else. The holdout half is scored only AFTER the winning
 * configuration is locked, and only for that configuration and the two baselines — the script cannot
 * rank configurations by holdout because it never computes holdout for the losers. Control flow, not
 * intention: "I looked but did not use it" is not a property anyone can verify afterwards.
 *
 * Walk-forward by match date. Rates for a match are fitted on matches dated strictly earlier, so a
 * player's own goal can never contribute to the rate used to predict it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitPlayerRates, predictPlayer, predictRaw, predictPositional, participationState, positionGroup } from "../../src/lib/sports/epl/player-rates.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const RESEARCH = path.join(REPO, "data/internal/research/epl");
const WRITE = process.argv.includes("--write");

const prereg = JSON.parse(fs.readFileSync(path.join(RESEARCH, "preregistration-player-v2.json"), "utf8"));
const rows = fs.readFileSync(path.join(RESEARCH, "players/espn-players-v1.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

/* ── Split, straight from the preregistration ────────────────────────────────────────────────── */
/*
 * v2 splits by SEASON rather than by half, and EXCLUDES one. 2025-26 was scored under v1 and is
 * burned; 2024-25 has never been scored (it was warm-up) and is therefore a valid holdout.
 */
const WARMUP = prereg.protocol.warmup.season;
const DEV_SEASON = prereg.protocol.development.season;
const HOLD_SEASON = prereg.protocol.holdout.season;
const EXCLUDED = prereg.protocol.excluded.season;
const byFixture = new Map();
for (const r of rows) {
  if (!byFixture.has(r.espnEventId)) byFixture.set(r.espnEventId, { date: r.dateUtc, season: r.season, rows: [] });
  byFixture.get(r.espnEventId).rows.push(r);
}
const fixtures = [...byFixture.entries()]
  .map(([id, v]) => ({ id, ...v }))
  .filter((f) => f.season !== EXCLUDED)                     // the burned season never enters the run
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

const DEV = new Set(fixtures.filter((f) => f.season === DEV_SEASON).map((f) => f.id));
const HOLD = new Set(fixtures.filter((f) => f.season === HOLD_SEASON).map((f) => f.id));
const warm = fixtures.filter((f) => f.season === WARMUP).length;
if (DEV.size === 0 || HOLD.size === 0) {
  console.error(`REFUSED — dev ${DEV.size} / holdout ${HOLD.size}. A split with an empty side would score nothing and report a verdict.`);
  process.exit(2);
}
console.log(`corpus ${fixtures.length} fixtures (${EXCLUDED} excluded as burned) · warm-up ${warm} (${WARMUP}) · dev ${DEV.size} (${DEV_SEASON}) · holdout ${HOLD.size} (${HOLD_SEASON})`);

/* ── One walk-forward pass ───────────────────────────────────────────────────────────────────── */
function walkForward(predictFn) {
  const out = [];
  const priorRows = [];
  let fit = fitPlayerRates([]);
  let lastDate = null;

  for (const f of fixtures) {
    /* Refit only when the date advances: every fixture on a day shares one pre-day state. */
    if (f.date !== lastDate) { fit = fitPlayerRates(priorRows); lastDate = f.date; }

    if (DEV.has(f.id) || HOLD.has(f.id)) {
      for (const r of f.rows) {
        const state = participationState(r);
        if (!state) continue;                               // population: appeared only
        const p = predictFn(fit, { playerId: r.playerId, position: r.position, state });
        out.push({
          fixtureId: f.id,
          split: DEV.has(f.id) ? "dev" : "holdout",
          y: Number(r.goals ?? 0) > 0 ? 1 : 0,
          p: p ? p.probability : null,
          group: positionGroup(r.position),
          state,
        });
      }
    }
    priorRows.push(...f.rows);
  }
  return out;
}

/* ── Metrics ─────────────────────────────────────────────────────────────────────────────────── */
const EPS = 1e-15;
const clip = (p) => Math.min(1 - EPS, Math.max(EPS, p));

function metrics(preds) {
  const usable = preds.filter((r) => r.p != null);
  const n = usable.length;
  if (n === 0) return null;
  let ll = 0, brier = 0, sumP = 0, obs = 0;
  for (const r of usable) {
    ll += -(r.y * Math.log(clip(r.p)) + (1 - r.y) * Math.log(1 - clip(r.p)));
    brier += (r.p - r.y) ** 2;
    sumP += r.p;
    obs += r.y;
  }
  // Expected calibration error over 10 bins.
  const bins = Array.from({ length: 10 }, () => ({ n: 0, sumP: 0, hits: 0 }));
  for (const r of usable) {
    const b = Math.min(9, Math.floor(r.p * 10));
    bins[b].n += 1; bins[b].sumP += r.p; bins[b].hits += r.y;
  }
  const ece = bins.filter((b) => b.n > 0).reduce((s, b) => s + (b.n / n) * Math.abs(b.sumP / b.n - b.hits / b.n), 0);
  return {
    n,
    coverage: Number((n / preds.length).toFixed(4)),
    logLoss: Number((ll / n).toFixed(5)),
    brier: Number((brier / n).toFixed(5)),
    ece: Number(ece.toFixed(5)),
    predictedScorers: Number(sumP.toFixed(1)),
    observedScorers: obs,
    countError: Number((Math.abs(sumP - obs) / Math.max(1, obs)).toFixed(4)),
  };
}
const on = (preds, split) => metrics(preds.filter((r) => r.split === split));

/* ── Baselines ───────────────────────────────────────────────────────────────────────────────── */
const positionalPreds = walkForward((fit, x) => predictPositional(fit, x));
const rawPreds = walkForward((fit, x) => predictRaw(fit, x));
const posDev = on(positionalPreds, "dev");
const rawDev = on(rawPreds, "dev");
console.log(`\nBASELINES (development)`);
console.log(`  positional  logLoss ${posDev.logLoss}  ece ${posDev.ece}  n ${posDev.n}`);
console.log(`  player_raw  logLoss ${rawDev.logLoss}  ece ${rawDev.ece}`);

/* ── Phase 1 · DEVELOPMENT sweep. Selection happens here and ONLY here ───────────────────────── */
const grid = prereg.stoppingRule.grid;
console.log(`\nDEVELOPMENT sweep — shrinkage k, selection metric = log loss`);
const devResults = [];
for (const k of grid.k) {
  const preds = walkForward((fit, x) => predictPlayer(fit, x, { k }));
  const m = on(preds, "dev");
  devResults.push({ k, dev: m });
  console.log(`  k=${String(k).padEnd(3)} logLoss ${m.logLoss.toFixed(5)}  vs positional ${(m.logLoss - posDev.logLoss >= 0 ? "+" : "") + (m.logLoss - posDev.logLoss).toFixed(5)}  ece ${m.ece.toFixed(4)}`);
}
const locked = devResults.reduce((a, b) => (a.dev.logLoss <= b.dev.logLoss ? a : b));
console.log(`\nLOCKED on development: k=${locked.k} (dev logLoss ${locked.dev.logLoss})`);
console.log("The holdout season has not been scored for any configuration up to this line.");

/* ── Phase 2 · HOLDOUT, once, for the locked config and the two baselines ────────────────────── */
const lockedPreds = walkForward((fit, x) => predictPlayer(fit, x, { k: locked.k }));
const mHold = on(lockedPreds, "holdout");
const posHold = on(positionalPreds, "holdout");
const rawHold = on(rawPreds, "holdout");

console.log(`\nHOLDOUT (n=${mHold.n}) — scored once`);
console.log(`  model       logLoss ${mHold.logLoss}  brier ${mHold.brier}  ece ${mHold.ece}  predicted ${mHold.predictedScorers} vs observed ${mHold.observedScorers}`);
console.log(`  positional  logLoss ${posHold.logLoss}  ece ${posHold.ece}`);
console.log(`  player_raw  logLoss ${rawHold.logLoss}  ece ${rawHold.ece}`);

/* ── The five bars ───────────────────────────────────────────────────────────────────────────── */
const bars = [
  { id: "P1_beats_positional", pass: posHold.logLoss - mHold.logLoss >= 0.005,
    detail: `model ${mHold.logLoss} vs positional ${posHold.logLoss} — improvement ${(posHold.logLoss - mHold.logLoss).toFixed(5)}, need >= 0.005` },
  { id: "P2_shrinkage_earns_it", pass: mHold.logLoss <= rawHold.logLoss,
    detail: `model ${mHold.logLoss} vs raw ${rawHold.logLoss} — need <= raw` },
  { id: "P3_calibrated", pass: mHold.ece <= 0.020,
    detail: `holdout ECE ${mHold.ece}, allowed <= 0.020` },
  { id: "P4_scorer_count_sane", pass: mHold.countError <= 0.10,
    detail: `predicted ${mHold.predictedScorers} vs observed ${mHold.observedScorers} — error ${(mHold.countError * 100).toFixed(1)}%, allowed <= 10%` },
  { id: "P5_no_abstention_gaming", pass: mHold.coverage >= 0.95,
    detail: `coverage ${(mHold.coverage * 100).toFixed(1)}%, need >= 95%` },
];
const verdict = bars.every((b) => b.pass) ? "ACCEPTED" : "REJECTED";

console.log(`\nBARS`);
for (const b of bars) console.log(`  ${b.pass ? "PASS" : "FAIL"}  ${b.id.padEnd(26)} ${b.detail}`);
console.log(`\nVERDICT: ${verdict}${verdict === "REJECTED" ? " — nothing player-level ships. The rejection is the finding." : " — every preregistered bar cleared on a half no hyperparameter touched."}`);

const report = {
  schemaVersion: 1,
  artifact: "epl-player-model-v2-backtest",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  generatedAt: new Date().toISOString(),
  preregistration: { file: "preregistration-player-v2.json", registeredAt: prereg.registeredAt },
  protocol: { ...prereg.protocol, devFixtures: DEV.size, holdoutFixtures: HOLD.size },
  developmentSweep: devResults.map((r) => ({ k: r.k, devLogLoss: r.dev.logLoss, devEce: r.dev.ece })),
  locked: { k: locked.k },
  baselines: { positional: { dev: posDev, holdout: posHold }, playerRaw: { dev: rawDev, holdout: rawHold } },
  model: { dev: locked.dev, holdout: mHold },
  bars,
  verdict,
};

if (WRITE) {
  fs.writeFileSync(path.join(RESEARCH, "reports/player-model-v2-backtest.json"), JSON.stringify(report, null, 1) + "\n");
  console.log(`\nwrote data/internal/research/epl/reports/player-model-v2-backtest.json`);
} else {
  console.log(`\ndry run — pass --write to persist the report.`);
}
