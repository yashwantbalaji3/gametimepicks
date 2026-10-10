/**
 * MLB-004 · mlb-k-workload-v1 — DEVELOPMENT run on 2026 (EXPLORATORY: this window is already exposed; see
 * PREREGISTRATION.md). Read-only; writes only into this directory.
 *
 *   (from app/) npx tsx ../docs/research/mlb/mlb-004/k-workload-v1/evaluate-k-workload-v1.mjs
 *
 * Every challenger input for a start on date D comes from box-score lines of games dated < D only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mlbFirstPitches, mlbLeansOfRecord } from "../../../../../app/src/lib/results/mlb-leans-of-record.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const BOX = path.join(REPO, "data/internal/mlb/boxscore-outcomes");
const P = { leagueStarterBF: 22, bfPriorStarts: 3, lastStarts: 5, pitcherPriorBF: 150, lineupPriorPA: 300, lineupGames: 15 };
const jsonl = (p) => fs.readFileSync(path.join(REPO, p), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

// ── box scores, chronological ───────────────────────────────────────────────────────────────────────────────────────
const days = fs.readdirSync(BOX).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(BOX, f), "utf8")));
const firstDay = days[0]?.date;
// Per-pitcher start history and season totals, per-team batting history, league totals — built incrementally so a
// date's state contains only earlier dates.
const pitcher = new Map(); // id -> { starts: [{date, bf}], bf, k }
const team = new Map(); // abbr -> [{date, pa, k}]
const league = { pa: 0, k: 0 };
const stateBefore = new Map(); // date -> frozen snapshot accessor (computed lazily below)
const snapshots = [];
for (const day of days) {
  snapshots.push({ date: day.date, pitcher: structuredClone([...pitcher]), team: structuredClone([...team]), league: { ...league } });
  const teamGame = new Map();
  for (const r of day.rows) {
    if (r.pitching) {
      const s = pitcher.get(r.playerId) ?? { starts: [], bf: 0, k: 0 };
      if (r.pitching.started) s.starts.push({ date: day.date, bf: r.pitching.bf ?? 0 });
      s.bf += r.pitching.bf ?? 0; s.k += r.pitching.so ?? 0;
      pitcher.set(r.playerId, s);
    }
    if (r.batting && r.team) {
      const k = `${r.gamePk}|${r.team}`;
      const t = teamGame.get(k) ?? { team: r.team, pa: 0, k: 0 };
      t.pa += r.batting.pa ?? 0; t.k += r.batting.so ?? 0;
      teamGame.set(k, t);
      league.pa += r.batting.pa ?? 0; league.k += r.batting.so ?? 0;
    }
  }
  for (const t of teamGame.values()) { const a = team.get(t.team) ?? []; a.push({ date: day.date, pa: t.pa, k: t.k }); team.set(t.team, a); }
}
const snapFor = (date) => {
  // The latest snapshot taken at the START of a day ≤ date: it holds everything strictly before that day.
  let lo = 0; let hi = snapshots.length - 1; let best = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (snapshots[mid].date <= date) { best = snapshots[mid]; lo = mid + 1; } else hi = mid - 1; }
  if (!best) return null;
  if (best.date !== date) {
    // `date` has no box-score file of its own (an off-day). The next day's snapshot holds everything up to it.
    const next = snapshots.find((s) => s.date > date);
    return next ? { ...next, pitcherMap: new Map(next.pitcher), teamMap: new Map(next.team) } : null;
  }
  return { ...best, pitcherMap: new Map(best.pitcher), teamMap: new Map(best.team) };
};
void stateBefore;

const shrink = (x, n, prior, l) => (x + prior * l) / (n + prior);
const log5 = (b, p, l) => { const c = (v) => Math.min(1 - 1e-4, Math.max(1e-4, v)); const B = c(b); const Q = c(p); const L = c(l); const num = (B * Q) / L; return num / (num + ((1 - B) * (1 - Q)) / (1 - L)); };
const lgamma = (z) => { const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < 9; i += 1) x += c[i] / (z + i); const t = z + 7.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); };
const nbPmf = (k, mu, r) => Math.exp(lgamma(k + r) - lgamma(r) - lgamma(k + 1) + r * Math.log(r / (r + mu)) + k * Math.log(mu / (r + mu)));
const nbCdf = (k, mu, r) => { let s = 0; for (let i = 0; i <= k; i += 1) s += nbPmf(i, mu, r); return s; };

function challengerMean(date, pitcherId, opp) {
  const s = snapFor(date);
  if (!s) return null;
  const pt = s.pitcherMap.get(pitcherId) ?? { starts: [], bf: 0, k: 0 };
  const last = pt.starts.slice(-P.lastStarts).map((x) => x.bf);
  const eBF = (last.reduce((a, b) => a + b, 0) + P.bfPriorStarts * P.leagueStarterBF) / (last.length + P.bfPriorStarts);
  const L = s.league.pa ? s.league.k / s.league.pa : 0.22;
  const pk = shrink(pt.k, pt.bf, P.pitcherPriorBF, L);
  const tg = (s.teamMap.get(opp) ?? []).slice(-P.lineupGames);
  const tpa = tg.reduce((a, g) => a + g.pa, 0); const tk = tg.reduce((a, g) => a + g.k, 0);
  const lk = shrink(tk, tpa, P.lineupPriorPA, L);
  return { mu: eBF * log5(pk, lk, L), eBF, pk, lk, L, startsSeen: last.length };
}

// ── the settled K lines of record ───────────────────────────────────────────────────────────────────────────────────
const games = jsonl("app/public/data/mlb/results/game-predictions-graded.jsonl");
const leans = mlbLeansOfRecord(jsonl("pipeline/validation/mlb_settled_leans.jsonl"), { firstPitches: mlbFirstPitches(games) }).record
  .filter((r) => r.marketKey === "pitcher_strikeouts" && Number.isFinite(r.actual) && Number.isFinite(r.line) && r.actual !== r.line && Number.isFinite(r.modelProbOver));
const boards = new Map();
const boardRow = (date, id) => {
  if (!boards.has(date)) { let b = null; try { b = JSON.parse(fs.readFileSync(path.join(REPO, `app/public/data/mlb/boards/${date}.json`), "utf8")); } catch { b = null; } boards.set(date, b ? new Map((b.leans ?? []).map((l) => [l.id, l])) : null); }
  return boards.get(date)?.get(id) ?? null;
};
// The start itself (to know it WAS a start, and its opponent) from the box score of that date — the outcome file is
// used only to identify the row and its result, never as an input.
const startOf = new Map();
for (const day of days) for (const r of day.rows) if (r.pitching?.started) startOf.set(`${day.date}|${r.playerId}`, { gamePk: r.gamePk, team: r.team, k: r.pitching.so });
const teamsOfGame = new Map();
for (const day of days) for (const r of day.rows) if (r.team) { const s = teamsOfGame.get(r.gamePk) ?? new Set(); s.add(r.team); teamsOfGame.set(r.gamePk, s); }

const rows = [];
const skip = { notAStart: 0, noBoxDay: 0, beforeHistory: 0 };
for (const l of leans) {
  if (!firstDay || l.date < firstDay) { skip.beforeHistory += 1; continue; }
  const st = startOf.get(`${l.date}|${l.playerId}`);
  if (!st) { skip.notAStart += 1; continue; }
  const opp = [...(teamsOfGame.get(st.gamePk) ?? [])].find((t) => t !== st.team);
  const c = challengerMean(l.date, l.playerId, opp);
  if (!c) { skip.noBoxDay += 1; continue; }
  const b = boardRow(l.date, l.id);
  const io = b && Number.isFinite(b.oddsOver) ? (b.oddsOver < 0 ? -b.oddsOver / (-b.oddsOver + 100) : 100 / (b.oddsOver + 100)) : null;
  const iu = b && Number.isFinite(b.oddsUnder) ? (b.oddsUnder < 0 ? -b.oddsUnder / (-b.oddsUnder + 100) : 100 / (b.oddsUnder + 100)) : null;
  rows.push({ date: l.date, month: l.date.slice(0, 7), id: l.id, line: l.line, actual: l.actual, y: l.actual > l.line ? 1 : 0, current: l.modelProbOver, projection: l.projection, market: io != null && iu != null && b.projection === l.projection ? io / (io + iu) : null, ...c });
}

// Dispersion r: walk-forward by month on all earlier-month starts in the box scores (not only lined starts).
const allStarts = [];
for (const day of days) for (const r of day.rows) if (r.pitching?.started) {
  const opp = [...(teamsOfGame.get(r.gamePk) ?? [])].find((t) => t !== r.team);
  const c = challengerMean(day.date, r.playerId, opp);
  if (c && c.startsSeen >= 1) allStarts.push({ month: day.date.slice(0, 7), mu: c.mu, k: r.pitching.so ?? 0 });
}
const rByMonth = {};
for (const m of [...new Set(rows.map((r) => r.month))].sort()) {
  const train = allStarts.filter((x) => x.month < m);
  if (train.length < 150) { rByMonth[m] = null; continue; }
  let best = null;
  for (const r of [2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 128, 256]) { let ll = 0; for (const x of train) ll += Math.log(Math.max(1e-12, nbPmf(x.k, x.mu, r))); if (!best || ll > best.ll) best = { r, ll }; }
  rByMonth[m] = best.r;
}

const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const ll = (p, y) => -Math.log(y ? clamp(p) : 1 - clamp(p));
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const auc = (s, y) => { const a = s.map((v, i) => ({ v, y: y[i] })).sort((p, q) => p.v - q.v); let i = 0; let sp = 0; const np = y.filter(Boolean).length; const nn = y.length - np; while (i < a.length) { let j = i; while (j < a.length && a[j].v === a[i].v) j += 1; const r = (i + j + 1) / 2; for (let k = i; k < j; k += 1) if (a[k].y) sp += r; i = j; } return np && nn ? (sp - (np * (np + 1)) / 2) / (np * nn) : null; };
function logistic(xs, ys) { let a = 0; let b = 1; for (let it = 0; it < 30; it += 1) { let ga = 0; let gb = 0; let haa = 0; let hab = 0; let hbb = 0; for (let i = 0; i < xs.length; i += 1) { const p = 1 / (1 + Math.exp(-(a + b * xs[i]))); const w = p * (1 - p); ga += ys[i] - p; gb += (ys[i] - p) * xs[i]; haa += w; hab += w * xs[i]; hbb += w * xs[i] * xs[i]; } const det = haa * hbb - hab * hab; if (Math.abs(det) < 1e-12) break; a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det; } return { intercept: a, slope: b }; }
function boot(xs, iters = 4000, seed = 20261010) { let s = seed >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; const m = []; for (let k = 0; k < iters; k += 1) { let t = 0; for (let i = 0; i < xs.length; i += 1) t += xs[Math.floor(r() * xs.length)]; m.push(t / xs.length); } m.sort((a, b) => a - b); return [m[Math.floor(0.025 * iters)], m[Math.floor(0.975 * iters)]]; }

const scored = rows.filter((r) => rByMonth[r.month] != null).map((r) => ({ ...r, challenger: 1 - nbCdf(Math.ceil(r.line) - 1, r.mu, rByMonth[r.month]) }));
const ys = scored.map((r) => r.y);
const mk = scored.filter((r) => r.market != null);
const summarize = (key, rs) => ({ logLoss: mean(rs.map((r) => ll(r[key], r.y))), brier: mean(rs.map((r) => (r[key] - r.y) ** 2)), auc: auc(rs.map((r) => r[key]), rs.map((r) => r.y)), calibration: logistic(rs.map((r) => Math.log(clamp(r[key]) / (1 - clamp(r[key])))), rs.map((r) => r.y)) });
const report = {
  challenger: "mlb-k-workload-v1", exploratory: true, window: [scored[0]?.date ?? null, scored[scored.length - 1]?.date ?? null],
  rowsScored: scored.length, skipped: skip, dispersionByMonth: rByMonth, boxScoreHistoryFrom: firstDay,
  current: summarize("current", scored), challenger: summarize("challenger", scored),
  challengerMinusCurrent: (() => { const d = scored.map((r) => ll(r.challenger, r.y) - ll(r.current, r.y)); return { mean: mean(d), ci95: boot(d) }; })(),
  market: mk.length ? { n: mk.length, market: summarize("market", mk), challenger: summarize("challenger", mk), challengerMinusMarket: (() => { const d = mk.map((r) => ll(r.challenger, r.y) - ll(r.market, r.y)); return { mean: mean(d), ci95: boot(d) }; })() } : null,
  meanAbsError: { currentProjection: mean(scored.map((r) => Math.abs(r.actual - r.projection))), challengerMu: mean(scored.map((r) => Math.abs(r.actual - r.mu))) },
  overRate: mean(ys),
};
fs.writeFileSync(path.join(HERE, "dev-summary.json"), JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify(report, null, 1));
