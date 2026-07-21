/**
 * recalibrate-mlb-modeled-markets.mjs — leakage-safe, out-of-sample recalibration experiment for the 4 demoted
 * MLB player-prop markets. INTERNAL ONLY. Decides nothing public; produces evidence + verdicts.
 *
 * Discipline (non-negotiable):
 *   - Chronological only. Final holdout = last N dates, frozen BEFORE any tuning.
 *   - Method + hyperparameter selection uses ONLY a walk-forward over the pre-holdout dates (never the holdout).
 *   - Every scored recalibrated probability comes from a transform fitted strictly on EARLIER dates.
 *   - The de-vigged market probability is the benchmark. Beating the raw model is NOT success.
 *   - Pregame fields only (projection, line, sigma, rawModelProb, de-vigged market prob, lean, market).
 *   - Never fit and score the same rows.
 *
 * Data: settled_leans.jsonl (official actual/outcome) ⋈ pregame board archives (modelProb + de-vigged market)
 * by id — identical join to audit-mlb-modeled-markets.mjs. Writes data/internal/mlb/calibration/*.json (public:false).
 *
 * Run: node app/scripts/recalibrate-mlb-modeled-markets.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const BOARD_DIR = path.join(APP, "public/data/mlb/boards");
const SETTLED = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");
const OUT_DIR = path.join(REPO, "data/internal/mlb/calibration");
const MARKETS = ["pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis"];

// ── protocol constants (declared BEFORE fitting) ──
const HOLDOUT_DATES = 9;      // last 9 of 43 dates = ~20% chronological holdout, frozen before tuning
const WF_INITIAL = 15;        // walk-forward initial training window (dates) inside the selection region
const MIN_HOLDOUT_OBS = 500;  // strict final-holdout min per market
const MIN_HOLDOUT_DATES = 5;
const SHRINK_GRID = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1.0];
const CLIP_CAPS = [[0.1, 0.9], [0.15, 0.85], [0.2, 0.8], [0.25, 0.75]];
const EPS = 1e-6;
const BOOT_ITERS = 2000;

// ── math ──
const clip01 = (p, lo = EPS, hi = 1 - EPS) => Math.min(hi, Math.max(lo, p));
const logit = (p) => Math.log(clip01(p) / (1 - clip01(p)));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const brier = (rows, pk) => mean(rows.map((r) => (r[pk] - r.won) ** 2));
const logloss = (rows, pk) => mean(rows.map((r) => { const q = clip01(r[pk]); return -(r.won * Math.log(q) + (1 - r.won) * Math.log(1 - q)); }));

/** Deterministic gradient-descent logistic regression. X: rows of features (incl. bias handled separately). */
function fitLogistic(X, y, iters = 4000, lr = 0.05, l2 = 1e-3) {
  const d = X[0].length;
  const w = new Array(d).fill(0);
  let b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < X.length; i++) {
      const z = b + X[i].reduce((s, x, j) => s + x * w[j], 0);
      const e = sigmoid(z) - y[i];
      gb += e;
      for (let j = 0; j < d; j++) gw[j] += e * X[i][j];
    }
    b -= lr * (gb / X.length);
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / X.length + l2 * w[j]);
  }
  return { w, b };
}

/** PAVA isotonic regression on (x asc, y). Returns knots for interpolation. */
function fitIsotonic(pairs) {
  const s = [...pairs].sort((a, b) => a.x - b.x);
  const blocks = s.map((p) => ({ x: p.x, sum: p.y, n: 1, val: p.y }));
  let i = 0;
  while (i < blocks.length - 1) {
    if (blocks[i].val > blocks[i + 1].val + 1e-12) {
      blocks[i].sum += blocks[i + 1].sum; blocks[i].n += blocks[i + 1].n; blocks[i].val = blocks[i].sum / blocks[i].n;
      blocks[i].x = Math.max(blocks[i].x, blocks[i + 1].x);
      blocks.splice(i + 1, 1);
      if (i > 0) i--;
    } else i++;
  }
  return blocks; // step function; each block covers up to its x
}
function applyIsotonic(blocks, x) {
  // clamp to the fitted range (never extrapolate a new value beyond the ends)
  for (const b of blocks) if (x <= b.x) return clip01(b.val);
  return clip01(blocks[blocks.length - 1].val);
}

