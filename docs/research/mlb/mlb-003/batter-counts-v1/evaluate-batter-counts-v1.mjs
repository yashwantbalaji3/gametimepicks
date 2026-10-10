/**
 * MLB-003 · mlb-batter-counts-v1 — DEVELOPMENT run on 2026 (EXPLORATORY: this window is already exposed; see
 * PREREGISTRATION.md). Read-only; writes only into this directory.
 *
 *   (from app/) npx tsx ../docs/research/mlb/mlb-003/batter-counts-v1/evaluate-batter-counts-v1.mjs
 *
 * Inputs for a line on date D: box-score lines of games dated < D (season-to-date per-PA rates, started-game PA) and
 * pregame captures (batter splits / starter workload / handedness / slot) captured before the line's board. The
 * game's own box score identifies the result only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mlbFirstPitches, mlbLeansOfRecord } from "../../../../../app/src/lib/results/mlb-leans-of-record.mjs";
import { PA_BY_SLOT } from "../../../../../app/scripts/capture-mlb-pregame-pa-opportunity.mjs";
import { SeededRng } from "../../../../../app/src/lib/game-simulations/rng.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const BOX = path.join(REPO, "data/internal/mlb/boxscore-outcomes");
const FEAT = path.join(REPO, "data/internal/mlb/pregame-archive/pregame-features");
const PRIOR = { pa: { mean: 4.0, games: 5, last: 15 }, h: 150, d: 300, t: 800, hr: 170, r: 200, rbi: 200, k: 60, bb: 120, pitcherHr: 500, pitcherK: 70, pitcherBb: 170, bfPerIp: 4.25 };
const DRAWS = 2000;
const jsonl = (p) => fs.readFileSync(path.join(REPO, p), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

// ── box scores → per-date snapshots of batter season-to-date totals and started-game PA ────────────────────────────
const days = fs.readdirSync(BOX).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(BOX, f), "utf8")));
const batters = new Map(); // id -> totals + startedPA[]
const league = { pa: 0, h: 0, d: 0, t: 0, hr: 0, r: 0, rbi: 0, k: 0, bb: 0 };
const snapAt = new Map(); // date -> { batters: Map(id -> frozen totals), league }
const resultOf = new Map(); // `${date}|${playerId}` -> batting line (result only)
for (const day of days) {
  const frozen = new Map();
  for (const [id, b] of batters) frozen.set(id, { ...b, startedPA: b.startedPA.slice(-PRIOR.pa.last) });
  snapAt.set(day.date, { batters: frozen, league: { ...league } });
  for (const r of day.rows) {
    if (!r.batting || r.playerId == null) continue;
    const x = r.batting;
    resultOf.set(`${day.date}|${r.playerId}`, x);
    const b = batters.get(r.playerId) ?? { pa: 0, h: 0, d: 0, t: 0, hr: 0, r: 0, rbi: 0, k: 0, bb: 0, startedPA: [] };
    b.pa += x.pa ?? 0; b.h += x.h ?? 0; b.d += x.d ?? 0; b.t += x.t ?? 0; b.hr += x.hr ?? 0; b.r += x.r ?? 0; b.rbi += x.rbi ?? 0; b.k += x.so ?? 0; b.bb += (x.bb ?? 0) + (x.hbp ?? 0);
    if (typeof r.battingOrder === "string" && r.battingOrder.endsWith("00")) b.startedPA.push(x.pa ?? 0);
    batters.set(r.playerId, b);
    for (const k of ["pa", "h", "d", "t", "hr", "r", "rbi"]) league[k] += k === "pa" ? (x.pa ?? 0) : (x[k] ?? 0);
    league.k += x.so ?? 0; league.bb += (x.bb ?? 0) + (x.hbp ?? 0);
  }
}
const snapFor = (date) => snapAt.get(date) ?? [...snapAt.entries()].find(([d]) => d > date)?.[1] ?? null;

// ── pregame captures (latest per key with capturedAt before the cutoff) ─────────────────────────────────────────────
const featCache = new Map();
const feats = (family, date) => {
  const k = `${family}|${date}`;
  if (!featCache.has(k)) {
    const dir = path.join(FEAT, family, date);
    let docs = [];
    try { docs = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } }).filter(Boolean); } catch { docs = []; }
    featCache.set(k, docs);
  }
  return featCache.get(k);
};
const latest = (docs, pred, cutoff) => docs.filter((d) => pred(d) && Date.parse(d.capturedAt) <= cutoff && Date.parse(d.capturedAt) < Date.parse(d.eventStartTime ?? "9999")).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0] ?? null;

const shrink = (x, n, prior, l) => (x + prior * l) / (n + prior);
const log5 = (b, p, l) => { const c = (v) => Math.min(1 - 1e-4, Math.max(1e-4, v)); const B = c(b); const Q = c(p); const L = c(l); const num = (B * Q) / L; return num / (num + ((1 - B) * (1 - Q)) / (1 - L)); };

// ── the settled lines of record ─────────────────────────────────────────────────────────────────────────────────────
const games = jsonl("app/public/data/mlb/results/game-predictions-graded.jsonl");
const MARKETS = new Set(["batter_hits", "batter_total_bases", "batter_hits_runs_rbis"]);
const leans = mlbLeansOfRecord(jsonl("pipeline/validation/mlb_settled_leans.jsonl"), { firstPitches: mlbFirstPitches(games) }).record
  .filter((r) => MARKETS.has(r.marketKey) && Number.isFinite(r.actual) && Number.isFinite(r.line) && r.actual !== r.line && Number.isFinite(r.modelProbOver) && r.playerId != null);
const boards = new Map();
const board = (date) => {
  if (!boards.has(date)) { let b = null; try { b = JSON.parse(fs.readFileSync(path.join(REPO, `app/public/data/mlb/boards/${date}.json`), "utf8")); } catch { b = null; } boards.set(date, b ? { generatedAt: b.generatedAt, byId: new Map((b.leans ?? []).map((l) => [l.id, l])) } : null); }
  return boards.get(date);
};
const implied = (o) => (o < 0 ? -o / (-o + 100) : 100 / (o + 100));

// One distribution per (date, player): every market of that batter-game reads the same simulated PAs.
const distCache = new Map();
function distribution(l) {
  const key = `${l.date}|${l.playerId}`;
  if (distCache.has(key)) return distCache.get(key);
  const s = snapFor(l.date);
  const b = s?.batters.get(l.playerId);
  const L = s?.league;
  if (!s || !L || !L.pa) { distCache.set(key, null); return null; }
  const bb0 = b ?? { pa: 0, h: 0, d: 0, t: 0, hr: 0, r: 0, rbi: 0, k: 0, bb: 0, startedPA: [] };
  const lr = (k) => L[k] / L.pa;
  let pK = shrink(bb0.k, bb0.pa, PRIOR.k, lr("k"));
  let pBB = shrink(bb0.bb, bb0.pa, PRIOR.bb, lr("bb"));
  let pHR = shrink(bb0.hr, bb0.pa, PRIOR.hr, lr("hr"));
  const pH = shrink(bb0.h, bb0.pa, PRIOR.h, lr("h"));
  const pD = shrink(bb0.d, bb0.pa, PRIOR.d, lr("d"));
  const pT = shrink(bb0.t, bb0.pa, PRIOR.t, lr("t"));
  const pR = shrink(bb0.r, bb0.pa, PRIOR.r, lr("r"));
  const pRBI = shrink(bb0.rbi, bb0.pa, PRIOR.rbi, lr("rbi"));
  // Matchup (where pregame captures exist): the batter's split vs the starter's hand and the starter's DIPS rates.
  const bd = board(l.date);
  const cutoff = Date.parse(bd?.generatedAt ?? `${l.date}T23:59:59Z`);
  const mu = latest(feats("matchup", l.date), (d) => d.gamePk === l.gamePk, cutoff);
  let slotPa = null; let matchupUsed = false;
  if (mu) {
    const home = (mu.homeBatters ?? []).some((x) => x.playerId === l.playerId);
    const side = home ? "home" : "away";
    const me = (mu[`${side}Batters`] ?? []).find((x) => x.playerId === l.playerId);
    if (me?.battingOrderSlot) slotPa = PA_BY_SLOT[me.battingOrderSlot] ?? null;
    const oppStarter = home ? mu.awayStartingPitcher : mu.homeStartingPitcher;
    const pw = latest(feats("pitcher-workload", l.date), (d) => d.gamePk === l.gamePk, cutoff);
    const st = pw?.pitchers?.[home ? "away" : "home"];
    const season = st && oppStarter && st.id === oppStarter.id ? st.seasonToDate : null;
    const sp = latest(feats("batter-splits", l.date), (d) => d.playerId === l.playerId && d.gamePk === l.gamePk, cutoff);
    const key = oppStarter?.pitchHand === "L" ? "vsLHP" : oppStarter?.pitchHand === "R" ? "vsRHP" : null;
    const split = key && sp ? sp.seasonSplits?.[key] : null;
    if (season || split) {
      matchupUsed = true;
      const bf = season ? (season.ip ?? 0) * PRIOR.bfPerIp : 0;
      const sK = shrink(season?.k ?? 0, bf, PRIOR.pitcherK, lr("k"));
      const sBB = shrink(season?.bb ?? 0, bf, PRIOR.pitcherBb, lr("bb"));
      const sHR = shrink(season?.hr ?? 0, bf, PRIOR.pitcherHr, lr("hr"));
      const bK = split ? shrink(split.k ?? 0, split.pa ?? 0, PRIOR.k, lr("k")) : pK;
      const bBB = split ? shrink(split.bb ?? 0, split.pa ?? 0, PRIOR.bb, lr("bb")) : pBB;
      const bHR = split ? shrink(split.hr ?? 0, split.pa ?? 0, PRIOR.hr, lr("hr")) : pHR;
      pK = log5(bK, sK, lr("k")); pBB = log5(bBB, sBB, lr("bb")); pHR = log5(bHR, sHR, lr("hr"));
    }
  }
  const startedPA = bb0.startedPA ?? [];
  const ePA = slotPa ?? (startedPA.reduce((a, x) => a + x, 0) + PRIOR.pa.games * PRIOR.pa.mean) / (startedPA.length + PRIOR.pa.games);
  // Per-PA outcome probabilities: K, BB, HR from the (matchup) rates; non-HR hits keep the batter's own share of
  // balls in play (DIPS); 2B/3B as shares of non-HR hits.
  const nonHrHit = Math.max(0, pH - shrink(bb0.hr, bb0.pa, PRIOR.hr, lr("hr")));
  const bipOwn = Math.max(1e-6, 1 - shrink(bb0.k, bb0.pa, PRIOR.k, lr("k")) - shrink(bb0.bb, bb0.pa, PRIOR.bb, lr("bb")) - shrink(bb0.hr, bb0.pa, PRIOR.hr, lr("hr")));
  const babip = Math.min(0.6, nonHrHit / bipOwn);
  const bip = Math.max(0, 1 - pK - pBB - pHR);
  const p1 = bip * babip;
  const dShare = nonHrHit > 0 ? Math.min(0.5, pD / nonHrHit) : 0.2;
  const tShare = nonHrHit > 0 ? Math.min(0.1, pT / nonHrHit) : 0.02;
  const probs = { hr: pHR, d: p1 * dShare, t: p1 * tShare, s: p1 * (1 - dShare - tShare) };
  const rng = new SeededRng(`mlb003|${key}`);
  const hits = []; const tb = []; const hrr = [];
  const paFloor = Math.floor(ePA); const paFrac = ePA - paFloor;
  for (let i = 0; i < DRAWS; i += 1) {
    const n = paFloor + (rng.next() < paFrac ? 1 : 0);
    let h = 0; let t = 0; let runs = 0; let rbi = 0;
    for (let j = 0; j < n; j += 1) {
      const u = rng.next();
      if (u < probs.hr) { h += 1; t += 4; runs += 1; rbi += 1; } else if (u < probs.hr + probs.t) { h += 1; t += 3; } else if (u < probs.hr + probs.t + probs.d) { h += 1; t += 2; } else if (u < probs.hr + probs.t + probs.d + probs.s) { h += 1; t += 1; }
      // Runs and RBI beyond a homer, per PA at the batter's (non-HR) rates.
      if (rng.next() < Math.max(0, pR - pHR)) runs += 1;
      if (rng.next() < Math.max(0, pRBI - pHR)) rbi += 1;
    }
    hits.push(h); tb.push(t); hrr.push(h + runs + rbi);
  }
  const d = { hits, tb, hrr, ePA, matchupUsed, slotKnown: slotPa != null };
  distCache.set(key, d);
  return d;
}

const clamp = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const ll = (p, y) => -Math.log(y ? clamp(p) : 1 - clamp(p));
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const auc = (s, y) => { const a = s.map((v, i) => ({ v, y: y[i] })).sort((p, q) => p.v - q.v); let i = 0; let sp = 0; const np = y.filter(Boolean).length; const nn = y.length - np; while (i < a.length) { let j = i; while (j < a.length && a[j].v === a[i].v) j += 1; const r = (i + j + 1) / 2; for (let k = i; k < j; k += 1) if (a[k].y) sp += r; i = j; } return np && nn ? (sp - (np * (np + 1)) / 2) / (np * nn) : null; };
function logistic(xs, ys) { let a = 0; let b = 1; for (let it = 0; it < 30; it += 1) { let ga = 0; let gb = 0; let haa = 0; let hab = 0; let hbb = 0; for (let i = 0; i < xs.length; i += 1) { const p = 1 / (1 + Math.exp(-(a + b * xs[i]))); const w = p * (1 - p); ga += ys[i] - p; gb += (ys[i] - p) * xs[i]; haa += w; hab += w * xs[i]; hbb += w * xs[i] * xs[i]; } const det = haa * hbb - hab * hab; if (Math.abs(det) < 1e-12) break; a += (hbb * ga - hab * gb) / det; b += (haa * gb - hab * ga) / det; } return { intercept: a, slope: b }; }
function boot(xs, iters = 3000, seed = 20261010) { let s = seed >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; const m = []; for (let k = 0; k < iters; k += 1) { let t = 0; for (let i = 0; i < xs.length; i += 1) t += xs[Math.floor(r() * xs.length)]; m.push(t / xs.length); } m.sort((a, b) => a - b); return [m[Math.floor(0.025 * iters)], m[Math.floor(0.975 * iters)]]; }

const FIELD = { batter_hits: "hits", batter_total_bases: "tb", batter_hits_runs_rbis: "hrr" };
const rows = [];
let skipped = 0;
for (const l of leans) {
  if (!resultOf.has(`${l.date}|${l.playerId}`)) { skipped += 1; continue; } // no box-score line to identify the game
  const d = distribution(l);
  if (!d) { skipped += 1; continue; }
  const draws = d[FIELD[l.marketKey]];
  const pOver = (draws.filter((x) => x > l.line).length + 0.5) / (draws.length + 1);
  const bd = board(l.date);
  const br = bd?.byId.get(l.id);
  const market = br && Number.isFinite(br.oddsOver) && Number.isFinite(br.oddsUnder) && br.projection === l.projection ? implied(br.oddsOver) / (implied(br.oddsOver) + implied(br.oddsUnder)) : null;
  rows.push({ market: l.marketKey, date: l.date, y: l.actual > l.line ? 1 : 0, current: l.modelProbOver, challenger: pOver, mkt: market, matchupUsed: d.matchupUsed, slotKnown: d.slotKnown });
}
const summarize = (key, rs) => ({ logLoss: mean(rs.map((r) => ll(r[key], r.y))), brier: mean(rs.map((r) => (r[key] - r.y) ** 2)), auc: auc(rs.map((r) => r[key]), rs.map((r) => r.y)), calibration: logistic(rs.map((r) => Math.log(clamp(r[key]) / (1 - clamp(r[key])))), rs.map((r) => r.y)) });
const report = { challenger: "mlb-batter-counts-v1", exploratory: true, draws: DRAWS, skipped, byMarket: {} };
for (const m of [...MARKETS]) {
  const rs = rows.filter((r) => r.market === m);
  const mk = rs.filter((r) => r.mkt != null);
  const d1 = rs.map((r) => ll(r.challenger, r.y) - ll(r.current, r.y));
  const d2 = mk.map((r) => ll(r.challenger, r.y) - ll(r.mkt, r.y));
  report.byMarket[m] = {
    n: rs.length, matchupShare: mean(rs.map((r) => (r.matchupUsed ? 1 : 0))), slotShare: mean(rs.map((r) => (r.slotKnown ? 1 : 0))),
    current: summarize("current", rs), challenger: summarize("challenger", rs), market: mk.length ? summarize("mkt", mk) : null,
    challengerMinusCurrent: { mean: mean(d1), ci95: boot(d1) }, challengerMinusMarket: mk.length ? { n: mk.length, mean: mean(d2), ci95: boot(d2) } : null,
  };
}
fs.writeFileSync(path.join(HERE, "dev-summary.json"), JSON.stringify(report, null, 1) + "\n");
const f4 = (x) => (x == null ? "—" : x.toFixed(4));
for (const [m, o] of Object.entries(report.byMarket)) console.log(`${m.padEnd(24)} n=${o.n} current LL ${f4(o.current.logLoss)} AUC ${f4(o.current.auc)} slope ${f4(o.current.calibration.slope)} | challenger LL ${f4(o.challenger.logLoss)} AUC ${f4(o.challenger.auc)} slope ${f4(o.challenger.calibration.slope)} | market LL ${f4(o.market?.logLoss)} AUC ${f4(o.market?.auc)} | ch−cur ${f4(o.challengerMinusCurrent.mean)} [${f4(o.challengerMinusCurrent.ci95[0])}, ${f4(o.challengerMinusCurrent.ci95[1])}] ch−mkt ${f4(o.challengerMinusMarket?.mean)} [${f4(o.challengerMinusMarket?.ci95[0])}, ${f4(o.challengerMinusMarket?.ci95[1])}] matchup ${f4(o.matchupShare)} slot ${f4(o.slotShare)}`);
console.log(`skipped ${skipped}`);
