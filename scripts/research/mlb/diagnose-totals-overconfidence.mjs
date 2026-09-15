#!/usr/bin/env node
/**
 * MLB GAME TOTALS — OVERCONFIDENCE DIAGNOSIS (plan: data/internal/research/mlb/reports/totals-overconfidence-diagnosis-plan.md)
 *
 * DIAGNOSIS ONLY. The 2026 graded record is SEEN (the scorecard, /results and this script read it); nothing here is a
 * candidate score, a bar, or an adoption. It answers, on the graded record, which failure class explains the breach:
 *   level      is the simulated total centred wrong? (actual − simulated median / mean, per game)
 *   dispersion is the simulated distribution too tight? (PIT of the actual total under the pregame distribution — a
 *              U-shaped PIT means too tight; p10–p90 coverage against the 80% target; actual SD vs simulated SD)
 *   selection  is the pick (the larger of P(over)/P(under)) what inflates the shown probability? (reliability of P(over)
 *              on EVERY game, fixed side, beside the reliability of the CHOSEN side)
 *   segments   line range and month, declared up front, reported — never used to choose anything here
 *
 * Forecast of record = the graded row's own `forecastSource` prediction snapshot (data/internal/mlb/prediction-snapshots)
 * — the snapshot the grader cited, never the current file. The pregame DISTRIBUTION is recovered from git history: the
 * revision of app/public/data/mlb/full-game-simulations/<date>.json whose game carries the snapshot's artifactHash
 * (the committed dated file is overwritten once games start). A game whose revision cannot be found is reported as
 * unjoined, never imputed.
 *
 *   node scripts/research/mlb/diagnose-totals-overconfidence.mjs [--out data/internal/research/mlb/reports/totals-overconfidence-diagnosis.json]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const argv = process.argv.slice(2);
const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const OUT = argOf("--out") ?? "data/internal/research/mlb/reports/totals-overconfidence-diagnosis.json";

const LEDGER = "app/public/data/mlb/results/game-predictions-graded.jsonl";
const rows = fs.readFileSync(rel(LEDGER), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => r.market === "total" && (r.outcome === "WIN" || r.outcome === "LOSS" || r.outcome === "PUSH") && Number.isFinite(r.line));

/* ── forecast of record: the cited prediction snapshot ─────────────────────────────────────────── */
const snapCache = new Map();
function snapshotPrediction(r) {
  const m = /^snapshot:(\d{4}-\d{2}-\d{2})\/(snapshot-\d{12}\.json)$/.exec(r.forecastSource ?? "");
  if (!m) return null;
  const p = rel(`data/internal/mlb/prediction-snapshots/${m[1]}/${m[2]}`);
  if (!snapCache.has(p)) { try { snapCache.set(p, JSON.parse(fs.readFileSync(p, "utf8"))); } catch { snapCache.set(p, null); } }
  const doc = snapCache.get(p);
  return doc?.predictions?.find((x) => String(x.gamePk) === String(r.gamePk)) ?? null;
}

/* ── pregame distribution: the artifact revision with the snapshot's hash ──────────────────────── */
const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).toString();
const revCache = new Map(); // date → [{ sha, games: Map<gamePk, game> }]
function revisionsFor(date) {
  if (revCache.has(date)) return revCache.get(date);
  const file = `app/public/data/mlb/full-game-simulations/${date}.json`;
  const shas = git("log", "--format=%H", "--", file).trim().split("\n").filter(Boolean);
  const revs = [];
  for (const sha of shas) {
    let doc;
    try { doc = JSON.parse(git("show", `${sha}:${file}`)); } catch { continue; }
    revs.push({ sha, games: new Map((doc.games ?? []).map((g) => [String(g.gamePk), g])) });
  }
  revCache.set(date, revs);
  return revs;
}
function pregameGame(r, hash) {
  for (const rev of revisionsFor(r.date)) {
    const g = rev.games.get(String(r.gamePk));
    if (g && g.artifactHash === hash && g.totalRuns?.distribution?.length) return g;
  }
  return null;
}

