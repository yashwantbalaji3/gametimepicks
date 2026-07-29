/**
 * SPRINT 047 — model learning: performance audit, market registry, and calibration backtest.
 *
 * WHAT SPRINT 046 ESTABLISHED
 * Over 2026-07-25..27 the model predicted ~59% and won ~49%, and lost to the de-vigged market on both
 * Brier and log loss. That was three days. This measures the whole settled history and then asks the
 * only question that matters next: **can a calibrator fix it, and can we prove that out of sample?**
 *
 * THE METHODOLOGY THAT MAKES THE ANSWER MEAN ANYTHING
 *
 *   1. TEMPORAL split, never random. The calibrator is fitted on the EARLIER dates and evaluated on
 *      the LATER ones. A random split would let a row from the same slate — same game, same pitcher,
 *      correlated outcome — sit on both sides, which inflates every out-of-sample number. Time is the
 *      only split that answers "would this have helped us on a day we had not yet seen?"
 *
 *   2. The market baseline is DE-VIGGED. Raw book probabilities in this corpus sum to ~1.069; scoring
 *      the model against them unmodified hands it the entire hold as a head start.
 *
 *   3. Identical rows only. Model, market, and calibrated model are all scored on exactly the same
 *      test rows, so a difference in score cannot be a difference in population.
 *
 *   4. Nothing is adopted here. This reports whether a calibrator improves out-of-sample. Applying one
 *      to production probabilities is a separate, later decision that needs its own evidence.
 *
 * Read-only. Writes analysis artifacts only; never touches a ledger, a board, or money.
 *
 * Usage:
 *   npx tsx scripts/model-learning-audit.mjs                       # print the report
 *   npx tsx scripts/model-learning-audit.mjs --json f --markdown f # write artifacts
 *   npx tsx scripts/model-learning-audit.mjs --self-test           # methodology fixtures
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const CAL_DIR = path.join(APP, "public/data/mlb/results/calibration");

// ── scoring ────────────────────────────────────────────────────────────────────

const clip = (p, eps = 1e-6) => Math.min(1 - eps, Math.max(eps, p));
const brier = (rows, pick) => rows.reduce((a, r) => a + (pick(r) - r.y) ** 2, 0) / rows.length;
const logLoss = (rows, pick) =>
  rows.reduce((a, r) => {
    const p = clip(pick(r));
    return a - (r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
  }, 0) / rows.length;
const mean = (xs) => (xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : null);

/**
 * Wilson score interval — used instead of the normal approximation because several markets have
 * small n, where the normal interval runs past 0/1 and understates uncertainty exactly where the
 * decision ("disable this market?") is most consequential.
 */
export function wilson(wins, n, z = 1.96) {
  if (n === 0) return { low: null, high: null, point: null };
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  // Wilson is mathematically bounded to [0,1]; clamp only to absorb floating-point drift, which shows
  // up exactly at the degenerate ends (0 wins, or all wins) where the bound sits on 0 or 1.
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  return { point: p, low: clamp01((centre - spread) / d), high: clamp01((centre + spread) / d) };
}

// ── calibrators ────────────────────────────────────────────────────────────────

/**
 * Platt scaling: fit a logistic on the model's log-odds. Two parameters, so it can correct a uniform
 * over/under-confidence but nothing shape-dependent. Fitted by plain gradient descent — the dataset
 * is small enough that solver sophistication buys nothing.
 */
export function fitPlattParams(rows, { iterations = 4000, lr = 0.1 } = {}) {
  let a = 1;
  let b = 0;
  const xs = rows.map((r) => Math.log(clip(r.p) / (1 - clip(r.p))));
  for (let it = 0; it < iterations; it += 1) {
    let ga = 0;
    let gb = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const z = a * xs[i] + b;
      const q = 1 / (1 + Math.exp(-z));
      const e = q - rows[i].y;
      ga += e * xs[i];
      gb += e;
    }
    a -= (lr * ga) / rows.length;
    b -= (lr * gb) / rows.length;
  }
  return { a, b, trainRows: rows.length };
}

/** Apply fitted Platt parameters. Separated from fitting so production applies without refitting. */
export function plattFromParams({ a, b }) {
  return (p) => 1 / (1 + Math.exp(-(a * Math.log(clip(p) / (1 - clip(p))) + b)));
}

