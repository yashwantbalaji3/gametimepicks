/**
 * SPRINT 048 — the daily learning report: market registry + post-settlement autopsy.
 *
 * WHAT THIS ANSWERS
 * "What did we learn yesterday that changes how we operate today?" Not a dashboard of levels — nobody
 * reads those — but a short list of CHANGES, each with a sample size attached.
 *
 * TWO OUTPUTS
 *   registry.json    every market's evidence-based status, plus its recent trend. UI-ready.
 *   autopsy/<date>   what the settled slate revealed: worst market, calibration error, what held up.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It never modifies the model. A system that auto-tunes on yesterday's slate is fitting noise: a
 * single MLB date carries a few hundred decisive rows, and the measured day-to-day swing in hit rate
 * across this corpus is wider than any effect worth chasing. The autopsy produces a RECOMMENDATION for
 * a human, and the experiment framework (docs/) is how that recommendation gets tested.
 *
 * Read-only over predictions and outcomes. Writes analysis artifacts only.
 *
 * Usage:
 *   npx tsx scripts/build-learning-report.mjs                  # print
 *   npx tsx scripts/build-learning-report.mjs --write          # persist registry + autopsy
 *   npx tsx scripts/build-learning-report.mjs --date 2026-07-27
 *   npx tsx scripts/build-learning-report.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";

import { loadRows, marketRegistry, wilson } from "./model-learning-audit.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const OUT_DIR = path.join(REPO, "data/internal/mlb/model-learning");

/** A trend needs enough rows on each side to mean anything; below this it is reported as null. */
const MIN_TREND_ROWS = 200;

const mean = (xs) => (xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : null);
const brier = (rows, pick) => (rows.length ? rows.reduce((a, r) => a + (pick(r) - r.y) ** 2, 0) / rows.length : null);

/**
 * Recent trend: the most recent `window` rows for a market versus everything before them.
 *
 * Split by row count rather than by date so a market with sparse daily volume still gets a comparable
 * window. Returns null rather than a number when either side is too thin — a "trend" computed on 40
 * rows is noise wearing a direction.
 */
export function recentTrend(rows, window = 500) {
  if (rows.length < MIN_TREND_ROWS * 2) return null;
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const recent = ordered.slice(-Math.min(window, Math.floor(ordered.length / 2)));
  const prior = ordered.slice(0, ordered.length - recent.length);
  if (recent.length < MIN_TREND_ROWS || prior.length < MIN_TREND_ROWS) return null;

  const hr = (rs) => rs.reduce((a, r) => a + r.y, 0) / rs.length;
  const recentCi = wilson(recent.reduce((a, r) => a + r.y, 0), recent.length);
  const priorCi = wilson(prior.reduce((a, r) => a + r.y, 0), prior.length);
  return {
    recentRows: recent.length,
    priorRows: prior.length,
    recentHitRate: hr(recent),
    priorHitRate: hr(prior),
    deltaPp: 100 * (hr(recent) - hr(prior)),
    /** True only when the two intervals do not overlap — otherwise the move is not distinguishable. */
    significant: recentCi.low > priorCi.high || recentCi.high < priorCi.low,
    recentDates: [recent[0].date, recent[recent.length - 1].date],
  };
}

// ── the autopsy ────────────────────────────────────────────────────────────────

/**
 * What did one settled date reveal?
 *
 * Framed as observations plus a single recommendation, not a scoreboard. Every figure carries n, and
 * anything under a usable sample is stated as insufficient rather than reported as a finding.
 */