/* ── join ─────────────────────────────────────────────────────────────────────────────────────── */
const joined = [];
const unjoined = { noSnapshot: 0, noRevision: 0 };
for (const r of rows) {
  const pred = snapshotPrediction(r);
  if (!pred?.total || pred.total.overProbability == null) { unjoined.noSnapshot += 1; continue; }
  const game = pregameGame(r, pred.artifactHash);
  if (!game) { unjoined.noRevision += 1; continue; }
  const dist = game.totalRuns.distribution.map((b) => ({ value: Number(b.value), p: Number(b.probability) })).filter((b) => Number.isFinite(b.value) && Number.isFinite(b.p));
  const mass = dist.reduce((s, b) => s + b.p, 0);
  const actual = r.actual.homeRuns + r.actual.awayRuns;
  const mean = dist.reduce((s, b) => s + b.value * b.p, 0) / mass;
  const sd = Math.sqrt(dist.reduce((s, b) => s + (b.value - mean) ** 2 * b.p, 0) / mass);
  const cdfBelow = dist.filter((b) => b.value < actual).reduce((s, b) => s + b.p, 0) / mass;
  const pAt = dist.filter((b) => b.value === actual).reduce((s, b) => s + b.p, 0) / mass;
  const pit = cdfBelow + 0.5 * pAt; // randomised-PIT midpoint for a discrete outcome
  joined.push({
    date: r.date, gamePk: r.gamePk, line: r.line, actual, median: game.totalRuns.median, mean, sd, p10: game.totalRuns.p10, p90: game.totalRuns.p90,
    pOver: pred.total.overProbability, pUnder: pred.total.underProbability, pick: pred.total.pick, shown: r.modelProbability,
    marketOver: pred.total.marketImpliedOver ?? r.marketImpliedProbability ?? null,
    outcome: r.outcome, over: actual > r.line ? 1 : actual < r.line ? 0 : null, pit,
    month: r.date.slice(0, 7),
  });
}

