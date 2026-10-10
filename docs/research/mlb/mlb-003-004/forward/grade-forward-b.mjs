/**
 * Forward test B · grader (FORWARD-PREREGISTRATION-B.md). Frozen with the registration; research only.
 *
 *   node docs/research/mlb/mlb-003-004/forward/grade-forward-b.mjs            counts only (no performance shown)
 *   node docs/research/mlb/mlb-003-004/forward/grade-forward-b.mjs --look     the single registered look, per family
 *
 * Joins every forward row (data/internal/research/mlb/forward-player-b/<date>.json) to:
 *   - the official box score of its date (data/internal/mlb/boxscore-outcomes/<date>.json): the outcome;
 *   - the board lean of record (mlbLeansOfRecord over pipeline/validation/mlb_settled_leans.jsonl): line, the published
 *     model's P(over), and the board's two-sided price (de-vigged multiplicatively).
 * Voids, never losses: a listed batter with no PA, a listed starter who did not start, an integer line that lands
 * exactly (push). Missing stays missing.
 *
 * Without --look it prints only the graded counts per family, so nobody reads performance before the single look.
 * --look refuses a family that has not reached its registered n, and (once written) refuses a second look at it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mlbFirstPitches, mlbLeansOfRecord } from "../../../../../app/src/lib/results/mlb-leans-of-record.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const LOOK = process.argv.includes("--look");
const FWD = path.join(REPO, "data/internal/research/mlb/forward-player-b");
const BOX = path.join(REPO, "data/internal/mlb/boxscore-outcomes");
const LOOK_FILE = path.join(HERE, "LOOK-RESULT.json");
const N_MIN = { batter_hits: 2000, batter_total_bases: 1000, batter_hits_runs_rbis: 1000, pitcher_strikeouts: 300 };
const FIELD = { batter_hits: "hits", batter_total_bases: "tb", batter_hits_runs_rbis: "hrr" };
const jsonl = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const files = fs.existsSync(FWD) ? fs.readdirSync(FWD).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
const graded = jsonl("app/public/data/mlb/results/game-predictions-graded.jsonl");
const leans = mlbLeansOfRecord(jsonl("pipeline/validation/mlb_settled_leans.jsonl"), { firstPitches: mlbFirstPitches(graded) }).record;
const leanBy = new Map(); for (const l of leans) if (N_MIN[l.marketKey]) { const k = `${l.date}|${l.gamePk}|${l.playerId}|${l.marketKey}`; const a = leanBy.get(k) ?? []; a.push(l); leanBy.set(k, a); }
const boards = new Map();
const boardRow = (date, id) => { if (!boards.has(date)) { let b = null; try { b = JSON.parse(fs.readFileSync(path.join(REPO, `app/public/data/mlb/boards/${date}.json`), "utf8")); } catch { b = null; } boards.set(date, b ? new Map((b.leans ?? []).map((x) => [x.id, x])) : null); } return boards.get(date)?.get(id) ?? null; };
const implied = (o) => (o < 0 ? -o / (-o + 100) : 100 / (o + 100));
const pOver = (pmf, t) => (pmf ? pmf.reduce((a, p, k) => a + (k > t ? p : 0), 0) : null);

const rows = []; const voids = {}; const noLine = {};
for (const f of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(FWD, f), "utf8"));
  let box = null; try { box = JSON.parse(fs.readFileSync(path.join(BOX, f), "utf8")); } catch { box = null; }
  if (!box) continue; // outcomes not captured yet: pending, never a loss
  const lineOf = new Map(box.rows.map((r) => [`${r.gamePk}|${r.playerId}`, r]));
  for (const r of doc.rows.filter((x) => x.kind !== "game")) {
    const out = lineOf.get(`${r.gamePk}|${r.playerId}`);
    const fams = r.kind === "starter" ? ["pitcher_strikeouts"] : Object.keys(FIELD);
    for (const fam of fams) {
      const ls = leanBy.get(`${doc.date}|${r.gamePk}|${r.playerId}|${fam}`);
      if (!ls?.length) { noLine[fam] = (noLine[fam] ?? 0) + 1; continue; }
      const played = r.kind === "starter" ? !!out?.pitching?.started : (out?.batting?.pa ?? 0) > 0;
      if (!played) { voids[fam] = (voids[fam] ?? 0) + 1; continue; }
      const actual = r.kind === "starter" ? out.pitching.so : fam === "batter_hits_runs_rbis" ? (out.batting.h ?? 0) + (out.batting.r ?? 0) + (out.batting.rbi ?? 0) : out.batting[fam === "batter_hits" ? "h" : "tb"];
      for (const l of ls) {
        if (actual === l.line) { voids[fam] = (voids[fam] ?? 0) + 1; continue; } // push
        const br = boardRow(l.date, l.id);
        const market = br && Number.isFinite(br.oddsOver) && Number.isFinite(br.oddsUnder) ? implied(br.oddsOver) / (implied(br.oddsOver) + implied(br.oddsUnder)) : null;
        const pick = (m) => (r.kind === "starter" ? r[m] : r[m]?.[FIELD[fam]]);
        rows.push({ fam, date: doc.date, y: actual > l.line ? 1 : 0, current: l.modelProbOver, v2: pOver(pick("v2"), l.line), engineSub: pOver(pick("engineSub"), l.line), market });
      }
    }
  }
}
const counts = Object.fromEntries(Object.keys(N_MIN).map((fam) => [fam, { graded: rows.filter((r) => r.fam === fam).length, required: N_MIN[fam], voids: voids[fam] ?? 0, noLine: noLine[fam] ?? 0 }]));
console.log(`[forward-b] ${files.length} forward file(s). Graded counts (no performance shown before the look):`);
for (const [fam, c] of Object.entries(counts)) console.log(`  ${fam.padEnd(24)} ${c.graded} / ${c.required}  (void ${c.voids}, no posted line ${c.noLine})`);
if (!LOOK) process.exit(0);

// ── the single look ──
const prior = fs.existsSync(LOOK_FILE) ? JSON.parse(fs.readFileSync(LOOK_FILE, "utf8")) : { families: {} };
const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const ll = (p, y) => -Math.log(y ? clamp(p) : 1 - clamp(p));
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
function bootByDate(rs, d, iters = 2000, seed = 20261010) { const by = new Map(); rs.forEach((r, i) => { const a = by.get(r.date) ?? []; a.push(d[i]); by.set(r.date, a); }); const g = [...by.values()].map((a) => [a.reduce((s, x) => s + x, 0), a.length]); let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; const ms = []; for (let k = 0; k < iters; k += 1) { let t = 0; let n = 0; for (let i = 0; i < g.length; i += 1) { const x = g[Math.floor(rnd() * g.length)]; t += x[0]; n += x[1]; } ms.push(t / n); } ms.sort((a, b) => a - b); return [ms[Math.floor(0.025 * iters)], ms[Math.floor(0.975 * iters)]]; }
function logistic(xs, ys) { let a = 0; let b = 1; for (let it = 0; it < 30; it += 1) { let ga = 0; let gb = 0; let haa = 0; let hab = 0; let hbb = 0; for (let i = 0; i < xs.length; i += 1) { const p = 1 / (1 + Math.exp(-(a + b * xs[i]))); const w = p * (1 - p); ga += ys[i] - p; gb += (ys[i] - p) * xs[i]; haa += w; hab += w * xs[i]; hbb += w * xs[i] * xs[i]; } const det = haa * hbb - hab * hab; if (Math.abs(det) < 1e-12) break; a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det; } return { intercept: a, slope: b }; }
for (const fam of Object.keys(N_MIN)) {
  if (prior.families[fam]) { console.log(`${fam}: already looked at (${prior.families[fam].lookedAt}); not re-read`); continue; }
  const rs = rows.filter((r) => r.fam === fam && r.v2 != null && r.engineSub != null);
  if (rs.length < N_MIN[fam]) { console.log(`${fam}: ${rs.length} < ${N_MIN[fam]} — not enough data; no look`); continue; }
  const res = { lookedAt: new Date().toISOString(), n: rs.length, models: {}, vsCurrent: {}, vsMarket: {} };
  for (const m of ["current", "v2", "engineSub"]) { const ps = rs.map((r) => r[m]); res.models[m] = { logLoss: mean(rs.map((r) => ll(r[m], r.y))), calibration: logistic(ps.map((p) => Math.log(clamp(p) / (1 - clamp(p)))), rs.map((r) => r.y)) }; }
  for (const m of ["v2", "engineSub"]) {
    const d = rs.map((r) => ll(r[m], r.y) - ll(r.current, r.y)); const ci = bootByDate(rs, d);
    const slope = res.models[m].calibration.slope;
    res.vsCurrent[m] = { mean: mean(d), ci95: ci, passes: ci[1] < 0 && slope >= 0.7 && slope <= 1.3 };
    const mk = rs.filter((r) => r.market != null); const dm = mk.map((r) => ll(r[m], r.y) - ll(r.market, r.y));
    res.vsMarket[m] = mk.length ? { n: mk.length, mean: mean(dm), ci95: bootByDate(mk, dm), note: "reported only; never used to pass" } : null;
  }
  prior.families[fam] = res;
  console.log(`${fam}: n=${res.n} ` + JSON.stringify(res.vsCurrent));
}
fs.writeFileSync(LOOK_FILE, JSON.stringify(prior, null, 1) + "\n");