// ── calibration transforms (each returns fit(trainRows) → predict(row) → prob on lean side) ──
const METHODS = {
  market: { name: "market", fit: () => ({ predict: (r) => r.pMarket }) },
  raw: { name: "raw", fit: () => ({ predict: (r) => r.pModel }) },
  logisticRecal: {
    name: "logisticRecal",
    fit: (tr) => { const { w, b } = fitLogistic(tr.map((r) => [logit(r.pModel)]), tr.map((r) => r.won)); return { params: { a: b, b: w[0] }, predict: (r) => sigmoid(b + w[0] * logit(r.pModel)) }; },
  },
  blend: {
    name: "blend",
    fit: (tr) => { const { w, b } = fitLogistic(tr.map((r) => [logit(r.pMarket), logit(r.pModel) - logit(r.pMarket)]), tr.map((r) => r.won)); return { params: { a: b, bMkt: w[0], cDisagree: w[1] }, predict: (r) => sigmoid(b + w[0] * logit(r.pMarket) + w[1] * (logit(r.pModel) - logit(r.pMarket))) }; },
  },
  isotonic: {
    name: "isotonic",
    fit: (tr) => { const blk = fitIsotonic(tr.map((r) => ({ x: r.pModel, y: r.won }))); return { predict: (r) => applyIsotonic(blk, r.pModel) }; },
  },
};
// fixed-shrinkage variants (one per w) + clipping variants (diagnostic)
for (const w of SHRINK_GRID) METHODS[`shrink_${w}`] = { name: `shrink_${w}`, w, fit: () => ({ predict: (r) => w * r.pModel + (1 - w) * r.pMarket }) };
for (const [lo, hi] of CLIP_CAPS) METHODS[`clip_${lo}_${hi}`] = { name: `clip_${lo}_${hi}`, fit: () => ({ predict: (r) => clip01(r.pModel, lo, hi) }) };

// ── build the row dataset: settled ⋈ board, per market ──
function loadBoardIndex() {
  const idx = new Map();
  for (const f of fs.readdirSync(BOARD_DIR)) {
    if (!f.endsWith(".json")) continue;
    let board; try { board = JSON.parse(fs.readFileSync(path.join(BOARD_DIR, f), "utf8")); } catch { continue; }
    for (const l of board.leans ?? []) {
      if (!l.id) continue;
      const io = Number(l.impliedOver), iu = Number(l.impliedUnder);
      const under = l.lean === "Under";
      const modelProb = under ? l.modelProbUnder : l.modelProbOver;
      const impliedLean = under ? iu : io;
      const marketProb = Number.isFinite(io) && Number.isFinite(iu) && io + iu > 0 ? impliedLean / (io + iu) : impliedLean;
      if (!Number.isFinite(modelProb) || !Number.isFinite(marketProb)) continue;
      idx.set(l.id, { pModel: clip01(modelProb), pMarket: clip01(marketProb), projection: l.projection, sigma: l.sigma, lean: l.lean, boardPath: `boards/${f}` });
    }
  }
  return idx;
}
function buildRows() {
  const board = loadBoardIndex();
  const byMkt = Object.fromEntries(MARKETS.map((m) => [m, []]));
  const seen = new Set(); let dupes = 0, unmatched = 0, nonDecisive = 0, leak = 0, projChecked = 0;
  for (const line of fs.readFileSync(SETTLED, "utf8").trim().split("\n")) {
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (!MARKETS.includes(o.marketKey)) continue;
    const oc = String(o.outcome || "").toLowerCase();
    if (oc !== "win" && oc !== "loss") { nonDecisive++; continue; }
    const b = board.get(o.id);
    if (!b) { unmatched++; continue; }
    if (Number.isFinite(o.projection) && Number.isFinite(b.projection)) { projChecked++; if (Math.abs(o.projection - b.projection) > 0.05) leak++; }
    if (seen.has(o.id)) { dupes++; continue; }
    seen.add(o.id);
    byMkt[o.marketKey].push({ date: o.date, id: o.id, market: o.marketKey, lean: o.lean, projection: o.projection, line: o.line, actual: o.actual, outcome: o.outcome, won: oc === "win" ? 1 : 0, pModel: b.pModel, pMarket: b.pMarket, sigma: b.sigma, confidence: o.confidence, edgePct: o.edgePct, boardPath: b.boardPath, player: o.playerName });
  }
  return { byMkt, meta: { dupes, unmatched, nonDecisive, leakageFailures: leak, projChecked } };
}

