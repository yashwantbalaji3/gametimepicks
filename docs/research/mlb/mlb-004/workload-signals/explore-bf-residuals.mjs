/**
 * MLB-004 · EXPLORATORY (2024 development season only): which pregame-knowable workload signals explain the starter
 * batters-faced error of the v2 workload mean (E[BF] = last-5-starts mean shrunk to 22 with weight 3)?
 *
 *   node docs/research/mlb/mlb-004/workload-signals/explore-bf-residuals.mjs
 *
 * Signals, every one from games dated BEFORE the start: days of rest since the pitcher's previous appearance, the
 * previous start's pitch count and BF, pitches per BF over his earlier starts, number of earlier starts, and
 * an "opener" history flag (mean BF of earlier starts < 12). Reports the residual mean by signal bucket. No model is
 * fitted or registered here; any mechanism it suggests is a new version, preregistered before it is evaluated.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const DIR = path.join(REPO, "data/internal/mlb/boxscore-outcomes-history/2024");
const days = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
const hist = new Map(); // pitcher -> [{date, started, bf, pitches}]
const rows = [];
const dayNum = (d) => Date.parse(`${d}T12:00:00Z`) / 86400e3;
for (const day of days) {
  for (const r of day.rows) {
    if (!r.pitching?.started) continue;
    const h = hist.get(r.playerId) ?? [];
    const starts = h.filter((x) => x.started);
    const last5 = starts.slice(-5).map((x) => x.bf);
    const eBF = (last5.reduce((a, b) => a + b, 0) + 3 * 22) / (last5.length + 3);
    const prev = h[h.length - 1]; const prevStart = starts[starts.length - 1];
    const ppb = starts.length ? starts.reduce((a, x) => a + (x.pitches ?? 0), 0) / Math.max(1, starts.reduce((a, x) => a + x.bf, 0)) : null;
    if (day.date >= "2024-05-01") rows.push({
      resid: (r.pitching.bf ?? 0) - eBF, eBF, bf: r.pitching.bf ?? 0,
      rest: prev ? dayNum(day.date) - dayNum(prev.date) : null,
      prevPitches: prevStart?.pitches ?? null, prevBf: prevStart?.bf ?? null, ppb, nStarts: starts.length,
      opener: starts.length >= 3 && last5.reduce((a, b) => a + b, 0) / last5.length < 12,
      prevRelief: prev ? !prev.started : null,
    });
  }
  for (const r of day.rows) if (r.pitching) { const h = hist.get(r.playerId) ?? []; h.push({ date: day.date, started: !!r.pitching.started, bf: r.pitching.bf ?? 0, pitches: r.pitching.pitches ?? null }); hist.set(r.playerId, h); }
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const bucket = (name, f, edges) => {
  const out = [];
  for (let i = 0; i < edges.length - 1; i += 1) { const sel = rows.filter((r) => { const v = f(r); return v != null && v >= edges[i] && v < edges[i + 1]; }); out.push({ range: `[${edges[i]}, ${edges[i + 1]})`, n: sel.length, residMean: mean(sel.map((r) => r.resid)), bfMean: mean(sel.map((r) => r.bf)) }); }
  return { signal: name, buckets: out };
};
const report = {
  label: "EXPLORATORY — 2024 development season; nothing fitted or registered",
  n: rows.length, residMean: mean(rows.map((r) => r.resid)), residMae: mean(rows.map((r) => Math.abs(r.resid))),
  signals: [
    bucket("days of rest", (r) => r.rest, [0, 4, 5, 6, 7, 10, 30, 400]),
    bucket("previous start pitches", (r) => r.prevPitches, [0, 60, 75, 85, 95, 105, 200]),
    bucket("pitches per BF (earlier starts)", (r) => r.ppb, [0, 3.6, 3.8, 4.0, 4.2, 9]),
    bucket("earlier starts", (r) => r.nStarts, [0, 1, 3, 6, 12, 40]),
    bucket("opener history (1 = yes)", (r) => (r.opener ? 1 : 0), [0, 1, 2]),
    bucket("previous appearance in relief (1 = yes)", (r) => (r.prevRelief == null ? null : r.prevRelief ? 1 : 0), [0, 1, 2]),
  ],
};
fs.writeFileSync(path.join(HERE, "bf-residuals-2024.json"), JSON.stringify(report, null, 1) + "\n");
console.log(`n=${report.n} resid mean ${report.residMean.toFixed(2)} MAE ${report.residMae.toFixed(2)}`);
for (const s of report.signals) console.log(`${s.signal}: ` + s.buckets.map((b) => `${b.range} n=${b.n} resid ${b.residMean?.toFixed(2)}`).join(" | "));
