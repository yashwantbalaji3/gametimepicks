/**
 * backtest-mlb-projection-formulas — leakage-safe walk-forward backtest of MLB
 * projection formula variants on SETTLED outcomes. Local, no network.
 *
 * Joins each settled leg's `actual` value (mlb/results/settled_leans.jsonl) to the
 * pre-game full-season `recentSeries` from that date's board (mlb/boards/<date>.json
 * — leakage-safe: the series excludes the settled game). Recomputes the projection
 * under different recent/season weights and reports Brier score (calibration, ↓
 * better) + directional accuracy (proj-vs-line predicts over/under, ↑ better) per
 * market. Pushes (actual==line) excluded.
 *
 * Run: cd app && npx tsx scripts/backtest-mlb-projection-formulas.mjs \
 *   --from 2026-06-01 --to 2026-06-08 \
 *   --markets batter_hits,batter_total_bases,batter_hits_runs_rbis,pitcher_strikeouts \
 *   --weights 0.3,0.4,0.5,0.6 --write-report
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "research");
const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const FROM = arg("--from", "2026-06-01"), TO = arg("--to", "2026-06-08");
const MARKETS = arg("--markets", "batter_hits,batter_total_bases,batter_hits_runs_rbis,pitcher_strikeouts").split(",");
const WEIGHTS = arg("--weights", "0.3,0.4,0.5,0.6").split(",").map(Number);
const WRITE = argv.includes("--write-report");
const FLOOR = { batter_hits: 0.85, batter_total_bases: 1.10, batter_hits_runs_rbis: 1.20, pitcher_strikeouts: 1.6 };

const loadJSON = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const pstdev = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
function dateRange(a, b) { const o = []; let d = new Date(a + "T00:00:00Z"); const e = new Date(b + "T00:00:00Z"); while (d <= e) { o.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return o; }

const dates = dateRange(FROM, TO);
const series = new Map(); // `${date}|${pid}|${marketKey}` -> number[]
for (const d of dates) {
  const b = loadJSON(resolve(DATA, "mlb", "boards", `${d}.json`));
  for (const l of (b?.leans || [])) {
    const rs = (l.recentSeries || []).filter((x) => typeof x === "number");
    if (rs.length && l.playerId && l.marketKey) series.set(`${d}|${l.playerId}|${l.marketKey}`, rs);
  }
}
const settled = [];
for (const line of readFileSync(resolve(DATA, "mlb", "results", "settled_leans.jsonl"), "utf8").split("\n")) {
  if (!line.trim()) continue;
  try { const d = JSON.parse(line); if (dates.includes(d.date) && d.actual != null && d.line != null) settled.push(d); } catch {}
}

const report = {};
for (const mk of MARKETS) {
  const rows = settled.filter((d) => d.marketKey === mk && series.has(`${d.date}|${d.playerId}|${mk}`));
  report[mk] = { n: 0, weights: {} };
  for (const w of WEIGHTS) {
    let brier = 0, n = 0, dirHit = 0, dirN = 0;
    for (const d of rows) {
      const rs = series.get(`${d.date}|${d.playerId}|${mk}`);
      if (rs.length < 5) continue;
      const line = +d.line, actual = +d.actual;
      if (actual === line) continue;
      const proj = w * mean(rs.slice(-10)) + (1 - w) * mean(rs);
      const sig = Math.max(pstdev(rs) || FLOOR[mk] || 1, FLOOR[mk] || 1);
      const pOver = 1 - phi((line - proj) / sig);
      const ao = actual > line ? 1 : 0;
      brier += (pOver - ao) ** 2; n++;
      dirN++; if ((proj > line) === (ao === 1)) dirHit++;
    }
    report[mk].n = n;
    report[mk].weights[w] = { brier: n ? +(brier / n).toFixed(4) : null, dirAcc: dirN ? +(dirHit / dirN).toFixed(3) : null };
  }
}

const md = `# MLB projection-formula backtest (${FROM}→${TO})\n\nLeakage-safe (pre-game series vs that day's actual). Brier ↓ better; dirAcc ↑ better.\n\n` +
  MARKETS.map((mk) => `## ${mk} (n=${report[mk].n})\n` +
    WEIGHTS.map((w) => `- L10 weight ${w}: Brier ${report[mk].weights[w].brier}, dirAcc ${report[mk].weights[w].dirAcc}`).join("\n")).join("\n\n");
console.log(md);
if (WRITE) { mkdirSync(DOCS, { recursive: true }); writeFileSync(resolve(DOCS, "mlb-projection-formula-backtest-latest.md"), md + "\n"); console.log("\nwrote report"); }