// ── metrics ──
function calibrationSlopeIntercept(rows, pk) {
  const { w, b } = fitLogistic(rows.map((r) => [logit(r[pk])]), rows.map((r) => r.won));
  return { intercept: +b.toFixed(4), slope: +w[0].toFixed(4) };
}
function reliability(rows, pk) {
  const bins = [];
  for (let i = 0; i < 10; i++) {
    const lo = i / 10, hi = (i + 1) / 10;
    const inB = rows.filter((r) => r[pk] >= lo && r[pk] < (i === 9 ? 1.0001 : hi));
    if (inB.length) bins.push({ bucket: `${i * 10}-${i * 10 + 10}`, n: inB.length, predicted: +mean(inB.map((r) => r[pk])).toFixed(3), actual: +mean(inB.map((r) => r.won)).toFixed(3) });
  }
  const ece = bins.reduce((s, b) => s + (b.n / rows.length) * Math.abs(b.predicted - b.actual), 0);
  const mce = Math.max(0, ...bins.map((b) => Math.abs(b.predicted - b.actual)));
  return { bins, ece: +ece.toFixed(4), mce: +mce.toFixed(4) };
}
/** Deterministic date-clustered bootstrap of (metric_recal − metric_market). Seeded LCG. */
function bootstrapDiff(rows, pk, metricFn, seed = 12345) {
  const byDate = new Map();
  for (const r of rows) { const k = r.date; if (!byDate.has(k)) byDate.set(k, []); byDate.get(k).push(r); }
  const dates = [...byDate.keys()];
  let s = seed >>> 0;
  const rnd = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
  const diffs = [];
  for (let it = 0; it < BOOT_ITERS; it++) {
    const sample = [];
    for (let i = 0; i < dates.length; i++) sample.push(...byDate.get(dates[Math.floor(rnd() * dates.length)]));
    diffs.push(metricFn(sample, pk) - metricFn(sample, "pMarket"));
  }
  diffs.sort((a, b) => a - b);
  return { lo: +diffs[Math.floor(0.025 * BOOT_ITERS)].toFixed(4), hi: +diffs[Math.floor(0.975 * BOOT_ITERS)].toFixed(4), iters: BOOT_ITERS, grouping: "date" };
}

// ── walk-forward OOS predictions over a set of dates (fit on strictly-earlier dates) ──
function walkForward(rowsByDate, orderedDates, method, initialWindow) {
  const preds = [];
  for (let k = initialWindow; k < orderedDates.length; k++) {
    const trainDates = orderedDates.slice(0, k);
    const testDate = orderedDates[k];
    const train = trainDates.flatMap((d) => rowsByDate.get(d) || []);
    const test = rowsByDate.get(testDate) || [];
    if (train.length < 30 || test.length === 0) continue;
    // LEAKAGE ASSERT: no train row is dated >= testDate
    if (train.some((r) => r.date >= testDate)) throw new Error(`leakage: train row >= ${testDate}`);
    const model = method.fit(train);
    for (const r of test) preds.push({ ...r, pRecal: clip01(model.predict(r)) });
  }
  return preds;
}

