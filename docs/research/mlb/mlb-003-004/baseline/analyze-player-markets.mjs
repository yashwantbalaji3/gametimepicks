/**
 * MLB-003 / MLB-004 · BASELINE AUDIT of the existing player-market model (founder decision 5, 2026-10-10).
 * READ-ONLY, descriptive: it measures the model as published; nothing is tuned and no challenger is evaluated here.
 *
 *   (from app/) npx tsx ../docs/research/mlb/mlb-003-004/baseline/analyze-player-markets.mjs
 *
 * Population: the settled player leans OF RECORD (pipeline/validation/mlb_settled_leans.jsonl through the production
 * forecast-of-record rule, mlbLeansOfRecord). Each row carries the model's P(over) for a posted line, its projection
 * (mean), the line and the official actual. Market: the board row with the same id (both sides' American odds,
 * de-vigged multiplicatively); the board file read is the day's committed file (its last revision), so a price can
 * differ from the revision that made the call — disclosed, and the market comparison is restricted to rows whose board
 * row carries the same projection as the settled row.
 *
 * September–October 2026 game outcomes were examined in MLB-002 (game level). They are reported here as their own
 * window and never called an untouched holdout for any challenger.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mlbFirstPitches, mlbLeansOfRecord } from "../../../../../app/src/lib/results/mlb-leans-of-record.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const jsonl = (p) => fs.readFileSync(path.join(REPO, p), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const all = jsonl("pipeline/validation/mlb_settled_leans.jsonl");
const games = jsonl("app/public/data/mlb/results/game-predictions-graded.jsonl");
const sel = mlbLeansOfRecord(all, { firstPitches: mlbFirstPitches(games) });
const rows = sel.record;

const boards = new Map();
const boardRow = (date, id) => {
  if (!boards.has(date)) {
    const p = path.join(REPO, `app/public/data/mlb/boards/${date}.json`);
    let b = null;
    try { b = JSON.parse(fs.readFileSync(p, "utf8")); } catch { b = null; }
    boards.set(date, b ? { generatedAt: b.generatedAt ?? null, byId: new Map((b.leans ?? []).map((l) => [l.id, l])) } : null);
  }
  return boards.get(date)?.byId.get(id) ?? null;
};
const implied = (o) => (o < 0 ? -o / (-o + 100) : 100 / (o + 100));
const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const windowOf = (d) => (d < "2026-07-01" ? "2026-05-16..06-30" : d < "2026-09-01" ? "2026-07-01..08-31" : "2026-09-01..10-08 (examined in MLB-002)");

function logistic(xs, ys) {
  let a = 0; let b = 1;
  for (let it = 0; it < 30; it += 1) {
    let ga = 0; let gb = 0; let haa = 0; let hab = 0; let hbb = 0;
    for (let i = 0; i < xs.length; i += 1) { const p = 1 / (1 + Math.exp(-(a + b * xs[i]))); const w = p * (1 - p); ga += ys[i] - p; gb += (ys[i] - p) * xs[i]; haa += w; hab += w * xs[i]; hbb += w * xs[i] * xs[i]; }
    const det = haa * hbb - hab * hab; if (Math.abs(det) < 1e-12) break;
    a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det;
  }
  return { intercept: a, slope: b };
}
function boot(xs, iters = 4000, seed = 20261010) {
  let s = seed >>> 0;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const m = [];
  for (let k = 0; k < iters; k += 1) { let t = 0; for (let i = 0; i < xs.length; i += 1) t += xs[Math.floor(r() * xs.length)]; m.push(t / xs.length); }
  m.sort((a, b) => a - b);
  return [m[Math.floor(0.025 * iters)], m[Math.floor(0.975 * iters)]];
}
const poissonLogScore = (lambda, k) => { const l = Math.max(1e-6, lambda); let lf = 0; for (let i = 2; i <= k; i += 1) lf += Math.log(i); return -(k * Math.log(l) - l - lf); };

function audit(rs) {
  const dec = rs.filter((r) => Number.isFinite(r.actual) && Number.isFinite(r.line) && r.actual !== r.line && Number.isFinite(r.modelProbOver));
  const y = dec.map((r) => (r.actual > r.line ? 1 : 0));
  const p = dec.map((r) => clamp(r.modelProbOver));
  const ll = p.map((pi, i) => -Math.log(y[i] ? pi : 1 - pi));
  const br = p.map((pi, i) => (pi - y[i]) ** 2);
  const cal = logistic(p.map((pi) => Math.log(pi / (1 - pi))), y);
  // Reliability (10 bins).
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  p.forEach((pi, i) => { const b = Math.min(9, Math.floor(pi * 10)); bins[b].n += 1; bins[b].p += pi; bins[b].y += y[i]; });
  // Market, where the board row is the same projection (the same model revision) and has both sides' prices.
  const mk = [];
  for (let i = 0; i < dec.length; i += 1) {
    const b = boardRow(dec[i].date, dec[i].id);
    if (!b || !Number.isFinite(b.oddsOver) || !Number.isFinite(b.oddsUnder) || b.projection !== dec[i].projection) continue;
    const io = implied(b.oddsOver); const iu = implied(b.oddsUnder);
    mk.push({ i, m: clamp(io / (io + iu)) });
  }
  const mll = mk.map(({ i, m }) => -Math.log(y[i] ? m : 1 - m));
  const dLL = mk.map(({ i, m }, j) => ll[i] - mll[j]);
  // The projection as a count distribution: Poisson with the published mean (the model publishes a mean, not a pmf).
  const proj = rs.filter((r) => Number.isFinite(r.projection) && Number.isFinite(r.actual) && Number.isInteger(r.actual));
  // Picks: the published lean side.
  const picks = dec.filter((r) => r.lean === "Over" || r.lean === "Under");
  const won = picks.filter((r) => (r.lean === "Over") === (r.actual > r.line)).length;
  return {
    rows: rs.length, decisive: dec.length, pushes: rs.filter((r) => r.actual === r.line).length,
    overRate: mean(y), meanPOver: mean(p),
    logLoss: mean(ll), brier: mean(br), coinLogLoss: Math.LN2,
    calibration: cal,
    reliability: bins.map((b, k) => ({ bin: `${k / 10}-${(k + 1) / 10}`, n: b.n, meanP: b.n ? b.p / b.n : null, observed: b.n ? b.y / b.n : null })).filter((b) => b.n),
    market: mk.length ? { n: mk.length, model: mean(mk.map(({ i }) => ll[i])), market: mean(mll), modelMinusMarket: mean(dLL), ci95: boot(dLL) } : null,
    projection: { n: proj.length, bias: mean(proj.map((r) => r.actual - r.projection)), mae: mean(proj.map((r) => Math.abs(r.actual - r.projection))), poissonLogScore: mean(proj.map((r) => poissonLogScore(r.projection, r.actual))) },
    leanPicks: { n: picks.length, hitRate: picks.length ? won / picks.length : null },
  };
}

const markets = [...new Set(rows.map((r) => r.marketKey))].sort();
const f4 = (x) => (x == null ? "—" : x.toFixed(4));
const report = {
  schema: "gtp.mlb.player-market-baseline@1",
  population: { settledRows: all.length, ofRecord: rows.length, excluded: sel.excluded },
  pointInTime: (() => {
    let late = 0; let unknown = 0;
    for (const r of rows) {
      const b = boards.get(r.date) ?? (boardRow(r.date, r.id), boards.get(r.date));
      const fp = games.find((g) => g.gamePk === r.gamePk)?.firstPitchUtc ?? null;
      if (!b?.generatedAt || !fp) { unknown += 1; continue; }
      if (!(Date.parse(b.generatedAt) < Date.parse(fp))) late += 1;
    }
    return { rule: "board file generatedAt < the game's first pitch (the day's LAST board revision — a conservative check: earlier revisions are earlier)", rowsChecked: rows.length - unknown, unknownTiming: unknown, boardGeneratedAtOrAfterFirstPitch: late, note: "The production leans-of-record rule already drops late copies (excluded.late)." };
  })(),
  byMarket: Object.fromEntries(markets.map((m) => [m, { all: audit(rows.filter((r) => r.marketKey === m)), byWindow: Object.fromEntries([...new Set(rows.map((r) => windowOf(r.date)))].sort().map((w) => [w, audit(rows.filter((r) => r.marketKey === m && windowOf(r.date) === w))])) }])),
};
// Home runs: Homer Nukes settled files (the model's P(player homers), settled from the official box score). No market
// price is stored with them, so this is calibration and proper scoring against the base rate only.
{
  const dir = path.join(REPO, "app/public/data/mlb/homer-nukes");
  const hr = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^settled-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
    for (const pk of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).picks ?? []) {
      if (Number.isFinite(pk.probability) && (pk.result === "hit" || pk.result === "miss")) hr.push({ p: clamp(pk.probability), y: pk.result === "hit" ? 1 : 0, date: f.slice(8, 18) });
    }
  }
  const base = mean(hr.map((r) => r.y));
  const ll = hr.map((r) => -Math.log(r.y ? r.p : 1 - r.p));
  const llBase = hr.map((r) => -Math.log(r.y ? clamp(base) : 1 - clamp(base)));
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (const r of hr) { const b = Math.min(9, Math.floor(r.p * 10)); bins[b].n += 1; bins[b].p += r.p; bins[b].y += r.y; }
  report.homeRuns = {
    source: "app/public/data/mlb/homer-nukes/settled-*.json", rows: hr.length, window: [hr[0]?.date ?? null, hr[hr.length - 1]?.date ?? null],
    hitRate: base, meanP: mean(hr.map((r) => r.p)), logLoss: mean(ll), brier: mean(hr.map((r) => (r.p - r.y) ** 2)),
    baseRateLogLoss: mean(llBase), modelMinusBaseRate: mean(ll.map((x, i) => x - llBase[i])), ci95: boot(ll.map((x, i) => x - llBase[i])),
    calibration: logistic(hr.map((r) => Math.log(r.p / (1 - r.p))), hr.map((r) => r.y)),
    reliability: bins.map((b, k) => ({ bin: `${k / 10}-${(k + 1) / 10}`, n: b.n, meanP: b.n ? b.p / b.n : null, observed: b.n ? b.y / b.n : null })).filter((b) => b.n),
    note: "selected players only (the product's candidates), not every batter; a base-rate comparison, not a market one",
  };
  console.log(`home_runs (Homer Nukes) n=${hr.length} hit=${f4(base)} meanP=${f4(report.homeRuns.meanP)} LL=${f4(report.homeRuns.logLoss)} baseLL=${f4(report.homeRuns.baseRateLogLoss)} diff ${f4(report.homeRuns.modelMinusBaseRate)} [${f4(report.homeRuns.ci95[0])}, ${f4(report.homeRuns.ci95[1])}] slope=${f4(report.homeRuns.calibration.slope)}`);
}
fs.writeFileSync(path.join(HERE, "baseline-summary.json"), JSON.stringify(report, null, 1) + "\n");
for (const m of markets) {
  const a = report.byMarket[m].all;
  console.log(`${m.padEnd(24)} n=${a.decisive} over=${f4(a.overRate)} meanP=${f4(a.meanPOver)} LL=${f4(a.logLoss)} Brier=${f4(a.brier)} slope=${f4(a.calibration.slope)} mkt=${a.market ? `${a.market.n} model ${f4(a.market.model)} market ${f4(a.market.market)} diff ${f4(a.market.modelMinusMarket)} [${f4(a.market.ci95[0])}, ${f4(a.market.ci95[1])}]` : "—"} projBias=${f4(a.projection.bias)} MAE=${f4(a.projection.mae)} leanHit=${f4(a.leanPicks.hitRate)} (${a.leanPicks.n})`);
}
console.log(JSON.stringify({ population: report.population, pointInTime: report.pointInTime }, null, 1));