export function autopsy(allRows, date) {
  const day = allRows.filter((r) => r.date === date);
  if (day.length === 0) return { date, status: "NO_DECISIVE_ROWS", note: "nothing settled for this date" };

  const wins = day.reduce((a, r) => a + r.y, 0);
  const observed = wins / day.length;
  const predicted = mean(day.map((r) => r.p));
  const marketPredicted = mean(day.map((r) => r.q));

  const byMarket = {};
  for (const r of day) (byMarket[r.market] ??= []).push(r);

  const marketRows = Object.entries(byMarket).map(([market, rs]) => {
    const w = rs.reduce((a, x) => a + x.y, 0);
    const ci = wilson(w, rs.length);
    return {
      market,
      n: rs.length,
      hitRate: w / rs.length,
      hitRate95: { low: ci.low, high: ci.high },
      meanPredicted: mean(rs.map((x) => x.p)),
      calibrationErrorPp: 100 * (mean(rs.map((x) => x.p)) - w / rs.length),
      modelBrier: brier(rs, (x) => x.p),
      marketBrier: brier(rs, (x) => x.q),
      /** A single date rarely carries enough rows per market to conclude anything. Say so. */
      sufficientSample: rs.length >= 100,
    };
  }).sort((a, b) => b.calibrationErrorPp - a.calibrationErrorPp);

  const worst = marketRows.filter((m) => m.sufficientSample)[0] ?? null;
  const best = [...marketRows].filter((m) => m.sufficientSample).sort((a, b) => a.calibrationErrorPp - b.calibrationErrorPp)[0] ?? null;

  const observations = [];
  const dayCalErr = 100 * (predicted - observed);
  observations.push(
    `Stated ${(predicted * 100).toFixed(1)}% on average and won ${(observed * 100).toFixed(1)}% ` +
      `(${wins}/${day.length}) — calibration error ${dayCalErr >= 0 ? "+" : ""}${dayCalErr.toFixed(1)}pp.`,
  );
  observations.push(
    `The de-vigged market stated ${(marketPredicted * 100).toFixed(1)}% on the same rows.`,
  );
  if (worst) {
    observations.push(
      `Widest gap: \`${worst.market}\` at ${worst.calibrationErrorPp >= 0 ? "+" : ""}${worst.calibrationErrorPp.toFixed(1)}pp on n=${worst.n}.`,
    );
  }
  if (best && best.market !== worst?.market) {
    observations.push(
      `Closest: \`${best.market}\` at ${best.calibrationErrorPp >= 0 ? "+" : ""}${best.calibrationErrorPp.toFixed(1)}pp on n=${best.n}.`,
    );
  }
  const thin = marketRows.filter((m) => !m.sufficientSample);
  if (thin.length) {
    observations.push(
      `Insufficient sample to read: ${thin.map((m) => `\`${m.market}\` (n=${m.n})`).join(", ")}.`,
    );
  }

  // The recommendation is explicitly about what a HUMAN should look at next.
  let recommendation;
  if (!worst) {
    recommendation = "No market carried enough rows on this date to justify an action. Accumulate more before concluding.";
  } else if (Math.abs(dayCalErr) < 3) {
    recommendation = `Calibration held on this date (${dayCalErr >= 0 ? "+" : ""}${dayCalErr.toFixed(1)}pp). No action; one date is not evidence of a change either way.`;
  } else {
    recommendation =
      `Investigate \`${worst.market}\` — it carried the widest gap on this date. A single date is NOT evidence; ` +
      `check whether the full-history registry status for it has moved before changing anything.`;
  }

  return {
    date,
    status: "OK",
    decisiveRows: day.length,
    wins,
    observedRate: observed,
    meanPredicted: predicted,
    meanMarketPredicted: marketPredicted,
    calibrationErrorPp: dayCalErr,
    byMarket: marketRows,
    observations,
    recommendation,
    caveat: "One settled date. Day-to-day swings in this corpus exceed most effects worth chasing; treat as a prompt to look, never as a result.",
  };
}

// ── self-test ──────────────────────────────────────────────────────────────────