export function fitPlatt(rows, opts) {
  return plattFromParams(fitPlattParams(rows, opts));
}

/**
 * Isotonic regression via pool-adjacent-violators: a monotone, non-parametric fit. Strictly more
 * flexible than Platt, and correspondingly easier to overfit — which is precisely why it is judged
 * on a held-out future window rather than on the data it was fitted to.
 */
export function fitIsotonic(rows) {
  const sorted = [...rows].sort((m, n) => m.p - n.p);
  const blocks = sorted.map((r) => ({ sum: r.y, count: 1, x: r.p }));
  for (let i = 1; i < blocks.length; ) {
    if (blocks[i - 1].sum / blocks[i - 1].count <= blocks[i].sum / blocks[i].count) {
      i += 1;
      continue;
    }
    blocks[i - 1].sum += blocks[i].sum;
    blocks[i - 1].count += blocks[i].count;
    blocks[i - 1].x = blocks[i].x;
    blocks.splice(i, 1);
    if (i > 1) i -= 1;
  }
  const knots = blocks.map((b) => ({ x: b.x, y: b.sum / b.count }));
  return (p) => {
    if (p <= knots[0].x) return knots[0].y;
    for (let i = 0; i < knots.length; i += 1) if (p <= knots[i].x) return knots[i].y;
    return knots[knots.length - 1].y;
  };
}

// ── data ───────────────────────────────────────────────────────────────────────

/**
 * Load decisive rows by joining the BOARD (model + both market sides) to the LEDGER (outcome).
 *
 * WHY NOT THE CALIBRATION CORPUS
 * `public/data/mlb/results/calibration/*.jsonl` looks like the natural source and carries exactly the
 * right fields — but its `marketProbability` is the RAW, VIGGED implied probability. Verified against
 * the board on 2026-07-27: cal 0.7110 vs raw implied 0.7110 vs de-vigged 0.6672.
 *
 * That matters in one direction only, and it is the flattering one. For the leaned side the vigged
 * probability is inflated, so scoring it against a ~50% observed rate makes the MARKET look worse than
 * it is and the model look better by comparison. Every model-vs-market number computed from that
 * corpus carries the entire hold as a thumb on the scale.
 *
 * So the market probability is reconstructed here from both sides of the board and normalised, which
 * is the same method Sprint 046 used. The corpus stays useful for everything that does not involve a
 * market baseline.
 */