/* ── metrics ──────────────────────────────────────────────────────────────────────────────────── */
const r4 = (v) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null);
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sdOf = (a) => { const m = meanOf(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : null; };
const clip = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const logLoss = (p, y) => -Math.log(clip(y ? p : 1 - p));
function reliability(pairs) {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 }));
  for (const [p, o] of pairs) { const b = bins[Math.min(9, Math.floor(p * 10))]; b.n += 1; b.p += p; b.o += o; }
  const n = pairs.length;
  return { n, ece: r4(bins.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.o / b.n) : 0), 0)), bins: bins.map((b, i) => ({ bin: `${i / 10}-${(i + 1) / 10}`, n: b.n, meanShown: b.n ? r4(b.p / b.n) : null, rate: b.n ? r4(b.o / b.n) : null })) };
}
function block(list) {
  const decided = list.filter((g) => g.over != null);
  const fixedOver = decided.map((g) => [g.pOver, g.over]);
  const chosen = decided.map((g) => [g.pick === "OVER" ? g.pOver : g.pUnder, g.pick === "OVER" ? g.over : 1 - g.over]);
  const market = decided.filter((g) => g.marketOver != null).map((g) => [g.marketOver, g.over]);
  const pitHist = Array.from({ length: 10 }, (_, i) => list.filter((g) => Math.min(9, Math.floor(g.pit * 10)) === i).length / (list.length || 1));
  return {
    n: list.length, decided: decided.length,
    level: { meanActualMinusMedian: r4(meanOf(list.map((g) => g.actual - g.median))), meanActualMinusMean: r4(meanOf(list.map((g) => g.actual - g.mean))), meanActual: r4(meanOf(list.map((g) => g.actual))), meanSimMean: r4(meanOf(list.map((g) => g.mean))), meanLine: r4(meanOf(list.map((g) => g.line))) },
    dispersion: { actualSd: r4(sdOf(list.map((g) => g.actual))), meanSimSd: r4(meanOf(list.map((g) => g.sd))), sdOfActualMinusMean: r4(sdOf(list.map((g) => g.actual - g.mean))), coverageP10P90: r4(meanOf(list.map((g) => (g.actual >= g.p10 && g.actual <= g.p90 ? 1 : 0)))), pitHistogram: pitHist.map(r4), pitTailMass: r4(pitHist[0] + pitHist[9]) },
    selection: {
      fixedOver: reliability(fixedOver), chosenSide: reliability(chosen),
      overRate: r4(meanOf(decided.map((g) => g.over))), meanPOver: r4(meanOf(decided.map((g) => g.pOver))),
      chosenHitRate: r4(meanOf(chosen.map(([, o]) => o))), chosenMeanShown: r4(meanOf(chosen.map(([p]) => p))),
      logLoss: { fixedOver: r4(meanOf(fixedOver.map(([p, y]) => logLoss(p, y)))), chosenSide: r4(meanOf(chosen.map(([p, y]) => logLoss(p, y)))), coin: r4(Math.log(2)), marketOver: market.length ? r4(meanOf(market.map(([p, y]) => logLoss(p, y)))) : null, marketN: market.length },
      brier: { fixedOver: r4(meanOf(fixedOver.map(([p, y]) => (p - y) ** 2))), marketOver: market.length ? r4(meanOf(market.map(([p, y]) => (p - y) ** 2))) : null },
    },
  };
}
const lineBand = (g) => (g.line <= 7.5 ? "≤7.5" : g.line <= 9 ? "8–9" : "≥9.5");
const report = {
  schemaVersion: 1, artifact: "mlb-totals-overconfidence-diagnosis", dataClass: "PRIVATE_RESEARCH", generatedAt: new Date().toISOString(),
  status: "DIAGNOSIS_ONLY · the graded 2026 record is SEEN; nothing here is a candidate score or a bar",
  population: { gradedTotalRows: rows.length, joined: joined.length, unjoined },
  overall: block(joined),
  segments: {
    byLineBand: Object.fromEntries(["≤7.5", "8–9", "≥9.5"].map((b) => [b, block(joined.filter((g) => lineBand(g) === b))])),
    byMonth: Object.fromEntries([...new Set(joined.map((g) => g.month))].sort().map((m) => [m, block(joined.filter((g) => g.month === m))])),
  },
  reading: null,
};
const o = report.overall;
const notes = [];
if (o.level.meanActualMinusMean != null) notes.push(`LEVEL: actual − simulated mean = ${o.level.meanActualMinusMean} runs per game (actual − median ${o.level.meanActualMinusMedian}); simulated mean ${o.level.meanSimMean} vs actual ${o.level.meanActual} vs posted line ${o.level.meanLine}.`);
notes.push(`DISPERSION: actual SD ${o.dispersion.actualSd} vs mean simulated SD ${o.dispersion.meanSimSd}; SD of (actual − sim mean) ${o.dispersion.sdOfActualMinusMean}; p10–p90 coverage ${o.dispersion.coverageP10P90} (target 0.80); PIT tail mass (deciles 1+10) ${o.dispersion.pitTailMass} (0.20 if well specified; higher = too tight).`);
notes.push(`SELECTION: fixed-side P(over) ECE ${o.selection.fixedOver.ece} (mean P(over) ${o.selection.meanPOver} vs over rate ${o.selection.overRate}); chosen-side ECE ${o.selection.chosenSide.ece} (shown ${o.selection.chosenMeanShown} vs hit ${o.selection.chosenHitRate}). Log loss fixed ${o.selection.logLoss.fixedOver} · chosen ${o.selection.logLoss.chosenSide} · coin ${o.selection.logLoss.coin} · market ${o.selection.logLoss.marketOver}.`);
report.reading = notes;
fs.mkdirSync(path.dirname(rel(OUT)), { recursive: true });
fs.writeFileSync(rel(OUT), JSON.stringify(report, null, 1));
console.log(`joined ${joined.length}/${rows.length} (unjoined ${JSON.stringify(unjoined)})`);
for (const n of notes) console.log(n);
console.log("fixed-side reliability:", o.selection.fixedOver.bins.filter((b) => b.n).map((b) => `${b.bin}: n${b.n} shown ${b.meanShown} rate ${b.rate}`).join(" | "));
console.log("chosen-side reliability:", o.selection.chosenSide.bins.filter((b) => b.n).map((b) => `${b.bin}: n${b.n} shown ${b.meanShown} rate ${b.rate}`).join(" | "));
console.log("PIT deciles:", o.dispersion.pitHistogram.join(" "));
for (const [k, v] of Object.entries(report.segments.byLineBand)) console.log(`line ${k}: n ${v.n} level ${v.level?.meanActualMinusMean} cov ${v.dispersion?.coverageP10P90} chosen ECE ${v.selection?.chosenSide?.ece} hit ${v.selection?.chosenHitRate} shown ${v.selection?.chosenMeanShown}`);
for (const [k, v] of Object.entries(report.segments.byMonth)) console.log(`month ${k}: n ${v.n} level ${v.level?.meanActualMinusMean} cov ${v.dispersion?.coverageP10P90} chosen hit ${v.selection?.chosenHitRate} shown ${v.selection?.chosenMeanShown}`);