export function selfTest() {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  const rows = [];
  for (let d = 1; d <= 20; d += 1) {
    const date = `2026-06-${String(d).padStart(2, "0")}`;
    for (let i = 0; i < 300; i += 1) {
      rows.push({ date, market: i % 2 ? "good" : "bad", confidence: "High", p: i % 2 ? 0.55 : 0.80, q: 0.5, y: i % 2 ? (i % 4 < 2 ? 1 : 0) : 0 });
    }
  }

  // The autopsy must name the market with the widest calibration gap.
  const a = autopsy(rows, "2026-06-10");
  ok(a.status === "OK", `expected OK, got ${a.status}`);
  ok(a.byMarket[0].market === "bad", `worst market should be 'bad', got ${a.byMarket[0].market}`);
  ok(a.recommendation.includes("`bad`"), `recommendation should name the worst market: ${a.recommendation}`);
  ok(a.caveat.length > 20, "a single-date autopsy must carry its caveat");

  // A date with nothing settled must say so rather than divide by zero.
  ok(autopsy(rows, "2026-01-01").status === "NO_DECISIVE_ROWS", "an empty date must be reported, not crash");

  // A thin market must be marked insufficient, and must not drive the recommendation.
  const thin = [
    ...Array.from({ length: 300 }, (_, i) => ({ date: "2026-06-01", market: "fat", p: 0.55, q: 0.5, y: i % 2, confidence: "High" })),
    ...Array.from({ length: 5 }, () => ({ date: "2026-06-01", market: "thin", p: 0.99, q: 0.5, y: 0, confidence: "High" })),
  ];
  const t = autopsy(thin, "2026-06-01");
  ok(t.byMarket.find((m) => m.market === "thin").sufficientSample === false, "5 rows must be insufficient");
  // Match the backticked market name, not a bare substring: "anything" contains "thin", which made an
  // earlier version of this assertion fail against a perfectly correct recommendation.
  ok(!t.recommendation.includes("`thin`"), `a 5-row market must not drive the recommendation: ${t.recommendation}`);

  // Trend must refuse to report on a thin corpus rather than inventing a direction.
  ok(recentTrend(rows.slice(0, 50)) === null, "a thin corpus must yield a null trend");
  const tr = recentTrend(rows);
  ok(tr && typeof tr.significant === "boolean", "a real corpus must yield a trend with a significance flag");
  ok(tr.recentRows >= MIN_TREND_ROWS && tr.priorRows >= MIN_TREND_ROWS, "both sides must meet the minimum");

  return fails;
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
    console.log("self-test ok — the autopsy names the worst market, refuses thin samples, and the trend declines to guess");
    return;
  }

  const rows = loadRows();
  if (rows.length === 0) {
    console.error("no decisive rows — nothing to report on");
    process.exit(2);
  }

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const target = arg("date", dates[dates.length - 1]);

  const byMarket = {};
  for (const r of rows) (byMarket[r.market] ??= []).push(r);
  const base = marketRegistry(rows);
  const registry = {
    kind: "mlb-market-registry",
    public: false,
    asOfSettledDate: dates[dates.length - 1],
    totalDecisiveRows: rows.length,
    methodology: {
      minimumSampleForStatusChange: 500,
      statuses: {
        APPROVED: "beats the de-vigged market on Brier AND is calibrated within 5pp, on a sufficient sample",
        RECALIBRATE: "loses to the de-vigged market on Brier, or is miscalibrated by more than 5pp",
        DISABLED: "the entire 95% hit-rate interval sits below break-even on a sufficient sample",
        MONITOR: "sample below the minimum — reported, never acted on",
      },
      note: "Statuses are derived from measured outcomes. None is hand-assigned.",
    },
    markets: Object.fromEntries(Object.entries(base).map(([m, v]) => [m, { ...v, recentTrend: recentTrend(byMarket[m]) }])),
  };

  const report = autopsy(rows, target);

  if (process.argv.includes("--write")) {
    fs.mkdirSync(path.join(OUT_DIR, "autopsy"), { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, "registry.json"), JSON.stringify(registry, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "autopsy", `${target}.json`), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, "autopsy", "latest.json"), JSON.stringify(report, null, 2));
    console.log(`wrote registry.json and autopsy/${target}.json`);
    return;
  }

  console.log(`=== market registry (as of ${registry.asOfSettledDate}, ${registry.totalDecisiveRows} decisive rows) ===`);
  for (const [m, v] of Object.entries(registry.markets)) {
    const t = v.recentTrend;
    const trend = t ? ` · recent ${(t.recentHitRate * 100).toFixed(1)}% vs prior ${(t.priorHitRate * 100).toFixed(1)}% (${t.deltaPp >= 0 ? "+" : ""}${t.deltaPp.toFixed(1)}pp${t.significant ? ", significant" : ", not significant"})` : " · trend: insufficient sample";
    console.log(`  ${m.padEnd(24)} ${v.status.padEnd(12)} n=${String(v.n).padEnd(6)} ${(v.hitRate * 100).toFixed(2)}%${trend}`);
  }
  console.log(`\n=== autopsy · ${report.date} ===`);
  if (report.status !== "OK") {
    console.log(`  ${report.note}`);
    return;
  }
  for (const o of report.observations) console.log(`  · ${o}`);
  console.log(`\n  RECOMMENDATION: ${report.recommendation}`);
  console.log(`  ${report.caveat}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