function main() {
  const { byMkt, meta } = buildRows();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allDates = [...new Set(MARKETS.flatMap((m) => byMkt[m].map((r) => r.date)))].sort();
  const holdoutDates = allDates.slice(-HOLDOUT_DATES);
  const selectDates = allDates.slice(0, allDates.length - HOLDOUT_DATES);
  const protocol = {
    public: false, kind: "recalibration-protocol", declaredBeforeFitting: true,
    totalDates: allDates.length, dateRange: [allDates[0], allDates[allDates.length - 1]],
    selectionDates: [selectDates[0], selectDates[selectDates.length - 1]], selectionDateCount: selectDates.length,
    finalHoldoutDates: [holdoutDates[0], holdoutDates[holdoutDates.length - 1]], finalHoldoutDateCount: holdoutDates.length,
    walkForwardInitialWindow: WF_INITIAL, minHoldoutObs: MIN_HOLDOUT_OBS, minHoldoutDates: MIN_HOLDOUT_DATES,
    shrinkGrid: SHRINK_GRID, bootstrapIters: BOOT_ITERS, benchmark: "de-vigged market probability", join: meta,
  };
  fs.writeFileSync(path.join(OUT_DIR, "protocol.json"), JSON.stringify(protocol, null, 2));

  const results = {};
  const CANDIDATES = ["market", "raw", "logisticRecal", "blend", "isotonic", ...SHRINK_GRID.map((w) => `shrink_${w}`), ...CLIP_CAPS.map(([lo, hi]) => `clip_${lo}_${hi}`)];

  for (const mkt of MARKETS) {
    const rows = byMkt[mkt];
    const byDate = new Map();
    for (const r of rows) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }
    const selD = selectDates.filter((d) => byDate.has(d));
    const holD = holdoutDates.filter((d) => byDate.has(d));
    const holdoutRows = holD.flatMap((d) => byDate.get(d));

    // 1) SELECTION: walk-forward over the selection region only; score each candidate by Brier then logloss.
    const selScores = {};
    for (const c of CANDIDATES) {
      const wf = walkForward(byDate, selD, METHODS[c], WF_INITIAL);
      if (wf.length < 50) { selScores[c] = null; continue; }
      selScores[c] = { n: wf.length, brier: +brier(wf, "pRecal").toFixed(4), logloss: +logloss(wf, "pRecal").toFixed(4) };
    }
    // the market's own walk-forward Brier/logloss (benchmark on the selection region)
    const selMktBrier = selScores["market"]?.brier, selMktLL = selScores["market"]?.logloss;
    // pick the best MODEL-BASED candidate (exclude the pure "market" from selection so we can compare it fairly)
    const modelCands = CANDIDATES.filter((c) => c !== "market" && selScores[c]);
    modelCands.sort((a, b) => (selScores[a].brier - selScores[b].brier) || (selScores[a].logloss - selScores[b].logloss));
    const selected = modelCands[0];

    // 2) FREEZE selected: refit on ALL selection dates, apply ONCE to the untouched holdout.
    const selTrain = selD.flatMap((d) => byDate.get(d));
    const frozen = METHODS[selected].fit(selTrain);
    for (const r of holdoutRows) r.pRecal = clip01(frozen.predict(r));

    const enoughHoldout = holdoutRows.length >= MIN_HOLDOUT_OBS && holD.length >= MIN_HOLDOUT_DATES;
    const hBrierR = brier(holdoutRows, "pRecal"), hBrierM = brier(holdoutRows, "pMarket"), hBrierRaw = brier(holdoutRows, "pModel");
    const hLLR = logloss(holdoutRows, "pRecal"), hLLM = logloss(holdoutRows, "pMarket"), hLLRaw = logloss(holdoutRows, "pModel");
    const boot = bootstrapDiff(holdoutRows, "pRecal", brier);
    const bootLL = bootstrapDiff(holdoutRows, "pRecal", logloss);

    // selected method params (for the frozen transform)
    const params = METHODS[selected].fit(selTrain).params ?? (METHODS[selected].w !== undefined ? { w: METHODS[selected].w } : {});

    // 3) VERDICT (strict gate on the final holdout).
    const beatsBrier = hBrierR < hBrierM, beatsLL = hLLR < hLLM;
    const ciCredible = boot.hi < 0; // whole 95% CI of (recal − market) Brier below 0
    let verdict;
    if (!enoughHoldout) verdict = "INSUFFICIENT_OUT_OF_SAMPLE_DATA";
    else if (beatsBrier && beatsLL && ciCredible) verdict = "PUBLIC_MODEL_OK";
    else if (beatsBrier && beatsLL) verdict = "NEEDS_CAUTION"; // beats point estimates but CI not conclusive
    else verdict = "MARKET_CONTEXT_ONLY";
    // if the selected method is effectively market-only, force MARKET_CONTEXT_ONLY (no model value)
    const marketOnly = selected === "shrink_0" || (params.w === 0);

    results[mkt] = {
      selectionRegionScores: selScores, selectionBenchmark: { marketBrier: selMktBrier, marketLogloss: selMktLL },
      selectedMethod: selected, selectedParams: params, selectedIsMarketOnly: marketOnly,
      holdout: {
        nObs: holdoutRows.length, nDates: holD.length, sufficient: enoughHoldout,
        brier: { recalibrated: +hBrierR.toFixed(4), market: +hBrierM.toFixed(4), rawModel: +hBrierRaw.toFixed(4), diffVsMarket: +(hBrierR - hBrierM).toFixed(4), ci95: boot },
        logloss: { recalibrated: +hLLR.toFixed(4), market: +hLLM.toFixed(4), rawModel: +hLLRaw.toFixed(4), diffVsMarket: +(hLLR - hLLM).toFixed(4), ci95: bootLL },
        calibration: { recalibrated: calibrationSlopeIntercept(holdoutRows, "pRecal"), rawModel: calibrationSlopeIntercept(holdoutRows, "pModel") },
        reliabilityRecalibrated: reliability(holdoutRows, "pRecal"),
        overUnder: { over: holdoutRows.filter((r) => r.lean === "Over").length, under: holdoutRows.filter((r) => r.lean === "Under").length },
      },
      verdict: marketOnly && verdict === "PUBLIC_MODEL_OK" ? "MARKET_CONTEXT_ONLY" : verdict,
    };
  }

  // robustness: leave-one-date-out on the holdout for any market whose point estimate beats the market
  const robustness = {};
  for (const mkt of MARKETS) {
    const r = results[mkt];
    if (!(r.holdout.brier.diffVsMarket < 0)) { robustness[mkt] = { tested: false, reason: "does not beat market on point estimate" }; continue; }
    const rows = byMkt[mkt];
    const byDate = new Map(); for (const x of rows) { if (!byDate.has(x.date)) byDate.set(x.date, []); byDate.get(x.date).push(x); }
    const holdoutDatesM = HOLDOUT_DATES ? [...byDate.keys()].sort().slice(-HOLDOUT_DATES) : [];
    const worst = [];
    for (const drop of holdoutDatesM) {
      const sub = holdoutDatesM.filter((d) => d !== drop).flatMap((d) => byDate.get(d).map((x) => ({ ...x })));
      const selTrain = [...byDate.keys()].sort().slice(0, -HOLDOUT_DATES).flatMap((d) => byDate.get(d));
      const frozen = METHODS[r.selectedMethod].fit(selTrain);
      for (const x of sub) x.pRecal = clip01(frozen.predict(x));
      worst.push({ droppedDate: drop, brierDiff: +(brier(sub, "pRecal") - brier(sub, "pMarket")).toFixed(4) });
    }
    robustness[mkt] = { tested: true, leaveOneDateOut: worst, stillBeatsMarketEveryFold: worst.every((w) => w.brierDiff < 0) };
  }

  fs.writeFileSync(path.join(OUT_DIR, "candidate-results.json"), JSON.stringify({ public: false, byMarket: Object.fromEntries(MARKETS.map((m) => [m, results[m].selectionRegionScores])) }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "final-holdout-results.json"), JSON.stringify({ public: false, protocol: { holdoutDates, selectDatesCount: selectDates.length }, byMarket: Object.fromEntries(MARKETS.map((m) => [m, results[m]])) }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "robustness-results.json"), JSON.stringify({ public: false, byMarket: robustness }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "selected-calibrators.json"), JSON.stringify({
    public: false, approvedForProduction: false, createdFrom: "recalibrate-mlb-modeled-markets.mjs",
    devigMethod: "proportional (impliedLean / (impliedOver + impliedUnder))", probabilityClipping: `[${EPS}, ${1 - EPS}]`,
    byMarket: Object.fromEntries(MARKETS.map((m) => [m, { market: m, method: results[m].selectedMethod, parameters: results[m].selectedParams, verdict: results[m].verdict, holdoutObs: results[m].holdout.nObs, approvedForProduction: false }])),
  }, null, 2));

  // ── console ──
  console.log(`\n=== MLB recalibration — selection ${selectDates.length}d (${selectDates[0]}..${selectDates[selectDates.length - 1]}), holdout ${holdoutDates.length}d (${holdoutDates[0]}..${holdoutDates[holdoutDates.length - 1]}) ===`);
  console.log(`join: dupes=${meta.dupes} unmatched=${meta.unmatched} leakageFails=${meta.leakageFailures}`);
  for (const mkt of MARKETS) {
    const r = results[mkt], h = r.holdout;
    console.log(`\n● ${mkt}  selected=${r.selectedMethod} ${JSON.stringify(r.selectedParams)}${r.selectedIsMarketOnly ? " (MARKET-ONLY)" : ""}`);
    console.log(`   holdout n=${h.nObs} (${h.nDates}d, sufficient=${h.sufficient})`);
    console.log(`   Brier   recal ${h.brier.recalibrated}  market ${h.brier.market}  raw ${h.brier.rawModel}  Δvs mkt ${h.brier.diffVsMarket} CI[${h.brier.ci95.lo},${h.brier.ci95.hi}]`);
    console.log(`   LogLoss recal ${h.logloss.recalibrated}  market ${h.logloss.market}  raw ${h.logloss.rawModel}  Δvs mkt ${h.logloss.diffVsMarket} CI[${h.logloss.ci95.lo},${h.logloss.ci95.hi}]`);
    console.log(`   calib slope recal ${h.calibration.recalibrated.slope} (raw ${h.calibration.rawModel.slope})  ECE ${h.reliabilityRecalibrated.ece}`);
    console.log(`   VERDICT: ${r.verdict}`);
  }
  console.log(`\nartifacts → ${path.relative(REPO, OUT_DIR)}/`);
  console.log(`SUMMARY: ${JSON.stringify(Object.fromEntries(MARKETS.map((m) => [m, results[m].verdict])))}`);
}
main();