export function loadRows() {
  const BOARDS = path.join(APP, "public/data/mlb/boards");
  const LEDGER = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");
  if (!fs.existsSync(BOARDS) || !fs.existsSync(LEDGER)) return [];

  // The LEDGER's date is authoritative for settlement. A lean also carries its own `date`, which is
  // the game's local date and rolls past midnight for late West-Coast starts: the 2026-07-27 board
  // holds 134 settled leans stamped 2026-07-28. Keying on the lean's date invents a phantom date the
  // ledger does not have, and every per-date figure for it is a slice of the previous slate.
  const outcomeById = new Map();
  for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    // The ledger writes "Win"/"Loss"; the calibration export writes "win"/"loss". Normalise, because
    // a case mismatch here silently empties the population rather than erroring.
    const o = String(r.outcome ?? "").toLowerCase();
    if (o === "win" || o === "loss") outcomeById.set(r.id, { y: o === "win" ? 1 : 0, date: r.date });
  }

  const rows = [];
  for (const f of fs.readdirSync(BOARDS).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
    const board = JSON.parse(fs.readFileSync(path.join(BOARDS, f), "utf8"));
    for (const lean of board.leans ?? []) {
      const settled = outcomeById.get(lean.id);
      if (settled === undefined) continue;
      const { y } = settled;
      const side = String(lean.lean ?? "").toLowerCase();
      if (side !== "over" && side !== "under") continue;

      const p = side === "over" ? lean.modelProbOver : lean.modelProbUnder;
      if (typeof p !== "number") continue;

      const o = lean.impliedOver;
      const u = lean.impliedUnder;
      if (typeof o !== "number" || typeof u !== "number" || !(o + u > 0)) continue;
      const q = (side === "over" ? o : u) / (o + u);   // de-vigged

      rows.push({
        date: settled.date ?? f.slice(0, 10),
        market: lean.marketKey,
        confidence: lean.confidence,
        p, q, y,
        team: lean.playerTeamAbbr,
        opponent: lean.opponentAbbr,
        overround: o + u,
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// ── phase 2: performance audit ─────────────────────────────────────────────────

function describe(rows, label) {
  const wins = rows.reduce((a, r) => a + r.y, 0);
  const ci = wilson(wins, rows.length);
  return {
    population: label,
    n: rows.length,
    wins,
    hitRate: rows.length ? wins / rows.length : null,
    hitRate95: { low: ci.low, high: ci.high },
    meanModelProbability: mean(rows.map((r) => r.p)),
    meanMarketProbability: mean(rows.map((r) => r.q)),
    observedRate: rows.length ? wins / rows.length : null,
    modelBrier: rows.length ? brier(rows, (r) => r.p) : null,
    marketBrier: rows.length ? brier(rows, (r) => r.q) : null,
    modelLogLoss: rows.length ? logLoss(rows, (r) => r.p) : null,
    marketLogLoss: rows.length ? logLoss(rows, (r) => r.q) : null,
    /** Positive = the model is overconfident by this many percentage points. */
    overconfidencePp: rows.length ? 100 * (mean(rows.map((r) => r.p)) - wins / rows.length) : null,
  };
}

const groupBy = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) {
    const k = String(keyFn(r));
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
};

function calibrationCurve(rows, pick) {
  const buckets = new Map();
  for (const r of rows) {
    const lo = Math.floor(pick(r) * 10) / 10;
    const k = `${lo.toFixed(1)}-${(lo + 0.1).toFixed(1)}`;
    if (!buckets.has(k)) buckets.set(k, { n: 0, predicted: 0, observed: 0 });
    const b = buckets.get(k);
    b.n += 1;
    b.predicted += pick(r);
    b.observed += r.y;
  }
  return Object.fromEntries(
    [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => {
      const ci = wilson(v.observed, v.n);
      return [k, {
        n: v.n,
        meanPredicted: v.predicted / v.n,
        observedRate: v.observed / v.n,
        observed95: { low: ci.low, high: ci.high },
        /** True when the predicted mean sits outside the observed 95% interval. */
        significantlyMiscalibrated: v.predicted / v.n > ci.high || v.predicted / v.n < ci.low,
      }];
    }),
  );
}

// ── phase 3: market registry ───────────────────────────────────────────────────

/** Below this, a market's record is reported but never used to justify a status change. */
const MIN_SAMPLE_FOR_STATUS = 500;

/**
 * Assign an evidence-based status to each market.
 *
 * Deliberately conservative about DISABLED: a market is only disabled when its 95% interval sits
 * entirely below break-even AND the sample is large. "Looks bad on 69 rows" is not evidence, and
 * disabling on it would be the same small-sample error the confidence tiers already made.
 */
export function marketRegistry(rows) {
  return Object.fromEntries(groupBy(rows, (r) => r.market).map(([market, rs]) => {
    const wins = rs.reduce((a, r) => a + r.y, 0);
    const ci = wilson(wins, rs.length);
    const mB = brier(rs, (r) => r.p);
    const qB = brier(rs, (r) => r.q);
    const beatsMarket = mB < qB;
    const over = 100 * (mean(rs.map((r) => r.p)) - wins / rs.length);

    let status;
    let rationale;
    if (rs.length < MIN_SAMPLE_FOR_STATUS) {
      status = "MONITOR";
      rationale = `n=${rs.length} is below the ${MIN_SAMPLE_FOR_STATUS}-row minimum for a status change; the record is reported, not acted on`;
    } else if (ci.high < 0.5) {
      status = "DISABLED";
      rationale = `the 95% interval [${(ci.low * 100).toFixed(1)}%, ${(ci.high * 100).toFixed(1)}%] lies entirely below 50% on n=${rs.length}`;
    } else if (!beatsMarket || Math.abs(over) > 5) {
      status = "RECALIBRATE";
      rationale = `${!beatsMarket ? `Brier ${mB.toFixed(4)} vs market ${qB.toFixed(4)}` : ""}${!beatsMarket && Math.abs(over) > 5 ? "; " : ""}${Math.abs(over) > 5 ? `${over > 0 ? "over" : "under"}confident by ${Math.abs(over).toFixed(1)}pp` : ""}`;
    } else {
      status = "APPROVED";
      rationale = `Brier ${mB.toFixed(4)} beats market ${qB.toFixed(4)} and confidence is within 5pp on n=${rs.length}`;
    }

    return [market, {
      status, rationale,
      n: rs.length, wins, hitRate: wins / rs.length,
      hitRate95: { low: ci.low, high: ci.high },
      modelBrier: mB, marketBrier: qB, beatsMarketBrier: beatsMarket,
      overconfidencePp: over,
    }];
  }));
}

// ── phase 5: calibration backtest ──────────────────────────────────────────────

/**
 * Fit calibrators on the earlier portion of the timeline and score them on the later portion.
 *
 * `splitFraction` is by ROW count over date-ordered rows, then snapped to a date boundary so no
 * single slate straddles the split — rows from one game are correlated, and letting them span the
 * boundary is a quiet form of leakage.
 */
export function calibrationBacktest(rows, splitFraction = 0.7) {
  if (rows.length < 200) return { skipped: "fewer than 200 decisive rows — not enough to split" };

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const target = Math.floor(rows.length * splitFraction);
  let seen = 0;
  let splitDate = dates[0];
  for (const d of dates) {
    seen += rows.filter((r) => r.date === d).length;
    if (seen >= target) { splitDate = d; break; }
  }
  const train = rows.filter((r) => r.date < splitDate);
  const test = rows.filter((r) => r.date >= splitDate);
  if (train.length < 100 || test.length < 100) return { skipped: "split produced too small a side" };

  const plattParams = fitPlattParams(train.map((r) => ({ p: r.p, y: r.y })));
  const platt = plattFromParams(plattParams);
  const iso = fitIsotonic(train.map((r) => ({ p: r.p, y: r.y })));

  const score = (pick) => ({ brier: brier(test, pick), logLoss: logLoss(test, pick), meanPredicted: mean(test.map(pick)) });
  const rawModel = score((r) => r.p);
  const market = score((r) => r.q);
  const plattScore = score((r) => platt(r.p));
  const isoScore = score((r) => iso(r.p));

  const best = [["platt", plattScore], ["isotonic", isoScore]].sort((a, c) => a[1].brier - c[1].brier)[0];
  const improvesOnRaw = best[1].brier < rawModel.brier;
  const beatsMarket = best[1].brier < market.brier;

  return {
    method: "temporal split, fitted on earlier dates and scored on later dates only",
    splitDate,
    trainRows: train.length,
    trainDates: [train[0].date, train[train.length - 1].date],
    testRows: test.length,
    testDates: [test[0].date, test[test.length - 1].date],
    observedRateInTest: mean(test.map((r) => r.y)),
    scores: { rawModel, market, platt: plattScore, isotonic: isoScore },
    // Persisted so production applies these exact parameters rather than refitting — a calibrator that
    // silently refits on every deploy is a model change nobody reviewed.
    plattParams,
    bestCalibrator: best[0],
    improvesOnRawModel: improvesOnRaw,
    brierImprovementVsRaw: rawModel.brier - best[1].brier,
    stillLosesToMarket: !beatsMarket,
    brierGapToMarket: best[1].brier - market.brier,
    /** The recommendation is explicitly about ADOPTION, and it is allowed to be "no". */
    recommendation: improvesOnRaw
      ? (beatsMarket
        ? `ADOPT ${best[0]} — improves out-of-sample AND scores better than the de-vigged market`
        : `ADOPT ${best[0]} for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability`)
      : "DO NOT ADOPT — no calibrator improved out-of-sample; the problem is not a monotone miscalibration",
  };
}

// ── self-test ──────────────────────────────────────────────────────────────────

export function selfTest() {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  // Wilson must be wide on small n and must not escape [0,1].
  const small = wilson(1, 3);
  ok(small.low >= 0 && small.high <= 1, "Wilson must stay inside [0,1]");
  ok(small.high - small.low > 0.5, "Wilson must be wide on n=3");
  const big = wilson(500, 1000);
  ok(big.high - big.low < 0.07, `Wilson must tighten on n=1000, got ${big.high - big.low}`);

  // A KNOWN overconfident generator must be corrected by both calibrators, measurably.
  const rows = [];
  for (let i = 0; i < 2000; i += 1) {
    const trueP = 0.35 + (i % 40) / 100;          // 0.35..0.74, deterministic
    const stated = Math.min(0.97, trueP + 0.12);   // uniformly 12pp too confident
    rows.push({ p: stated, y: i % 100 < trueP * 100 ? 1 : 0 });
  }
  const platt = fitPlatt(rows);
  const iso = fitIsotonic(rows);
  const rawB = brier(rows, (r) => r.p);
  ok(brier(rows, (r) => platt(r.p)) < rawB, "Platt must improve a knowingly overconfident set");
  ok(brier(rows, (r) => iso(r.p)) < rawB, "Isotonic must improve a knowingly overconfident set");

  // Isotonic must be monotone — a calibrator that reorders predictions is not a calibrator.
  const probes = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const mapped = probes.map(iso);
  ok(mapped.every((v, i) => i === 0 || v >= mapped[i - 1] - 1e-9), `isotonic output must be monotone: ${mapped}`);

  // A WELL-CALIBRATED set must not be materially "improved" — guards against a calibrator that
  // always claims a win.
  const good = [];
  for (let i = 0; i < 2000; i += 1) {
    const p = 0.3 + (i % 40) / 100;
    good.push({ p, y: i % 100 < p * 100 ? 1 : 0 });
  }
  const gP = fitPlatt(good);
  ok(brier(good, (r) => gP(r.p)) >= brier(good, (r) => r.p) - 0.01,
    "Platt must not claim a large gain on already-calibrated data");

  // The temporal split must never let a date appear on both sides.
  const seq = [];
  for (let d = 1; d <= 20; d += 1) {
    for (let i = 0; i < 30; i += 1) {
      seq.push({ date: `2026-06-${String(d).padStart(2, "0")}`, p: 0.6, q: 0.5, y: i % 2, market: "m" });
    }
  }
  const bt = calibrationBacktest(seq, 0.7);
  ok(!bt.skipped, `backtest should run on the fixture: ${bt.skipped}`);
  ok(bt.trainDates[1] < bt.splitDate, "no train date may reach the split date");
  ok(bt.testDates[0] >= bt.splitDate, "no test date may precede the split date");

  return fails;
}

// ── rendering ──────────────────────────────────────────────────────────────────

const pc = (v, d = 2) => (v == null ? "n/a" : `${(v * 100).toFixed(d)}%`);
const f4 = (v) => (v == null ? "n/a" : v.toFixed(4));

function render(out) {
  const L = [];
  const o = out.overall;
  L.push(`# Model Learning Audit`, ``, `**Rows:** ${o.n} decisive · **Dates:** ${out.dateRange[0]} → ${out.dateRange[1]}`, ``);
  L.push(`## Overall`, ``, `| Measure | Model | Market (de-vigged) |`, `|---|---|---|`);
  L.push(`| Brier ↓ | ${f4(o.modelBrier)} | ${f4(o.marketBrier)} |`);
  L.push(`| Log loss ↓ | ${f4(o.modelLogLoss)} | ${f4(o.marketLogLoss)} |`);
  L.push(`| Mean predicted | ${pc(o.meanModelProbability)} | ${pc(o.meanMarketProbability)} |`);
  L.push(`| Observed | ${pc(o.observedRate)} | — |`, ``);
  L.push(`Hit rate **${pc(o.hitRate)}** (${o.wins}/${o.n}), 95% CI [${pc(o.hitRate95.low)}, ${pc(o.hitRate95.high)}]. Overconfidence **${o.overconfidencePp.toFixed(2)}pp**.`);

  L.push(``, `## Market registry`, ``, `| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |`, `|---|---|---|---|---|---|---|`);
  for (const [m, v] of Object.entries(out.registry)) {
    L.push(`| \`${m}\` | **${v.status}** | ${v.n} | ${pc(v.hitRate)} [${pc(v.hitRate95.low)}, ${pc(v.hitRate95.high)}] | ${f4(v.modelBrier)} | ${f4(v.marketBrier)} | ${v.overconfidencePp.toFixed(1)}pp |`);
  }
  L.push(``);
  for (const [m, v] of Object.entries(out.registry)) L.push(`- \`${m}\` → **${v.status}**: ${v.rationale}`);

  L.push(``, `## Calibration curve (model)`, ``, `| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |`, `|---|---|---|---|---|`);
  for (const [k, v] of Object.entries(out.calibrationCurve)) {
    L.push(`| ${k} | ${v.n} | ${pc(v.meanPredicted, 1)} | ${pc(v.observedRate, 1)} [${pc(v.observed95.low, 1)}, ${pc(v.observed95.high, 1)}] | ${v.significantlyMiscalibrated ? "**yes**" : "no"} |`);
  }

  const b = out.calibrationBacktest;
  L.push(``, `## Calibration backtest — fitted on the past, scored on the future`, ``);
  if (b.skipped) {
    L.push(`Skipped: ${b.skipped}`);
  } else {
    L.push(`Train: ${b.trainRows} rows (${b.trainDates[0]} → ${b.trainDates[1]}) · Test: ${b.testRows} rows (${b.testDates[0]} → ${b.testDates[1]}) · split at **${b.splitDate}**`, ``);
    L.push(`| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |`, `|---|---|---|---|`);
    for (const [k, v] of Object.entries(b.scores)) {
      L.push(`| ${k} | ${f4(v.brier)} | ${f4(v.logLoss)} | ${pc(v.meanPredicted)} |`);
    }
    L.push(`| _observed_ | — | — | ${pc(b.observedRateInTest)} |`, ``);
    L.push(`**${b.recommendation}**`, ``);
    L.push(`Best calibrator: \`${b.bestCalibrator}\` · improves on raw model: **${b.improvesOnRawModel}** (Brier ${b.brierImprovementVsRaw >= 0 ? "−" : "+"}${Math.abs(b.brierImprovementVsRaw).toFixed(4)}) · still loses to market: **${b.stillLosesToMarket}** (gap ${b.brierGapToMarket >= 0 ? "+" : ""}${b.brierGapToMarket.toFixed(4)}).`);
  }

  L.push(``, `## By descriptive category`, ``, `| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |`, `|---|---|---|---|---|---|`);
  for (const [k, v] of Object.entries(out.byConfidence)) {
    L.push(`| ${k} | ${v.n} | ${pc(v.hitRate)} | ${f4(v.modelBrier)} | ${f4(v.marketBrier)} | ${v.overconfidencePp.toFixed(1)}pp |`);
  }
  return L.join("\n");
}

// ── main ───────────────────────────────────────────────────────────────────────

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

function main() {
  if (process.argv.includes("--self-test")) {
    const fails = selfTest();
    if (fails.length) {
      console.error(`SELF-TEST FAILED — ${fails.length}:`);
      for (const f of fails) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log("self-test ok — Wilson bounds hold, both calibrators correct a known-overconfident set, isotonic is monotone, and the temporal split never shares a date");
    return;
  }

  const rows = loadRows();
  if (rows.length === 0) {
    console.error("no decisive rows — boards and/or settled_leans.jsonl are missing or empty");
    process.exit(2);
  }

  const out = {
    kind: "model-learning-audit",
    dateRange: [rows[0].date, rows[rows.length - 1].date],
    overall: describe(rows, "all decisive settled MLB rows with both a model and a market probability"),
    byMarket: Object.fromEntries(groupBy(rows, (r) => r.market).map(([k, v]) => [k, describe(v, `market ${k}`)])),
    byConfidence: Object.fromEntries(groupBy(rows, (r) => r.confidence).map(([k, v]) => [k, describe(v, `category ${k}`)])),
    byDate: Object.fromEntries(groupBy(rows, (r) => r.date).map(([k, v]) => [k, describe(v, `date ${k}`)])),
    registry: marketRegistry(rows),
    calibrationCurve: calibrationCurve(rows, (r) => r.p),
    marketCalibrationCurve: calibrationCurve(rows, (r) => r.q),
    calibrationBacktest: calibrationBacktest(rows),
  };

  const j = arg("json");
  const m = arg("markdown");
  if (j) fs.writeFileSync(j, JSON.stringify(out, null, 2));
  if (m) fs.writeFileSync(m, render(out));
  if (!j && !m) console.log(render(out));
  else console.log(`wrote ${[j, m].filter(Boolean).join(" and ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
