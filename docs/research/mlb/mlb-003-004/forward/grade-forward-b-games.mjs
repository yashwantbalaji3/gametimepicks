/**
 * Forward test B-GAMES · grader (FORWARD-PREREGISTRATION-B-GAMES.md). Frozen with its registration; research only.
 *
 *   node docs/research/mlb/mlb-003-004/forward/grade-forward-b-games.mjs           counts only (no performance shown)
 *   node docs/research/mlb/mlb-003-004/forward/grade-forward-b-games.mjs --look    the single look (refuses before n)
 *
 * Joins forward test B's `game` rows (data/internal/research/mlb/forward-player-b/<date>.json) to the published game
 * prediction of record (app/public/data/mlb/results/game-predictions-graded.jsonl, moneyline) and the official final
 * (data/internal/mlb/boxscore-outcomes/<date>.json, opposing pitching runs). Regular season counts toward n; the
 * postseason is reported separately. Pending games are never losses.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const LOOK = process.argv.includes("--look");
const N_MIN = 300;
const FWD = path.join(REPO, "data/internal/research/mlb/forward-player-b");
const BOX = path.join(REPO, "data/internal/mlb/boxscore-outcomes");
const LOOK_FILE = path.join(HERE, "LOOK-RESULT-B-GAMES.json");
const REG_FILE = "docs/research/mlb/mlb-003-004/forward/FORWARD-PREREGISTRATION-B-GAMES.md";
const graded = fs.readFileSync(path.join(REPO, "app/public/data/mlb/results/game-predictions-graded.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const pubBy = new Map(graded.filter((r) => r.market === "moneyline").map((r) => [r.gamePk, r]));
const files = fs.existsSync(FWD) ? fs.readdirSync(FWD).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
let regTime = null;
try { regTime = (await import("node:child_process")).execFileSync("git", ["-C", REPO, "log", "--diff-filter=A", "--format=%cI", "--", REG_FILE], { encoding: "utf8" }).trim().split("\n").pop() || null; } catch { regTime = null; }
const rows = []; let pending = 0; let noPublished = 0; let beforeWindow = 0;
for (const f of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(FWD, f), "utf8"));
  let box = null; try { box = JSON.parse(fs.readFileSync(path.join(BOX, f), "utf8")); } catch { box = null; }
  for (const g of doc.rows.filter((r) => r.kind === "game")) {
    if (!regTime || !(Date.parse(g.scheduledStart) > Date.parse(regTime))) { beforeWindow += 1; continue; }
    if (!box) { pending += 1; continue; }
    const runs = (side) => box.rows.filter((r) => r.gamePk === g.gamePk && r.side !== side && r.pitching).reduce((a, r) => a + (r.pitching.r ?? 0), 0);
    const a = runs("away"); const h = runs("home");
    if (!box.rows.some((r) => r.gamePk === g.gamePk) || a === h) { pending += 1; continue; }
    const pub = pubBy.get(g.gamePk);
    if (!pub) { noPublished += 1; continue; }
    const homePick = String(pub.pick).endsWith("(home)");
    const meta = (box.games ?? []).find((x) => x.gamePk === g.gamePk);
    rows.push({ date: doc.date, y: h > a ? 1 : 0, total: a + h, postseason: meta?.gameType ? meta.gameType !== "R" : null,
      engine: g.engineSub.pHome, totalPmf: g.engineSub.totalRuns, pub: homePick ? pub.modelProbability : 1 - pub.modelProbability,
      mkt: pub.marketImpliedProbability == null ? null : homePick ? pub.marketImpliedProbability : 1 - pub.marketImpliedProbability });
  }
}
const reg = rows.filter((r) => r.postseason === false);
console.log(`[forward-b-games] regular season ${reg.length} / ${N_MIN}; postseason ${rows.filter((r) => r.postseason).length}; pending ${pending}; no published row ${noPublished}; before window ${beforeWindow} (no performance shown before the look)`);
if (!LOOK) process.exit(0);
if (fs.existsSync(LOOK_FILE)) { console.log("already looked; not re-read"); process.exit(0); }
if (reg.length < N_MIN) { console.log(`not enough data: ${reg.length} < ${N_MIN}`); process.exit(0); }
const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const ll = (p, y) => -Math.log(y ? clamp(p) : 1 - clamp(p));
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
function boot(rs, d, iters = 4000, seed = 20261010) { const by = new Map(); rs.forEach((r, i) => { const a = by.get(r.date) ?? []; a.push(d[i]); by.set(r.date, a); }); const g = [...by.values()].map((a) => [a.reduce((s, x) => s + x, 0), a.length]); let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; const ms = []; for (let k = 0; k < iters; k += 1) { let t = 0; let n = 0; for (let i = 0; i < g.length; i += 1) { const x = g[Math.floor(rnd() * g.length)]; t += x[0]; n += x[1]; } ms.push(t / n); } ms.sort((a, b) => a - b); return [ms[Math.floor(0.025 * iters)], ms[Math.floor(0.975 * iters)]]; }
function slope(rs) { let a = 0; let b = 1; const xs = rs.map((r) => Math.log(clamp(r.engine) / (1 - clamp(r.engine)))); const ys = rs.map((r) => r.y); for (let it = 0; it < 30; it += 1) { let ga = 0; let gb = 0; let haa = 0; let hab = 0; let hbb = 0; for (let i = 0; i < xs.length; i += 1) { const p = 1 / (1 + Math.exp(-(a + b * xs[i]))); const w = p * (1 - p); ga += ys[i] - p; gb += (ys[i] - p) * xs[i]; haa += w; hab += w * xs[i]; hbb += w * xs[i] * xs[i]; } const det = haa * hbb - hab * hab; if (Math.abs(det) < 1e-12) break; a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det; } return b; }
const d = reg.map((r) => ll(r.engine, r.y) - ll(r.pub, r.y)); const ci = boot(reg, d); const sl = slope(reg);
const mk = reg.filter((r) => r.mkt != null); const dm = mk.map((r) => ll(r.engine, r.y) - ll(r.mkt, r.y));
const res = { lookedAt: new Date().toISOString(), n: reg.length, logLoss: { engine: mean(reg.map((r) => ll(r.engine, r.y))), published: mean(reg.map((r) => ll(r.pub, r.y))) }, engineMinusPublished: { mean: mean(d), ci95: ci }, calibrationSlope: sl, passes: ci[1] < 0 && sl >= 0.7 && sl <= 1.3, engineMinusMarket: mk.length ? { n: mk.length, mean: mean(dm), ci95: boot(mk, dm), note: "reported only" } : null };
fs.writeFileSync(LOOK_FILE, JSON.stringify(res, null, 1) + "\n");
console.log(JSON.stringify(res));
